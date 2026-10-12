'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { StatCard } from '@/components/stat-card'
import { PageFilters } from '@/components/page-filters'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { seniorCombos, seniorGrades } from '@/app/lib/senior-scope'
import { useViewer } from '@/app/lib/viewer'
import { fetchSubjectSummaries, type SubjectSummary } from '@/app/lib/subject-directory'
import { StatCardGridSkeleton } from '@/components/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// The leadership Subjects directory (Figma 1550-19932). One grade + one exam,
// every subject in scope, each card carrying the grade-wide average.

/** '10' -> '10th', '1' -> '1st'; the card title names the grade so it reads e.g. "10th Mathematics". */
function gradeOrdinal(grade: string): string {
  const n = Number(grade)
  if (!Number.isInteger(n)) return grade
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export default function SubjectDirectoryPage() {
  const router = useRouter()
  const { viewer, roleResolved } = useViewer()
  const { combos, filters, setFilters, error, retry } = useAnalyticsFilters()
  // Results are stamped with the request they answer, so `loading` is derived
  // rather than toggled — a slow response for the previous grade can't land
  // after a newer one and show the wrong subjects under the new heading.
  // `list: null` means that request failed.
  const [result, setResult] = useState<{ key: string; list: SubjectSummary[] | null } | null>(null)
  const [reload, setReload] = useState(0)

  // Not a security boundary — the nav simply doesn't offer this page to a
  // teacher or student, and the API is what actually refuses out-of-scope
  // data. This just stops a stale bookmark rendering an empty screen.
  const redirecting = roleResolved && !!viewer && !viewer.capabilities.view_subject_directory
  useEffect(() => {
    if (redirecting) router.replace('/dashboard')
  }, [redirecting, router])

  // The directory is for the grades the viewer LEADS (head of department,
  // coordinator, principal by the grant covering the grade); a class they
  // merely teach in another grade stays on the teacher pages. Rows without a
  // role lead nothing, so a filters feed that predates the field shows the
  // empty state rather than every grade.
  const ledCombos = useMemo(() => (combos ? seniorCombos(combos) : null), [combos])
  const ledGrades = useMemo(() => (ledCombos ? seniorGrades(ledCombos) : []), [ledCombos])

  // The shared selection may sit on a grade the viewer only teaches (the
  // teacher pages allow it); move it to a led grade before asking for subjects.
  const offLedGrade = !!filters && ledGrades.length > 0 && !ledGrades.includes(filters.grade)
  useEffect(() => {
    if (!offLedGrade || !ledCombos || !filters) return
    const first = ledCombos.find((c) => c.grade === ledGrades[0])
    if (first) setFilters({ ...filters, grade: first.grade, subject: first.subject, section: first.section, exam: first.exam })
  }, [offLedGrade, ledCombos, ledGrades, filters, setFilters])

  const requestKey = filters && !offLedGrade ? `${filters.grade}|${filters.exam}|${reload}` : null

  useEffect(() => {
    if (!filters || !ledCombos || !requestKey) return
    let ignore = false
    fetchSubjectSummaries({ combos: ledCombos, grade: filters.grade, exam: filters.exam })
      .then((list) => { if (!ignore) setResult({ key: requestKey, list }) })
      .catch(() => { if (!ignore) setResult({ key: requestKey, list: null }) })
    return () => { ignore = true }
  }, [requestKey, filters, ledCombos])

  const current = result && result.key === requestKey ? result : null
  const loading = !error && current === null
  const failed = error || current?.list === null
  const subjects = current?.list ?? []

  // `router.replace` only runs after this render, so without an explicit
  // branch a teacher who switched roles here would see the Subjects heading
  // and grid for a frame before being moved on.
  if (redirecting) {
    return (
      <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
        <Skeleton className="h-[36px] w-[180px]" />
        <StatCardGridSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Subjects
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Browse and analyse exams
          </p>
        </div>
        {ledCombos && filters && (
          <PageFilters
            showExam
            showSubject={false}
            showSection={false}
            examScope="grade"
            gradeOptions={ledGrades}
            combos={ledCombos}
            value={filters}
            onChange={setFilters}
          />
        )}
      </div>

      {failed && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 flex items-center justify-between gap-4">
          <span className="text-[14px] text-muted-foreground">Couldn&apos;t load subjects. Check your connection and try again.</span>
          <button
            type="button"
            // Retries both layers: the filter combos (which may be what failed)
            // and this page's own fetch.
            onClick={() => { retry(); setReload((n) => n + 1) }}
            className="shrink-0 h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
      {!failed && loading && <StatCardGridSkeleton />}
      {!failed && !loading && subjects.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No subjects found for the selected grade and exam.
        </div>
      )}

      {/* Subject grid */}
      {!failed && !loading && subjects.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {subjects.map((s) => (
            <StatCard
              key={s.subject}
              name={filters ? `${gradeOrdinal(filters.grade)} ${s.subject}` : s.subject}
              subtitle={`${s.sections} ${s.sections === 1 ? 'section' : 'sections'}`}
              label="Grade average"
              avg={s.average}
              // The Figma card carries a "+10.2 from midterm" delta, but the
              // layer is set to 0% opacity — a placeholder the designer left
              // hidden, not a state to build. Wire it up once there's a
              // decision on which exam it compares against.
              trend={null}
              // This subject's own id for the sitting, not the page's selected
              // one — those differ for every subject but the first.
              drilldownEntity="subject"
              href={`/subject/${encodeURIComponent(s.subject)}?${new URLSearchParams({
                grade: filters?.grade ?? '',
                exam: s.examId,
              }).toString()}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
