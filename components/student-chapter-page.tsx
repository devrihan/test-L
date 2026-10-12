'use client'

// Student variant of the Chapters page — Student Login Metrics (6) spec
// ("Chapter Main Page"). Each card shows the logged-in student's OWN chapter
// average — (their marks on the chapter / chapter max) × 100 over the selected
// exam scope — plus the change vs the previous exam ("↑ +10.2% from Mid Term")
// when one exists. Nothing here is class-scoped or hardcoded: no data for a
// scope renders an honest empty state, and a first exam shows no comparison.

import { useState, useEffect } from 'react'
import { StatCard } from '@/components/stat-card'
import { StatCardGridSkeleton } from '@/components/page-skeletons'
import { PageFilters } from '@/components/page-filters'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import {
  fetchLoggedInStudent,
  resolveStudentSection,
  normKey,
  type LoggedInStudent,
} from '@/app/lib/student-identity'
import { fetchStudentChapterStats, type StudentChapterStat } from '@/app/lib/answer-crops'
import { fetchExamInfo } from '@/app/lib/questions'
import { academicYearsOf, formatExamName, matchesAcademicYear, pickSubjectTitle } from '@/app/lib/filters'

interface StudentChapterCard {
  id: string
  name: string
  /** the student's own average % on this chapter over the selected exam scope */
  avgPct: number
  /** "+10.2% from Mid Term 2025-26" — null when there is no previous exam to compare */
  trend: string | null
  trendDown: boolean
}

/** chapter -> the student's marked totals {got, max}; unmarked rows (max 0) dropped. */
function myChapterTotals(
  stats: StudentChapterStat[], admissionNo: string,
): Map<string, { got: number; max: number }> {
  const totals = new Map<string, { got: number; max: number }>()
  for (const s of stats) {
    if (s.admissionNo !== admissionNo || s.chapterMax <= 0) continue
    const cur = totals.get(s.chapter) ?? { got: 0, max: 0 }
    totals.set(s.chapter, { got: cur.got + s.got, max: cur.max + s.chapterMax })
  }
  return totals
}

const pct = (t: { got: number; max: number }) => (100 * t.got) / t.max
const round1 = (n: number) => Math.round(n * 10) / 10

export function StudentChapterPage() {
  const { combos, filters, setFilters } = useAnalyticsFilters()
  // undefined = identity still resolving; null = login has no linked student.
  const [student, setStudent] = useState<LoggedInStudent | null | undefined>(undefined)
  const [chapters, setChapters] = useState<StudentChapterCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    fetchLoggedInStudent().then((s) => { if (!ignore) setStudent(s) })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    if (!filters || !combos || student === undefined) return
    if (student === null) { setChapters([]); setLoading(false); return }
    let ignore = false
    setLoading(true)
    setError(null)
    ;(async () => {
      // The student's own cohort: their section (matched whitespace/case-
      // insensitively) within the selected grade/subject.
      const sec = resolveStudentSection(combos, filters, student)
      const cohortExams = Array.from(new Set(
        combos
          .filter((c) =>
            c.grade === filters.grade &&
            normKey(c.subject) === normKey(filters.subject) &&
            normKey(c.section) === normKey(sec))
          .map((c) => c.exam),
      ))
      // Year scoping (matchesAcademicYear): re-validate the shared year against
      // the resolved cohort so a mismatch can't hide every exam.
      const years = academicYearsOf(cohortExams)
      const year = filters.year && years.includes(filters.year) ? filters.year : years[0]
      const yearExams = cohortExams.filter((e) => matchesAcademicYear(e, year))
      // Spec: All Exams -> sum marks/max across the year's exams; Single Exam
      // -> that exam only.
      const scope = filters.examAll ? yearExams : [filters.exam]
      if (scope.length === 0) { if (!ignore) setChapters([]); return }

      const ctx = { grade: filters.grade, section: sec, subject: filters.subject }

      // Previous exam = the one before the current exam in date order (real
      // question-paper dates). Undatable exams can't be placed honestly, so
      // they never produce a comparison.
      const infos = await Promise.all(yearExams.map(async (exam) => ({
        exam,
        date: (await fetchExamInfo({ ...ctx, exam }).catch(() => null))?.examDate ?? null,
      })))
      const ordered = infos
        .filter((i): i is { exam: string; date: string } => i.date !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((i) => i.exam)
      const currentExam = filters.examAll ? ordered[ordered.length - 1] ?? null : filters.exam
      const currentIdx = currentExam ? ordered.indexOf(currentExam) : -1
      const prevExam = currentIdx > 0 ? ordered[currentIdx - 1] : null

      // Self-scoped fetches: a student token is only allowed its own rows
      // (access policy), which are also the only rows this page uses.
      const admissionNo = student.admissionNo
      const none = Promise.resolve<StudentChapterStat[]>([])
      const [scopeStats, currStats, prevStats] = await Promise.all([
        fetchStudentChapterStats({ ...ctx, exams: scope, admissionNo }),
        // single-exam scope IS the current exam — no second fetch needed
        prevExam && filters.examAll && currentExam
          ? fetchStudentChapterStats({ ...ctx, exams: [currentExam], admissionNo }).catch(() => [])
          : none,
        prevExam ? fetchStudentChapterStats({ ...ctx, exams: [prevExam], admissionNo }).catch(() => []) : none,
      ])
      if (ignore) return

      const mine = myChapterTotals(scopeStats, student.admissionNo)
      const curr = filters.examAll ? myChapterTotals(currStats, student.admissionNo) : mine
      const prev = myChapterTotals(prevStats, student.admissionNo)

      setChapters(Array.from(mine.entries()).map(([chapter, totals]) => {
        // Comparison only when the chapter was marked in BOTH exams.
        const c = curr.get(chapter)
        const p = prevExam ? prev.get(chapter) : undefined
        let trend: string | null = null
        let trendDown = false
        if (prevExam && c && p) {
          const diff = round1(pct(c) - pct(p))
          trend = `${diff >= 0 ? '+' : ''}${diff}% from ${formatExamName(prevExam)}`
          trendDown = diff < 0
        }
        return {
          id: encodeURIComponent(chapter),
          name: chapter,
          avgPct: round1(pct(totals)),
          trend,
          trendDown,
        }
      }))
    })()
      .catch((err: unknown) => {
        if (ignore) return
        setChapters([])
        setError(err instanceof Error ? err.message : 'Failed to load chapters.')
      })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [filters, combos, student])

  // Detail links carry the backend filter context (incl. the resolved section
  // and the exam scope), mirroring the teacher grid's chapterHref.
  function chapterHref(id: string): string {
    if (!filters || !combos) return '#'
    const p = new URLSearchParams({
      grade: filters.grade,
      section: resolveStudentSection(combos, filters, student ?? null),
      subject: filters.subject,
    })
    if (filters.examAll) p.set('examAll', 'true')
    else p.set('exam', filters.exam)
    return `/chapter/${id}?${p.toString()}`
  }

  return (
    <div className="px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div>
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            {filters ? pickSubjectTitle(filters.subject, 'Chapter') : 'Chapter'}
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Review weak areas and remediation needs
          </p>
        </div>

        {/* Spec filter order: Subject -> Exams (All Exams / Single Exam) -> Grade */}
        {combos && filters && (
          <PageFilters showExam allowAllExams showSection={false} combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      {loading && <StatCardGridSkeleton />}
      {!loading && error && (
        <div className="border border-destructive/30 rounded-lg bg-destructive/5 px-4 py-6 text-[14px] text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && student === null && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          Your login isn&apos;t linked to a student record yet, so chapter performance can&apos;t be shown.
        </div>
      )}
      {!loading && !error && student !== null && chapters.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No marked chapter data for you in the selected exams yet. Chapter performance appears once your papers have been analysed.
        </div>
      )}

      {/* Chapter grid — the student's own averages, never the class's */}
      {!loading && !error && chapters.length > 0 && (
      <div className="grid grid-cols-3 gap-6">
        {chapters.map((chapter) => (
          <StatCard
            key={chapter.id}
            name={chapter.name}
            label="Average"
            avg={chapter.avgPct}
            suffix="%"
            trend={chapter.trend}
            trendDown={chapter.trendDown}
            drilldownEntity="chapter"
            href={chapterHref(chapter.id)}
          />
        ))}
      </div>
      )}
    </div>
  )
}
