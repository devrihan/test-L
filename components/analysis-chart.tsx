'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fetchQuestions } from '@/app/lib/questions'
import {
  fetchCropRoster, fetchChapterStats, fetchAnswerCrops, personalQuestionStats,
  type CropStudentContext,
} from '@/app/lib/answer-crops'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { PERFORMANCE_BANDS, bandIndex, bandByLabel } from '@/app/lib/performance-bands'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SlidePanels } from '@/components/slide-panels'

// ─── colours (new design) ─────────────────────────────────────────────────────
export const PERF_ORANGE = '#ffa940'  // Below 40%
export const PERF_RED    = 'var(--chart-1)'  // 40-60%
export const PERF_TEAL   = '#299D8F'  // 60-80%
export const PERF_GREEN  = 'var(--inferentics-brand-primary)'  // 80%+
export const PERF_BLUE   = '#0066cc'

// Horizontal px reserved per bar on the "By Question" tab. It decides two
// things that must agree: whether the chart overflows its card (and so scrolls),
// and how wide the scroll canvas is once it does — hence one constant rather
// than the number written twice. Sized so a 20-question paper fits the card down
// to a ~1280px viewport; beyond that the measured width wins and it scrolls.
// This does NOT set the bar width: when the chart isn't scrolling it renders at
// width="100%" and Recharts sizes bars from the card's real width, capped at
// cfg.barSize.
const QUESTION_BAR_SLOT = 46

// ─── types ────────────────────────────────────────────────────────────────────
export type ChartTab = 'question' | 'chapter' | 'student'

interface DataPoint {
  label: string
  value: number
  color: string
  // chapter bars (Teacher Metrics spec tooltip): absolute section average
  // marks and the chapter's total marks — null where scans aren't marked yet.
  // Also reused by class-wide question bars for the "Sec X scored Y/Z" line.
  avgMarks?: number | null
  maxMarks?: number | null
  section?: string | null        // class-wide question bars only
  // personal bars only (Student Login Metrics spec tooltip)
  gotMarks?: number | null       // the student's own absolute marks
  difficulty?: string | null     // question difficulty from the paper
  classAvgMarks?: number | null  // class average in absolute marks
}

// ─── colours per bar ──────────────────────────────────────────────────────────
// Below 40% is red, 40%+ is green — matches the question legend.
function questionBarColor(value: number): string {
  return value < 40 ? PERF_RED : PERF_GREEN
}

// Below 40% is a struggling chapter (red); 40% and above is on track (green) — same threshold logic as the question chart.
function chapterBarColor(value: number): string {
  return value < 40 ? PERF_RED : PERF_GREEN
}

// The "By student" histogram has one bucket per performance band, so a bar and
// its legend entry are the same thing. These labels are the axis labels AND the
// legend labels, and bar colours are matched on them — so DIST_RANGES below must
// stay character-for-character identical to the labels here.
const STUDENT_BAND_COLORS = [PERF_RED, PERF_ORANGE, PERF_TEAL, PERF_GREEN]
const STUDENT_BANDS: { label: string; color: string }[] = PERFORMANCE_BANDS.map(
  (b, i) => ({ label: b.label, color: STUDENT_BAND_COLORS[i] }),
)

// value here is a student count, not a score — colour by the bucket's score band instead.
function studentBarColor(label: string): string {
  return STUDENT_BANDS.find((b) => b.label === label)?.color ?? PERF_RED
}

// ─── per-tab config ───────────────────────────────────────────────────────────
interface TabConfigEntry {
  data: DataPoint[]
  title: string
  subtitle: string
  tooltipLabel: string
  isPercent: boolean
  yDomain: [number, number]
  yTicks: number[]
  barSize: number
  legend: { color: string; label: string }[]
}

const tabConfig: Record<ChartTab, TabConfigEntry> = {
  question: {
    data:        [],
    title:       'Question-wise performance in this exam',
    subtitle:    'See how your section performed on each question',
    tooltipLabel:'Class Avg',
    isPercent:   true,
    yDomain:     [0, 100] as [number, number],
    yTicks:      [0, 25, 50, 75, 100],
    barSize:     32,
    legend: [
      { color: PERF_RED,   label: 'Below 40%' },
      { color: PERF_GREEN, label: '40% and above' },
    ],
  },
  chapter: {
    data:        [],
    title:       'Chapter-wise performance in this exam',
    subtitle:    'See how the class performed in each chapter',
    tooltipLabel:'Chapter Avg',
    isPercent:   true,
    yDomain:     [0, 100] as [number, number],
    yTicks:      [0, 25, 50, 75, 100],
    barSize:     44,
    legend: [
      { color: PERF_RED,   label: 'Below 40%' },
      { color: PERF_GREEN, label: '40% and above' },
    ],
  },
  student: {
    data:        [],
    title:       'Score Distribution in this exam ',
    subtitle:    'See how students are distributed by score range',
    tooltipLabel:'No. of students',
    isPercent:   false,
    // beaver#669 (revised): 0-40 in 10-student steps — see studentYAxis(),
    // which cfgFor() applies over these defaults.
    yDomain:     [0, 40] as [number, number],
    yTicks:      [0, 10, 20, 30, 40],
    barSize:     60,
    legend:      STUDENT_BANDS,
  },
}

// Matches the 3-tier "By Question" legend: zero marks, partial marks, full
// marks — used for a student's own per-question view.
function personalQuestionBarColor(value: number): string {
  if (value <= 0) return PERF_RED
  if (value >= 100) return PERF_GREEN
  return PERF_ORANGE
}

// Student's own view: personalized copy on both tabs — "Section ..." /
// "the class" reads wrong when it's one student looking at their own results.
// Data comes from the student's own scanned crops (personalContext), never mocks.
const personalTabConfig = {
  question: {
    ...tabConfig.question,
    title: 'Question-wise Performance',
    subtitle: 'See how you performed in each question',
    tooltipLabel: 'You Scored',
    legend: [
      { color: PERF_RED,    label: 'Zero Marks' },
      { color: PERF_ORANGE, label: 'Partial Marks Scored' },
      { color: PERF_GREEN,  label: 'Full Marks Scored' },
    ],
  },
  chapter: {
    ...tabConfig.chapter,
    title: 'Chapter-Wise Performance',
    subtitle: 'Prioritise weak chapters to recover marks',
    tooltipLabel: 'You Scored',
    legend: [
      { color: PERF_GREEN, label: 'Average Score in a Chapter' },
    ],
  },
}

// Spec labels the difficulty Hard / Moderate / Easy — normalise the paper's
// raw value ("HARD", "medium", …) to that vocabulary.
function fmtDifficulty(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (t === 'medium' || t === 'moderate') return 'Moderate'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Format "10" / "10.5" without a trailing ".0".
function fmtMarks(n: number): string {
  return String(Math.round(n * 10) / 10)
}

// Histogram tooltip sentence (Teacher Metrics spec): where this score band
// sits relative to the class average — below / around (±10%) / above.
function distDescription(d: DataPoint, classAvg: number | null): string | null {
  if (classAvg == null || d.value <= 0) return null
  const band = bandByLabel(d.label)
  if (!band) return null
  const { lo, hi } = band
  const position =
    hi <= classAvg - 10 ? 'below' : lo >= classAvg + 10 ? 'above' : 'around'
  const subject = d.value === 1 ? '1 student is' : `${d.value} students are`
  return `${subject} ${position} the class average of ${Math.round(classAvg)}%`
}

// ─── custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({
  active, payload, tab, cfg, personal, classAvg,
}: {
  active?: boolean
  payload?: readonly any[]
  tab: ChartTab
  cfg: TabConfigEntry
  personal: boolean
  classAvg: number | null
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as DataPoint

  // Student Login Metrics spec: the personal tooltip shows absolute marks
  // ("You Scored 3/6") plus difficulty + class average (question) or the
  // chapter's worth in this exam (chapter). Lines only appear when the
  // underlying data exists — no invented copy.
  const descriptionLines: React.ReactNode[] = personal
    ? tab === 'chapter'
      ? d.maxMarks != null
        ? [
            `This chapter was worth ${fmtMarks(d.maxMarks)} marks in this exam.` +
              (d.gotMarks != null ? ` You scored ${fmtMarks(d.gotMarks)}/${fmtMarks(d.maxMarks)} marks.` : ''),
          ]
        : []
      : [
          ...(d.difficulty
            ? [<>Question Difficulty: <span className="font-semibold text-foreground">{fmtDifficulty(d.difficulty)}</span></>]
            : []),
          ...(d.classAvgMarks != null && d.maxMarks != null
            ? [`Class Average was ${fmtMarks(d.classAvgMarks)}/${fmtMarks(d.maxMarks)}.`]
            : []),
        ]
    : tab === 'chapter'
      ? d.maxMarks != null && d.avgMarks != null && d.section
        ? [`This chapter was worth ${fmtMarks(d.maxMarks)} marks on this exam. Sec ${d.section} scored ${fmtMarks(d.avgMarks)}/${fmtMarks(d.maxMarks)} on avg.`]
        : []
      : tab === 'student'
        ? [distDescription(d, classAvg)].filter((s): s is string => s != null)
        : [
            ...(d.difficulty ? [`Difficulty Level: ${fmtDifficulty(d.difficulty)}`] : []),
            ...(d.avgMarks != null && d.maxMarks != null && d.section
              ? [`Sec ${d.section} scored ${fmtMarks(d.avgMarks)}/${fmtMarks(d.maxMarks)} on avg for this question.`]
              : []),
          ]

  // Personal bars carry the student's absolute marks — spec shows "3/6", not a %.
  const valueText =
    personal && d.gotMarks != null && d.maxMarks != null
      ? `${fmtMarks(d.gotMarks)}/${fmtMarks(d.maxMarks)}`
      : cfg.isPercent ? `${d.value}%` : String(d.value)

  return (
    <div className="bg-background border border-border rounded-md shadow-md px-3 py-[6px] w-[266px] flex flex-col gap-[6px]">
      <p className="text-[16px] font-normal leading-6 text-foreground truncate">
        {d.label}
      </p>
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="size-3 rounded-[2px] bg-muted-foreground shrink-0" />
          <span className="text-[14px] leading-5 text-muted-foreground">{cfg.tooltipLabel}</span>
        </div>
        <span className="text-[12px] font-normal text-foreground tabular-nums shrink-0">
          {valueText}
        </span>
      </div>
      {descriptionLines.length > 0 && (
        <div className="pt-1.5 border-t border-border flex flex-col gap-1">
          {descriptionLines.map((line, i) => (
            <p key={i} className="text-[12px] leading-4 tracking-[-0.072px] text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── legend swatch ────────────────────────────────────────────────────────────
function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-[11px] rounded-[2px] shrink-0" style={{ background: color }} />
      <span className="text-[16px] font-normal leading-6 text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  )
}

// ─── tab button ───────────────────────────────────────────────────────────────
function TabBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-[4px] text-[14px] font-medium tracking-[-0.084px] transition-colors whitespace-nowrap ${
        active
          ? 'bg-background text-foreground shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// ─── x-axis tick: left-aligned to the bar's left edge ────────────────────────
function AxisTick({
  x, y, payload, barSize, tab,
}: {
  x?: string | number
  y?: string | number
  payload?: { value: string }
  barSize: number
  tab: ChartTab
}) {
  return (
    <ChartAxisTick
      x={Number(x ?? 0) - barSize / 2}
      y={y}
      payload={payload}
      maxChars={tab === 'chapter' ? 10 : 999}
      fontSize={14}
      fill="oklch(0.554 0.041 257.417)"
      textAnchor="start"
      dy={16}
    />
  )
}

// ─── main component ───────────────────────────────────────────────────────────
interface AnalysisChartProps {
  tab: ChartTab
  onTabChange: (tab: ChartTab) => void
  /** 'personal' = a student viewing their own results: no "By student" tab, personalized copy/coloring on "By Question" */
  variant?: 'class' | 'personal'
  /** When provided, the three series show this exam's real data. */
  context?: AnalyticsFilters
  /** Personal variant only: the logged-in student's own crops for this exam —
   * both series show their real marked scores (Student Login Metrics spec). */
  personalContext?: CropStudentContext
}

// beaver#669 (revised): one bucket per performance band, so the bars line up
// one-to-one with the legend. Labels come from STUDENT_BANDS so the two can't drift.
const DIST_RANGES = STUDENT_BANDS.map((b) => b.label)
function buildStudentDist(pcts: number[]): DataPoint[] {
  const counts = new Array(DIST_RANGES.length).fill(0)
  for (const p of pcts) {
    if (p < 0) continue // unmarked papers stay out of the histogram
    counts[bandIndex(p)]++
  }
  return DIST_RANGES.map((label, i) => ({ label, value: counts[i], color: studentBarColor(label) }))
}

// 0-40 in steps of 10. Four buckets concentrate the counts, so 40 clears a
// typical section without the crowded gridlines a 5-student step gave. The
// Math.max is only a guard against clipping an unusually large section.
function studentYAxis(data: DataPoint[]): { yDomain: [number, number]; yTicks: number[] } {
  const top = Math.max(40, Math.ceil(Math.max(0, ...data.map((d) => d.value)) / 10) * 10)
  return { yDomain: [0, top], yTicks: Array.from({ length: top / 10 + 1 }, (_, i) => i * 10) }
}

function ChartBody({ cfg, tab, personal, classAvg }: { cfg: TabConfigEntry; tab: ChartTab; personal: boolean; classAvg: number | null }) {
  return (
    <>
      <CartesianGrid vertical={false} stroke="oklch(0.929 0.013 255.508)" />
      <XAxis
        dataKey="label"
        tick={(props) => <AxisTick {...props} barSize={cfg.barSize} tab={tab} />}
        axisLine={false}
        tickLine={false}
        tickMargin={8}
        interval={0}
      />
      <YAxis
        domain={cfg.yDomain}
        interval={0}
            ticks={cfg.yTicks}
        tick={{ fontSize: 14, fill: 'oklch(0.554 0.041 257.417)' }}
        axisLine={false}
        tickLine={false}
        width={32}
      />
      <Tooltip
        content={(props) => (
          <ChartTooltip active={props.active} payload={props.payload} tab={tab} cfg={cfg} personal={personal} classAvg={classAvg} />
        )}
        cursor={false}
        position={TOOLTIP_POSITION}
      />
      <Bar dataKey="value" radius={[8, 8, 8, 8]}>
        {cfg.data.map((d, i) => (
          <Cell key={i} fill={d.color} />
        ))}
      </Bar>
    </>
  )
}

export function AnalysisChart({ tab, onTabChange, variant = 'class', context, personalContext }: AnalysisChartProps) {
  const personal = variant === 'personal'
  const [dyn, setDyn] = useState<{ data: Record<ChartTab, DataPoint[]>; classAvg: number | null } | null>(null)
  const [pers, setPers] = useState<{ question: DataPoint[]; chapter: DataPoint[] } | null>(null)

  // Personal series: the student's own marked crops joined with the paper's
  // question metadata (max marks, chapter, difficulty) and the class averages.
  useEffect(() => {
    if (!personal || !personalContext) { setPers(null); return }
    let ignore = false
    const filters: AnalyticsFilters = {
      grade: personalContext.grade,
      section: personalContext.section,
      subject: personalContext.subject,
      exam: personalContext.exam,
    }
    Promise.all([
      fetchAnswerCrops(personalContext).catch(() => []),
      fetchQuestions(filters).catch(() => ({ exam: filters.exam, questions: [] })),
    ])
      .then(([crops, g]) => {
        if (ignore) return
        // Marked-only per-question scores; denominator = whole-question max.
        const stats = personalQuestionStats(crops)
        const rowByNum = new Map(g.questions.map((q) => [Number(q.q.slice(1)), q]))
        const question: DataPoint[] = stats.map((s) => {
          const qr = rowByNum.get(s.questionNumber)
          const value = Math.round((100 * s.got) / s.max)
          return {
            label: `Q${s.questionNumber}`,
            value,
            color: personalQuestionBarColor(value),
            gotMarks: s.got,
            maxMarks: s.max,
            difficulty: qr && qr.difficulty !== '—' ? qr.difficulty : null,
            // Class average in absolute marks over the same denominator as
            // "You Scored" — only where the class actually has marked data.
            classAvgMarks: qr && qr.totalStudents > 0 ? (qr.avg / 100) * s.max : null,
          }
        })
        // Chapter % = student marks on the chapter / chapter max in this exam.
        // Chapter names join whitespace-insensitively (paper data varies).
        const byChapter = new Map<string, { label: string; got: number; max: number }>()
        for (const s of stats) {
          const chapter = rowByNum.get(s.questionNumber)?.chapter
          if (!chapter || chapter === '—') continue
          const clean = chapter.replace(/\s+/g, ' ').trim()
          const key = clean.toLowerCase()
          const e = byChapter.get(key) ?? { label: clean, got: 0, max: 0 }
          e.got += s.got
          e.max += s.max
          byChapter.set(key, e)
        }
        const chapter: DataPoint[] = Array.from(byChapter.values())
          .filter((e) => e.max > 0)
          .map((e) => {
            const value = Math.round((100 * e.got) / e.max)
            // Personal chapter bars are a single color — the legend now has
            // just one entry ("Average Score in a Chapter"), so a red/green
            // threshold would show a bar with no matching legend item.
            return { label: e.label, value, color: PERF_GREEN, gotMarks: e.got, maxMarks: e.max }
          })
        setPers({ question, chapter })
      })
      .catch(() => { if (!ignore) setPers({ question: [], chapter: [] }) })
    return () => { ignore = true }
  }, [personal, personalContext?.grade, personalContext?.section, personalContext?.subject, personalContext?.exam, personalContext?.roll, personalContext?.admissionNo])

  useEffect(() => {
    if (!context) { setDyn(null); return }
    let ignore = false
    Promise.all([
      fetchQuestions(context),
      fetchCropRoster({ grade: context.grade, section: context.section, subject: context.subject, exam: context.exam }).catch(() => []),
      fetchChapterStats({ grade: context.grade, section: context.section, subject: context.subject, exams: [context.exam] }).catch(() => []),
    ])
      .then(([g, roster, chapterStats]) => {
        if (ignore) return
        const question = g.questions.map((q) => ({
          label: q.q,
          value: q.avg,
          color: questionBarColor(q.avg),
          difficulty: q.difficulty !== '—' ? q.difficulty : null,
          avgMarks: q.marks ? Math.round(((q.avg / 100) * q.marks) * 10) / 10 : null,
          maxMarks: q.marks,
          section: context.section,
        }))
        // Spec: chapter avg % = Σ student marks on the chapter / (students ×
        // chapter max) × 100 — the chapter-stats endpoint computes exactly
        // that from scanned marks (marked papers only, OR groups counted once).
        let chapter: DataPoint[] = chapterStats
          .filter((c) => c.avgPct != null)
          .map((c) => {
            const v = Math.round(c.avgPct as number)
            return { label: c.chapter, value: v, color: chapterBarColor(v), avgMarks: c.avgMarks, maxMarks: c.chapterMax, section: context.section }
          })
        if (chapter.length === 0) {
          // Fallback (no chapter-mapped scans): marks-weighted mean of the
          // per-question averages — same formula, computed from question rows.
          const cm = new Map<string, { got: number; max: number }>()
          for (const q of g.questions) {
            const k = q.chapter || '—'
            const e = cm.get(k) ?? { got: 0, max: 0 }
            if (q.avg && q.marks) { e.got += (q.avg / 100) * q.marks; e.max += q.marks }
            cm.set(k, e)
          }
          chapter = Array.from(cm.entries())
            .filter(([, e]) => e.max > 0)
            .map(([label, e]) => {
              const v = Math.round((100 * e.got) / e.max)
              return { label, value: v, color: chapterBarColor(v), avgMarks: e.got, maxMarks: e.max, section: context.section }
            })
        }
        const pcts = roster.map((r) =>
          r.totalMarks != null && (r.totalMaxMarks ?? 0) > 0 ? (100 * r.totalMarks) / (r.totalMaxMarks as number) : -1,
        )
        const student = buildStudentDist(pcts)
        // Class average % across marked papers — the histogram tooltip's anchor.
        const marked = pcts.filter((p) => p >= 0)
        const classAvg = marked.length ? marked.reduce((a, b) => a + b, 0) / marked.length : null
        setDyn({ data: { question, chapter, student }, classAvg })
      })
      .catch(() => { if (!ignore) setDyn(null) })
    return () => { ignore = true }
  }, [context])

  const loading = (!!context && !dyn) || (personal && !!personalContext && !pers)

  // Every tab's config, not just the active one — the slider renders them all.
  // Cheap: one fetch already returns data for all three (dyn.data).
  const cfgFor = (t: ChartTab): TabConfigEntry => {
    const base: TabConfigEntry = personal
      ? personalTabConfig[t as 'question' | 'chapter']
      : tabConfig[t]
    const withData = personal
      ? { ...base, data: pers?.[t as 'question' | 'chapter'] ?? [] }
      : context && dyn ? { ...base, data: dyn.data[t] } : base
    // "By student" counts students, not percentages, so its axis can't be a
    // fixed 0-100. Four buckets concentrate the counts far more than the old
    // nine did, so grow the axis in 5-student steps rather than clipping a bar.
    return t === 'student' ? { ...withData, ...studentYAxis(withData.data) } : withData
  }

  // A student's own view has no "By student" tab.
  const TABS: ChartTab[] = personal ? ['question', 'chapter'] : ['question', 'chapter', 'student']
  const cfg = cfgFor(tab)
  const classAvg = dyn?.classAvg ?? null

  // Honest empty state: a student with no marked scans for this exam (or no
  // chapter mapping on the paper) sees that, not placeholder bars.
  const personalEmptyFor = (t: ChartTab) => personal && !loading && cfgFor(t).data.length === 0
  const personalEmptyMsgFor = (t: ChartTab) =>
    t === 'chapter'
      ? 'No chapter-wise data for this exam yet — your marked answers haven’t been mapped to chapters.'
      : 'No marked answers for this exam yet — your scores will appear here once your paper is scanned and marked.'

  // "By Question" only needs to scroll once the fixed per-bar width
  // (QUESTION_BAR_SLOT) actually exceeds the card's real width — measured in JS
  // instead of via a CSS min-width/width tug-of-war, which raced with
  // ResponsiveContainer's own measurement and misdrew the Y-axis. When no scroll
  // is needed, this renders the exact same plain <ResponsiveContainer>
  // structure as the other tabs.
  //
  // The measurement *stores the width* and the decision is derived from it on
  // every render. Measuring straight into the boolean latched: the observer only
  // fires when the wrapper's own box changes, which a full-width wrapper never
  // does, so a single early 0-width reading stuck and pinned the chart to a
  // data.length * SLOT canvas inside a much wider card.
  const questionWrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState(0)
  useEffect(() => {
    if (tab !== 'question' || !questionWrapRef.current) return
    const el = questionWrapRef.current
    const measure = () => setWrapWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab])
  // The QUESTION tab's own bar count, not the active tab's — that panel is
  // always mounted now, so its width must not depend on which tab is showing.
  const questionDesiredWidth = cfgFor('question').data.length * QUESTION_BAR_SLOT
  const questionNeedsScroll = wrapWidth > 0 && questionDesiredWidth > wrapWidth

  return (
    <div className="border border-border rounded-lg bg-card shadow-sm overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between gap-6 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-0">
          <p className="text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground">
            {cfg.title}
          </p>
          <p className="text-[18px] font-normal leading-7 tracking-[-0.108px] text-muted-foreground">
            {cfg.subtitle}
          </p>
        </div>
        <div className="flex items-center bg-secondary rounded-md p-1 shrink-0 gap-0">
          <TabBtn active={tab === 'question'} onClick={() => onTabChange('question')}>By Question</TabBtn>
          <TabBtn active={tab === 'chapter'}  onClick={() => onTabChange('chapter')}>By Chapter</TabBtn>
          {!personal && (
            <TabBtn active={tab === 'student'} onClick={() => onTabChange('student')}>By Student</TabBtn>
          )}
        </div>
      </div>

      {/* chart */}
      <div className="px-6 pb-6">
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SlidePanels className="w-full" index={TABS.indexOf(tab)}>
            {TABS.map((t) => (
              <div key={t}>{chartFor(t)}</div>
            ))}
          </SlidePanels>
        )}
      </div>
    </div>
  )

  // One tab's chart plus its legend. Takes the tab so the slider can render
  // every panel; only the question tab needs the scroll wrapper.
  function chartFor(t: ChartTab) {
    const c = cfgFor(t)

    if (personalEmptyFor(t)) {
      return (
        <div className="h-[220px] flex items-center justify-center px-6">
          <p className="text-[16px] leading-6 text-muted-foreground text-center">{personalEmptyMsgFor(t)}</p>
        </div>
      )
    }

    return (
      <>
        {t === 'question' ? (
          // Section supports up to MAX_QUESTIONS bars — fixed per-bar width so
          // a large question count overflows and scrolls horizontally instead
          // of squeezing every bar in. questionNeedsScroll is measured in JS
          // (see the effect above), so when it's false this renders the exact
          // same plain <ResponsiveContainer> structure as the other tabs below
          // — no CSS width tug-of-war for ResponsiveContainer to race against.
          <TooltipProvider delayDuration={300}>
            <div ref={questionWrapRef} className={questionNeedsScroll ? 'overflow-x-auto scrollbar-hide' : undefined}>
              {questionNeedsScroll ? (
                // minWidth keeps a stale/early "needs scroll" reading from
                // shrinking the chart below the card — it fills the card
                // whenever the bars fit, and only the wider `width` overflows.
                <div style={{ width: questionDesiredWidth, minWidth: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={c.data}
                      barSize={c.barSize}
                      margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                    >
                      <ChartBody cfg={c} tab={t} personal={personal} classAvg={classAvg} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={c.data}
                    barSize={c.barSize}
                    margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                  >
                    <ChartBody cfg={c} tab={t} personal={personal} classAvg={classAvg} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={300}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={c.data}
                barSize={c.barSize}
                margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
              >
                <ChartBody cfg={c} tab={t} personal={personal} classAvg={classAvg} />
              </BarChart>
            </ResponsiveContainer>
          </TooltipProvider>
        )}

        {/* legend */}
        <div className="flex items-center justify-center gap-6 mt-3">
          {c.legend.map((item) => (
            <Swatch key={item.label} color={item.color} label={item.label} />
          ))}
        </div>
      </>
    )
  }
}
