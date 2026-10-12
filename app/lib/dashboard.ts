// Teacher dashboard data — class-level summary assembled from the endpoints we
// have: /api/chapters (analytics chapter performance) and /api/answer-crops
// (scanned marks). All reads go through loam_db only.

import { PERFORMANCE_BANDS, bandIndex } from './performance-bands'
import { fetchChapterStats } from './answer-crops'
import { fetchExamInfo, formatExamDate } from './questions'
import { fetchCropRoster, type CropFilterCombo } from './answer-crops'
import type { AnalyticsFilters } from './filters'
import { formatExamName, matchesAcademicYear } from './filters'

export interface DashboardData {
  chapters: { name: string; score: number; tooltip: string }[] // class avg % per chapter
  distribution: { range: string; count: number; tooltip: string }[] // students per % band
  trend: { name: string; score: number; tooltip: string }[] // class avg % per exam
  // avg is null while none of the exam's scanned papers have been marked yet.
  assessments: { id: number; name: string; examId: string; marks: string; date: string; avg: number | null; avgPct: number | null; trend: string | null }[]
}

// beaver#669 (revised): one bucket per performance band, so the bars line up
// one-to-one with the chart legend. These labels are the axis labels AND the
// legend labels — the dashboard chart matches on them exactly to pick each
// bar's colour, so changing a string here means changing it there too.
const PCT_BANDS = PERFORMANCE_BANDS.map((b) => b.label)
// The labels are written to be read on an axis, so the tooltip spells the range
// out in prose rather than splicing the label into a sentence.
const BAND_PHRASES = PERFORMANCE_BANDS.map((b) => b.phrase)
function pctBands(pcts: number[], section: string): { range: string; count: number; tooltip: string }[] {
  const counts = new Array(PCT_BANDS.length).fill(0)
  for (const p of pcts) {
    counts[bandIndex(Math.max(0, p))]++
  }
  return PCT_BANDS.map((range, i) => ({
    range,
    count: counts[i],
    tooltip: `${counts[i]} student${counts[i] === 1 ? '' : 's'} in Section ${section} ${BAND_PHRASES[i]} across all exams.`,
  }))
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// Format "10" / "10.5" without a trailing ".0".
function fmtMarks(n: number): string {
  return String(Math.round(n * 10) / 10)
}

export async function fetchDashboardData(
  filters: AnalyticsFilters,
  combos: CropFilterCombo[],
): Promise<DashboardData> {
  const sec = filters.section
  // By Chapter: class average % per chapter from scanned marks, scoped to the
  // selected academic year's exams (OR/choice structures handled server-side).
  const yearExams = Array.from(
    new Set(
      combos
        .filter(
          (c) =>
            c.grade === filters.grade &&
            c.subject === filters.subject &&
            c.section === filters.section &&
            matchesAcademicYear(c.exam, filters.year),
        )
        .map((c) => c.exam),
    ),
  )
  const chapters = (await fetchChapterStats({ ...filters, exams: yearExams }).catch(() => []))
    .filter((c) => c.avgPct != null)
    .map((c) => ({
      name: c.chapter,
      score: Math.round(c.avgPct as number),
      // beaver#737: an absolute running total across the academic year's
      // exams so far — both numbers grow as more exams get scanned/marked.
      tooltip:
        c.avgMarks != null && c.chapterMax != null
          ? `This chapter was worth ${fmtMarks(c.chapterMax)} marks across all exams. Sec ${sec} scored ${fmtMarks(c.avgMarks)}/${fmtMarks(c.chapterMax)} across all exams.`
          : `Sec ${sec} averaged ${c.avgPct}% across all exams in this chapter.`,
    }))

  // Class average % per exam (By Assignment) for this grade/section/subject,
  // scoped to the selected academic year (beaver#547).
  const exams = Array.from(
    new Set(
      combos
        .filter(
          (c) =>
            c.grade === filters.grade &&
            c.subject === filters.subject &&
            c.section === filters.section &&
            matchesAcademicYear(c.exam, filters.year),
        )
        .map((c) => c.exam),
    ),
  )
  const perExam = await Promise.all(
    exams.map(async (exam) => {
      const [r, info] = await Promise.all([
        fetchCropRoster({ ...filters, exam }).catch(() => []),
        fetchExamInfo({ ...filters, exam }),
      ])
      // Only students whose papers are actually marked. Students awaiting
      // marking are imported with 0/0 totals — counting them as scored-zero
      // collapses the class average (e.g. 11-C Accountancy showed ~6% when
      // 11 of its 13 scanned papers were unmarked).
      const marked = r.filter((x) => x.totalMarks != null && (x.totalMaxMarks ?? 0) > 0)
      const avg = mean(marked.map((x) => x.totalMarks as number))
      // The scan pipeline's per-student max is the attemptable max (OR/choice
      // aware); the question paper's printed max is only a fallback.
      const cropsMax = marked.length ? Math.max(...marked.map((x) => x.totalMaxMarks as number)) : null
      const max = cropsMax ?? info?.maxMarks ?? null
      const pct = max ? Math.round((100 * avg) / max) : Math.round(avg)

      // Weighted grade average across all sections visible in this cohort
      const gradeSections = Array.from(
        new Set(
          combos
            .filter((c) => c.grade === filters.grade && c.subject === filters.subject && c.exam === exam)
            .map((c) => c.section),
        ),
      )
      const bySection = await Promise.all(
        gradeSections.map(async (section) => {
          const rows =
            section === filters.section ? r : await fetchCropRoster({ ...filters, section, exam }).catch(() => [])
          const m = rows.filter((x) => x.totalMarks != null && (x.totalMaxMarks ?? 0) > 0)
          return { avg: mean(m.map((x) => x.totalMarks as number)), count: m.length }
        }),
      )
      const totalStudents = bySection.reduce((s, x) => s + x.count, 0)
      const gradeAvg = totalStudents > 0 ? bySection.reduce((s, x) => s + x.avg * x.count, 0) / totalStudents : null

      return { exam, avg, max, pct, marked, info, gradeAvg }
    }),
  )
  // Oldest first: `exams` inherits the API's order, which plots time backwards.
  const examDateOf = (e: (typeof perExam)[number]) => e.info?.examDate ?? null
  const chronological = [...perExam].sort((a, b) => {
    const da = examDateOf(a)
    const db = examDateOf(b)
    if (!da || !db) return da ? -1 : db ? 1 : 0
    return da < db ? -1 : da > db ? 1 : 0
  })
  
  // Exams with no marked papers yet would plot a fake 0% — leave them off the
  // trend line (they still appear in the assessment table with '—'). Retests
  // are left off too: only the few students who resat sit them, so their
  // average is not comparable with a whole-section exam. They stay in the
  // assessment table.
  const trend = chronological.filter((e) => e.marked.length > 0 && !/retest/i.test(e.exam)).map((e) => {
    const secAvg = Math.round(e.avg)
    let comparison = ''
    if (e.gradeAvg != null && e.gradeAvg > 0) {
      const diffRatio = (e.avg - e.gradeAvg) / e.gradeAvg
      const status = diffRatio > 0.1 ? 'above' : diffRatio < -0.1 ? 'below' : 'around'
      comparison = ` This is ${status} the grade's performance.`
    }
    return {
      name: formatExamName(e.exam),
      score: e.pct,
      tooltip: e.max
        ? `Sec ${sec} scored an avg of ${secAvg}/${e.max} in this exam.${comparison}`
        : `Sec ${sec} scored an avg of ${secAvg} marks in this exam.${comparison}`,
    }
  })
  const assessments = perExam.map((e, i) => ({
    id: i + 1,
    name: formatExamName(e.exam),
    examId: e.exam,
    marks: e.max != null ? String(e.max) : '—',
    date: formatExamDate(e.info?.examDate) ?? '—',
    avg: e.marked.length ? Math.round(e.avg) : null,
    avgPct: e.marked.length ? e.pct : null,
    trend: null,
  }))

  // By Students: each student's % across ALL exams (marks summed over exams),
  // binned into five percentage bands. Marked papers only, against the scan
  // pipeline's per-student max.
  const perStudent = new Map<string, { got: number; max: number }>()
  for (const e of perExam) {
    for (const r of e.marked) {
      const key = r.admissionNo ?? r.rollNumber
      const a = perStudent.get(key) ?? { got: 0, max: 0 }
      a.got += r.totalMarks ?? 0
      a.max += r.totalMaxMarks ?? 0
      perStudent.set(key, a)
    }
  }
  const distribution = pctBands(
    Array.from(perStudent.values())
      .filter((a) => a.max > 0)
      .map((a) => (100 * a.got) / a.max),
    sec,
  )

  return { chapters, distribution, trend, assessments }
}
