'use client'

import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'
import { SlidePanels } from '@/components/slide-panels'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'
import { trackTabView } from '@/app/lib/analytics'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartSkeleton } from '@/components/page-skeletons'

export interface StatusChartPoint {
  exam: string
  score: number
}

export interface GroupedBarSeries {
  key: string
  label: string
  color: string
}

export interface ChartTabOption {
  key: string
  /** tab button label, e.g. "By Exam" */
  label: string
  /** heading shown above the chart when this tab is active */
  chartTitle: string
  kind: 'line' | 'bar' | 'groupedBar'
  /** points; `detail` (optional) renders as an extra tooltip line below a
   * divider; `valueLabel` (optional) overrides the tooltip's value text
   * (e.g. "5/18") while `value` still drives the plotted position/height */
  data: { label: string; value: number; detail?: string; valueLabel?: string }[]
  legendLabel?: string
  /** line/bar only: overrides the hover tooltip's row label — defaults to legendLabel */
  tooltipLabel?: string
  barColor?: string
  /** groupedBar only: one row per x-axis label, one numeric field per series
   * key; an optional `${key}Detail` string renders in the single-bar tooltip */
  groupedData?: Record<string, string | number>[]
  /** groupedBar only: which fields in groupedData to plot, in legend order */
  series?: GroupedBarSeries[]
  /** per-tab status copy — overrides the card-level status while active */
  status?: string
  statusDescription?: string
  /** y-axis ticks; default [0,15,30,45,60]. Domain is [first, last] unless yDomain overrides it */
  yTicks?: number[]
  /** y-axis domain override — otherwise derived from [yTicks[0], last] */
  yDomain?: [number, number]
  /** appended to tooltip values, e.g. '%' */
  valueSuffix?: string
  /** groupedBar only: 'single' shows only the hovered bar's series in the tooltip */
  groupedTooltip?: 'shared' | 'single'
  /** groupedTooltip='single' only: the value-row label, e.g. 'Section average'
   * (Teacher Metrics "By Concept" spec); default 'Average score' */
  groupedTooltipLabel?: string
  /** groupedTooltip='single' only: separator between the x-axis label and the
   * series label in the tooltip title (e.g. "Concept 1{sep}Exam 1"); default ' - ' */
  groupedTooltipSeparator?: string
  /** groupedBar only: controls the single-tooltip title */
  groupedTooltipTitle?: 'series' | 'label' | 'both'
  /** rendered instead of an empty chart when the tab has no data */
  emptyText?: string
  /** bar only: scroll horizontally instead of squishing bars when there are many data points */
  scrollable?: boolean
}

interface StatusChartCardProps {
  status: string
  statusDescription: string
  /** label above the status line, e.g. "Status" (default) or "Summary" */
  statusLabel?: string
  /** simple single-chart mode (used by Chapter) */
  chartTitle?: string
  chartData?: StatusChartPoint[]
  legendLabel?: string
  /** tabbed chart-switcher mode (used by Student) — takes precedence over the simple props above */
  chartTabs?: ChartTabOption[]
  /**
   * The card's data is still in flight: render skeletons in place of the status
   * lines and the chart, rather than the word "Loading". Off by default, so a
   * caller that doesn't opt in behaves exactly as before.
   */
  loading?: boolean
  className?: string
}

const GRID_COLOR = 'oklch(0.929 0.013 255.508)'
const LINE_COLOR = '#299d8f'
const DEFAULT_Y_TICKS = [0, 15, 30, 45, 60]

/** Resolves the Y-axis domain/ticks: an explicit yDomain always wins; otherwise
 * the domain spans the first and last tick, falling back to the default scale. */
function resolveYAxis(yDomain?: [number, number], yTicks?: number[]): { domain: [number, number]; ticks: number[] } {
  const ticks = yTicks ?? DEFAULT_Y_TICKS
  const domain = yDomain ?? ([ticks[0], ticks[ticks.length - 1]] as [number, number])
  return { domain, ticks }
}

function ChartTooltip({
  active, payload, color, legendLabel, tooltipLabel, valueSuffix = '',
}: {
  active?: boolean
  payload?: readonly any[]
  color: string
  legendLabel: string
  tooltipLabel?: string
  valueSuffix?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as { label: string; value: number; detail?: string; valueLabel?: string }

  return (
    <div className="bg-background rounded-md shadow-[0px_6px_3px_rgba(148,163,184,0.15),0px_0px_0.5px_rgba(148,163,184,1)] px-2 py-1.5 flex flex-col gap-1.5 min-w-[144px] max-w-[220px]">
      <p className="text-[12px] font-medium leading-4 tracking-[-0.072px] text-foreground break-words w-full">{point.label}</p>
      <div className="flex items-start gap-2 w-full">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground whitespace-nowrap">
            {tooltipLabel ?? legendLabel}
          </span>
        </div>
        <span className="font-mono text-[12px] leading-5 text-foreground text-right shrink-0 tabular-nums">
          {point.valueLabel ?? `${point.value}${valueSuffix}`}
        </span>
      </div>
      {point.detail && (
        <>
          <div className="h-px w-full bg-border shrink-0" />
          <p className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground whitespace-pre-line">{point.detail}</p>
        </>
      )}
    </div>
  )
}

function LineVariant({
  data, legendLabel, tooltipLabel, yDomain, yTicks, valueSuffix,
}: {
  data: { label: string; value: number; detail?: string }[]
  legendLabel: string
  tooltipLabel?: string
  yDomain?: [number, number]
  yTicks?: number[]
  valueSuffix?: string
}) {
  const { domain, ticks } = resolveYAxis(yDomain, yTicks)
  return (
    <>
      <ResponsiveContainer width="100%" height={222}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} horizontal={true} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            interval={0}
            ticks={ticks}
            tick={{ fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip active={props.active} payload={props.payload} color={LINE_COLOR} legendLabel={legendLabel} tooltipLabel={tooltipLabel} valueSuffix={valueSuffix} />
            )}
            cursor={false}
            position={TOOLTIP_POSITION}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 4, fill: LINE_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: LINE_COLOR, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-2 w-full">
        <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: LINE_COLOR }} />
        <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-foreground whitespace-nowrap">
          {legendLabel}
        </span>
      </div>
    </>
  )
}

function BarVariant({
  data, legendLabel, tooltipLabel, barColor, scrollable = false, yDomain, yTicks, valueSuffix,
}: {
  data: { label: string; value: number; detail?: string }[]
  legendLabel: string
  tooltipLabel?: string
  barColor: string
  scrollable?: boolean
  yDomain?: [number, number]
  yTicks?: number[]
  valueSuffix?: string
}) {
  const { domain, ticks } = resolveYAxis(yDomain, yTicks)
  const chartWidth = Math.max(data.length * 26, 550)
  return (
    <>
      <div className="w-full overflow-x-auto overflow-y-hidden">
        <div style={{ width: scrollable ? chartWidth : '100%', minWidth: '100%', height: 222 }}>
          <TooltipProvider delayDuration={300}>
          <ResponsiveContainer width="100%" height={222}>
            <BarChart data={data} barSize={44} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} horizontal={true} />
              <XAxis
                dataKey="label"
                // Bars share the width, so the budget shrinks as they multiply —
                // a lone bar keeps its full name, ten of them still clip at 10.
                tick={<ChartAxisTick maxChars={Math.max(10, Math.floor(64 / Math.max(1, data.length)))} />}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                domain={domain}
                interval={0}
            ticks={ticks}
                tick={{ fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip active={props.active} payload={props.payload} color={barColor} legendLabel={legendLabel} tooltipLabel={tooltipLabel} valueSuffix={valueSuffix} />
                )}
                cursor={{ fill: '#f1f5f9' }}
                position={TOOLTIP_POSITION}
              />
              <Bar dataKey="value" fill={barColor} radius={[6, 6, 6, 6]} />
            </BarChart>
          </ResponsiveContainer>
          </TooltipProvider>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 w-full">
        <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: barColor }} />
        <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-foreground whitespace-nowrap">
          {legendLabel}
        </span>
      </div>
    </>
  )
}

function GroupedChartTooltip({
  active, payload, label, series, valueSuffix = '',
}: {
  active?: boolean
  payload?: readonly any[]
  label?: string | number
  series: GroupedBarSeries[]
  valueSuffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background rounded-md shadow-[0px_6px_6px_rgba(148,163,184,0.15),0px_0px_1px_rgba(148,163,184,1)] px-2 py-1.5 flex flex-col gap-1.5 min-w-[160px] max-w-[240px]">
      <p className="text-[12px] font-medium leading-4 tracking-[-0.072px] text-foreground break-words">{label}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key)
        // Optional per-series detail line, e.g. "You scored 1/5 on this concept
        // in this exam." — carried on the row as `${key}Detail`.
        const detail = (entry?.payload as Record<string, unknown> | undefined)?.[`${s.key}Detail`]
        return (
          <div key={s.key} className="flex flex-col gap-1 w-full">
            <div className="flex items-start gap-2 w-full">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground whitespace-nowrap">
                  {s.label}
                </span>
              </div>
              <span className="text-[12px] text-foreground text-right shrink-0 tabular-nums">
                {entry?.value ?? '—'}{entry?.value != null ? valueSuffix : ''}
              </span>
            </div>
            {typeof detail === 'string' && detail && (
              <p className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground pl-5">{detail}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Tooltip for groupedTooltip='single' — only the hovered bar's series, plus
 * its optional `${key}Detail` line (student spec: "[Concept] - [Exam] … you
 * scored …"; teacher spec: a "Section average [value]%" row via `rowLabel`). */
function SingleBarTooltip({
  active, payload, label, series, valueSuffix = '', rowLabel = 'Average score', separator = ' - ', titleMode = 'both',
}: {
  active?: boolean
  payload?: readonly any[]
  label?: string | number
  series: GroupedBarSeries[]
  valueSuffix?: string
  rowLabel?: string
  separator?: string
  titleMode?: 'series' | 'label' | 'both'
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const s = series.find((x) => x.key === p.dataKey)
  if (!s) return null
  const row = p.payload as Record<string, string | number | undefined>
  const detail = row[`${s.key}Detail`]
  return (
    <div className="bg-background rounded-md shadow-[0px_6px_6px_rgba(148,163,184,0.15),0px_0px_1px_rgba(148,163,184,1)] px-2 py-1.5 flex flex-col gap-1.5 min-w-[160px] max-w-[240px]">
      <p className="text-[12px] font-medium leading-4 tracking-[-0.072px] text-foreground break-words">
        {titleMode === 'label'
          ? row.label
          : titleMode === 'series'
            ? s.label
            : `${label}${separator}${s.label}`}
      </p>
      <div className="flex items-start gap-2 w-full">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: s.color }} />
          <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground whitespace-nowrap">
            {rowLabel}
          </span>
        </div>
        <span className="text-[12px] text-foreground text-right shrink-0 tabular-nums">{p.value}{valueSuffix}</span>
      </div>
      {typeof detail === 'string' && detail && (
        <p className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground">{detail}</p>
      )}
    </div>
  )
}

function GroupedBarVariant({
  data, series, yDomain, yTicks, valueSuffix, singleTooltip = false, tooltipRowLabel, tooltipSeparator, tooltipTitle,
}: {
  data: Record<string, string | number>[]
  series: GroupedBarSeries[]
  yDomain?: [number, number]
  yTicks?: number[]
  valueSuffix?: string
  singleTooltip?: boolean
  tooltipRowLabel?: string
  tooltipSeparator?: string
  tooltipTitle?: 'series' | 'label' | 'both'
}) {
  const { domain, ticks } = resolveYAxis(yDomain, yTicks)
  return (
    <>
      <TooltipProvider delayDuration={300}>
      <ResponsiveContainer width="100%" height={222}>
        <BarChart data={data} barGap={4} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} horizontal={true} />
          <XAxis
            dataKey="label"
            tick={<ChartAxisTick maxChars={10} />}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            domain={domain}
            interval={0}
            ticks={ticks}
            tick={{ fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip
            shared={!singleTooltip}
            content={(props) =>
              singleTooltip ? (
                <SingleBarTooltip active={props.active} payload={props.payload} label={props.label} series={series} valueSuffix={valueSuffix} rowLabel={tooltipRowLabel} separator={tooltipSeparator} titleMode={tooltipTitle} />
              ) : (
                <GroupedChartTooltip active={props.active} payload={props.payload} label={props.label} series={series} valueSuffix={valueSuffix} />
              )
            }
            cursor={{ fill: '#f1f5f9' }}
            position={TOOLTIP_POSITION}
          />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      </TooltipProvider>
      <div className="flex items-center justify-center gap-4 w-full flex-wrap">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-foreground whitespace-nowrap">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

export function StatusChartCard({
  status,
  statusDescription,
  statusLabel = 'Status',
  chartTitle,
  chartData,
  legendLabel = 'Average Score',
  chartTabs,
  loading = false,
  className,
}: StatusChartCardProps) {
  const [activeTab, setActiveTab] = useState(chartTabs?.[0]?.key)
  const activeChartTab = chartTabs?.find((t) => t.key === activeTab) ?? chartTabs?.[0]

  // One tab's chart. Takes the tab rather than reading activeChartTab, so the
  // slider can render all of them at once.
  function renderChartBody(tab: ChartTabOption) {
    // Checked before `empty`: while loading, a tab legitimately has no data yet,
    // and the skeleton is what stands in for it. 222px is the height every chart
    // variant and the empty box use, so the card doesn't resize when data lands.
    if (loading) return <ChartSkeleton height={222} />

    const empty =
      tab.emptyText !== undefined &&
      (tab.kind === 'groupedBar' ? (tab.groupedData ?? []).length === 0 : tab.data.length === 0)

    // Fixed height, not flex-1: inside a slide panel there's no flex parent to
    // stretch against, and unequal panels would jog the card mid-slide.
    if (empty) {
      return (
        <div className="w-full min-h-[222px] flex items-center justify-center">
          <p className="text-[14px] font-normal leading-5 text-muted-foreground text-center">
            {tab.emptyText}
          </p>
        </div>
      )
    }

    if (tab.kind === 'groupedBar') {
      return (
        <GroupedBarVariant
          data={tab.groupedData ?? []}
          series={tab.series ?? []}
          yDomain={tab.yDomain}
          yTicks={tab.yTicks}
          valueSuffix={tab.valueSuffix}
          singleTooltip={tab.groupedTooltip === 'single'}
          tooltipRowLabel={tab.groupedTooltipLabel}
          tooltipSeparator={tab.groupedTooltipSeparator}
          tooltipTitle={tab.groupedTooltipTitle}
        />
      )
    }

    // beaver#705: a single point has no trend to show — a line with one point
    // reads as a dot floating in space, so it's a plain bar instead.
    if (tab.kind === 'bar' || tab.data.length <= 1) {
      return (
        <BarVariant
          data={tab.data}
          legendLabel={tab.legendLabel ?? 'Average score'}
          tooltipLabel={tab.tooltipLabel}
          barColor={tab.barColor ?? (tab.kind === 'bar' ? '#58728d' : LINE_COLOR)}
          scrollable={tab.kind === 'bar' ? tab.scrollable : undefined}
          yDomain={tab.yDomain}
          yTicks={tab.yTicks}
          valueSuffix={tab.valueSuffix}
        />
      )
    }

    return (
      <LineVariant
        data={tab.data}
        legendLabel={tab.legendLabel ?? 'Average score'}
        tooltipLabel={tab.tooltipLabel}
        yDomain={tab.yDomain}
        yTicks={tab.yTicks}
        valueSuffix={tab.valueSuffix}
      />
    )
  }

  return (
    <div className={cn('border border-border rounded-2xl overflow-hidden flex shadow-sm', className)}>
      {/* Left: status */}
      <div className="flex-1 min-w-0 min-h-[360px] p-6 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {/* The label is known up front, so it stays put while loading — only
              the values it introduces are stood in for. Bar heights match the
              line-boxes below them (20px/28px status, 16px/24px description). */}
          <p className="text-[16px] font-normal leading-6 text-foreground whitespace-nowrap">{statusLabel}</p>
          {loading ? (
            <Skeleton className="h-[28px] w-[55%]" />
          ) : (
            <p className="text-[20px] font-bold leading-7 tracking-[-0.12px] text-[#ad4e00] whitespace-nowrap">
              {activeChartTab?.status ?? status}
            </p>
          )}
        </div>
        {loading ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[24px] w-full" />
            <Skeleton className="h-[24px] w-[80%]" />
          </div>
        ) : (
          <p className="text-[16px] font-normal leading-6 text-muted-foreground whitespace-pre-line">
            {activeChartTab?.statusDescription ?? statusDescription}
          </p>
        )}
      </div>
      {/* Right: chart */}
      {/* min-h (not a fixed h-): when the tabs row + title + chart genuinely
          need more than 360px, the box must grow with them — a fixed height
          combined with the card's rounded-corner overflow-hidden would
          otherwise center-crop the content, clipping the Y-axis's top/bottom
          tick labels. */}
      <div className="w-[615px] shrink-0 min-h-[360px] px-6 pt-6 pb-6 flex flex-col gap-5 items-center justify-center">
        {/* Tabs on their own top row so the left column's status heading has
            the full width of that line; the chart title sits below them. */}
        {chartTabs && (
        <div className="flex items-center justify-end gap-6 w-full">
          {chartTabs && (
            <div className="bg-secondary flex items-start p-1 rounded-md shrink-0">
              {chartTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { trackTabView(tab.label); setActiveTab(tab.key) }}
                  className={`h-8 px-3 py-1.5 rounded text-[14px] font-medium leading-5 tracking-[-0.084px] transition-colors whitespace-nowrap ${
                    tab.key === activeChartTab?.key
                      ? 'bg-background text-foreground shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
                      : 'text-muted-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        {/* mt-6 drops the title to the same line the left column's body text
            starts on (tabs row + gap above ≈ Summary label + heading). */}
        <p className="w-full mt-6 text-[16px] font-medium leading-6 text-foreground truncate">
          {activeChartTab ? activeChartTab.chartTitle : chartTitle}
        </p>

        {chartTabs && chartTabs.length > 0 ? (
          // Every tab's chart stays mounted and the track slides. Rendering
          // only the active one tore down its SVG on each click, so
          // ResponsiveContainer re-measured from zero width — the blink.
          <SlidePanels
            className="w-full"
            index={chartTabs.findIndex((t) => t.key === activeChartTab?.key)}
          >
            {chartTabs.map((tab) => (
              <div key={tab.key}>{renderChartBody(tab)}</div>
            ))}
          </SlidePanels>
        ) : (
          <LineVariant
            data={(chartData ?? []).map((d) => ({ label: d.exam, value: d.score }))}
            legendLabel={legendLabel}
          />
        )}
      </div>
    </div>
  )
}
