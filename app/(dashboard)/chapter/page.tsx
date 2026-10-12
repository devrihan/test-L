'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import { StatCardGridSkeleton, TableSkeleton } from '@/components/page-skeletons'
import { PageFilters } from '@/components/page-filters'
import { Button } from '@/components/ui/button'
import { pickSubjectTitle } from '@/app/lib/filters'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { useViewer } from '@/app/lib/viewer'
import { StudentChapterPage } from '@/components/student-chapter-page'
import { fetchChapters, type ChapterRow } from '@/app/lib/chapters'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { ApiError } from '@/app/lib/api'
import { trackDrilldown } from '@/app/lib/analytics'


function LayoutGridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 1.33333C1.63181 1.33333 1.33333 1.63181 1.33333 2V6.66667C1.33333 7.03486 1.63181 7.33333 2 7.33333H6.66667C7.03486 7.33333 7.33333 7.03486 7.33333 6.66667V2C7.33333 1.63181 7.03486 1.33333 6.66667 1.33333H2ZM2.66667 6V2.66667H6V6H2.66667ZM9.33333 1.33333C8.96514 1.33333 8.66667 1.63181 8.66667 2V6.66667C8.66667 7.03486 8.96514 7.33333 9.33333 7.33333H14C14.3682 7.33333 14.6667 7.03486 14.6667 6.66667V2C14.6667 1.63181 14.3682 1.33333 14 1.33333H9.33333ZM10 6V2.66667H13.3333V6H10ZM8.66667 9.33333C8.66667 8.96514 8.96514 8.66667 9.33333 8.66667H14C14.3682 8.66667 14.6667 8.96514 14.6667 9.33333V14C14.6667 14.3682 14.3682 14.6667 14 14.6667H9.33333C8.96514 14.6667 8.66667 14.3682 8.66667 14V9.33333ZM10 10V13.3333H13.3333V10H10ZM2 8.66667C1.63181 8.66667 1.33333 8.96514 1.33333 9.33333V14C1.33333 14.3682 1.63181 14.6667 2 14.6667H6.66667C7.03486 14.6667 7.33333 14.3682 7.33333 14V9.33333C7.33333 8.96514 7.03486 8.66667 6.66667 8.66667H2ZM2.66667 13.3333V10H6V13.3333H2.66667Z"
        fill="currentColor"
      />
    </svg>
  )
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.66667 3.33333C2.66667 2.96514 2.96514 2.66667 3.33333 2.66667H7.33333V5.33333H2.66667V3.33333ZM7.33333 6.66667H2.66667V9.33333H7.33333V6.66667ZM8.66667 9.33333V6.66667H13.3333V9.33333H8.66667ZM7.33333 10.6667H2.66667V12.6667C2.66667 13.0349 2.96514 13.3333 3.33333 13.3333H7.33333V10.6667ZM8.66667 13.3333V10.6667H13.3333V12.6667C13.3333 13.0349 13.0349 13.3333 12.6667 13.3333H8.66667ZM8 14.6667H3.33333C2.22876 14.6667 1.33333 13.7712 1.33333 12.6667V10V6V3.33333C1.33333 2.22876 2.22876 1.33333 3.33333 1.33333H8H12.6667C13.7712 1.33333 14.6667 2.22876 14.6667 3.33333V6V10V12.6667C14.6667 13.7712 13.7712 14.6667 12.6667 14.6667H8ZM8.66667 2.66667H12.6667C13.0349 2.66667 13.3333 2.96514 13.3333 3.33333V5.33333H8.66667V2.66667Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function ChapterPage() {
  const { activeRole, roleResolved } = useViewer()
  // activeRole falls back to TEACHER until the stored user is read
  // (viewer.tsx roleResolved), so without this gate the TEACHER body mounts
  // for one frame on a student login and fires its class-level fetches —
  // every one a 403 for a student token (console noise + wasted round trips).
  // Render nothing for that frame instead; the resolved role then mounts once.
  if (!roleResolved) return null
  if (activeRole === 'STUDENT') return <StudentChapterPage />
  return <TeacherChapterPage />
}

// Average marks to at most 1 decimal (chapter max marks are small, e.g. 1–9,
// so whole-number rounding would blur 4.6 vs 5.4). Integers stay integers.
function fmtMarks(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1)
}

// Class average as "avg marks (pct%)" — e.g. "4.6 (51%)". Falls back to just
// the percentage when there are no absolute marks (v2 accuracy path), and "—"
// when there's no analytics at all (blueprint chapters).
function classAverageDisplay(row: { avgMarks: number | null; classAvg: number | null }): string {
  if (row.classAvg === null) return '—'
  if (row.avgMarks === null) return `${row.classAvg}%`
  return `${fmtMarks(row.avgMarks)} (${row.classAvg}%)`
}

// Teacher chapter body — now wired to aggregatedData's GET /api/chapters
// (see app/lib/chapters.ts) instead of a hardcoded array.
function TeacherChapterPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const [sort, setSort] = useState<{ key: 'classAvg'; dir: 'asc' | 'desc' } | null>(null)

  const { combos, filters, setFilters } = useAnalyticsFilters()
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filters) return
    let ignore = false
    setLoading(true)
    setError(null)
    fetchChapters(filters, combos ?? undefined)
      .then((rows) => {
        if (!ignore) setChapters(rows)
      })
      .catch((err: unknown) => {
        if (ignore) return
        setChapters([])
        setError(
          err instanceof ApiError && err.status === 0
            ? 'Could not reach the analytics service. Is aggregatedData running on :8082?'
            : err instanceof Error
              ? err.message
              : 'Failed to load chapters.',
        )
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [filters, combos])

  const filteredChapters = chapters.filter((chapter) =>
    chapter.name.toLowerCase().includes(search.toLowerCase())
  )

  const sortedChapters = [...filteredChapters]
  if (sort) {
    sortedChapters.sort((a, b) => {
      // sort nulls last regardless of direction.
      let diff: number
      if (a.classAvg === null && b.classAvg === null) diff = 0
      else if (a.classAvg === null) return 1
      else if (b.classAvg === null) return -1
      else diff = a.classAvg - b.classAvg
      return sort.dir === 'asc' ? diff : -diff
    })
  }

  function toggleSort(key: 'classAvg') {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  // Carry backend filter context so the detail page can fetch chapter analytics
  // and show which exam(s) the numbers below the chapter name refer to.
  function chapterHref(id: string): string {
    const p = new URLSearchParams({
      grade: filters?.grade ?? '',
      section: filters?.section ?? '',
      subject: filters?.subject ?? '',
    })
    if (filters?.examAll) {
      p.set('examAll', 'true')
    } else if (filters?.exam) {
      p.set('exam', filters.exam)
    }
    return `/chapter/${id}?${p.toString()}`
  }
  // Row click and the stopPropagation'd View button open the same chapter —
  // one track-then-navigate function so the two can't diverge.
  function openChapter(id: string) {
    trackDrilldown('chapter')
    router.push(chapterHref(id))
  }


  return (
    <div className="px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
      <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
  {filters ? pickSubjectTitle(filters.subject, 'Chapter') : 'Pick a Chapter'}
</h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
           Review weak areas and remediation needs
          </p>
        </div>

        {combos && filters && (
          <PageFilters showExam allowAllExams combineGradeSection combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      <div className="flex flex-col gap-3">
      {/* Search + view toggle */}
      <div className="flex gap-4 items-center pl-px">
        <div className="flex flex-1 items-center">
          <div className="w-[259px] border border-border rounded-md bg-background flex items-center px-3 py-2">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 text-[14px] leading-5 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-start gap-0 bg-secondary p-1 rounded-md shrink-0 w-[88px]">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`h-8 px-3 py-1.5 flex items-center justify-center rounded shrink-0 transition-colors ${
              viewMode === 'grid' ? 'bg-background shadow-[0px_1px_1px_rgba(0,0,0,0.05)]' : ''
            }`}
          >
            <LayoutGridIcon className="size-4 text-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`h-8 px-3 py-1.5 flex items-center justify-center rounded shrink-0 transition-colors ${
              viewMode === 'table' ? 'bg-background shadow-[0px_1px_1px_rgba(0,0,0,0.05)]' : ''
            }`}
          >
            <TableIcon className="size-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* Data status */}
      {/* Matches whichever view is active, so the skeleton doesn't preview a
          layout the user isn't about to get. */}
      {loading && (viewMode === 'grid' ? <StatCardGridSkeleton /> : <TableSkeleton columns={4} />)}
      {!loading && error && (
        <div className="border border-destructive/30 rounded-lg bg-destructive/5 px-4 py-6 text-[14px] text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && sortedChapters.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No chapters found for the selected filters.
        </div>
      )}

      {!loading && !error && sortedChapters.length > 0 && (viewMode === 'grid' ? (
        /* Chapter grid */
        <div className="grid grid-cols-3 gap-6">
          {filteredChapters.map((chapter) => (
            <StatCard
              key={chapter.id}
              name={chapter.name}
              label={chapter.classAvg === null ? 'Total marks' : 'Section average'}
              avg={chapter.classAvg === null ? chapter.maxMarks : chapter.classAvg}
              suffix={chapter.classAvg === null ? '' : '%'}
              valueDisplay={
                chapter.avgMarks !== null && chapter.classAvg !== null
                  ? classAverageDisplay(chapter)
                  : undefined
              }
              trend={chapter.trend}
              drilldownEntity="chapter"
              href={chapterHref(chapter.id)}
            />
          ))}
        </div>
      ) : (
        /* Chapter table */
        <div className="border border-sidebar-border rounded-xl overflow-hidden">
          <TooltipProvider delayDuration={300}>
          <Table>
            <TableHeader>
              <TableRow className="bg-green-50 hover:bg-green-50 border-sidebar-border">
                <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[240px]">
                  Chapter name
                </TableHead>
                <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[120px]">
                  <button
                    type="button"
                    onClick={() => toggleSort('classAvg')}
                    className="flex items-center gap-1 hover:text-foreground/80 transition-colors"
                  >
                    {filters?.examAll ? 'Average for all exams' : 'Class average'}
                    {sort?.key === 'classAvg' && sort.dir === 'asc' && <ChevronUp className="size-4" />}
                    {sort?.key === 'classAvg' && sort.dir === 'desc' && <ChevronDown className="size-4" />}
                    {sort?.key !== 'classAvg' && <ChevronsUpDown className="size-4" />}
                  </button>
                </TableHead>
                <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[103px]">
                  Max marks
                </TableHead>
                <TableHead className="px-4 py-3 h-auto w-[88px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedChapters.map((chapter) => (
                <TableRow
                  key={chapter.id}
                  onClick={() => openChapter(chapter.id)}
                  className="border-sidebar-border hover:bg-muted/30 cursor-pointer bg-white"
                >
                  <TableCell className="px-4 py-3 max-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-[14px] leading-5 text-foreground cursor-default">
                          {chapter.name}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[320px] text-wrap">
                        {chapter.name}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground w-[120px]">
                    <CellTooltip content={classAverageDisplay(chapter)}>
                      {classAverageDisplay(chapter)}
                    </CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground w-[103px]">
                    <CellTooltip content={chapter.maxMarks ?? '—'}>{chapter.maxMarks ?? '—'}</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 w-[88px] text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-[12px] h-8 px-3"
                      onClick={(e) => { e.stopPropagation(); openChapter(chapter.id) }}
                    >
                      View
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </TooltipProvider>
        </div>
      ))}

      </div>
    </div>
  )
}
