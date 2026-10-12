'use client'

import { useState, useEffect } from 'react'
import {
  ChevronsUpDown, ChevronUp, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, ChevronDown, Loader2,
} from 'lucide-react'
import { AnalysisDetailSheet, type AnalysisDetailData } from './analysis-detail-sheet'
import { TableColumnToggle, type ColumnToggleOption } from './table-column-toggle'
import { TableFilterPopover, filterKey, type FilterGroup } from './table-filter-popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import LatexInline from '@/components/latex-inline'
import LatexPreview from '@/components/latex-preview'
import { fetchQuestions } from '@/app/lib/questions'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { useRouter } from 'next/navigation'
import { useFeatureFlag } from '@/components/config-provider'

// Type badge colours — mirror the question page (app/(dashboard)/question/page.tsx)
// so both tables colour bloomTaxonomy identically. CBSE types plus the 4 tagged
// Bloom levels get colours; anything else falls back to neutral slate.
const TYPE_STYLES: Record<string, string> = {
  MCQ:         'text-orange-600 bg-orange-50 border border-orange-200',
  VSA:         'text-blue-600 bg-blue-50 border border-blue-200',
  SA:          'text-green-600 bg-green-50 border border-green-200',
  LA:          'text-purple-600 bg-purple-50 border border-purple-200',
  CASE_STUDY:  'text-pink-600 bg-pink-50 border border-pink-200',
  Knowledge:     'text-orange-600 bg-orange-50 border border-orange-200',
  Understanding: 'text-blue-600 bg-blue-50 border border-blue-200',
  Application:   'text-green-600 bg-green-50 border border-green-200',
  Skill:         'text-purple-600 bg-purple-50 border border-purple-200',
}
const TYPE_FALLBACK = 'text-slate-600 bg-slate-50 border border-slate-200'

interface Row { id?: number; q: string; text: string; chapter: string; concept: string; bloomTaxonomy: string; difficulty: string; classAvg: string; marks: number }

// Placeholder rows (used only when no exam context is provided).
const FALLBACK_ROWS: Row[] = [
  { q: 'Q1',  text: 'Let R be a relation on the set N of natural numbers defined by nRm if n divides m, then R is A) reflexive and symmetric B) transitive and symmetric C) equivalence relation D) reflexive, transitive but not symmetric', chapter: 'Relations and Functions', concept: 'Equivalence relations', bloomTaxonomy: 'Remember',   difficulty: 'Medium', classAvg: '37%', marks: 5 },
  { q: 'Q2',  text: 'Algebraic Structures & Applications',                   chapter: 'Algebra',   concept: 'Group axioms',   bloomTaxonomy: 'Understand', difficulty: 'Medium', classAvg: '9%',  marks: 5 },
  { q: 'Q3',  text: 'Calculus Fundamentals & Proofs',                        chapter: 'Calculus',  concept: 'Limits',         bloomTaxonomy: 'Understand', difficulty: 'Medium', classAvg: '20%', marks: 5 },
]

const columnOptions: ColumnToggleOption[] = [
  { key: 'chapter',    label: 'Chapter' },
  { key: 'concept',    label: 'Concept' },
  { key: 'type',       label: 'Type' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'classAvg',   label: 'Class avg' },
  { key: 'marks',      label: 'Marks' },
]

// 'Q1' → 'Question 1'. Anything that isn't in that form is left as-is rather
// than mangled into "Question " with nothing after it.
function questionLabel(q: string): string {
  const m = /^Q\s*(.+)$/i.exec(q.trim())
  return m ? `Question ${m[1]}` : q
}

function buildQuestionSheetData(row: Row): AnalysisDetailData {
  return {
    // The question text is long enough to truncate in the header, where it read
    // as a clipped sentence. It is still shown in full in the body (fullText).
    title: questionLabel(row.q),
    subtitle: `Chapter: ${row.chapter} · Average: ${row.classAvg}`,
    footerLabel: 'View question',
    fullText: row.text,
    accuracy: { description: 'Class average on this question', pct: parseFloat(row.classAvg) || 0 },
    // No per-question error breakdown is available here — the 33/33/34 split
    // was fixed text, the same for every question.
    bullets: [],
  }
}

// When `context` is supplied the table shows the exam's real questions (paper
// text + analytics accuracy where available); otherwise the placeholder rows.
export function AnalysisQuestionTable({ context }: { context?: AnalyticsFilters }) {
  const router = useRouter()
  // beaver#569 — skip the drawer (subjective error-classification data) and
  // go straight to the real question page until error classification is figured out.
  const routeToDetail = useFeatureFlag('route_to_detail_question_table')
  const ctxQs = context
    ? new URLSearchParams({ grade: context.grade, section: context.section, subject: context.subject, exam: context.exam }).toString()
    : ''
  const [rows, setRows] = useState<Row[]>(FALLBACK_ROWS)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!context) { setRows(FALLBACK_ROWS); setLoading(false); return }
    let ignore = false
    setLoading(true)
    fetchQuestions(context)
      .then((g) => {
        if (ignore) return
        setRows(g.questions.map((q) => ({
          id: q.id, q: q.q, text: q.title, chapter: q.chapter,
          concept: q.concept, bloomTaxonomy: q.bloomTaxonomy, difficulty: q.difficulty,
          classAvg: q.avg ? `${q.avg}%` : '—', marks: q.marks,
        })))
      })
      .catch(() => { if (!ignore) setRows([]) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [context])

  const typeOptions = Array.from(new Set(rows.map((r) => r.bloomTaxonomy)))
  const chapterOptions = Array.from(new Set(rows.map((r) => r.chapter)))
  const filterGroups: FilterGroup[] = [
    { label: 'Type',    options: typeOptions },
    { label: 'Chapter', options: chapterOptions },
  ]

  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dialogRow, setDialogRow]     = useState<Row | null>(null)
  const [sortDir, setSortDir]         = useState<'asc' | 'desc' | null>(null)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({})
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())

  const toggleColumn = (key: string) =>
    setVisibleCols((prev) => ({ ...prev, [key]: prev[key] === false }))

  const toggleFilter = (option: string) =>
    setActiveFilters((prev) => {
      const next = new Set(prev)
      next.has(option) ? next.delete(option) : next.add(option)
      return next
    })

  const selectedTypes    = typeOptions.filter((t) => activeFilters.has(filterKey('Type', t)))
  const selectedChapters = chapterOptions.filter((c) => activeFilters.has(filterKey('Chapter', c)))

  const filtered = rows.filter(
    (r) =>
      (r.q.toLowerCase().includes(search.toLowerCase()) ||
        r.text.toLowerCase().includes(search.toLowerCase()) ||
        r.chapter.toLowerCase().includes(search.toLowerCase())) &&
      (selectedTypes.length === 0 || selectedTypes.includes(r.bloomTaxonomy)) &&
      (selectedChapters.length === 0 || selectedChapters.includes(r.chapter)),
  )

  if (sortDir) {
    filtered.sort((a, b) => {
      const diff = parseFloat(a.classAvg) - parseFloat(b.classAvg)
      return sortDir === 'asc' ? diff : -diff
    })
  }

  const toggleSort = () =>
    setSortDir((d) => (d === null ? 'asc' : d === 'asc' ? 'desc' : null))

  const showCol = (key: string) => visibleCols[key] !== false

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage   = Math.min(page, totalPages - 1)
  const pageRows   = filtered.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage)

  function hrefFor(row: Row): string | undefined {
    return row.id != null && context ? `/question/${row.id}?${ctxQs}` : undefined
  }

  function openRow(row: Row) {
    if (routeToDetail) {
      const href = hrefFor(row)
      if (href) { router.push(href); return }
    }
    setDialogRow(row)
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Title + filters */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex flex-col gap-[2px]">
          <p className="text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">
            Pick a question for detailed analysis
          </p>
          <p className="text-[18px] font-normal leading-7 tracking-[-0.108px] text-muted-foreground">
            Review mistakes for each question
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
          <TableColumnToggle columns={columnOptions} visible={visibleCols} onToggle={toggleColumn} />
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
              <th className="bg-[#f0fdf4] border-b border-border px-2 py-3 text-center text-[18px] font-medium tracking-[-0.108px] text-foreground w-[52px] whitespace-nowrap">Q#</th>
              <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground">Questions</th>
              {showCol('chapter') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[230px] whitespace-nowrap">Chapter</th>
              )}
              {showCol('concept') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[210px] whitespace-nowrap">Concept</th>
              )}
              {showCol('type') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[132px] whitespace-nowrap">Type</th>
              )}
              {showCol('difficulty') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[120px] whitespace-nowrap">Difficulty</th>
              )}
              {showCol('classAvg') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[135px] whitespace-nowrap">
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="flex items-center gap-1 hover:text-foreground/80 transition-colors"
                  >
                    Class avg
                    {sortDir === 'asc' && <ChevronUp className="size-4 text-foreground" />}
                    {sortDir === 'desc' && <ChevronDown className="size-4 text-foreground" />}
                    {sortDir === null && <ChevronsUpDown className="size-4 text-muted-foreground" />}
                  </button>
                </th>
              )}
              {showCol('marks') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[85px] whitespace-nowrap">Marks</th>
              )}
              <th className="bg-[#f0fdf4] border-b border-border px-2 py-3 w-[101px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              return (
                <tr
                  key={row.q}
                  onClick={() => openRow(row)}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="border-b border-border px-2 py-0 h-[56px] text-center text-[16px] font-normal text-foreground whitespace-nowrap align-middle">
                    <CellTooltip content={row.q}>{row.q}</CellTooltip>
                  </td>
                  <td className="border-b border-border pl-4 pr-10 py-0 h-[56px] text-[16px] font-normal text-foreground align-middle max-w-0">
                    <CellTooltip content={<LatexPreview text={row.text} />} className="block truncate"><LatexInline text={row.text} /></CellTooltip>
                  </td>
                  {showCol('chapter') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] text-[16px] font-normal text-foreground align-middle w-[230px] max-w-[230px]">
                      <CellTooltip content={row.chapter} className="block truncate">{row.chapter}</CellTooltip>
                    </td>
                  )}
                  {showCol('concept') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] text-[16px] font-normal text-foreground align-middle w-[210px] max-w-[210px]">
                      <CellTooltip content={row.concept} className="block truncate">{row.concept}</CellTooltip>
                    </td>
                  )}
                  {showCol('type') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] align-middle w-[132px]">
                      <CellTooltip content={row.bloomTaxonomy}>
                        <span className={`inline-flex items-center justify-center px-[10px] py-[2px] rounded-md text-[14px] font-semibold tracking-[-0.084px] whitespace-nowrap ${TYPE_STYLES[row.bloomTaxonomy] ?? TYPE_FALLBACK}`}>
                          {row.bloomTaxonomy}
                        </span>
                      </CellTooltip>
                    </td>
                  )}
                  {showCol('difficulty') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] text-[16px] font-normal text-foreground align-middle w-[120px]">
                      <CellTooltip content={row.difficulty} className="block truncate">{row.difficulty}</CellTooltip>
                    </td>
                  )}
                  {showCol('classAvg') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] align-middle w-[135px]">
                      <CellTooltip content={row.classAvg}>
                        <span className="text-[16px] font-medium text-foreground whitespace-nowrap">{row.classAvg}</span>
                      </CellTooltip>
                    </td>
                  )}
                  {showCol('marks') && (
                    <td className="border-b border-border px-4 py-0 h-[56px] text-[16px] font-normal text-foreground align-middle w-[85px]">
                      <CellTooltip content={row.marks}>{row.marks}</CellTooltip>
                    </td>
                  )}
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
              )
            })}
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
        open={!!dialogRow}
        onClose={() => setDialogRow(null)}
        data={dialogRow ? { ...buildQuestionSheetData(dialogRow), footerHref: hrefFor(dialogRow) } : null}
      />
    </div>
  )
}
