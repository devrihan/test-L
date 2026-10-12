'use client'

import { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { fetchCropRoster, type CropRosterRow } from '@/app/lib/answer-crops'
import { formatExamName } from '@/app/lib/filters'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { useViewer } from '@/app/lib/viewer'
import { BreadcrumbSwitcher } from '@/components/breadcrumb-switcher'
import { PerformanceTab } from '@/components/performance-tab'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// One class's answer scripts for one paper (Figma 1570-50747). The question
// browser on the right is PerformanceTab, already built for the student pages.

const pct = (row: CropRosterRow): number | null =>
  row.totalMarks == null || !row.totalMaxMarks
    ? null
    : Math.round((row.totalMarks / row.totalMaxMarks) * 100)

export default function AnswerScriptDetailPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params)
  const exam = decodeURIComponent(examId)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { viewer, roleResolved } = useViewer()

  const grade = searchParams.get('grade') ?? ''
  const section = searchParams.get('section') ?? ''
  const subject = searchParams.get('subject') ?? ''
  const cohort = `Grade ${grade} - ${section}`

  // const redirecting = roleResolved && !!viewer && viewer.navView !== 'leadership'
  // useEffect(() => {
  //   if (redirecting) router.replace('/dashboard')
  // }, [redirecting, router])

  usePageBreadcrumb(
    <BreadcrumbSwitcher
      parentLabel="Answer scripts"
      parentHref="/answer-scripts"
      activeId={exam}
      activeLabel={formatExamName(exam)}
      sectionLabel="Exams"
      items={[{ id: exam, label: formatExamName(exam) }]}
      onSelect={() => { /* one paper per page; switching lives on the list */ }}
    />,
    [exam],
  )

  const [roster, setRoster] = useState<CropRosterRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedRoll, setSelectedRoll] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!grade || !section || !subject || !exam) return
    let ignore = false
    fetchCropRoster({ grade, section, subject, exam })
      .then((rows) => { if (!ignore) setRoster(rows) })
      .catch(() => { if (!ignore) { setRoster([]); setFailed(true) } })
    return () => { ignore = true }
  }, [grade, section, subject, exam])

  // Worst first — the reason to open this screen is to find who's struggling.
  const ordered = [...(roster ?? [])].sort((a, b) => (pct(a) ?? 101) - (pct(b) ?? 101))
  const shown = query.trim()
    ? ordered.filter((r) => r.studentName.toLowerCase().includes(query.trim().toLowerCase()))
    : ordered
  const selected = ordered.find((r) => r.rollNumber === selectedRoll) ?? ordered[0] ?? null

  // if (redirecting) {
  //   return <div className="min-h-full bg-stone-50 p-6"><Skeleton className="h-[560px] w-full rounded-2xl" /></div>
  // }

  if (!grade || !section || !subject) {
    return (
      <div className="min-h-full bg-stone-50 p-6">
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          This link is missing its class. Open a paper from the Answer scripts page.
        </div>
      </div>
    )
  }

  return (
    // h-full + overflow-hidden, not min-h-full: the columns below scroll
    // themselves, and a min-height would just grow the page instead.
    <div className="h-full flex bg-stone-50 overflow-hidden">
      {/* Left: the class, worst score first */}
      <aside className="w-[240px] shrink-0 border-r border-border bg-background flex flex-col">
        <div className="p-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-[14px] leading-5 outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>

        {/* min-h-0: a flex child defaults to min-height:auto and would refuse
            to shrink below its content, so it would never scroll. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {roster === null && (
            <div className="px-4 flex flex-col gap-3">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
          {roster !== null && shown.length === 0 && (
            <p className="px-4 text-[14px] text-muted-foreground">
              {failed ? "Couldn't load the class." : 'No students match.'}
            </p>
          )}
          {shown.map((row) => {
            const score = pct(row)
            const active = selected?.rollNumber === row.rollNumber
            return (
              <button
                key={row.rollNumber}
                type="button"
                onClick={() => setSelectedRoll(row.rollNumber)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border flex items-start justify-between gap-2 transition-colors',
                  active ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50',
                )}
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-5 text-foreground truncate">
                    {row.studentName}
                  </span>
                  <span className="block text-[12px] leading-4 text-muted-foreground truncate">{cohort}</span>
                </span>
                <span
                  className={cn(
                    'text-[12px] font-medium leading-4 shrink-0 tabular-nums',
                    // Red below 60, per the frame's 54% treatment.
                    score != null && score < 60 ? 'text-[#e60000]' : 'text-muted-foreground',
                  )}
                >
                  {score == null ? '—' : `${score}%`}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right: the selected student's script */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <div className="bg-background border border-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.144px] text-foreground truncate">
                {selected?.studentName ?? '—'}
              </h1>
              <p className="text-[16px] font-medium leading-6 text-muted-foreground">{cohort}</p>
            </div>
            {/* The frame's "View answer script" button is omitted until we know
                what it opens — a dead CTA is worse than none. */}
            {selected && (
              <div
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-[16px] font-medium tabular-nums',
                  pct(selected) != null && pct(selected)! >= 90
                    ? 'border-green-500 text-green-600'
                    : pct(selected) != null && pct(selected)! >= 60
                      ? 'border-yellow-600 text-yellow-600'
                      : 'border-red-500 text-red-600',
                )}
              >
                {selected.totalMarks ?? 0}/{selected.totalMaxMarks ?? 0}
              </div>
            )}
          </div>

          {selected && (
            <PerformanceTab
              key={selected.rollNumber}
              showExamsFilter={false}
              cropContext={{
                grade,
                section,
                subject,
                exam,
                roll: selected.rollNumber,
                admissionNo: selected.admissionNo ?? undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
