'use client'

import { PERFORMANCE_BANDS } from '@/app/lib/performance-bands'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDashboardData, type DashboardData } from '@/app/lib/dashboard'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'
import { trackDrilldown, trackTabKey } from '@/app/lib/analytics'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { LayoutGrid, Table2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useViewer } from '@/app/lib/viewer'
import { StudentDashboard } from '@/components/student-dashboard'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { StatCardGridSkeleton, TableSkeleton, ChartSkeleton } from '@/components/page-skeletons'
import { PageFilters } from '@/components/page-filters'
import { ClassTeachers } from '@/components/class-teachers'
import { teachersForCombo } from '@/app/lib/teachers'
import { leadsClass } from '@/app/lib/senior-scope'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip as UiTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { ChartAxisTickEdge } from '@/components/chart-axis-tick-edge'
import { SlidePanels } from '@/components/slide-panels'

// Panel order inside SlidePanels — must match the TabsTrigger order on screen,
// or the slide direction reads backwards.
const CHART_TAB_ORDER = ['assignment', 'chapter', 'student']


const CHART_META: Record<string, { title: string; subtitle: string }> = {
  assignment: {
    title: 'Average Score for each Exam',
    subtitle: 'Compare average scores across all exams',
  },
  chapter: {
    title: 'Chapter-wise Scores across all Exams',
    subtitle: 'See weakest and strongest chapters across exams',
  },
  student: {
    title: 'Score Distribution across all Exams',
    subtitle: 'See how students are distributed by score range',
  },
}

// Exam trend: the brand identity pair (design tokens, theme.css) — navy for
// the line, dots and legend, a soft teal wash under the line. The fill used
// to be the near-black line colour at 95% opacity, which read as a heavy
// dark slab.
const CHART_COLOR = '#133951' // --inferentics-primitive-brand-navy-700
const CHART_FILL = '#6baaae'  // --inferentics-primitive-brand-teal-500
const AXIS_COLOR = 'oklch(0.554 0.041 257.417)'
const GRID_COLOR = 'oklch(0.929 0.013 255.508)'
const CHAPTER_GREEN = 'var(--inferentics-brand-primary)'
const STUDENT_RED    = 'var(--chart-1)'  // Below 40%
const STUDENT_ORANGE = '#ffa940'         // 40-60%
const STUDENT_TEAL   = '#299D8F'         // 60-80%
const STUDENT_GREEN  = CHAPTER_GREEN     // 80%+

// Student distribution: one bucket per performance band (PCT_BANDS in
// app/lib/dashboard.ts), so a bar and its legend entry are the same thing.
// Both the bar fills and the legend below are driven off this one list —
// the labels must stay identical to PCT_BANDS or a bar loses its colour.
const STUDENT_BAND_COLORS = [STUDENT_RED, STUDENT_ORANGE, STUDENT_TEAL, STUDENT_GREEN]
const STUDENT_BANDS: { label: string; color: string }[] = PERFORMANCE_BANDS.map(
  (b, i) => ({ label: b.label, color: STUDENT_BAND_COLORS[i] }),
)

// Bar fill for student distribution — colour by performance band
function studentBarFill(range: string): string {
  return STUDENT_BANDS.find((b) => b.label === range)?.color ?? STUDENT_RED
}

const examSeriesLabel = (f: { grade: string; section: string } | null, fallback: string) =>
  f ? `${f.grade}-${f.section} average score` : fallback

interface TooltipPayload {
  value: number
  payload?: { range?: string; count?: number; name?: string; score?: number }
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

function TooltipShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md shadow-md px-2 py-1.5 w-[250px] flex flex-col gap-1.5">
      <p className="text-[16px] font-normal leading-6 text-foreground truncate">{label}</p>
      {children}
    </div>
  )
}

function AssignmentTooltip({ active, payload, label, seriesLabel }: ChartTooltipProps & { seriesLabel?: string }) {
  if (!active || !payload?.length) return null
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: CHART_COLOR }} />
        <span className="text-[14px] leading-5 text-muted-foreground flex-1">{seriesLabel ?? 'Class average'}</span>
        <span className="text-[12px] font-mono text-foreground">{payload[0].value}%</span>
      </div>
      <div className="border-t border-border" />
      <p className="text-[12px] leading-4 tracking-[-0.072px] text-muted-foreground">
        {(payload[0] as { payload?: { tooltip?: string } }).payload?.tooltip ?? ''}
      </p>
    </TooltipShell>
  )
}

function ChapterTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-[2px] shrink-0 bg-muted-foreground" />
        <span className="text-[14px] leading-5 text-muted-foreground flex-1">Chapter average</span>
        <span className="text-[12px] font-mono text-foreground">{payload[0].value}%</span>
      </div>
      <div className="border-t border-border" />
      <p className="text-[12px] leading-4 tracking-[-0.072px] text-muted-foreground">
        {(payload[0] as { payload?: { tooltip?: string } }).payload?.tooltip ?? ''}
      </p>
    </TooltipShell>
  )
}

function StudentTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const fill = studentBarFill(label ?? '')
  return (
    <TooltipShell label={label ?? ''}>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: fill }} />
        <span className="text-[14px] leading-5 text-muted-foreground flex-1">No.of students</span>
        <span className="text-[12px] font-mono text-foreground">{payload[0].value}</span>
      </div>
      <div className="border-t border-border" />
      <p className="text-[12px] leading-4 tracking-[-0.072px] text-muted-foreground">
        {(payload[0] as { payload?: { tooltip?: string } }).payload?.tooltip ?? ''}
      </p>
    </TooltipShell>
  )
}

export default function DashboardPage() {
  const { activeRole, roleResolved } = useViewer()
  // No leadership redirect to /subject any more: the sidebar now shows both
  // groups, so Home is a real destination for them.
  // activeRole falls back to TEACHER until the stored user is read
  // (viewer.tsx roleResolved), so without this gate the TEACHER body mounts
  // for one frame on a student login and fires its class-level fetches —
  // every one a 403 for a student token (console noise + wasted round trips).
  // Render nothing for that frame instead; the resolved role then mounts once.
  if (!roleResolved) return null
  if (activeRole === 'STUDENT') return <StudentDashboard />
  return <TeacherDashboard />
}

// Untouched below this line — original teacher dashboard body, just renamed
// from the default export so this file can dispatch on role.
function TeacherDashboard() {
  const router = useRouter()
  // Opens on By Exam. ('assignment' is the By Exam tab's legacy key, kept
  // in sync with CHART_META and the render branches below.)
  const [chartTab, setChartTab] = useState('assignment')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const activeMeta = CHART_META[chartTab]

  const { combos, filters, setFilters } = useAnalyticsFilters()
  const [data, setData] = useState<DashboardData>({
    chapters: [],
    distribution: [],
    trend: [],
    assessments: [],
  })

  // The empty arrays above mean both "not fetched yet" and "genuinely nothing",
  // so without this the charts and the exam table render as finished-but-empty
  // results while the request is still in flight — on a slow network that reads
  // as "this class has no data" (beaver#786).
  //
  // Loading is DERIVED, not a flag set inside the effect: we remember which
  // filter combination `data` belongs to, so a filter change is "loading" from
  // the very first render — no window where the old exam's numbers sit under the
  // new exam's heading.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const filterKey = filters ? JSON.stringify(filters) : null
  const loading = filterKey === null || !combos || loadedKey !== filterKey

  useEffect(() => {
    if (!filters || !combos) return
    let ignore = false
    const key = JSON.stringify(filters)
    fetchDashboardData(filters, combos)
      .then((d) => { if (!ignore) { setData(d); setLoadedKey(key) } })
      // Mark it settled on failure too — otherwise the page spins forever
      // instead of falling back to the honest empty state.
      .catch(() => { if (!ignore) setLoadedKey(key) })
    return () => { ignore = true }
  }, [filters, combos])

  const chartData = data.trend
  const chapterData = data.chapters
  const studentData = data.distribution
  // 0-40 in steps of 10. Four buckets concentrate the counts, so 40 clears a
  // typical section without the crowded gridlines a 5-student step gave. The
  // Math.max is only a guard against clipping an unusually large section.
  const studentTop = Math.max(40, Math.ceil(Math.max(0, ...studentData.map((d) => d.count)) / 10) * 10)
  const studentTicks = Array.from({ length: studentTop / 10 + 1 }, (_, i) => i * 10)
  const assessments = data.assessments

  // Carry the exam name + filter context so the exam page's Analysis tab can
  // show that exam's real questions.
  function examHref(a: { id: number; examId: string }): string {
    if (!filters) return `/exam/${a.id}`
    const p = new URLSearchParams({
      // exam carries the BACKEND id — the display name is presentation-only
      grade: filters.grade, section: filters.section, subject: filters.subject, exam: a.examId,
    })
    return `/exam/${a.id}?${p.toString()}`
  }

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Exams
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Analyse your section’s scores across all exams 
          </p>
        </div>

        {combos && filters && (
          <div className="flex flex-wrap items-center justify-end gap-sp-lg gap-y-2 min-w-0">
            <PageFilters combineGradeSection combos={combos} value={filters} onChange={setFilters} />
            {/* beaver#806: who takes the selected class, read-only. */}
            <ClassTeachers
              teachers={teachersForCombo(combos, filters)}
              leads={leadsClass(combos, filters.grade, filters.subject, filters.section)}
              className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-foreground"
            />
          </div>
        )}
      </div>

      {/* Performance chart card */}
      <Card className="gap-0 py-0 rounded-xl overflow-hidden">
        <CardHeader className="p-6 gap-0">
          <CardTitle className="text-[20px] font-semibold leading-[28px] tracking-[-0.12px]">
            {activeMeta.title}
          </CardTitle>
          <CardDescription className="text-[18px] leading-[28px] tracking-[-0.108px]">
            {activeMeta.subtitle}
          </CardDescription>
          <CardAction>
            {/* Which analysis teachers actually open — page_view can't see a
                tab switch, the path is unchanged. */}
            <Tabs
              value={chartTab}
              onValueChange={(tab) => {
                trackTabKey(tab)
                setChartTab(tab)
              }}
            >
              <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-[#f4f4f5] border border-border p-1 rounded-[6px] gap-0">
                <TabsTrigger
                  value="assignment"
                  className="h-auto text-[16px] leading-6 font-medium px-3 py-2 rounded-[4px] data-[state=active]:bg-white data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                >
                  By Exam
                </TabsTrigger>
                <TabsTrigger
                  value="chapter"
                  className="h-auto text-[16px] leading-6 font-medium px-3 py-2 rounded-[4px] data-[state=active]:bg-white data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                >
                  By Chapter
                </TabsTrigger>
                <TabsTrigger
                  value="student"
                  className="h-auto text-[16px] leading-6 font-medium px-3 py-2 rounded-[4px] data-[state=active]:bg-white data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                >
                  By Student
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>

        <CardContent className="px-6 pb-6 pt-0">
          {/* Same height as the charts below, so the card doesn't resize once
              the data lands. */}
          {loading && <ChartSkeleton height={240} />}

          {/* All three panels stay mounted inside SlidePanels — swapping them
              tore down the chart and made it re-measure, which read as a blink. */}
          {!loading && (
          <SlidePanels index={CHART_TAB_ORDER.indexOf(chartTab)}>
            {/* By assignment — area chart */}
            <>
              {/* Provider for ChartAxisTick's hover tooltip — the chapter and
                  student branches already wrap theirs. */}
              <TooltipProvider delayDuration={300}>
              <ResponsiveContainer width="100%" height={240}>
                {/* beaver#705: a single exam has no trend to show — a line/area
                    with one point reads as a dot floating in space, so it's a
                    plain bar instead. Once there are 2+ exams, an area chart
                    shows the trend across them. */}
                {chartData.length <= 1 ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} barSize={44}>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                    {/* Shared tick: centered under the band, ellipsis + hover
                        tooltip past maxChars — the same treatment the chapter
                        and student charts below use. */}
                    <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={<ChartAxisTick maxChars={24} fontSize={16} fill={AXIS_COLOR} />} />
                    <YAxis domain={[0, 100]} interval={0} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 16, fill: AXIS_COLOR }} width={40} />
                    <Tooltip content={<AssignmentTooltip seriesLabel={examSeriesLabel(filters, 'Class average')} />} cursor={false} position={TOOLTIP_POSITION} />
                    <Bar dataKey="score" fill={CHART_COLOR} radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_FILL} stopOpacity={0.55} />
                        <stop offset="95%" stopColor={CHART_FILL} stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                    {/* Inset the end points off the plot edges, where a centred label would be half clipped. */}
                    <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} padding={{ left: 120, right: 120 }} tick={<ChartAxisTickEdge count={chartData.length} maxChars={Math.max(10, Math.floor(64 / Math.max(1, chartData.length)))} fontSize={16} fill={AXIS_COLOR} />} />
                    <YAxis domain={[0, 100]} interval={0} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 16, fill: AXIS_COLOR }} width={40} />
                    <Tooltip content={<AssignmentTooltip seriesLabel={examSeriesLabel(filters, 'Class average')} />} cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }} position={TOOLTIP_POSITION} />
                    <Area type="linear" dataKey="score" stroke={CHART_COLOR} strokeWidth={1.5} fill="url(#areaGradient)"
                      dot={{ r: 4, fill: 'white', stroke: CHART_COLOR, strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: 'white', stroke: CHART_COLOR, strokeWidth: 2 }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
              </TooltipProvider>
              <div className="flex justify-center mt-3">
                <div className="flex items-center gap-2">
                  <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: CHART_COLOR }} />
                  <span className="text-[16px] leading-6 text-muted-foreground">
                    {examSeriesLabel(filters, 'Average score')}
                  </span>
                </div>
              </div>
            </>

            {/* By chapter — bar chart, uniform slate bars */}
            <>
              <TooltipProvider delayDuration={300}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chapterData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} barSize={44}>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={<ChartAxisTick maxChars={12} fontSize={14} fill={AXIS_COLOR} />}
                      interval={0}
                    />
                    <YAxis domain={[0, 100]} interval={0} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 16, fill: AXIS_COLOR }} width={40} />
                    <Tooltip content={<ChapterTooltip />} cursor={false} position={TOOLTIP_POSITION} />
                    <Bar dataKey="score" fill={CHAPTER_GREEN} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TooltipProvider>
              <div className="flex justify-center mt-3">
                <div className="flex items-center gap-2">
                  <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: CHAPTER_GREEN }} />
                  <span className="text-[16px] leading-6 text-muted-foreground">Chapter name</span>
                </div>
              </div>
            </>

            {/* By student — histogram coloured by performance band */}
            <>
              <TooltipProvider delayDuration={300}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={studentData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} barSize={53}>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={<ChartAxisTick maxChars={10} fontSize={14} fill={AXIS_COLOR} />} interval={0} />
                    {/* beaver#669 (revised): Y axis 0-40 in 10-student steps */}
                    <YAxis domain={[0, studentTop]} interval={0} ticks={studentTicks} axisLine={false} tickLine={false} tick={{ fontSize: 16, fill: AXIS_COLOR }} width={40} />
                    <Tooltip content={<StudentTooltip />} cursor={false} position={TOOLTIP_POSITION} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {studentData.map((entry) => (
                        <Cell key={entry.range} fill={studentBarFill(entry.range)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TooltipProvider>
              <div className="flex justify-center gap-6 mt-3">
                {STUDENT_BANDS.map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[16px] leading-6 text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </>
          </SlidePanels>
          )}
        </CardContent>
      </Card>

      {/* Assessment overview */}
      <div className="pb-6">
        <div className="flex items-start justify-between mb-sp-3xl">
          <div>
            <h2 className="text-[20px] font-semibold leading-[28px] tracking-[-0.12px] text-foreground">
              Pick an exam for a detailed analysis
            </h2>
            <p className="text-[18px] leading-[28px] tracking-[-0.108px] text-muted-foreground">
              Review analysis and trends for each exam
            </p>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'table')}>
            <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-secondary p-1 rounded-md gap-0 mt-1">
              <TabsTrigger
                value="grid"
                aria-label="Grid view"
                className="h-8 px-3 rounded-[4px] data-[state=active]:bg-white data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
              >
                <LayoutGrid className="size-4" />
              </TabsTrigger>
              <TabsTrigger
                value="table"
                aria-label="Table view"
                className="h-8 px-3 rounded-[4px] data-[state=active]:bg-white data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
              >
                <Table2 className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          viewMode === 'grid' ? <StatCardGridSkeleton count={3} /> : <TableSkeleton columns={6} rows={6} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-3 gap-6">
            {assessments.map((assessment) => (
              <Link key={assessment.id} href={examHref(assessment)} onClick={() => trackDrilldown('exam')}>
                <StatCard
                  name={assessment.name}
                  subtitle={`${assessment.date} · ${assessment.marks} marks`}
                  label="Class average"
                  avg={assessment.avg}
                  suffix=""
                  trend={assessment.trend}
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-sidebar-border rounded-xl overflow-hidden">
            <TooltipProvider delayDuration={300}>
            <Table>
              <TableHeader>
                <TableRow className="bg-green-50 hover:bg-green-50 border-sidebar-border">
                  <TableHead className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground h-auto w-[280px]">
                    Exam name
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground h-auto w-[154px]">
                    Class average
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground h-auto w-[125px]">
                    Max marks
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground h-auto w-[156px]">
                    Date
                  </TableHead>
                  <TableHead className="px-4 py-3 h-auto w-[101px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((assessment) => (
                  <TableRow
                    key={assessment.id}
                    onClick={() => { trackDrilldown('exam'); router.push(examHref(assessment)) }}
                    className="border-sidebar-border hover:bg-muted/30 cursor-pointer bg-white"
                  >
                    <TableCell className="px-4 py-3 max-w-0">
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <p className="truncate text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground cursor-default">
                            {assessment.name}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[400px] text-wrap">
                          {assessment.name}
                        </TooltipContent>
                      </UiTooltip>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground w-[154px]">
                      <CellTooltip content={assessment.avg ?? '—'}>{assessment.avg ?? '—'}</CellTooltip>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground w-[125px]">
                      <CellTooltip content={assessment.marks}>{assessment.marks}</CellTooltip>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[14px] font-medium leading-[28px] tracking-[-0.108px] text-foreground w-[156px]">
                      <CellTooltip content={assessment.date}>{assessment.date}</CellTooltip>
                    </TableCell>
                    <TableCell className="px-4 py-2 w-[101px] text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
                        <Link href={examHref(assessment)} onClick={() => trackDrilldown('exam')}>
                          View
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  )
}
