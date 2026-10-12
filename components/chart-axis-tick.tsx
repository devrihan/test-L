'use client'

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Bar-chart x-axis category tick: truncates with an ellipsis when the label
// doesn't fit, and reveals the full text on hover via the app's own Tooltip.
// The trigger is the tick's own native SVG <text> element (not embedded HTML
// via foreignObject) — Radix positions tooltips using getBoundingClientRect,
// which SVG text elements support directly, and native SVG elements reliably
// receive pointer events, unlike HTML embedded in a foreignObject (which is
// what caused clipping and non-firing hover in an earlier version of this).
// The chart must have a `<TooltipProvider>` ancestor.
export function ChartAxisTick({
  x, y, payload, maxChars, fontSize = 12, fill = '#020617', textAnchor = 'middle', dy = 16,
}: {
  x?: string | number
  y?: string | number
  payload?: { value: string }
  /** labels longer than this get clipped with an ellipsis */
  maxChars: number
  fontSize?: number
  fill?: string
  textAnchor?: 'start' | 'middle'
  /** vertical offset from the axis line */
  dy?: number
}) {
  const full = String(payload?.value ?? '')
  const short = full.length > maxChars ? `${full.slice(0, Math.max(1, maxChars - 2))}…` : full

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <text
          x={Number(x ?? 0)}
          y={Number(y ?? 0)}
          dy={dy}
          textAnchor={textAnchor}
          fontSize={fontSize}
          fill={fill}
          letterSpacing={-0.072}
          style={{ cursor: 'default' }}
        >
          {short}
        </text>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-wrap">{full}</TooltipContent>
    </Tooltip>
  )
}
