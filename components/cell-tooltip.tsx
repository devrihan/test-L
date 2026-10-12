'use client'

import type { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Wraps a table CELL's value so hovering it shows that value in a tooltip —
// used on every column of every table, not just ones whose text truncates.
// Needs a `TooltipProvider` ancestor (every table already has one, or gets
// one alongside this).
export function CellTooltip({
  children,
  content,
  className = 'cursor-default',
}: {
  children: ReactNode
  content: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[300px] text-wrap">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
