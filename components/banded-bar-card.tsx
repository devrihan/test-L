'use client'

// Titled card with a bar chart whose bars are coloured by score band
// (Figma 1550-20532, the leadership subject detail page).
//
// Deliberately self-contained rather than an extension of status-chart-card:
// that component is shared by the chapter and student pages, requires a
// status/statusDescription block this design doesn't have, and paints every
// bar one colour. The tooltip below is a copy of its ChartTooltip — the two
// are siblings and should look identical; consolidate them deliberately if a
// third caller ever appears, not as a side effect of this page.

import {
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartAxisTick } from '@/components/chart-axis-tick'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TOOLTIP_POSITION } from '@/app/lib/chart-tooltip'

const GRID_COLOR = 'oklch(0.929 0.013 255.508)'
const AXIS_TICK = { fontSize: 12, fill: '#64748b', letterSpacing: -0.072 }
// Chapter names run long ("Tools for Analysis of Financial Statements") and
// collide on the axis; the frame caps each label at a fixed width with an
// ellipsis. ChartAxisTick does that and puts the full name in a hover tooltip.
// Short labels (sections "A", exams "Unit Test 1") are unaffected.
const AXIS_MAX_CHARS = 16

/**
 * Score bands. The Figma legend reads "Below 40% / Below 40-60% / 60-80%" with
 * orange on the *worst* band and red in the middle — malformed and inverted,
 * confirmed with the designer as placeholder. Worst is red here.
 *
 * Ordered worst-first; `bandFor` takes the last band whose floor the value
 * clears, so the thresholds stay readable as a table.
 */
export const SCORE_BANDS = [
  { floor: 0, label: 'Below 40%', color: '#e40014' },
  { floor: 40, label: '40-60%', color: '#ff8b1a' },
  { floor: 60, label: '60%+', color: '#075133' },
] as const

export type ScoreBand = (typeof SCORE_BANDS)[number]

/**
 * At most one decimal, with no trailing ".0".
 *
 * Belt and braces: the data layer already rounds, but a float reaching the
 * chart shouldn't be able to print "2.8000000000000003%" in a tooltip.
 */
function formatScore(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export function bandFor(value: number): ScoreBand {
  // Annotated, or the initialiser narrows `match` to the first band's literal
  // type and the loop can't reassign it.
  let match: ScoreBand = SCORE_BANDS[0]
  for (const band of SCORE_BANDS) if (value >= band.floor) match = band
  return match
}

export interface BandedBarPoint {
  /** x-axis label, e.g. a section name */
  label: string
  /** 0-100; null renders no bar (nothing marked yet) rather than a zero */
  value: number | null
  /** sentence under the divider in the tooltip */
  detail?: string
}

function BandedTooltip({
  active,
  payload,
  valueLabel,
  swatchColor,
}: {
  active?: boolean
  payload?: readonly { payload: BandedBarPoint }[]
  valueLabel: string
  /** omitted = colour by band, for the banded-bar chart */
  swatchColor?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  if (point.value === null) return null
  const color = swatchColor ?? bandFor(point.value).color

  return (
    <div className="bg-background border border-border rounded-md shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] px-2 py-1.5 flex flex-col gap-1.5 min-w-[144px] max-w-[266px]">
      <p className="text-[16px] font-normal leading-6 text-foreground truncate w-full">
        {point.label}
      </p>
      <div className="flex items-start gap-6 w-full">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[14px] font-normal leading-5 text-muted-foreground">
            {valueLabel}
          </span>
        </div>
        <span className="font-mono text-[12px] leading-5 text-foreground text-right shrink-0 tabular-nums">
          {formatScore(point.value)}%
        </span>
      </div>
      {point.detail && (
        <>
          <div className="h-px w-full bg-border shrink-0" />
          <p className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground whitespace-pre-line">
            {point.detail}
          </p>
        </>
      )}
    </div>
  )
}

/** Colour + legend text for the single-series charts (Figma 1550-20854). */
export interface ChartSeries {
  color: string
  label: string
}

interface BandedBarCardProps {
  title: string
  subtitle: string
  /** rendered top-right of the card header — the design puts a Section select here */
  action?: React.ReactNode
  data: BandedBarPoint[]
  /** tooltip's metric name, e.g. "Avg score" */
  valueLabel?: string
  emptyText?: string
  /**
   * 'banded-bar' (default) colours each bar by score band and shows the
   * three-band legend — the all-sections view.
   *
   * 'bar' and 'line' are the single-section views: one colour, one legend
   * swatch. 'line' is an area chart over exams; 'bar' is the same series when
   * there's only one exam, since a one-point line reads as a dot floating in
   * space (the convention already used on the teacher dashboard, beaver#705).
   */
  kind?: 'banded-bar' | 'bar' | 'line'
  /** required by 'bar' and 'line'; ignored by 'banded-bar' */
  series?: ChartSeries
}

export function BandedBarCard({
  title,
  subtitle,
  action,
  data,
  valueLabel = 'Avg score',
  emptyText = 'Nothing marked yet for this selection.',
  kind = 'banded-bar',
  series,
}: BandedBarCardProps) {
  const plotted = data.filter((d) => d.value !== null)
  // Many sections squash into unreadable slivers; past ~24 bars the chart
  // scrolls instead, matching what the teacher charts already do.
  const scrollWidth = Math.max(data.length * 48, 550)
  const banded = kind === 'banded-bar'
  const seriesColor = series?.color ?? SCORE_BANDS[2].color
  // Unique per card: two gradients with the same id on one page make the
  // second chart adopt the first one's colours.
  const gradientId = `area-${title.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className="border border-border rounded-xl bg-background overflow-hidden">
      <div className="flex items-start gap-2 p-6 pb-0">
        <div className="flex-1 min-w-0">
          <p className="text-[18px] font-medium leading-7 tracking-[-0.108px] text-foreground">{title}</p>
          <p className="text-[18px] font-normal leading-7 tracking-[-0.108px] text-muted-foreground">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {plotted.length === 0 ? (
        <div className="h-[222px] flex items-center justify-center px-6">
          <p className="text-[14px] leading-5 text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="p-6 pt-4">
          <div className="w-full overflow-x-auto overflow-y-hidden">
            {/* ChartAxisTick's hover-to-see-full-label needs this ancestor. */}
            <TooltipProvider delayDuration={300}>
            <div style={{ width: scrollWidth, minWidth: '100%', height: 222 }}>
              <ResponsiveContainer width="100%" height={222}>
                {kind === 'line' ? (
                  <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={seriesColor} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={seriesColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} horizontal />
                    <XAxis
                      dataKey="label"
                      tick={<ChartAxisTick maxChars={AXIS_MAX_CHARS} fill="#64748b" />}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      interval={0}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      content={(props) => (
                        <BandedTooltip
                          active={props.active}
                          payload={props.payload as never}
                          valueLabel={valueLabel}
                          swatchColor={seriesColor}
                        />
                      )}
                      cursor={false}
                      position={TOOLTIP_POSITION}
                    />
                    <Area
                      type="linear"
                      dataKey="value"
                      stroke={seriesColor}
                      strokeWidth={2}
                      fill={`url(#${gradientId})`}
                      // Hollow dots, per the frame's 10px ringed circles.
                      dot={{ r: 5, fill: '#ffffff', stroke: seriesColor, strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#ffffff', stroke: seriesColor, strokeWidth: 2 }}
                      connectNulls
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={data} barSize={kind === 'bar' ? 44 : 28} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} horizontal />
                    <XAxis
                      dataKey="label"
                      tick={<ChartAxisTick maxChars={AXIS_MAX_CHARS} fill="#64748b" />}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      interval={0}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      content={(props) => (
                        <BandedTooltip
                          active={props.active}
                          payload={props.payload as never}
                          valueLabel={valueLabel}
                          swatchColor={banded ? undefined : seriesColor}
                        />
                      )}
                      cursor={{ fill: '#f1f5f9' }}
                      position={TOOLTIP_POSITION}
                    />
                    <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                      {data.map((d) => (
                        <Cell
                          key={d.label}
                          fill={
                            d.value === null
                              ? 'transparent'
                              : banded
                                ? bandFor(d.value).color
                                : seriesColor
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            </TooltipProvider>
          </div>

          {/* Banded: every band always shown, so the colour scale reads the
              same on a card where one band happens to be absent. Single
              series: one swatch naming what's plotted ("8-A average score"). */}
          <div className="mt-3 flex items-center justify-center gap-6">
            {banded ? (
              SCORE_BANDS.map((band) => (
                <div key={band.label} className="flex items-center gap-2">
                  <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: band.color }} />
                  <span className="text-[12px] font-normal leading-4 tracking-[-0.072px] text-foreground whitespace-nowrap">
                    {band.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2">
                <div className="size-[11px] rounded-[2px] shrink-0" style={{ backgroundColor: seriesColor }} />
                <span className="text-[16px] font-normal leading-6 text-muted-foreground whitespace-nowrap">
                  {series?.label ?? valueLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
