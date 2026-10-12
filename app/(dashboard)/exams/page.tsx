'use client'

import { useState, useEffect } from 'react'
import { StatCard } from '@/components/stat-card'
import { StatCardGridSkeleton } from '@/components/page-skeletons'
import { PageFilters } from '@/components/page-filters'
import { fetchCropRoster } from '@/app/lib/answer-crops'
import { fetchExamInfo, formatExamDate } from '@/app/lib/questions'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { formatExamName, matchesAcademicYear, academicYearsOf, pickSubjectTitle, byExamOrder, type AnalyticsFilters } from '@/app/lib/filters'
import { useViewer } from '@/app/lib/viewer'
import { useLoggedInStudent, resolveStudentSection, normKey } from '@/app/lib/student-identity'

export default function ExamsPage() {
  const { activeRole, roleResolved } = useViewer()
  // activeRole falls back to TEACHER until the stored user is read
  // (viewer.tsx roleResolved), so without this gate the TEACHER body mounts
  // for one frame on a student login and fires its class-level fetches —
  // every one a 403 for a student token (console noise + wasted round trips).
  // Render nothing for that frame instead; the resolved role then mounts once.
  if (!roleResolved) return null
  if (activeRole === 'STUDENT') return <StudentExamsPage />
  return <TeacherExamsPage />
}

// ─── Shared page chrome ──────────────────────────────────────────────────────

function ExamsPageShell({
  title = 'Exams', subtitle = 'Browse and analyse exams', filtersSlot, children,
}: {
  title?: string
  subtitle?: string
  filtersSlot: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            {title}
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {filtersSlot}
      </div>
      {children}
    </div>
  )
}

function examHref(filters: AnalyticsFilters | null, name: string, section?: string): string {
  if (!filters) return `/exam/${encodeURIComponent(name)}`
  const p = new URLSearchParams({
    grade: filters.grade, section: section ?? filters.section, subject: filters.subject, exam: name,
  })
  return `/exam/${encodeURIComponent(name)}?${p.toString()}`
}

// ─── Teacher / shared list — class average per exam ──────────────────────────

interface ExamCard { name: string; avg: number; marks: number }

function TeacherExamsPage() {
  const { combos, filters, setFilters, error, retry } = useAnalyticsFilters()
  const [exams, setExams] = useState<ExamCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!filters || !combos) return
    let ignore = false
    setLoading(true)
    const examNames = Array.from(new Set(
      combos
        .filter((c) => c.grade === filters.grade && c.subject === filters.subject && c.section === filters.section)
        .map((c) => c.exam),
    )).sort(byExamOrder)
    Promise.all(examNames.map(async (exam) => {
      const roster = await fetchCropRoster({
        grade: filters.grade, section: filters.section, subject: filters.subject, exam,
      }).catch(() => [])
      const marks = roster.map((r) => r.totalMarks ?? 0)
      const avg = marks.length ? Math.round(marks.reduce((a, b) => a + b, 0) / marks.length) : 0
      const max = Math.round(Math.max(0, ...roster.map((r) => r.totalMaxMarks ?? 0)))
      return { name: exam, avg, marks: max }
    }))
      .then((list) => { if (!ignore) { setExams(list); setLoading(false) } })
      .catch(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [filters, combos])

  return (
    <ExamsPageShell
      filtersSlot={combos && filters && (
        <PageFilters showSection={false} combos={combos} value={filters} onChange={setFilters} />
      )}
    >
      {error && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 flex items-center justify-between gap-4">
          <span className="text-[14px] text-muted-foreground">Couldn't load exams. Check your connection and try again.</span>
          <button
            type="button"
            onClick={retry}
            className="shrink-0 h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
      {!error && loading && <StatCardGridSkeleton />}
      {!error && !loading && exams.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No exams found for the selected filters.
        </div>
      )}

      {/* Exam grid */}
      {!error && !loading && exams.length > 0 && (
      <div className="grid grid-cols-3 gap-6">
        {exams.map((exam) => (
          <StatCard
            key={exam.name}
            name={formatExamName(exam.name)}
            subtitle={`${exam.marks} marks`}
            label="Score"
            avg={exam.avg}
            suffix=""
            trend={null}
            drilldownEntity="exam"
            href={examHref(filters, exam.name)}
          />
        ))}
      </div>
      )}
    </ExamsPageShell>
  )
}

// ─── Student list — own score per exam (Student Login Metrics (3)) ───────────
//
// The card shows the student's OWN score as "25/80" — score out of the exam's
// max marks — and the max marks also appear in the subtitle. The score comes
// from the student's row in the scanned-crop roster (matched by admission
// number); the max marks from the question paper (fetchExamInfo). An unmarked
// or missing scan renders "—", never a fake 0.

interface StudentExamCard {
  name: string
  /** the exam's date (question paper), ISO YYYY-MM-DD */
  date: string | null
  /** the exam's max marks (question paper first, marked scan as fallback) */
  max: number | null
  /** the logged-in student's own marked total */
  score: number | null
}

function StudentExamsPage() {
  const { combos, filters, setFilters, error, retry } = useAnalyticsFilters()
  const student = useLoggedInStudent()
  const [exams, setExams] = useState<StudentExamCard[]>([])
  const [loading, setLoading] = useState(true)

  const section = combos && filters ? resolveStudentSection(combos, filters, student) : null

  useEffect(() => {
    if (!filters || !combos) return
    let ignore = false
    setLoading(true)
    const sec = resolveStudentSection(combos, filters, student)
    const cohortExams = Array.from(new Set(
      combos
        .filter((c) =>
          c.grade === filters.grade &&
          normKey(c.subject) === normKey(filters.subject) &&
          normKey(c.section) === normKey(sec))
        .map((c) => c.exam),
    )).sort(byExamOrder)
    // Year scoping: the shared filters validate `year` against the *filter*
    // section's exams — re-validate against the resolved cohort (latest year
    // as fallback) so a mismatch can't hide every exam.
    const years = academicYearsOf(cohortExams)
    const year = filters.year && years.includes(filters.year) ? filters.year : years[0]
    const examNames = cohortExams.filter((e) => matchesAcademicYear(e, year))
    Promise.all(examNames.map(async (exam): Promise<StudentExamCard> => {
      const ctx = { grade: filters.grade, section: sec, subject: filters.subject, exam }
      const [roster, info] = await Promise.all([
        // Self-scoped roster: a student token is only allowed its own row
        // (access policy), which is also the only row this page needs.
        fetchCropRoster({ ...ctx, admissionNo: student?.admissionNo }).catch(() => []),
        fetchExamInfo(ctx).catch(() => null),
      ])
      const mine = student
        ? roster.find((r) => r.admissionNo != null && r.admissionNo === student.admissionNo) ?? null
        : null
      // Marked papers only — an unmarked scan has no honest score to show.
      const marked = mine != null && mine.totalMarks != null && (mine.totalMaxMarks ?? 0) > 0
      const max = info?.maxMarks ?? (marked ? Math.round(mine.totalMaxMarks as number) : null)
      return {
        name: exam,
        date: info?.examDate ?? null,
        max,
        // Show the true mark (e.g. 26.5), matching the exam detail page which
        // renders mine.totalMarks unrounded. JS stringifies 27.0 as "27" and
        // 26.5 as "26.5", so whole scores stay clean and half-marks show.
        score: marked ? (mine.totalMarks as number) : null,
      }
    }))
      .then((list) => { if (!ignore) { setExams(list); setLoading(false) } })
      .catch(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [filters, combos, student])

  return (
    <ExamsPageShell
      title={filters ? pickSubjectTitle(filters.subject, 'Exam') : 'Exams'}
      subtitle="Review a detailed analysis of each exam"
      filtersSlot={combos && filters && (
        <PageFilters showSection={false} combos={combos} value={filters} onChange={setFilters} />
      )}
    >
      {error && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 flex items-center justify-between gap-4">
          <span className="text-[14px] text-muted-foreground">Couldn't load exams. Check your connection and try again.</span>
          <button
            type="button"
            onClick={retry}
            className="shrink-0 h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
      {!error && loading && <StatCardGridSkeleton />}
      {!error && !loading && exams.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No exams found for the selected filters.
        </div>
      )}

      {/* Exam grid — Score as "25/80" with the exam's max marks (spec) */}
      {!error && !loading && exams.length > 0 && (
      <div className="grid grid-cols-3 gap-6">
        {exams.map((exam) => (
          <StatCard
            key={exam.name}
            name={formatExamName(exam.name, { year: false })}
            subtitle={[
              // "18 May 2026" (design shows no comma) then "80 marks"
              formatExamDate(exam.date)?.replace(',', ''),
              exam.max != null ? `${exam.max} marks` : null,
            ].filter(Boolean).join(' · ') || undefined}
            label="Score"
            avg={exam.score}
            suffix=""
            valueDisplay={exam.score != null && exam.max != null ? `${exam.score}/${exam.max}` : undefined}
            trend={null}
            drilldownEntity="exam"
            href={examHref(filters, exam.name, section ?? undefined)}
          />
        ))}
      </div>
      )}
    </ExamsPageShell>
  )
}
