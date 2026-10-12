'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ChevronsUpDown, ChevronUp, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ChevronDown, ArrowUp, ArrowDown, Loader2,
} from 'lucide-react'
import { AnalysisDetailSheet, type AnalysisDetailData } from './analysis-detail-sheet'
import { TableColumnToggle, type ColumnToggleOption } from './table-column-toggle'
import { TableFilterPopover, filterKey, type FilterGroup } from './table-filter-popover'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { fetchStudents, fetchStudentAnswerErrors, type StudentAnswerError } from '@/app/lib/students'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { useRouter } from 'next/navigation'
import { useFeatureFlag } from '@/components/config-provider'
import { trackDrilldown } from '@/app/lib/analytics'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'

interface StudentRow {
  roll: string
  admission?: string | null
  name: string
  strongest: string
  weakest: string
  commonMistake: string
  /** The other mistakes behind the "+N" — real values only, never inferred. */
  extraMistakes?: string[]
  score: string
  // spec: absent students show "AB" in every column except Roll and Student
  absent?: boolean
}

const columnOptions: ColumnToggleOption[] = [
  { key: 'strongest',     label: 'Strongest' },
  { key: 'weakest',       label: 'Weakest' },
  { key: 'commonMistake', label: 'Common mistake' },
  { key: 'score',         label: 'Score' },
]

// Placeholder rows (used only when no exam context is provided).
const FALLBACK_ROWS: StudentRow[] = [
  { roll: 'R01', name: 'Devon Lane',       strongest: 'Matrices',              weakest: 'Determinants',        commonMistake: 'Misreading',    extraMistakes: ['Calculation'], score: '50/80' },
  { roll: 'R02', name: 'Leslie Alexander', strongest: 'Determinants',          weakest: 'Matrices',            commonMistake: 'Steps skipped', extraMistakes: ['Calculation'], score: '50/80' },
  { roll: 'R03', name: 'Cody Fisher',      strongest: 'Continuity',            weakest: 'Probability',         commonMistake: 'Misreading',    extraMistakes: ['Calculation'], score: '50/80' },
]

function scoreRatio(score: string): number {
  if (!score.includes('/')) return parseFloat(score) || 0
  const [num, den] = score.split('/').map(Number)
  return den ? num / den : 0
}

// NOTE: the "+N" popover used to list `['Misreading','Steps skipped',
// 'Calculation']` minus the primary — a fixed list, identical for every
// student and unrelated to their work. With no per-student mistake data
// (student_error_type_summary is not written yet) every row rendered a blank
// label, a "+0" button, and a popover naming all three invented categories.
// The cell now renders only what the row actually carries.

// Same tokens as the chapter drawer's legend, so the two "Most common error"
// blocks read as one system.
const ERROR_COLORS = [
  'var(--inferentics-performance-not-improved-badge)',
  'var(--inferentics-performance-declined)',
  'var(--accent)',
  'var(--inferentics-performance-score)',
]

// The drawer's error breakdown, computed from this student's classified
// answers. `null` → no classification data for this student, hide the block.
interface ErrorBreakdown {
  description: string
  segments: { color: string; pct: number }[]
  legend: { color: string; label: string }[]
}

// Mirrors the summary-table convention (runbook §6a): the base is every
// incorrect response — coded AND uncoded — while only coded types are named.
// Uncoded remainder is left as bare track rather than given an invented label.
function buildErrorBreakdown(answers: StudentAnswerError[]): ErrorBreakdown | null {
  const incorrect = answers.filter((a) => a.verdict !== 'clean')
  if (incorrect.length === 0) return null
  const counts = new Map<string, number>()
  for (const a of incorrect) {
    if (a.errorTypeName) counts.set(a.errorTypeName, (counts.get(a.errorTypeName) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const types = Array.from(counts.entries())
    .map(([label, n]) => ({ label, pct: (n / incorrect.length) * 100 }))
    .sort((a, b) => b.pct - a.pct)
  const top = types[0]
  return {
    description: `${top.label} error: ${Math.round(top.pct)}% of incorrect responses`,
    segments: types.map((t, i) => ({ color: ERROR_COLORS[i % ERROR_COLORS.length], pct: t.pct })),
    legend: types.map((t, i) => ({ color: ERROR_COLORS[i % ERROR_COLORS.length], label: t.label })),
  }
}

function buildStudentSheetData(row: StudentRow, breakdown: ErrorBreakdown | null): AnalysisDetailData {
  return {
    title: row.name,
    subtitle: `Roll: ${row.roll} · Score: ${row.score}`,
    footerLabel: 'View student',
    // Real per-student distribution from /api/student-answer-errors, or no
    // block at all — the sheet hides it when segments are absent. Never a
    // mocked split: sections without a classification run show only the
    // chapter highlights below.
    errorDescription: breakdown?.description,
    errorSegments: breakdown?.segments,
    errorLegend: breakdown?.legend,
    // Strongest/weakest are real. They previously rendered under the bullet
    // block's default "Most common error" heading, which they are not — and
    // with the error block restored above, that heading now appears twice.
    bulletsTitle: 'Chapter highlights',
    bullets: [
      row.strongest ? `Strongest chapter: ${row.strongest}` : 'No standout strong chapter yet',
      row.weakest ? `Weakest chapter: ${row.weakest}` : 'No standout weak chapter yet',
    ],
  }
}

export function AnalysisStudentTable({ context }: { context?: AnalyticsFilters }) {
  const router = useRouter()
  // beaver#572/#569 — error-classification-derived: hide the column, and skip
  // the drawer (which is full of that same data) in favor of the real page.
  const showCommonMistakeColumnFlag = useFeatureFlag('show_common_mistake_column_student_table')
  const classifiedCohorts = useClassifiedCohorts()
  const showCommonMistakeColumn = showCommonMistakeColumnFlag && classificationEnabledFor(classifiedCohorts, context?.grade, context?.subject)
  const routeToDetail = useFeatureFlag('route_to_detail_student_table')
  const [rows, setRows] = useState<StudentRow[]>(FALLBACK_ROWS)
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({})
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir]         = useState<'asc' | 'desc' | null>(null)
  const [sheetRow, setSheetRow]       = useState<StudentRow | null>(null)
  // This student's error breakdown for the open drawer; null until fetched (the
  // block simply isn't rendered while loading or when no classification exists).
  const [sheetBreakdown, setSheetBreakdown] = useState<ErrorBreakdown | null>(null)
  const breakdownRequest = useRef(0)
  // The flag is school-wide, but per-student mistakes are only populated where
  // error classification has run, so require content too (same rule as the
  // students roster page). Without this the column renders for every section
  // as a blank label next to a "+0".
  const hasCommonMistakeData = rows.some((r) => Boolean(r.commonMistake))
  const showMistakeCol = showCommonMistakeColumn && hasCommonMistakeData

  useEffect(() => {
    if (!context) { setRows(FALLBACK_ROWS); setLoading(false); return }
    let ignore = false
    setLoading(true)
    fetchStudents(context)
      .then((rs) => {
        if (ignore) return
        setRows(rs.map((r) => ({
          roll: r.roll, name: r.name, admission: r.admission,
          strongest: r.strongest === '—' ? '' : r.strongest,
          weakest: r.weakest === '—' ? '' : r.weakest,
          commonMistake: r.mistake ?? '',
          score: r.marks,
          absent: r.absent,
        })))
      })
      .catch(() => { if (!ignore) setRows([]) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [context])

  const strongestOptions = Array.from(new Set(rows.map((r) => r.strongest).filter(Boolean)))
  const weakestOptions   = Array.from(new Set(rows.map((r) => r.weakest).filter(Boolean)))
  const filterGroups: FilterGroup[] = [
    { label: 'Strongest', options: strongestOptions },
    { label: 'Weakest',   options: weakestOptions },
  ]

  const toggleColumn = (key: string) =>
    setVisibleCols((prev) => ({ ...prev, [key]: prev[key] === false }))

  const showCol = (key: string) => visibleCols[key] !== false

  const toggleFilter = (key: string) =>
    setActiveFilters((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleSort = () =>
    setSortDir((d) => (d === null ? 'asc' : d === 'asc' ? 'desc' : null))

  const selectedStrongest = strongestOptions.filter((o) => activeFilters.has(filterKey('Strongest', o)))
  const selectedWeakest   = weakestOptions.filter((o) => activeFilters.has(filterKey('Weakest', o)))

  const filtered = rows.filter((r) =>
    (r.roll.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.strongest.toLowerCase().includes(search.toLowerCase()) ||
      r.weakest.toLowerCase().includes(search.toLowerCase()) ||
      r.commonMistake.toLowerCase().includes(search.toLowerCase())) &&
    (selectedStrongest.length === 0 || selectedStrongest.includes(r.strongest)) &&
    (selectedWeakest.length === 0 || selectedWeakest.includes(r.weakest)),
  )

  if (sortDir) {
    filtered.sort((a, b) => {
      const diff = scoreRatio(a.score) - scoreRatio(b.score)
      return sortDir === 'asc' ? diff : -diff
    })
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage   = Math.min(page, totalPages - 1)
  const pageRows   = filtered.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage)

  function hrefFor(row: StudentRow): string | undefined {
    if (!context) return undefined
    return `/student/${row.roll.toLowerCase()}?${new URLSearchParams({
      name: row.name,
      admission: row.admission ?? '',
      grade: context.grade, section: context.section, subject: context.subject, exam: context.exam,
    }).toString()}`
  }

  function openRow(row: StudentRow) {
    if (routeToDetail) {
      const href = hrefFor(row)
      if (href) { trackDrilldown('student'); router.push(href); return }
    }
    setSheetRow(row)
    // Fetch this student's classified answers for the drawer's error block.
    // The request id guards against a quick open of another row landing its
    // response late and showing the wrong student's bar.
    setSheetBreakdown(null)
    if (!context) return
    const requestId = ++breakdownRequest.current
    fetchStudentAnswerErrors(context, { roll: row.roll, admissionNo: row.admission })
      .then((answers) => {
        if (breakdownRequest.current === requestId) setSheetBreakdown(buildErrorBreakdown(answers))
      })
      .catch(() => {
        if (breakdownRequest.current === requestId) setSheetBreakdown(null)
      })
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Title + filters */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex flex-col gap-[2px]">
          <p className="text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">
            Pick a student for detailed analysis
          </p>
          <p className="text-[14px] font-normal leading-5 text-muted-foreground">
            Review mistakes for each student
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-[259px] border border-border rounded-md bg-background flex items-center px-3">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="flex-1 text-[14px] leading-5 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <TableColumnToggle
            columns={showMistakeCol ? columnOptions : columnOptions.filter((c) => c.key !== 'commonMistake')}
            visible={visibleCols}
            onToggle={toggleColumn}
          />
          <TableFilterPopover groups={filterGroups} selected={activeFilters} onToggle={toggleFilter} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="border border-border rounded-lg h-[220px] flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="border border-border rounded-lg overflow-hidden">
        <TooltipProvider delayDuration={300}>
        <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[91px] whitespace-nowrap">Roll</th>
              <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[270px]">Student</th>
              {showCol('strongest') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[185px] whitespace-nowrap">Strongest</th>
              )}
              {showCol('weakest') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[185px] whitespace-nowrap">Weakest</th>
              )}
              {showCol('commonMistake') && showMistakeCol && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[181px] whitespace-nowrap">Common mistake</th>
              )}
              {showCol('score') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[95px] whitespace-nowrap">
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="flex items-center gap-1 hover:text-foreground/80 transition-colors"
                  >
                    Score
                    {sortDir === 'asc' && <ChevronUp className="size-4 text-foreground" />}
                    {sortDir === 'desc' && <ChevronDown className="size-4 text-foreground" />}
                    {sortDir === null && <ChevronsUpDown className="size-4 text-muted-foreground" />}
                  </button>
                </th>
              )}
              <th className="bg-[#f0fdf4] border-b border-border px-2 py-3 w-[101px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.roll}
                onClick={() => openRow(row)}
                className="hover:bg-muted/20 transition-colors cursor-pointer"
              >
                {/* Roll */}
                <td className="border-b border-border px-4 py-0 h-[56px] text-[16px] font-normal text-foreground whitespace-nowrap align-middle w-[91px]">
                  <CellTooltip content={row.roll}>{row.roll}</CellTooltip>
                </td>
                {/* Student */}
                <td className="border-b border-border px-4 py-0 h-[56px] align-middle max-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block truncate text-[16px] font-medium text-foreground cursor-default">
                        {row.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] text-wrap">
                      {row.name}
                    </TooltipContent>
                  </Tooltip>
                </td>
                {/* Strongest */}
                {showCol('strongest') && (
                  <td className="border-b border-border px-4 py-0 h-[56px] align-middle w-[185px] max-w-[185px]">
                    {row.absent ? (
                      <span className="text-[16px] font-normal text-muted-foreground">AB</span>
                    ) : row.strongest ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowUp className="size-4 text-chart-2 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-[16px] font-normal text-foreground truncate cursor-default">{row.strongest}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] text-wrap">
                              {row.strongest}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ) : null}
                  </td>
                )}
                {/* Weakest */}
                {showCol('weakest') && (
                  <td className="border-b border-border px-4 py-0 h-[56px] align-middle w-[185px] max-w-[185px]">
                    {row.absent ? (
                      <span className="text-[16px] font-normal text-muted-foreground">AB</span>
                    ) : row.weakest ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowDown className="size-4 text-[#ffa940] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-[16px] font-normal text-foreground truncate cursor-default">{row.weakest}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] text-wrap">
                              {row.weakest}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ) : null}
                  </td>
                )}
                {/* Common mistake */}
                {showCol('commonMistake') && showMistakeCol && (
                  <td className="border-b border-border px-4 py-0 h-[56px] align-middle max-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="min-w-0 flex-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate text-[16px] font-normal text-foreground cursor-default">
                              {row.commonMistake}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-wrap">
                            {row.commonMistake}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {/* Only when the row really has further mistakes. */}
                      {(row.extraMistakes?.length ?? 0) > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[16px] font-medium text-[#3b82f6] hover:underline shrink-0"
                            >
                              +{row.extraMistakes?.length ?? 0}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            onClick={(e) => e.stopPropagation()}
                            className="w-auto min-w-[128px] p-1.5"
                          >
                            <div className="flex flex-col">
                              {[row.commonMistake, ...(row.extraMistakes ?? [])]
                                .filter(Boolean)
                                .map((mistake) => (
                                  <div
                                    key={mistake}
                                    className="h-8 flex items-center rounded-md px-2 text-[14px] text-popover-foreground whitespace-nowrap"
                                  >
                                    {mistake}
                                  </div>
                                ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </td>
                )}
                {/* Score */}
                {showCol('score') && (
                  <td className="border-b border-border px-4 py-0 h-[56px] align-middle w-[95px]">
                    <CellTooltip content={row.score}>
                      <span className="text-[14px] font-medium tracking-[-0.084px] text-foreground whitespace-nowrap">{row.score}</span>
                    </CellTooltip>
                  </td>
                )}
                {/* View button */}
                <td className="border-b border-[#e5e7eb] px-4 py-0 h-[56px] align-middle w-[101px]">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); openRow(row) }}
                      className="flex items-center gap-2 border border-border rounded-md h-8 px-2 bg-background hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-[12px] font-medium tracking-[-0.072px] text-foreground">View</span>
                      <ChevronRight className="size-4 text-foreground" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </TooltipProvider>

        {/* Pagination footer */}
        <div className="bg-white flex items-center justify-between px-4 py-3">
          <p className="flex-1 text-[16px] font-normal leading-6 text-muted-foreground opacity-0 select-none">
            0 of {filtered.length} row(s) selected.
          </p>
          <div className="flex items-center gap-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-normal leading-5 text-foreground whitespace-nowrap">Rows per page</span>
              <label className="relative flex items-center">
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0) }}
                  className="appearance-none bg-background border border-border rounded-md pl-3 pr-7 py-[6px] text-[14px] font-normal leading-5 text-foreground cursor-pointer focus:outline-none"
                >
                  {[5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-4 text-foreground" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(0)} disabled={safePage === 0} aria-label="First page"
                className="size-9 flex items-center justify-center border border-border rounded-md bg-background hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronsLeft className="size-4" />
              </button>
              <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label="Previous page"
                className="size-9 flex items-center justify-center border border-border rounded-md bg-background hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="size-4" />
              </button>
              <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage === totalPages - 1} aria-label="Next page"
                className="size-9 flex items-center justify-center border border-border rounded-md bg-background hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight className="size-4" />
              </button>
              <button onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1} aria-label="Last page"
                className="size-9 flex items-center justify-center border border-border rounded-md bg-background hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronsRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      <AnalysisDetailSheet
        open={!!sheetRow}
        onClose={() => setSheetRow(null)}
        data={sheetRow ? { ...buildStudentSheetData(sheetRow, sheetBreakdown), footerHref: hrefFor(sheetRow) } : null}
      />
    </div>
  )
}
