'use client'

import { useState, useEffect } from 'react'
import {
  ChevronsUpDown, ChevronUp, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, ChevronDown, Loader2,
} from 'lucide-react'
import { AnalysisDetailSheet, type AnalysisDetailData } from './analysis-detail-sheet'
import { TableColumnToggle, type ColumnToggleOption } from './table-column-toggle'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { fetchQuestions } from '@/app/lib/questions'
import {
  fetchChapterStats, fetchAnswerCrops, personalQuestionStats,
  type CropStudentContext, type ChapterStat,
} from '@/app/lib/answer-crops'
import { PERF_RED, PERF_GREEN, PERF_ORANGE } from './analysis-chart'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { useRouter } from 'next/navigation'
import { useFeatureFlag } from '@/components/config-provider'
import { trackDrilldown } from '@/app/lib/analytics'

interface ChapterQuestion { id?: number; q: string; text: string; avg: number; marks: number }

// How many question badges show inline before collapsing the rest behind "+N".
const QUESTIONS_VISIBLE = 3

interface ChapterRow {
  chapter: string
  questions: ChapterQuestion[]
  classAvg: string
  // "Most common error" inputs from chapter-stats, per chapter.
  errors?: ChapterStat['errorTypeBreakdown']
  insights?: string[]
}

// Legend colours in the order the design lists them — Conceptual, Calculation,
// Skipped (Figma 1006:41438). All three tokens exist in app/theme.css.
const ERROR_COLORS = [
  'var(--inferentics-performance-not-improved-badge)',
  'var(--inferentics-performance-declined)',
  'var(--accent)',
  'var(--inferentics-performance-score)',
]

function columnOptions(student: boolean): ColumnToggleOption[] {
  return [
    { key: 'questions', label: 'Questions' },
    { key: 'classAvg',  label: student ? 'Student average' : 'Class average' },
  ]
}

// Placeholder rows (used only when no exam context is provided).
const FALLBACK_ROWS: ChapterRow[] = [
  { chapter: 'Statistical Methods & Data Visualization', questions: [{ q: 'Q1', text: 'Q1', avg: 52, marks: 5 }, { q: 'Q5', text: 'Q5', avg: 52, marks: 5 }, { q: 'Q4', text: 'Q4', avg: 52, marks: 5 }], classAvg: '52%' },
  { chapter: 'Calculus Fundamentals & Proofs',           questions: [{ q: 'Q1', text: 'Q1', avg: 56, marks: 5 }, { q: 'Q5', text: 'Q5', avg: 56, marks: 5 }],                                             classAvg: '56%' },
  { chapter: 'Financial Math & Budgeting Basics',        questions: [{ q: 'Q1', text: 'Q1', avg: 12, marks: 5 }, { q: 'Q4', text: 'Q4', avg: 12, marks: 5 }],                                             classAvg: '12%' },
]

// Chapter names occasionally differ in whitespace between the question paper
// and the chapter-stats endpoint — join on a collapsed form.
function normChapter(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Group an exam's questions by chapter → question badges + class average.
// Class avg matches the chapter chart (spec): Σ student marks on the chapter /
// (students × chapter max) × 100 — chapter-stats where scans are chapter-mapped,
// else the marks-weighted mean of the per-question averages.
function groupByChapter(
  questions: { id: number; q: string; title: string; chapter: string; avg: number; marks: number }[],
  statsPct: Map<string, number>,
  // Student mode: the % is the student's OWN chapter average from their crops —
  // never fall back to class-derived numbers; chapters they have no marked
  // answers for honestly show '—'.
  fallbackToClass = true,
  // Per-chapter error breakdown / insights, keyed like statsPct. Empty in
  // student mode, and empty until chapter-stats returns these fields.
  meta: Map<string, ChapterStat> = new Map(),
): ChapterRow[] {
  const byChapter = new Map<string, { qs: ChapterQuestion[]; got: number; max: number }>()
  for (const q of questions) {
    const key = q.chapter || '—'
    const g = byChapter.get(key) ?? { qs: [], got: 0, max: 0 }
    g.qs.push({ id: q.id, q: q.q, text: q.title, avg: q.avg, marks: q.marks })
    if (q.avg && q.marks) { g.got += (q.avg / 100) * q.marks; g.max += q.marks }
    byChapter.set(key, g)
  }
  return Array.from(byChapter.entries()).map(([chapter, g]) => {
    const pct = statsPct.get(normChapter(chapter)) ??
      (fallbackToClass && g.max > 0 ? (100 * g.got) / g.max : null)
    const m = meta.get(normChapter(chapter))
    return {
      chapter,
      questions: g.qs,
      classAvg: pct != null ? `${Math.round(pct)}%` : '—',
      errors: m?.errorTypeBreakdown,
      insights: m?.chapterInsights,
    }
  })
}

// Spec: Class avg is colour-coded like the chart bars — green 40%+, red below.
// Student Login Metrics spec: the student's own avg is shown in orange.
function avgColor(pctStr: string, student: boolean): string | undefined {
  const pct = parseInt(pctStr)
  if (Number.isNaN(pct)) return undefined
  if (student) return PERF_ORANGE
  return pct >= 40 ? PERF_GREEN : PERF_RED
}

// Figma 1006:41438 — the "Most common error" block. Every value comes from
// chapter-stats; a chapter the endpoint has no breakdown for renders no block
// at all (the sheet's omit-when-absent contract), never a fixed preview split.
function buildChapterSheetData(row: ChapterRow): AnalysisDetailData {
  const errors = (row.errors ?? [])
    .map((e) => ({ label: e.errorType, pct: Number(e.percentage) }))
    .filter((e) => e.label && Number.isFinite(e.pct))
  // The caption names the largest slice: "Skipped error: 75% of incorrect
  // responses". Skipped is drawn as bare track, so it is excluded from the
  // segments but kept in the legend.
  const top = errors.reduce<{ label: string; pct: number } | null>(
    (best, e) => (best == null || e.pct > best.pct ? e : best),
    null,
  )
  const drawn = errors.filter((e) => e.label.toLowerCase() !== 'skipped')

  return {
    title: row.chapter,
    subtitle: `Chapter: ${row.questions.map((q) => q.q).join(', ')} · Average: ${row.classAvg}`,
    footerLabel: 'View chapter',
    errorDescription: top
      ? `${top.label} error: ${Math.round(top.pct)}% of incorrect responses`
      : undefined,
    errorSegments: drawn.map((e, i) => ({ color: ERROR_COLORS[i % ERROR_COLORS.length], pct: e.pct })),
    // Skipped keeps its designed swatch colour, so index by position in the
    // full list rather than in `drawn`.
    errorLegend: errors.map((e, i) => ({ color: ERROR_COLORS[i % ERROR_COLORS.length], label: e.label })),
    bullets: row.insights ?? [],
  }
}

function buildQuestionSheetData(q: ChapterQuestion): AnalysisDetailData {
  return {
    title: q.text,
    subtitle: `Average: ${q.avg ? `${q.avg}%` : '—'} · Marks: ${q.marks}`,
    footerLabel: 'View question',
    footerHref: q.id != null ? `/question/${q.id}` : undefined,
    fullText: q.text,
    accuracy: { description: 'Class average on this question', pct: q.avg || 0 },
    bullets: [],
  }
}

export function AnalysisChapterTable({
  context,
  disableQuestionLinks = false,
  variant = 'class',
  studentContext,
}: {
  context?: AnalyticsFilters
  disableQuestionLinks?: boolean
  /** 'student' = the avg column is the logged-in student's OWN chapter average
   * (from their crops via studentContext), labelled "Student avg", in orange. */
  variant?: 'class' | 'student'
  studentContext?: CropStudentContext
}) {
  const student = variant === 'student'
  const router = useRouter()
  // beaver#569 — skip the drawer (subjective error-classification data) and
  // go straight to the real chapter page until error classification is figured out.
  const routeToDetail = useFeatureFlag('route_to_detail_chapter_table')
  const ctxQs = context
    ? new URLSearchParams({ grade: context.grade, section: context.section, subject: context.subject, exam: context.exam }).toString()
    : ''
  const [rows, setRows] = useState<ChapterRow[]>(FALLBACK_ROWS)
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [sheetRow, setSheetRow]       = useState<ChapterRow | null>(null)
  const [questionSheet, setQuestionSheet] = useState<ChapterQuestion | null>(null)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({})
  const [sortDir, setSortDir]         = useState<'asc' | 'desc' | null>(null)

  useEffect(() => {
    // Student mode never shows the placeholder design rows — empty is honest.
    if (!context) { setRows(student ? [] : FALLBACK_ROWS); setLoading(false); return }
    let ignore = false
    setLoading(true)
    Promise.all([
      fetchQuestions(context),
      student
        ? Promise.resolve([])
        : fetchChapterStats({ grade: context.grade, section: context.section, subject: context.subject, exams: [context.exam] }).catch(() => []),
      student && studentContext ? fetchAnswerCrops(studentContext).catch(() => []) : Promise.resolve([]),
    ])
      .then(([g, stats, crops]) => {
        if (ignore) return
        const statsPct = new Map<string, number>()
        const statsMeta = new Map<string, ChapterStat>()
        if (student) {
          // Student avg % = student marks on chapter / chapter max in this exam
          // (marked crops only; whole-question denominators; whitespace-
          // insensitive chapter join) — same numbers as the personal chart.
          const rowByNum = new Map(g.questions.map((q) => [Number(q.q.slice(1)), q]))
          const agg = new Map<string, { got: number; max: number }>()
          for (const s of personalQuestionStats(crops)) {
            const chapter = rowByNum.get(s.questionNumber)?.chapter
            if (!chapter || chapter === '—') continue
            const k = normChapter(chapter)
            const e = agg.get(k) ?? { got: 0, max: 0 }
            e.got += s.got
            e.max += s.max
            agg.set(k, e)
          }
          for (const [k, e] of agg) if (e.max > 0) statsPct.set(k, (100 * e.got) / e.max)
        } else {
          for (const s of stats) {
            if (s.avgPct != null) statsPct.set(normChapter(s.chapter), s.avgPct)
            statsMeta.set(normChapter(s.chapter), s)
          }
        }
        setRows(groupByChapter(g.questions, statsPct, !student, statsMeta))
      })
      .catch(() => { if (!ignore) setRows([]) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [context, student, studentContext?.roll, studentContext?.admissionNo])

  const toggleColumn = (key: string) =>
    setVisibleCols((prev) => ({ ...prev, [key]: prev[key] === false }))

  const showCol = (key: string) => visibleCols[key] !== false

  const toggleSort = () =>
    setSortDir((d) => (d === null ? 'asc' : d === 'asc' ? 'desc' : null))

  const filtered = rows.filter((r) =>
    r.chapter.toLowerCase().includes(search.toLowerCase()) ||
    r.questions.some((q) => q.q.toLowerCase().includes(search.toLowerCase())),
  )

  if (sortDir) {
    filtered.sort((a, b) => {
      const pa = parseFloat(a.classAvg)
      const pb = parseFloat(b.classAvg)
      // '—' (no marked data) sorts after real percentages either way
      const diff = (Number.isNaN(pa) ? -1 : pa) - (Number.isNaN(pb) ? -1 : pb)
      return sortDir === 'asc' ? diff : -diff
    })
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage   = Math.min(page, totalPages - 1)
  const pageRows   = filtered.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage)

  function hrefFor(row: ChapterRow): string | undefined {
    return context ? `/chapter/${encodeURIComponent(row.chapter)}?${ctxQs}` : undefined
  }

  function openRow(row: ChapterRow) {
    // Only the flag decides drawer vs. navigation — no silent fallback to the
    // drawer just because `context` happened to be missing on this load.
    if (routeToDetail) {
      trackDrilldown('chapter')
      router.push(`/chapter/${encodeURIComponent(row.chapter)}?${ctxQs}`)
      return
    }
    // The sheet's body is built from errorTypeBreakdown/chapterInsights, and
    // chapter-stats does not return those yet (student mode never will) — so
    // without them the sheet renders header + footer around a blank body.
    // Go where its "View chapter" footer points instead of opening a shell.
    if (!row.errors?.length && !row.insights?.length && context) {
      router.push(`/chapter/${encodeURIComponent(row.chapter)}?${ctxQs}`)
      return
    }
    setSheetRow(row)
  }

  function questionHrefFor(q: ChapterQuestion): string | undefined {
    return context && q.id != null ? `/question/${q.id}?${ctxQs}` : undefined
  }

  function openQuestion(q: ChapterQuestion) {
    // beaver#674 — student login: question badges shouldn't route to the
    // teacher's question detail page. A student-side drawer will replace this
    // no-op once it's built.
    if (disableQuestionLinks) return
    if (routeToDetail) {
      const href = questionHrefFor(q)
      if (href) { router.push(href); return }
    }
    setQuestionSheet(q)
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Title + filters */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex flex-col gap-[2px]">
          <p className="text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">
            {variant === 'student' ? 'Pick a Chapter for detailed analysis' : 'Pick a chapter for detailed analysis'}
          </p>
          <p className="text-[14px] font-normal leading-5 text-muted-foreground">
            {variant === 'student' ? 'Review mistakes in each chapter' : 'Review mistakes for each chapter'}
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
          <TableColumnToggle columns={columnOptions(student)} visible={visibleCols} onToggle={toggleColumn} />
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
              <th className="bg-[#f0fdf4] border-b border-border px-2 py-3 text-center text-[18px] font-medium tracking-[-0.108px] text-foreground w-[40px] whitespace-nowrap">#</th>
              <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground">Chapter</th>
              {showCol('questions') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[280px] whitespace-nowrap">Questions</th>
              )}
              {showCol('classAvg') && (
                <th className="bg-[#f0fdf4] border-b border-border px-4 py-3 text-left text-[18px] font-medium tracking-[-0.108px] text-foreground w-[131px] whitespace-nowrap">
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="flex items-center gap-1 hover:text-foreground/80 transition-colors"
                  >
                    {student ? 'Avg Score' : 'Class avg'}
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
            {pageRows.map((row, idx) => {
              const color = avgColor(row.classAvg, student)
              const rowNum = safePage * rowsPerPage + idx + 1
              return (
                <tr
                  key={rowNum}
                  onClick={() => openRow(row)}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="border-b border-border px-2 py-0 h-[48px] text-center text-[16px] font-normal text-foreground whitespace-nowrap align-middle w-[40px]">
                    <CellTooltip content={rowNum}>{rowNum}</CellTooltip>
                  </td>
                  <td className="border-b border-border px-4 py-0 h-[48px] text-[16px] font-normal text-foreground align-middle max-w-0">
                    <CellTooltip content={row.chapter} className="block truncate">{row.chapter}</CellTooltip>
                  </td>
                  {showCol('questions') && (
                    <td className="border-b border-border px-4 py-0 h-[48px] align-middle w-[280px]">
                      <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
                        {row.questions.slice(0, QUESTIONS_VISIBLE).map((q) => (
                          <CellTooltip key={q.q} content={q.text}>
                            <button
                              onClick={(e) => { e.stopPropagation(); openQuestion(q) }}
                              className="inline-flex items-center justify-center px-[10px] py-[2px] rounded-md text-[16px] font-normal text-foreground border border-border whitespace-nowrap hover:bg-muted/50 transition-colors"
                            >
                              {q.q}
                            </button>
                          </CellTooltip>
                        ))}
                        {row.questions.length > QUESTIONS_VISIBLE && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[16px] font-medium text-[#3b82f6] hover:underline shrink-0"
                              >
                                +{row.questions.length - QUESTIONS_VISIBLE}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              onClick={(e) => e.stopPropagation()}
                              className="w-auto max-w-[280px] flex flex-wrap gap-2"
                            >
                              {row.questions.map((q) => (
                                <button
                                  key={q.q}
                                  onClick={() => openQuestion(q)}
                                  className="inline-flex items-center justify-center px-[10px] py-[2px] rounded-md text-[16px] font-normal text-foreground border border-border whitespace-nowrap hover:bg-muted/50 transition-colors"
                                >
                                  {q.q}
                                </button>
                              ))}
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </td>
                  )}
                  {showCol('classAvg') && (
                    <td className="border-b border-border px-4 py-0 h-[48px] align-middle w-[131px]">
                      <CellTooltip content={row.classAvg}>
                        <span className="text-[16px] font-medium whitespace-nowrap text-foreground">
                          {row.classAvg}
                        </span>
                      </CellTooltip>
                    </td>
                  )}
                  <td className="border-b border-[#e5e7eb] px-4 py-0 h-[48px] align-middle w-[101px]">
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
        open={!!sheetRow}
        onClose={() => setSheetRow(null)}
        data={sheetRow ? { ...buildChapterSheetData(sheetRow), footerHref: hrefFor(sheetRow) } : null}
      />

      <AnalysisDetailSheet
        open={!!questionSheet}
        onClose={() => setQuestionSheet(null)}
        data={questionSheet ? buildQuestionSheetData(questionSheet) : null}
      />
    </div>
  )
}
