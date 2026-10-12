'use client'

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Like ChartAxisTick, but the end labels anchor inward so the plot edge cannot clip them.
export function ChartAxisTickEdge({
  x, y, payload, index, count, maxChars, fontSize = 12, fill = '#020617', dy = 16,
}: {
  x?: string | number
  y?: string | number
  payload?: { value: string }
  /** supplied by recharts */
  index?: number
  /** number of ticks, passed in so this never relies on a recharts internal */
  count?: number
  /** labels longer than this get clipped with an ellipsis */
  maxChars: number
  fontSize?: number
  fill?: string
  /** vertical offset from the axis line */
  dy?: number
}) {
  const full = String(payload?.value ?? '')
  const short = full.length > maxChars ? `${full.slice(0, Math.max(1, maxChars - 2))}…` : full

  // Unknown index falls through to 'middle', i.e. the old behaviour.
  const textAnchor = index === 0 ? 'start' : count != null && index === count - 1 ? 'end' : 'middle'

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
