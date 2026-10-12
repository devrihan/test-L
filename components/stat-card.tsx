import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { trackDrilldown, type DrilldownEntity } from '@/app/lib/analytics'

interface StatCardProps {
  name: string
  subtitle?: string
  label: string
  /** null renders "—" (no analytics yet — e.g. blueprint chapters). */
  avg: number | null
  /** appended after the number — e.g. '%' for class averages, '' for raw marks */
  suffix?: string
  /**
   * Pre-formatted value string that overrides the `avg`+`suffix` rendering when
   * provided — e.g. "4.6 (51%)" for the chapter class average. Falls back to
   * `avg`/`suffix` when undefined, so existing callers are unaffected.
   */
  valueDisplay?: string
  trend?: string | null
  /** renders the trend with a down arrow in red (falling vs the previous exam). */
  trendDown?: boolean
  href?: string
  /** What this card leads to. Omit to record nothing. */
  drilldownEntity?: DrilldownEntity
}

export function StatCard({ name, subtitle, label, avg, suffix = '%', valueDisplay, trend, trendDown = false, href, drilldownEntity }: StatCardProps) {
  const card = (
    <Card className="py-0 gap-0 cursor-pointer hover:shadow-md transition-shadow rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap cursor-default">
                  {name}
                </p>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-wrap">
                {name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {subtitle && (
            <p className="text-[16px] leading-[24px] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        <div className="px-4 pb-4 pt-0 flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] leading-[20px] text-muted-foreground">
              {label}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
                {valueDisplay ?? (avg === null ? '—' : `${avg}${suffix}`)}
              </span>
              {trend && (
                <span className={`flex items-center gap-1 text-[12px] leading-4 tracking-[-0.072px] ${trendDown ? 'text-red-700' : 'text-green-700'}`}>
                  {trendDown
                    ? <ArrowDownRight className="size-5 shrink-0" />
                    : <ArrowUpRight className="size-5 shrink-0" />}
                  {trend}
                </span>
              )}
            </div>
          </div>
          <div className="py-1 text-muted-foreground shrink-0">
            <ArrowRight className="size-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href)
    return (
      <Link
        href={href}
        className="block"
        onClick={drilldownEntity ? () => trackDrilldown(drilldownEntity) : undefined}
      >
        {card}
      </Link>
    )
  return card
}
