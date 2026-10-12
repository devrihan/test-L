'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from '@/components/ui/card'
import { PageFilters } from '@/components/page-filters'
import { ChartSkeleton } from '@/components/page-skeletons'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'
import { useLoggedInStudent, type LoggedInStudent } from '@/app/lib/student-identity'
import { fetchRemediation, type Remediation } from '@/app/lib/questions'
import { mistakeTypeColor, mistakeTypeLegend } from '@/app/lib/mistake-type-legend'
import { fetchCropRoster, fetchStudentChapterStats, type CropFilterCombo, type CropRosterRow } from '@/app/lib/answer-crops'
import { matchesAcademicYear, formatExamName, examAcademicYear } from '@/app/lib/filters'
import { examScope } from '@/app/lib/chapters'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CommonMistakesSection } from '@/components/common-mistakes-section'
import type { MistakeItem } from '@/components/common-mistakes-section'
import { useQuestionRefs } from '@/app/lib/question-refs'
import { useFeatureFlag } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { TooltipProvider } from '@/components/ui/tooltip'
import { trackTabKey } from '@/app/lib/analytics'

// Analytics names for the chart tabs, keyed by state value.

const LINE_COLOR = '#299d8f'
const AXIS_COLOR = '#64748b'
const GRID_COLOR = 'oklch(0.929 0.013 255.508)'

// This screen only renders for a real logged-in student (dashboard page
// dispatches on role), so every block is real data or an honest empty state —
// never hardcoded design placeholders.

/** One bar of the "All Subjects" chart (Student Login Metrics spec):
 * score = (sum of marks across all marked exams in the subject /
 *          sum of max marks across those exams) × 100,
 * plus the per-exam breakdown shown in the hover tooltip. */
interface SubjectAvgPoint {
  name: string
  score: number
  exams: { name: string; marks: number; max: number }[]
}

/** One point of the single-subject "By exam" line (Student Login Metrics spec):
 * Exam Score % = (student marks in exam / exam max marks) × 100, from the
 * student's own crop-roster row; the tooltip adds the absolute marks and the
 * section's average marks over the same exam's marked papers. */
interface ExamPoint {
  name: string
  score: number
  marks: number
  max: number
  sectionAvg: number | null
}

/** One bar of the single-subject "By chapter" chart (Student Login Metrics
 * spec): Chapter Avg % = Σ student marks on the chapter / Σ chapter max × 100
 * across the selected exam(s); got/max feed the tooltip's absolute marks. */
interface ChapterPoint {
  name: string
  score: number
  got: number
  max: number
}

/** Marks for display: whole numbers stay whole, half-marks keep one decimal. */
function fmtMarks(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** Coarse chronological order for exam ids (they carry no dates): the CBSE
 * year runs Unit Test 1 → Mid Term / Half Yearly → Unit Test 2 → Mid Term 2 →
 * Preboards → Annual/Final. Unknown types sort last; ties fall back to name. */
function examChronoRank(examId: string): number {
  // Separators kept so the sitting number is only a digit that ends the
  // token: in 'MIDTERM_26-27' the '2' is the year, not Mid Term 2.
  const u = examId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const ut = /UNIT_?TE[SX]T_?(\d)?(?![0-9])/.exec(u) // covers the UNITTEXT typo in ids
  if (ut) return (Number(ut[1] || '1')) <= 1 ? 1 : 3
  const mid = /MID_?TERM_?(\d)?(?![0-9])/.exec(u)
  if (mid) return (Number(mid[1] || '1')) <= 1 ? 2 : 4
  if (/HALF_?YEARLY/.test(u)) return 2
  if (/PRE_?BOARD/.test(u)) return 5
  if (/ANNUAL_?EXAM|FINAL_?EXAM/.test(u)) return 6
  return 7
}

/** Subject names fork on whitespace in the crops data
 * ('Applied  Mathematics' vs 'Applied Mathematics') — collapse before
 * comparing/grouping so a forked subject renders as one bar. */
function normalizeSubject(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** The logged-in student's own roster row: admission number is the stable key;
 * fall back to roll number only when the row carries no admission number. */
function findStudentRow(rows: CropRosterRow[], student: LoggedInStudent): CropRosterRow | undefined {
  const byAdmission = rows.find(
    (r) => r.admissionNo != null && r.admissionNo.trim() === student.admissionNo.trim(),
  )
  if (byAdmission) return byAdmission
  return rows.find((r) => r.admissionNo == null && Number(r.rollNumber) === student.rollNumber)
}

function TooltipShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md shadow-md px-2 py-1.5 w-[220px] flex flex-col gap-1.5">
      <p className="text-[14px] font-medium leading-5 text-foreground break-words">{label}</p>
      {children}
    </div>
  )
}

// left-aligned tick, anchored directly under its data point (instead of centered) — same fix as the teacher exam chart's AssignmentAxisTick
function ExamAxisTick({
  x, y, payload,
}: {
  x?: string | number
  y?: string | number
  payload?: { value: string }
}) {
  return (
    <text x={Number(x ?? 0)} y={y} dy={16} textAnchor="middle" fontSize={12} fill={AXIS_COLOR}>
      {payload?.value ?? ''}
    </text>
  )
}

// Single-subject "By exam" tooltip (Student Login Metrics spec): exam name,
// "% Scored" with the big percentage, then "You scored [marks]/[max] marks.
// Section Average is [avg]/[max]."
function ExamScoreTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { payload: ExamPoint }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: LINE_COLOR }} />
          <span className="text-[14px] leading-5 text-muted-foreground whitespace-nowrap">% Scored</span>
        </div>
        <span className="text-[18px] font-semibold text-foreground text-right shrink-0">{point.score}%</span>
      </div>
      <div className="border-t border-border pt-1.5">
        <p className="text-[12px] leading-4 text-muted-foreground">
          You scored {fmtMarks(point.marks)}/{fmtMarks(point.max)} marks.
          {' '}Section Average is {point.sectionAvg != null ? `${fmtMarks(point.sectionAvg)}/${fmtMarks(point.max)}` : 'null'}.
        </p>
      </div>
    </TooltipShell>
  )
}

// Single-subject "By chapter" tooltip (Student Login Metrics spec): chapter
// name, "% Scored" with the big percentage, then "This chapter was worth [X]
// marks in all exams. You scored [marks]/[X]."
function ChapterScoreTooltip({
  active, payload, label, allExams,
}: {
  active?: boolean
  payload?: { payload: ChapterPoint }[]
  label?: string
  allExams?: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: LINE_COLOR }} />
          <span className="text-[14px] leading-5 text-muted-foreground whitespace-nowrap">% Scored</span>
        </div>
        <span className="text-[18px] font-semibold text-foreground text-right shrink-0">{point.score}%</span>
      </div>
      <div className="border-t border-border pt-1.5">
        <p className="text-[12px] leading-4 text-muted-foreground">
          This chapter was worth {fmtMarks(point.max)} marks in {allExams ? 'all exams' : 'this exam'}.
          {' '}You scored {fmtMarks(point.got)}/{fmtMarks(point.max)}.
        </p>
      </div>
    </TooltipShell>
  )
}

// "All Subjects" bar tooltip (Student Login Metrics spec): subject name,
// "Avg score" with the big percentage, then the student's marks/max in each
// exam of that subject.
function SubjectTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { payload: SubjectAvgPoint }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: LINE_COLOR }} />
          <span className="text-[14px] leading-5 text-muted-foreground whitespace-nowrap">Avg score</span>
        </div>
        <span className="text-[18px] font-semibold text-foreground text-right shrink-0">{point.score}%</span>
      </div>
      {point.exams.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1.5">
          {point.exams.map((e, i) => (
            <div key={`${e.name}-${i}`} className="flex items-start gap-2">
              <span className="flex-1 min-w-0 text-[12px] leading-4 text-muted-foreground break-words">{e.name}</span>
              <span className="text-[12px] font-mono text-foreground shrink-0">{e.marks}/{e.max}</span>
            </div>
          ))}
        </div>
      )}
    </TooltipShell>
  )
}

export function StudentDashboard() {
  // beaver#643 — student-role own Home page; hide the Common mistakes section.
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_student_dashboard')
  const classifiedCohorts = useClassifiedCohorts()
  const { combos, filters, setFilters } = useAnalyticsFilters()
  const showCommonMistakes = showCommonMistakesFlag && classificationEnabledFor(classifiedCohorts, filters?.grade, filters?.subject)
  const student = useLoggedInStudent()
  const [chartTab, setChartTab] = useState<'exam' | 'chapter'>('exam')

  // Default the Subject dropdown to "All Subjects" the first time filters
  // resolve for this student (subjectAll is only ever set by this page, so
  // undefined means it's never been touched — not a user choosing a single
  // subject). Once set, later visits/toggles are left alone.
  const [defaultedAllSubjects, setDefaultedAllSubjects] = useState(false)
  useEffect(() => {
    if (defaultedAllSubjects || !filters) return
    if (filters.subjectAll === undefined) setFilters({ ...filters, subjectAll: true })
    setDefaultedAllSubjects(true)
  }, [filters, defaultedAllSubjects, setFilters])


  // Personal data for the logged-in student; every block is real data or an
  // honest empty state — never a hardcoded placeholder.

  // By exam (Student Login Metrics spec, single subject): one line point per
  // exam of the selected subject in the academic year — the exam dropdown
  // doesn't narrow this view, the spec pins it to All Exams. Per exam the
  // student's own marked crop-roster row (matched by admission number) gives
  // Exam Score % = marks / max × 100; MARKED papers only (totalMarks != null
  // && totalMaxMarks > 0), an unmarked scan is skipped, never counted as zero.
  // The same roster also yields the section's average marks for the tooltip.
  const [examSeries, setExamSeries] = useState<ExamPoint[]>([])
  const [examLoading, setExamLoading] = useState(true)
  useEffect(() => {
    if (!student || !combos || !filters) return
    if (filters.subjectAll || !filters.subject) { setExamSeries([]); return }
    let ignore = false
    setExamLoading(true)
    const grade = student.grade ?? filters.grade
    const section = student.section ?? filters.section
    const subject = normalizeSubject(filters.subject)
    // Whitespace forks of the subject name count as the same subject, but the
    // same exam must not be fetched (or plotted) twice — dedupe per exam id.
    const seen = new Set<string>()
    const pairs = combos.filter((c) => {
      if (c.grade !== grade || c.section !== section) return false
      if (normalizeSubject(c.subject) !== subject) return false
      if (!matchesAcademicYear(c.exam, filters.year)) return false
      if (seen.has(c.exam)) return false
      seen.add(c.exam)
      return true
    })
    Promise.all(
      pairs.map((p) =>
        // Self-scoped roster: a student token is only allowed its own row
        // (access policy), so the response is just this student.
        fetchCropRoster({ grade, section, subject: p.subject, exam: p.exam, admissionNo: student.admissionNo })
          .then((rows) => ({ exam: p.exam, rows }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (ignore) return
      const points: (ExamPoint & { exam: string })[] = []
      for (const r of results) {
        if (!r) continue
        const marked = r.rows.filter((row) => row.totalMarks != null && (row.totalMaxMarks ?? 0) > 0)
        const mine = findStudentRow(marked, student)
        if (!mine || mine.totalMarks == null || mine.totalMaxMarks == null) continue
        // MOCK (null) — section average needs the whole section's roster
        // (class-level data a student token is denied; the self-scoped
        // response only ever holds this student's own row). Left as an
        // explicit null placeholder — not a fake number — until a
        // class-scoped, aggregate-only endpoint exists to compute this for
        // real; the tooltip below renders it as a visible "null" so it's
        // unmistakably a stub rather than data someone could mistake as real.
        const sectionAvg = null
        points.push({
          exam: r.exam,
          name: formatExamName(r.exam),
          score: Math.round((100 * mine.totalMarks) / mine.totalMaxMarks),
          marks: mine.totalMarks,
          max: mine.totalMaxMarks,
          sectionAvg,
        })
      }
      // Chronological trend: academic year first, then the CBSE exam-calendar
      // rank, then the id as a stable tie-break.
      points.sort(
        (a, b) =>
          (examAcademicYear(a.exam) ?? '').localeCompare(examAcademicYear(b.exam) ?? '') ||
          examChronoRank(a.exam) - examChronoRank(b.exam) ||
          a.exam.localeCompare(b.exam),
      )
      setExamSeries(points)
      setExamLoading(false)
    })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, combos, filters?.grade, filters?.section, filters?.subject, filters?.subjectAll, filters?.year])

  // All Subjects (Student Login Metrics spec): one bar per subject the student
  // actually has scanned papers for, scoped to the selected academic year.
  // The subjects come from the student's own cohort's filter combos; per
  // (subject, exam) the student's marked totals come from the crop roster,
  // matched by admission number. Subject Average % = Σ marks / Σ max × 100 —
  // summed over MARKED papers only (totalMarks != null && totalMaxMarks > 0);
  // unmarked scans are excluded, never counted as zero.
  const [subjectAvgSeries, setSubjectAvgSeries] = useState<SubjectAvgPoint[]>([])
  const [subjectAvgLoading, setSubjectAvgLoading] = useState(true)
  useEffect(() => {
    if (!student || !combos || !filters) return
    let ignore = false
    setSubjectAvgLoading(true)
    const grade = student.grade ?? filters.grade
    const section = student.section ?? filters.section
    const pairs = combos.filter(
      (c) => c.grade === grade && c.section === section && matchesAcademicYear(c.exam, filters.year),
    )
    Promise.all(
      pairs.map((p) =>
        // Self-scoped roster (access policy): only the student's own row.
        fetchCropRoster({ grade, section, subject: p.subject, exam: p.exam, admissionNo: student.admissionNo })
          .then((rows) => ({ pair: p, row: findStudentRow(rows, student) }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (ignore) return
      // One entry per (normalized subject, exam) — whitespace forks of the
      // same subject ('Applied  Mathematics') must not double count an exam.
      const perExam = new Map<string, { subject: string; exam: string; marks: number; max: number }>()
      for (const r of results) {
        if (!r?.row) continue
        const { totalMarks, totalMaxMarks } = r.row
        if (totalMarks == null || totalMaxMarks == null || totalMaxMarks <= 0) continue // marked papers only
        const subject = normalizeSubject(r.pair.subject)
        const key = `${subject}\u0000${r.pair.exam}`
        if (!perExam.has(key)) perExam.set(key, { subject, exam: r.pair.exam, marks: totalMarks, max: totalMaxMarks })
      }
      const bySubject = new Map<string, { got: number; max: number; exams: { name: string; marks: number; max: number }[] }>()
      for (const e of Array.from(perExam.values()).sort((a, b) => a.exam.localeCompare(b.exam))) {
        const agg = bySubject.get(e.subject) ?? { got: 0, max: 0, exams: [] }
        agg.got += e.marks
        agg.max += e.max
        agg.exams.push({ name: formatExamName(e.exam), marks: e.marks, max: e.max })
        bySubject.set(e.subject, agg)
      }
      setSubjectAvgSeries(
        Array.from(bySubject.entries())
          .map(([name, a]) => ({ name, score: Math.round((100 * a.got) / a.max), exams: a.exams }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setSubjectAvgLoading(false)
    })
    return () => { ignore = true }
  }, [student, combos, filters?.grade, filters?.section, filters?.year])
  // 'All Exams' selected (beaver#694) — only meaningful for a single subject;
  // under 'All Subjects' the flag is cleared by PageFilters, but stale saved
  // state could carry both, so never honor it while subjectAll is on.
  const allExams = !!filters?.examAll && !filters?.subjectAll

  // By chapter: the student's scanned marks for the selected subject/exam,
  // grouped by chapter via the paper's question->chapter mapping. Always via
  // student-chapter-stats — the single-exam case used to sum raw crop rows
  // client-side (marks/maxMarks per question_key), which double/triple-counts
  // any multi-part question: a sub-part row (e.g. '2.1') mirrors its whole-
  // question parent's marks rather than holding a fraction of them, so the
  // parent row and every sub-part row all got summed as if separate marks.
  // The stats endpoint does the same whole-question dedup (parent-vs-sub-part
  // bbox convention, option groups) the Chapters page already relies on, so
  // this chart now agrees with it instead of drifting on any chapter with a
  // multi-part question (e.g. Polynomials pulling a wrong % on the exam
  // scope while the Chapters page showed the right one for the same exam).
  const [chapterSeries, setChapterSeries] = useState<ChapterPoint[]>([])
  useEffect(() => {
    if (!student || !filters) { setChapterSeries([]); return }
    let ignore = false
    const grade = student.grade ?? filters.grade
    const section = student.section ?? filters.section
    const exams = allExams ? examScope({ ...filters, grade, section }, combos ?? undefined) : [filters.exam]
    fetchStudentChapterStats({
      grade,
      section,
      subject: filters.subject,
      exams,
      // Self-scoped (access policy): only the student's own rows.
      admissionNo: student.admissionNo,
    }).then((stats) => {
      if (ignore) return
      setChapterSeries(
        stats
          .filter((c) =>
            c.admissionNo
              ? c.admissionNo === student.admissionNo
              : (c.rollNumber ?? '').replace(/^0+/, '') === String(student.rollNumber).replace(/^0+/, ''),
          )
          .filter((c) => c.chapterMax > 0)
          .map((c) => ({ name: c.chapter, score: Math.round((100 * c.got) / c.chapterMax), got: c.got, max: c.chapterMax })),
      )
    }).catch(() => { if (!ignore) setChapterSeries([]) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, combos, filters?.subject, filters?.exam, filters?.year, allExams])

  // Common mistakes: the exam's real error analytics with student-work
  // evidence; empty until the exam has been analysed. Remediation only exists
  // per exam, so under 'All Exams' (beaver#694) the section stays empty rather
  // than showing one exam's mistakes while the dropdown says 'All Exams'.
  const [rem, setRem] = useState<Remediation | null>(null)
  useEffect(() => {
    if (!filters || allExams) { setRem(null); return }
    let ignore = false
    // Tagged result (beaver#831): degrade to the empty state on failure —
    // student-facing, same reasoning as student-exam-detail; context is logged.
    fetchRemediation(filters).then((r) => { if (!ignore) setRem(r.ok ? r.data : null) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.subject, filters?.exam, allExams])

  // Legend and colours: by KIND of mistake (Concept mix-up, Mistake in the
  // steps, ...), the way the chapter page splits its own-mistakes bar. The
  // rollup rows carry no type column; the API resolves each pattern through
  // error_taxonomy (label or code) and sends errorTypeName, null for the free-
  // text patterns older runs wrote — those are 'Other', an honest bucket, not
  // a guess. Colours are fixed per type (mistakeTypeColor), so a type reads
  // the same here as on the chapter page. Groups below still fold by chapter,
  // so a group's patterns can carry different colours; the header then shows
  // one dot per type present.
  const colorForMistakeType = mistakeTypeColor

  // The exam's questions: each card names its question (hover: the text) and
  // offers the answer key beside the student's own scanned answer.
  const questionRefs = useQuestionRefs(filters && !allExams ? { grade: filters.grade, subject: filters.subject, exam: filters.exam } : null)
  const mistakeItems: MistakeItem[] = (rem?.mistakes ?? []).map((m, i) => ({
    id: `cm${i}`,
    color: colorForMistakeType(m.errorTypeName),
    title: m.pattern,
    chapter: m.chapter ?? '—',
    description: `${m.description}${m.count ? ` · ${m.count} students` : ''}`,
    example: m.evidenceImageUrl
      ? { student: m.evidenceStudent ?? '', earned: m.evidenceMarks ?? 0, total: m.evidenceMaxMarks ?? 0, description: m.description, image: m.evidenceImageUrl, count: m.count }
      : null,
    // The full evidence list, so the card's pager cycles real images instead
    // of showing the first crop under a "1/N" that never changes. For a
    // student token the API narrows this to their own answers, so a mistake
    // they did not make simply carries none.
    evidences: (m.evidences ?? []).filter((e) => e.imageUrl),
    question: m.questionNumber != null ? questionRefs.get(Math.trunc(m.questionNumber)) : undefined,
  }))
  const mistakeLegend = mistakeTypeLegend(rem?.mistakes ?? [], colorForMistakeType)

  // Subject dropdown = "All Subjects" (beaver#1081-15860, beaver#691) — the
  // By exam / By chapter tabs are hidden and the chart is always the bar
  // chart averaged per subject (those views only make sense for one subject).
  // Per the Student Login Metrics spec the exam selection does not matter in
  // this mode: the bars always average across ALL of the subject's exams.
  const showAllSubjects = !!filters?.subjectAll
  const subjectLabel = filters?.subject ? filters.subject.toLowerCase() : null
  const activeMeta = {
    title: showAllSubjects
      ? 'Subject-wise Performance - All Exams'
      : chartTab === 'exam'
        ? 'Overall Performance'
        : allExams
          ? 'Chapter-wise Performance - All Exams'
          : subjectLabel
            ? `Performance in ${subjectLabel} by chapter`
            : 'Performance by chapter',
    subtitle: showAllSubjects
      ? 'Compare and prioritise weak subjects'
      : chartTab === 'exam'
        ? 'Compare your marks across exams'
        : 'Compare average scores across chapters.',
  }
  const data: (SubjectAvgPoint | ExamPoint | ChapterPoint)[] =
    showAllSubjects ? subjectAvgSeries : chartTab === 'exam' ? examSeries : chapterSeries
  // Bar chart data as one concrete array type (recharts' generic can't take
  // the raw union of the two state arrays).
  const barData: (SubjectAvgPoint | ChapterPoint)[] = showAllSubjects ? subjectAvgSeries : chapterSeries
  const loading = showAllSubjects
    ? subjectAvgLoading
    : chartTab === 'exam' && examLoading
  // Loading is now a skeleton, so this only ever states the genuinely-empty case.
  const emptyMessage = 'No marked exam papers to show yet.'

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div>
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Home{filters ? ` - ${filters.subjectAll ? 'All Subjects' : filters.subject}` : ''}
          </h1>
          {filters && (
            <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
              {filters.subjectAll ? 'Review your performance across all subjects' : 'Analyse your performance across all exams'}
            </p>
          )}
        </div>

        {combos && filters && (
          <PageFilters showExam allowAllSubjects allowAllExams={!filters.subjectAll} showSection={false} combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      {/* Performance chart card */}
      <Card className="gap-0 py-0 rounded-lg overflow-hidden">
        <CardHeader className="p-6 gap-0">
          <CardTitle className="text-[16px] font-medium leading-6">
            {activeMeta.title}
          </CardTitle>
          <CardDescription className="text-[14px] leading-5">
            {activeMeta.subtitle}
          </CardDescription>
          {/* By exam / By chapter only apply to a single subject — hidden for
              "All Subjects" (beaver#691). */}
          {!showAllSubjects && (
            <CardAction>
              {/* Label, not the state key — values are 'exam'/'chapter'. */}
              <Tabs value={chartTab} onValueChange={(v) => { trackTabKey(v); setChartTab(v as 'exam' | 'chapter') }}>
                <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-secondary p-1 rounded-md gap-0">
                  <TabsTrigger
                    value="exam"
                    className="h-[32px] text-[14px] leading-5 font-medium tracking-[-0.084px] px-3 py-[6px] rounded data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                  >
                    By Exam
                  </TabsTrigger>
                  <TabsTrigger
                    value="chapter"
                    className="h-[32px] text-[14px] leading-5 font-medium tracking-[-0.084px] px-3 py-[6px] rounded data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                  >
                    By Chapter
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="px-6 pb-6 pt-0">
          {loading ? (
            <ChartSkeleton height={222} />
          ) : data.length === 0 ? (
            // Real-or-empty: no data never falls back to a design placeholder
            // for a logged-in student.
            <div className="h-[222px] flex items-center justify-center">
              <p className="text-[14px] leading-5 text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
          <TooltipProvider delayDuration={300}>
          <ResponsiveContainer width="100%" height={222}>
            {chartTab === 'exam' && !showAllSubjects ? (
              // beaver#705: a single exam has no trend to show — a line with
              // one point reads as a dot floating in space, so it's a plain
              // bar instead. Once there are 2+ exams, a line shows the trend.
              examSeries.length >= 2 ? (
                <LineChart data={examSeries} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => <ExamAxisTick {...props} />}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: AXIS_COLOR }}
                    width={32}
                  />
                  <Tooltip content={<ExamScoreTooltip />} cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }} position={TOOLTIP_POSITION} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    dot={{ r: 4, fill: LINE_COLOR, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: LINE_COLOR, strokeWidth: 0 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={examSeries} barSize={44} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => <ExamAxisTick {...props} />}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: AXIS_COLOR }}
                    width={32}
                  />
                  <Tooltip content={<ExamScoreTooltip />} cursor={{ fill: '#f1f5f9' }} position={TOOLTIP_POSITION} />
                  <Bar dataKey="score" fill={LINE_COLOR} radius={[6, 6, 6, 6]} />
                </BarChart>
              )
            ) : (
              <BarChart data={barData} barSize={44} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={<ChartAxisTick maxChars={10} />}
                  interval={0}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: AXIS_COLOR }}
                  width={32}
                />
                <Tooltip
                  content={showAllSubjects ? <SubjectTooltip /> : <ChapterScoreTooltip allExams={allExams} />}
                  cursor={{ fill: '#f1f5f9' }}
                  position={TOOLTIP_POSITION}
                />
                <Bar dataKey="score" fill={LINE_COLOR} radius={[6, 6, 6, 6]} />
              </BarChart>
            )}
          </ResponsiveContainer>
          </TooltipProvider>
          )}
          <div className="flex justify-center mt-3">
            <div className="flex items-center gap-2">
              <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: LINE_COLOR }} />
              <span className="text-[12px] leading-4 tracking-[-0.072px] text-muted-foreground">
                {showAllSubjects
                  ? 'Avg Score - All Exams'
                  : chartTab === 'chapter'
                    ? 'Avg score'
                    : 'Score in each Exam'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Common mistakes — gated by show_common_mistakes_student_dashboard (beaver#643).
          Hidden when the selected subject has no analytics (same rule as the
          question page): the flag is school-wide, so an unclassified subject
          would otherwise render a titled block with an empty legend. */}
      {showCommonMistakes && mistakeItems.length > 0 && (
        <CommonMistakesSection
          subtitle="Common mistakes made across your section"
          variant="question"
          hideAddToPlan
          groupByChapter
          tabs={[{ key: 'mistakes', label: 'Mistakes', legend: mistakeLegend, items: mistakeItems }]}
        />
      )}
    </div>
  )
}
