'use client'

import { use, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpRight, X } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog'
import { CommonMistakesSection } from '@/components/common-mistakes-section'
import { mistakeTypeColor, mistakeTypeLegend } from '@/app/lib/mistake-type-legend'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useFeatureFlag } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import LatexPreview from '@/components/latex-preview'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'
import { BreadcrumbSwitcher } from '@/components/breadcrumb-switcher'
import { PrevNextNav } from '@/components/prev-next-nav'
import { SummaryText } from '@/components/summary-text'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { formatExamName } from '@/app/lib/filters'
import {
  fetchQuestionById, fetchQuestionStatsSmart, fetchPaperQuestions, fetchAnswerKey,
  fetchQuestionSectionSummary,
  type PaperQuestion, type QuestionStats, type AnswerKey,
} from '@/app/lib/questions'

const GRID_COLOR = 'oklch(0.929 0.013 255.508)'

function qLabel(n: number): string {
  return `Q${Number.isInteger(n) ? String(Math.trunc(n)) : String(n)}`
}
function fmtMarks(m: number | null | undefined): string {
  if (m == null) return '—'
  return `${Number.isInteger(m) ? Math.trunc(m) : m} Marks`
}

// Per-mark score distribution built from the per-student marks in the stats
// (only present for evaluated classes; empty otherwise).
// Spec: X axis covers EVERY possible score 0..max — in half-mark steps when
// any student earned a half mark, whole marks otherwise.
function buildDistribution(stats: QuestionStats | null, maxMarks: number | null | undefined) {
  const max = Math.max(1, Math.round((maxMarks ?? 4) * 2) / 2)
  const marks = (stats?.studentList ?? [])
    .map((s) => s.marksObtained)
    .filter((m): m is number => m != null && m >= 0)
  const halfSteps = marks.some((m) => m % 1 !== 0) || max % 1 !== 0
  const step = halfSteps ? 0.5 : 1
  const n = Math.floor(max / step) + 1
  const buckets = Array.from({ length: n }, (_, i) => {
    const v = i * step
    return { label: `${Number.isInteger(v) ? String(v) : v.toFixed(1)} marks`, value: 0, markValue: v }
  })
  for (const m of marks) {
    const idx = Math.min(n - 1, Math.max(0, Math.round(m / step)))
    buckets[idx].value++
  }
  return buckets
}

// beaver#747: Marks Distribution bar hover — "Q1 / No.of Students X / X/Y
// students in Sec Z scored M/max marks in this question."
function DistributionTooltip({
  active, payload, questionLabel, totalStudents, section, maxMarks,
}: {
  active?: boolean
  payload?: readonly any[]
  questionLabel: string
  totalStudents: number
  section: string
  maxMarks: number | null
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as { value: number; markValue: number }
  const markText = `${Number.isInteger(point.markValue) ? point.markValue : point.markValue.toFixed(1)}/${maxMarks ?? '—'}`
  return (
    <div className="bg-background border border-border rounded-md shadow-md px-3 py-2 flex flex-col gap-1.5 min-w-[200px]">
      <p className="text-[14px] font-medium leading-5 text-foreground">{questionLabel}</p>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-[2px] shrink-0 bg-[#22d3ee]" />
        <span className="text-[12px] leading-4 text-muted-foreground flex-1">No.of Students</span>
        <span className="text-[12px] font-mono text-foreground">{point.value}</span>
      </div>
      <p className="text-[12px] leading-4 text-muted-foreground">
        {point.value > 0
          ? `${point.value}/${totalStudents} students in Sec ${section} scored ${markText} marks in this question.`
          : `No students scored ${markText} marks in this question.`}
      </p>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function QuestionDetailPage({ params }: { params: Promise<{ questionId: string }> }) {
  // beaver#575 — error-classification-derived; hide the whole section, title included.
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_question_page')
  const classifiedCohorts = useClassifiedCohorts()
  const router = useRouter()
  const { questionId } = use(params)
  const searchParams = useSearchParams()
  const showCommonMistakes = showCommonMistakesFlag && classificationEnabledFor(classifiedCohorts, searchParams.get('grade'), searchParams.get('subject'))
  const ctx = {
    grade: searchParams.get('grade') ?? '',
    section: searchParams.get('section') ?? '',
    subject: searchParams.get('subject') ?? '',
    exam: searchParams.get('exam') ?? '',
  }

  // Whole-question oriented: a "question" (e.g. Q17) is stored as sub-part rows
  // (17.1…17.7, an either/or option group). We collapse those rows into ONE
  // whole question — `parts` holds every sub-part in order; `whole` is the
  // integer question number (17). Header/body/stats/summary are all whole-Q.
  const [parts, setParts] = useState<PaperQuestion[]>([])
  const [whole, setWhole] = useState<number | null>(null)
  const [stats, setStats] = useState<QuestionStats | null>(null)
  // One answer key per part, index-aligned with `parts` (null where a part has
  // no key) — the dialog covers the whole question.
  const [answerKeys, setAnswerKeys] = useState<(AnswerKey | null)[]>([])
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false)
  const [questionExpanded, setQuestionExpanded] = useState(false)
  // The question only needs "…more" when it outgrows the space the right card
  // gives the left one — measured, since that height is not known up front.
  const questionRef = useRef<HTMLDivElement>(null)
  const [questionClipped, setQuestionClipped] = useState(false)
  // The right card sets the ceiling for the left one; null until it is measured,
  // so the first paint is uncapped rather than capped at a guess.
  const perfCardRef = useRef<HTMLDivElement>(null)
  const [perfCardHeight, setPerfCardHeight] = useState<number | null>(null)
  // Which of the whole question's diagrams the left card is showing (0-based).
  const [diagramIndex, setDiagramIndex] = useState(0)
  const [siblings, setSiblings] = useState<{ id: string; label: string }[]>([])
  // Pre-computed per-question × per-section teacher summary (staff-only endpoint).
  const [sectionSummary, setSectionSummary] = useState<string | null>(null)
  // Every field on this page derives from `parts`/`stats`, which start empty —
  // so until the fetches land the header reads '—' for chapter/type/marks and
  // the performance card reads '—%', which is exactly how a question with no
  // analytics looks (beaver#786). Keyed by question + class context so moving
  // between questions reads as loading instead of showing the previous one's.
  const loadKey = [questionId, ctx.grade, ctx.section, ctx.subject, ctx.exam].join('|')
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== loadKey

  // Observed, not measured once: parts arrive async and KaTeX relayouts after
  // mount, so a single read lands on the wrong height.
  useEffect(() => {
    const el = questionRef.current
    if (!el) return
    const measure = () => setQuestionClipped(el.scrollHeight > el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [parts, questionExpanded, perfCardHeight])

  useEffect(() => {
    const el = perfCardRef.current
    if (!el) return
    const measure = () => setPerfCardHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Expanded counts too: nothing is clipped then, so the measure alone would
  // drop "Show less" and strand the reader in the expanded view.
  const showQuestionToggle = questionClipped || questionExpanded

  useEffect(() => {
    let ignore = false
    const havePaper = Boolean(ctx.grade && ctx.subject && ctx.exam)
    const key = [questionId, ctx.grade, ctx.section, ctx.subject, ctx.exam].join('|')
    const settled = () => { if (!ignore) setLoadedKey(key) }

    Promise.all([
      fetchQuestionById(questionId),
      havePaper
        ? fetchPaperQuestions({ grade: ctx.grade, section: ctx.section, subject: ctx.subject, exam: ctx.exam }).catch(() => [] as PaperQuestion[])
        : Promise.resolve<PaperQuestion[]>([]),
    ]).then(([current, allQ]) => {
      if (ignore) return

      // Resolve the WHOLE question number for the route id (a sub-part id).
      const currentNum =
        current?.questionNumber ??
        allQ.find((q) => String(q.id) === String(questionId))?.questionNumber ??
        null
      if (currentNum == null) {
        // No paper context available — fall back to the single fetched part.
        setParts(current ? [current] : [])
        setWhole(null)
        settled()
        return
      }
      const w = Math.trunc(currentNum)
      setWhole(w)

      // Every sub-part of this whole question, in order (17.1 … 17.7).
      let wholeParts = allQ
        .filter((q) => Math.trunc(q.questionNumber) === w)
        .sort((a, b) => a.questionNumber - b.questionNumber)
      if (wholeParts.length === 0 && current) wholeParts = [current]
      setParts(wholeParts)

      // Dropdown: collapse siblings to DISTINCT whole questions — one entry per
      // Math.trunc(questionNumber), id = that whole's FIRST part's id. Never
      // shows .1/.2 sub-part entries.
      if (allQ.length) {
        const byWhole = new Map<number, PaperQuestion[]>()
        for (const q of allQ) {
          const k = Math.trunc(q.questionNumber)
          byWhole.set(k, [...(byWhole.get(k) ?? []), q])
        }
        const collapsed = Array.from(byWhole.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([num, ps]) => {
            ps.sort((x, y) => x.questionNumber - y.questionNumber)
            return { id: String(ps[0].id), label: `Q${num}` }
          })
        setSiblings(collapsed)
      }

      const firstId = wholeParts[0]?.id ?? questionId
      // Stats keyed by the WHOLE number: fetchQuestionStatsSmart's crop fallback
      // is keyed by question number, so passing `w` returns the whole-question
      // (~49%) distribution/avg, not a sub-part's 0%.
      const statsDone = ctx.section
        ? fetchQuestionStatsSmart(firstId, w, ctx).then((s) => { if (!ignore) setStats(s) })
        : Promise.resolve()
      // Per-question section summary is stored against the WHOLE number too
      // (a sub-part request returns nothing). Staff-only endpoint.
      const summaryDone = havePaper && ctx.section
        ? fetchQuestionSectionSummary({
            grade: ctx.grade, section: ctx.section, subject: ctx.subject, exam: ctx.exam,
            questionNumber: w,
          }).then((s) => { if (!ignore) setSectionSummary(s?.summary ?? null) })
        : Promise.resolve()
      // Answer keys for EVERY part (index-aligned) — the dialog covers the
      // whole question; the button is enabled if any part has a key.
      const keysDone = Promise.all(wholeParts.map((p) => fetchAnswerKey(p.id))).then((keys) => {
        if (!ignore) setAnswerKeys(keys)
      })
      // Settled, not resolved: one failed call must still end the loading state
      // rather than leave the page on "Loading…" for good.
      void Promise.allSettled([statsDone, summaryDone, keysDone]).then(settled)
    })
      // The outer fetch had no rejection handler at all — a failure was an
      // unhandled rejection and left the page permanently blank.
      .catch(settled)

    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, ctx.section, ctx.grade, ctx.subject, ctx.exam])

  const first = parts[0] ?? null
  const questionLabel = whole != null ? `Q${whole}` : `Q${questionId}`
  // Collapsed metadata, mirroring fetchQuestions(): first part's non-null value.
  const pick = <T,>(get: (p: PaperQuestion) => T | null | undefined): T | null => {
    for (const p of parts) {
      const v = get(p)
      if (v != null && v !== '') return v
    }
    return null
  }
  // An either/or question has sub-parts sharing an option_group — its
  // attemptable max is LESS than the sum of every sub-part's max (you only
  // answer one alternative). Q17 (17.1–17.7, "17_opt") is scoreable out of 5,
  // not the 10 you'd get by summing all seven parts.
  const isOrQuestion = parts.some((p) => p.optionGroup != null && p.optionGroup !== '')
  const sumOfPartMarks = parts.reduce((a, p) => a + (p.maxMarks ?? 0), 0)
  // Marks: for an OR question use the whole-question ATTEMPTABLE MAX from the
  // crop stats (e.g. Q17 = 5) so the header agrees with the score distribution;
  // fall back to the sum only when stats are absent. Normal (all-attempted)
  // questions keep the existing sum-of-parts behaviour.
  const wholeMarks = isOrQuestion
    ? (stats?.maxMarks ?? (parts.length ? sumOfPartMarks : null))
    : (parts.length ? sumOfPartMarks : null)
  // The score distribution / tooltip always use the real scoreable max.
  const distMaxMarks = stats?.maxMarks ?? (parts.length ? sumOfPartMarks : null)
  // '—' is the honest "this paper doesn't carry the field"; while the fetch is
  // still out we haven't earned that claim yet.
  const unknown = loading ? 'Loading…' : '—'
  const question = {
    exam: first ? formatExamName(first.exam) : unknown,
    chapter: pick((p) => p.chapterName) ?? unknown,
    type: pick((p) => p.bloomTaxonomy) ?? pick((p) => p.questionType) ?? unknown,
    marks: parts.length ? fmtMarks(wholeMarks) : unknown,
    weightage: pick((p) => p.weightageTag) ?? unknown,
    difficulty: pick((p) => p.difficultyLevel) ?? unknown,
    sectionAvg: stats?.averageMarks ? Math.round(stats.averageMarks.percentage) : null,
    // Pre-computed per-question section summary first; then the per-paper AI
    // summary (spec field); then the analytics insight as fallback copy.
    sectionDescription: sectionSummary ?? pick((p) => p.aiSummary) ?? stats?.keyInsights?.[0]?.description ?? '',
  }
  const scoreDistribution = buildDistribution(stats, distMaxMarks)
  // A part's answer: the reviewed key row (crop / MCQ choice / clean text)
  // when the answer-key pipeline has produced one, else the paper's own
  // answer_key / ai_answer text. Many papers have never been through the
  // review pipeline (the /answer-key call 404s for every part), yet carry a
  // perfectly usable answer on the question itself — without this fallback the
  // button sat disabled for all of them (#905). Blank strings are "no key".
  const hasReviewedKey = (k: AnswerKey | null | undefined): k is AnswerKey =>
    k != null && Boolean(k.croppedImageUrl || k.cleanText || k.ocrText || k.mcqChoice)
  const fallbackAnswerFor = (p: PaperQuestion): string | null =>
    p.answerKey?.trim() || p.aiAnswer?.trim() || null
  const hasAnswerKey = parts.some((p, i) => hasReviewedKey(answerKeys[i]) || fallbackAnswerFor(p) != null)
  // Spec: Y axis counts students in bands of 10 (0–40); extend in 10-steps
  // when a bar exceeds 40 so no count is ever clipped.
  const distYMax = Math.max(40, ...scoreDistribution.map((d) => Math.ceil(d.value / 10) * 10))
  const distYTicks = Array.from({ length: distYMax / 10 + 1 }, (_, i) => i * 10)
  // Coloured by KIND of mistake (errorTypeName, null → 'Other'), with the
  // same fixed colours and legend bar as Home, Chapter and the exam pages.
  // Every row used to wear the same grey dot under a fixed two-entry legend
  // ('Foundational gaps' / 'Mistakes in steps') whose bar was split 50/50
  // whatever the mistakes were.
  const mistakeItems = (stats?.commonMistakes ?? []).map((m, i) => ({
    id: `cm${i}`,
    errorTypeName: m.errorTypeName ?? null,
    color: mistakeTypeColor(m.errorTypeName),
    title: m.pattern,
    description: `${m.description}${m.count ? ` · ${m.count} students` : ''}`,
  }))
  // The dropdown lists whole questions only; the active entry is this whole's
  // first-part id (what the collapsed siblings use as each entry's id).
  const activeId = String(first?.id ?? questionId)
  const allQuestions = siblings.length ? siblings : [{ id: activeId, label: questionLabel }]
  // Prev/next navigation across the paper's whole questions (same list the
  // breadcrumb dropdown uses); disabled at the ends.
  const currentIndex = allQuestions.findIndex((q) => q.id === activeId)
  const prevQuestion = currentIndex > 0 ? allQuestions[currentIndex - 1] : null
  const nextQuestion =
    currentIndex >= 0 && currentIndex < allQuestions.length - 1 ? allQuestions[currentIndex + 1] : null

  // The left card's stepper pages this question's diagrams — one per sub-part
  // that has one (a multi-part question may have several, and plenty have none).
  // With no paper loaded at all (design preview) the stand-in image stands as
  // the single diagram, so the stepper reads 1/1 rather than 0/0.
  // Only real diagram crops. The Figma stand-in that used to fill this in
  // preview mode rendered as a question diagram that does not exist (and 404s
  // now that the asset is gone).
  const diagrams = parts
    .filter((p) => p.diagramCropUrl)
    .map((p) => ({ key: String(p.id), url: p.diagramCropUrl as string }))
  // Clamped rather than reset in an effect: moving to a question with fewer
  // diagrams must not leave the stepper pointing past the end.
  const diagramPos = Math.min(diagramIndex, Math.max(0, diagrams.length - 1))
  const activeDiagram = diagrams[diagramPos]

  function goToQuestion(id: string) {
    const p = new URLSearchParams(ctx as Record<string, string>)
    setDiagramIndex(0)
    router.push(`/question/${id}?${p.toString()}`)
  }

  usePageBreadcrumb(
    <BreadcrumbSwitcher
      parentLabel="Questions"
      parentHref="/question"
      activeId={activeId}
      activeLabel={questionLabel}
      sectionLabel="Questions"
      searchable
      searchPlaceholder="Search questions..."
      items={allQuestions.map((q) => ({ id: q.id, label: q.label }))}
      drilldownEntity="question"
      onSelect={goToQuestion}
    />,
    [activeId, questionLabel, allQuestions.length]
  )

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">

      {/* ── Scrollable content ── */}
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 pb-12 flex justify-center">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-[1280px] flex flex-col gap-4">

            {/* ── Title row ── */}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold leading-8 text-black">
                {questionLabel}
              </h1>
            </div>
            <p className="text-base font-medium leading-6 text-muted-foreground -mt-4">
              {question.exam}
            </p>

            {/* ── Question card + Section average ── */}
            {/* items-start, not stretch: the left card hugs its content, and
                perfCardHeight caps it so only long questions clip. */}
            <div className="flex gap-6 items-start">

              {/* Left: question detail */}
              <div
                className="flex-1 min-w-0 overflow-hidden border border-border rounded-2xl p-6 flex flex-col gap-3"
                style={{ maxHeight: questionExpanded ? undefined : perfCardHeight ?? undefined }}
              >
                <div className="flex items-start gap-6 shrink-0">
                  {/* Chapter absorbs the shrink (long names truncate with a
                      tooltip) so the row can never overflow into the panel
                      beside it. */}
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <p className="text-sm font-normal leading-5 text-muted-foreground whitespace-nowrap">Chapter</p>
                    <p
                      className="text-xl font-medium leading-7 tracking-[-0.12px] text-foreground truncate"
                      title={question.chapter}
                    >
                      {question.chapter}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <p className="text-sm font-normal leading-5 text-muted-foreground whitespace-nowrap">Bloom’s Type</p>
                    <p className="text-xl font-medium leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">{question.type}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <p className="text-sm font-normal leading-5 text-muted-foreground whitespace-nowrap">Marks</p>
                    <p className="text-xl font-medium leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">{question.marks}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <p className="text-sm font-normal leading-5 text-muted-foreground whitespace-nowrap">Difficulty</p>
                    <div className="bg-[#fffcf0] flex items-center justify-center px-[10px] py-[2px] rounded-full">
                      <span className="text-[18px] font-medium leading-7 tracking-[-0.108px] text-[#dc7609] whitespace-nowrap">
                        {question.difficulty}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px rounded-[0.5px] bg-[#d9d9d9] shrink-0" />

                {/* line-clamp no-ops on block content like a rendered <table>, so
                    this shrinks against the card's height and clips instead. */}
                <div
                  ref={questionRef}
                  onClick={showQuestionToggle ? () => setQuestionExpanded((v) => !v) : undefined}
                  className={`relative min-w-0 text-lg font-normal leading-7 text-foreground ${
                    showQuestionToggle ? 'cursor-pointer' : ''
                  } ${questionExpanded ? '' : 'min-h-0 overflow-hidden'}`}
                >
                  {/* Full question = every sub-part's text in order (e.g. Q17
                      shows a,b,c,d … OR … a,b,c). The collapse wraps the whole
                      concatenation. */}
                  <div className="flex flex-col gap-3">
                    {parts.map((p) => (
                      <LatexPreview key={p.id} text={p.questionText} />
                    ))}
                  </div>
                  {!questionExpanded && questionClipped && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background to-transparent" />
                  )}
                </div>
                {showQuestionToggle && (
                  <button
                    type="button"
                    onClick={() => setQuestionExpanded((v) => !v)}
                    className="self-start shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {questionExpanded ? 'Show less' : '…more'}
                  </button>
                )}

                {/* One diagram at a time — the stepper below pages between them.
                    Nothing is rendered when no sub-part has one; there is no
                    broken-image placeholder. The answer key is deliberately NOT
                    shown here; it opens via "View answer key". */}
                {activeDiagram && (
                  <div
                    key={activeDiagram.key}
                    className={`bg-[#f4f4f5] border border-border rounded-lg overflow-hidden shrink-0 ${
                      parts.length === 0 ? 'h-60' : ''
                    }`}
                  >
                    <img
                      src={activeDiagram.url}
                      alt={diagrams.length > 1 ? `Question diagram ${diagramPos + 1} of ${diagrams.length}` : 'Question diagram'}
                      className={`w-full object-contain ${parts.length === 0 ? 'h-full' : ''}`}
                    />
                  </div>
                )}

                <div className="flex items-center gap-4 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2 h-10 px-5 text-sm font-medium leading-5 "
                    onClick={() => setAnswerKeyOpen(true)}
                    disabled={!hasAnswerKey}
                  >
                    <ArrowUpRight className="size-4" />
                    View answer key
                  </Button>
                  {/* No diagram means nothing to page through — the stepper is
                      hidden rather than left reading "0/0" over empty space. */}
                  {diagrams.length > 0 && (
                    <PrevNextNav
                      className="flex-1"
                      itemLabel="diagram"
                      current={diagramPos + 1}
                      total={diagrams.length}
                      onPrev={diagramPos > 0 && (() => setDiagramIndex(diagramPos - 1))}
                      onNext={diagramPos < diagrams.length - 1 && (() => setDiagramIndex(diagramPos + 1))}
                    />
                  )}
                </div>
              </div>

              {/* Right: section average */}
              <div ref={perfCardRef} className="flex-1 min-w-0 border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div className="flex flex-col gap-2">
                    <p className="text-base font-normal leading-6 text-foreground">Question Performance</p>
                    {loading ? (
                      // Same 48px height as the figure it stands in for, so the
                      // card doesn't resize when the number lands.
                      <p role="status" className="h-12 flex items-center text-base font-normal leading-6 text-muted-foreground">
                        Loading…
                      </p>
                    ) : (
                      <p className="text-5xl font-bold leading-[48px] tracking-[-0.576px] text-[#008138]">
                        {question.sectionAvg ?? '—'}%
                      </p>
                    )}
                    <SummaryText
                      text={question.sectionDescription}
                      className="text-base font-medium leading-6 text-foreground mt-4"
                    />
                  </div>

                  <div className="flex flex-col gap-5 mt-6">
                    <p className="text-base font-medium leading-6 text-foreground">Marks Distribution</p>
                    {loading ? (
                      <div className="h-[222px] flex items-center justify-center text-[14px] text-muted-foreground">
                        Loading…
                      </div>
                    ) : (
                    <TooltipProvider delayDuration={300}>
                      <ResponsiveContainer width="100%" height={222}>
                        <BarChart data={scoreDistribution} barSize={53} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={<ChartAxisTick maxChars={6} />}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                          />
                          <YAxis
                            domain={[0, distYMax]}
                            interval={0}
            ticks={distYTicks}
                            tick={{ fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }}
                            axisLine={false}
                            tickLine={false}
                            width={24}
                          />
                          <Tooltip
                            content={(props) => (
                              <DistributionTooltip
                                active={props.active}
                                payload={props.payload}
                                questionLabel={questionLabel}
                                totalStudents={stats?.totalStudents ?? 0}
                                section={ctx.section}
                                maxMarks={distMaxMarks}
                              />
                            )}
                            cursor={{ fill: '#f1f5f9' }}
                            position={TOOLTIP_POSITION}
                          />
                          <Bar dataKey="value" fill="#22d3ee" radius={[6, 6, 6, 6]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </TooltipProvider>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <div className="size-[11px] rounded-[2px] bg-[#22d3ee] shrink-0" />
                      <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-foreground whitespace-nowrap">
                        No. of students
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <PrevNextNav
              className="mt-4"
              showLabels
              drilldownEntity="question"
              itemLabel="question"
              current={(currentIndex < 0 ? 0 : currentIndex) + 1}
              total={allQuestions.length}
              prevTooltip={prevQuestion?.label}
              nextTooltip={nextQuestion?.label}
              onPrev={prevQuestion && (() => goToQuestion(prevQuestion.id))}
              onNext={nextQuestion && (() => goToQuestion(nextQuestion.id))}
            />

            {/* ── Common mistakes ── */}
            {/* Also hidden when there is nothing to show: error classification
                lands one section at a time, and the flag is school-wide, so a
                section with no analytics yet would otherwise render an empty
                titled block. */}
            {showCommonMistakes && mistakeItems.length > 0 && (
              <CommonMistakesSection
              title='Common Mistakes in this Question'
              subtitle='Review why your section lost marks '
                className="mt-4"
                variant="question"
                tabs={[{ key: 'mistakes', label: 'Mistakes', legend: mistakeTypeLegend(mistakeItems), items: mistakeItems }]}
              />
            )}

          </div>
        </div>
      </main>

      {/* Answer key: the reviewed key crop + clean text, from /answer-key */}
      <Dialog open={answerKeyOpen} onOpenChange={setAnswerKeyOpen}>
        {/* Own close button, not the built-in one: that is absolutely
            positioned, so it cannot centre against the title. */}
        <DialogContent className="max-w-2xl" showCloseButton={false}>
          <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <DialogTitle>Answer key · {questionLabel}</DialogTitle>
            <DialogClose asChild>
              <Button variant="outline" size="icon-sm" className="shrink-0">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </DialogHeader>
          {/* Whole-question answer key: one section per sub-part that has a key
              (labelled with its sub-part number when there's more than one). */}
          <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
            {parts.map((p, i) => {
              const k = answerKeys[i]
              const fallback = hasReviewedKey(k) ? null : fallbackAnswerFor(p)
              if (!hasReviewedKey(k) && fallback == null) return null
              return (
                <div key={`answer-${p.id}`} className="flex flex-col gap-4">
                  {parts.length > 1 && (
                    <p className="text-sm font-medium leading-5 text-muted-foreground">{qLabel(p.questionNumber)}</p>
                  )}
                  {fallback != null && (
                    <div className="text-base font-normal leading-7 text-foreground">
                      <LatexPreview text={fallback} />
                    </div>
                  )}
                  {k?.croppedImageUrl && (
                    <div className="bg-[#f4f4f5] border border-border rounded-lg overflow-hidden">
                      <img src={k.croppedImageUrl} alt="Answer key" className="w-full object-contain" />
                    </div>
                  )}
                  {k?.mcqChoice && (
                    <p className="text-base font-medium leading-6 text-foreground">
                      Correct option: {k.mcqChoice}
                    </p>
                  )}
                  {(k?.cleanText || k?.ocrText) && (
                    <div className="text-base font-normal leading-7 text-foreground">
                      <LatexPreview text={k.cleanText ?? k.ocrText ?? undefined} />
                    </div>
                  )}
                </div>
              )
            })}
            {!hasAnswerKey && (
              <p className="text-base text-muted-foreground">No answer key available for this question.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
