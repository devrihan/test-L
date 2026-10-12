'use client'

import { Children } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizontal slider for tab panels.
 *
 * Every panel stays MOUNTED and the track is translated, rather than swapping
 * one panel for another. That's the point: conditionally rendering a chart tore
 * down its SVG and made ResponsiveContainer re-measure from zero width, which
 * read as a blink on every tab click. Nothing unmounts here, so there is
 * nothing to blink.
 *
 * Direction is free — moving to a higher index slides left, lower slides right.
 *
 * Panels should be the same height, or the container will jump mid-slide.
 */
export function SlidePanels({
  index,
  children,
  className,
}: {
  /** zero-based index of the visible panel */
  index: number
  children: React.ReactNode
  className?: string
}) {
  const panels = Children.toArray(children)
  // Clamp so an unknown tab key (indexOf -> -1) shows the first panel rather
  // than sliding the track off screen.
  const active = Math.min(Math.max(index, 0), Math.max(panels.length - 1, 0))

  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {panels.map((panel, i) => (
          <div
            key={i}
            className="w-full shrink-0"
            // Off-screen panels are still in the DOM; hide them from assistive
            // tech so three charts aren't announced as all visible.
            aria-hidden={i !== active}
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  )
}
