'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { trackDrilldown, type DrilldownEntity } from '@/app/lib/analytics'

const BTN = 'flex items-center gap-1.5 border border-border rounded-md p-2 hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
const LABEL = 'text-[14px] font-medium leading-5 tracking-[-0.084px]'

/** One arrow button, wrapped in a tooltip when there is something to say —
 * the name of the target it moves to, or why it cannot move at all.
 *
 * A `disabled` button dispatches no pointer events, and neither does its parent
 * while the cursor sits over it, so a tooltip on a disabled arrow needs the
 * button made pointer-transparent and a wrapper span as the hover/focus target. */
function NavButton({
  onClick, ariaLabel, tooltip, children,
}: {
  onClick?: (() => void) | null | false
  ariaLabel: string
  tooltip?: string
  children: ReactNode
}) {
  const disabled = !onClick
  const button = (
    <button
      type="button"
      onClick={() => { if (onClick) onClick() }}
      disabled={disabled}
      aria-label={tooltip ? `${ariaLabel}: ${tooltip}` : ariaLabel}
      className={cn(BTN, disabled && tooltip && 'pointer-events-none')}
    >
      {children}
    </button>
  )
  if (!tooltip) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span tabIndex={0} className="inline-flex rounded-md">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/** Paged prev/next control: two icon buttons with an optional "3/20" counter
 * between them. Extracted from the question detail page so the same stepper can
 * sit on any detail page that walks a list (questions, chapters, students).
 *
 * Pass `current`/`total` for the counter, or leave them out for bare arrows.
 * A button is disabled when its handler is omitted, so callers can just pass
 * `prevQuestion && (() => go(prevQuestion.id))`-style values without also
 * tracking a separate disabled flag. */
export function PrevNextNav({
  onPrev,
  onNext,
  current,
  total,
  itemLabel = 'item',
  prevTooltip,
  nextTooltip,
  disabledTooltip,
  showLabels = false,
  drilldownEntity,
  className,
}: {
  onPrev?: (() => void) | null | false
  onNext?: (() => void) | null | false
  /** 1-based position; omit (with `total`) to hide the counter */
  current?: number
  total?: number
  /** used for the buttons' aria-labels, e.g. "Previous question" */
  itemLabel?: string
  /** names the target on hover, e.g. "Q4" — omit for no tooltip */
  prevTooltip?: string
  nextTooltip?: string
  /** shown on hover when an arrow is disabled, e.g. "No diagram for this
   * question". Pass it only for a genuinely empty list — at the ends of a
   * non-empty one there is nothing to explain, so leave it undefined. */
  disabledTooltip?: string
  /** shows "Previous"/"Next" text next to the chevrons */
  showLabels?: boolean
  /** Counts a step as a drilldown of this entity. Omit to record nothing. */
  drilldownEntity?: DrilldownEntity
  className?: string
}) {
  // Paging to a neighbour reaches a detail page the same way a list click does,
  // so it is the same event — otherwise stepping through a list reads as one visit.
  const step = (go: () => void) => () => {
    if (drilldownEntity) trackDrilldown(drilldownEntity)
    go()
  }
  // Nothing to step through at all (as opposed to sitting at one end of a real
  // list): the counter joins the arrows in looking and behaving disabled. A
  // plain span takes pointer events even when dimmed, so no wrapper is needed.
  const empty = !onPrev && !onNext && Boolean(disabledTooltip)
  const counter = current != null && total != null && (
    <span
      tabIndex={empty ? 0 : undefined}
      className={cn(LABEL, 'text-foreground', empty && 'opacity-40 cursor-not-allowed')}
    >
      {`${current}/${total}`}
    </span>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center justify-end gap-2', className)}>
        <NavButton
          onClick={onPrev && step(onPrev)}
          ariaLabel={`Previous ${itemLabel}`}
          tooltip={onPrev ? prevTooltip : disabledTooltip}
        >
          <ChevronLeft className="size-4" />
          {showLabels && <span className={cn(LABEL, 'pr-1')}>Previous</span>}
        </NavButton>
        {counter && (empty ? (
          <Tooltip>
            <TooltipTrigger asChild>{counter}</TooltipTrigger>
            <TooltipContent sideOffset={6}>{disabledTooltip}</TooltipContent>
          </Tooltip>
        ) : counter)}
        <NavButton
          onClick={onNext && step(onNext)}
          ariaLabel={`Next ${itemLabel}`}
          tooltip={onNext ? nextTooltip : disabledTooltip}
        >
          {showLabels && <span className={cn(LABEL, 'pl-1')}>Next</span>}
          <ChevronRight className="size-4" />
        </NavButton>
      </div>
    </TooltipProvider>
  )
}
