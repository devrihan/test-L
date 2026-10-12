import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SectionAverageVariant = 'good' | 'warning' | 'danger'

interface SectionAverageCardProps {
  label?: string
  value: number | string
  /** appended after the number — e.g. '%' for section averages, '' for raw marks */
  suffix?: string
  /** Trend row (change vs the previous exam). Shown ONLY when BOTH trendValue
   * and trendLabel are provided — the caller/backend sends them only when a
   * comparison exists (e.g. the subject has more than one exam); otherwise the
   * row is hidden (nothing to compare against). */
  trendValue?: string
  trendLabel?: string
  /** While the value is still being fetched: renders a placeholder bar in the
   * number's place and hides the trend row. Without it the card has to invent
   * something to print — and both '—' and '…' read as a real (empty) result
   * rather than "not loaded yet" (beaver#786). */
  loading?: boolean
  variant?: SectionAverageVariant
  className?: string
}

const VARIANT = {
  good: {
    bg: 'bg-[#EAF4EE]',
    valueColor: 'text-[#008138]',
    trendColor: 'text-[#15803d]',
    Icon: ArrowUpRight,
  },
  warning: {
    bg: 'bg-[#fffcf0]',
    valueColor: 'text-[#dc7609]',
    trendColor: 'text-[#dc7609]',
    Icon: ArrowDownRight,
  },
  danger: {
    bg: 'bg-[#fff0f0]',
    valueColor: 'text-[#e76e4f]',
    trendColor: 'text-[#e76e4f]',
    Icon: ArrowDownRight,
  },
} as const

export function SectionAverageCard({
  label = 'Section average',
  value,
  suffix = '%',
  trendValue,
  trendLabel,
  loading = false,
  variant = 'good',
  className,
}: SectionAverageCardProps) {
  const { bg, valueColor, trendColor, Icon } = VARIANT[variant]

  return (
    <div className={cn('outline outline-1 outline-offset-[-1px] outline-gray-200 rounded-xl px-6 py-4 flex flex-col', bg, className)}>
      <div className="flex-1 flex flex-col gap-2 items-start">
        <p className="text-base font-normal leading-6 text-foreground">{label}</p>
        {loading ? (
          // Same 48px height as the number it replaces, so the card doesn't
          // resize when the value lands.
          <p role="status" className="h-12 flex items-center text-base font-normal leading-6 text-muted-foreground">
            Loading…
          </p>
        ) : (
          <p className={cn('text-5xl font-bold leading-[48px] ', valueColor)}>
            {value}{suffix}
          </p>
        )}
      </div>

      {!loading && trendValue && trendLabel ? (
        <div className="mt-3 flex items-center gap-1 shrink-0">
          <div className={cn('flex items-center gap-0.5', trendColor)}>
            <Icon className="size-5 shrink-0" />
            <span className="text-sm font-medium leading-5">{trendValue}</span>
          </div>
          <span className="text-sm font-medium leading-5 tracking-[-0.084px] text-[inferentics-primitive-ink-900]">
            {trendLabel}
          </span>
        </div>
      ) : null}
    </div>
  )
}
