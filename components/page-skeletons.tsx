// Loading placeholders shaped like the content they stand in for.
//
// Every bar's height matches the line-box of the text it replaces (a 30px/36px
// value becomes an h-9 bar, not a generic strip), and the wrappers reuse the
// same Card/border/padding classes as the real thing. That's the point: the
// page must not reflow when data lands, or the skeleton trades one kind of
// jank for another.
//
// These matter most on a role switch — the dashboard layout remounts the page
// when the active role changes, so whatever renders here is what the user sees
// instead of the previous role's data.

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

/** Mirrors components/stat-card.tsx. */
function StatCardSkeleton() {
  return (
    <Card className="py-0 gap-0 rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4">
          {/* name: 18px / 28px */}
          <Skeleton className="h-[28px] w-[60%]" />
          {/* subtitle: 16px / 24px */}
          <Skeleton className="h-[24px] w-[35%] mt-0.5" />
        </div>
        <div className="px-4 pb-4 pt-0 flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            {/* label: 14px / 20px */}
            <Skeleton className="h-[20px] w-[88px]" />
            {/* value: 30px / 36px */}
            <Skeleton className="h-[36px] w-[72px]" />
          </div>
          {/* the arrow-right affordance */}
          <Skeleton className="size-6 rounded-full shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

/** The 3-column StatCard grid used by subjects, exams, chapters and the dashboard. */
export function StatCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * The bordered table shell used by the students and questions rosters — header
 * strip plus body rows, at the real px-4 py-3 / 20px-line-height rhythm.
 */
export function TableSkeleton({
  rows = 8,
  columns = 5,
  headerClassName = 'bg-green-50',
}: {
  rows?: number
  columns?: number
  headerClassName?: string
}) {
  // Fixed widths per column index rather than random ones: a random width
  // would differ between the server and client renders and trip hydration.
  const widths = ['55%', '70%', '45%', '60%', '50%', '65%']

  return (
    <div className="border border-sidebar-border rounded-xl overflow-hidden bg-white">
      <div className={`flex items-center border-b border-sidebar-border ${headerClassName}`}>
        {Array.from({ length: columns }, (_, c) => (
          <div key={c} className="flex-1 px-4 py-3">
            <Skeleton className="h-[20px]" style={{ width: widths[c % widths.length] }} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center border-b border-sidebar-border last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <div key={c} className="flex-1 px-4 py-3">
              <Skeleton className="h-[20px]" style={{ width: widths[(r + c) % widths.length] }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A chart plot area — y-axis ticks and plotted bars. `height` must match the
 * real chart's so the card doesn't resize when it renders.
 */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  // Deterministic, for the hydration reason above.
  const bars = [62, 84, 48, 73, 57, 88, 66, 79]

  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="flex flex-col justify-between py-1 w-10 shrink-0">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[12px] w-6" />
        ))}
      </div>
      <div className="flex-1 flex items-end justify-between gap-3">
        {bars.map((pct, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${pct}%` }} />
        ))}
      </div>
    </div>
  )
}
