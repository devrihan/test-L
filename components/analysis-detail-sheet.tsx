'use client'

import Link from 'next/link'
import { X, PlusCircle, ArrowUpRight } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import LatexPreview from '@/components/latex-preview'
import LatexInline from '@/components/latex-inline'
import { useShowAddToPlan } from '@/components/config-provider'

// ─── types ────────────────────────────────────────────────────────────────────

export interface AnalysisDetailData {
  title: string
  subtitle: string
  footerLabel: string
  /** navigation target for the footer CTA (e.g. the question detail page) */
  footerHref?: string
  /** untruncated version of the title, repeated in the body — questions only, since the header truncates long question text */
  fullText?: string
  accuracy?: {
    description: string
    pct: number
  }
  // Optional: a caller with no real error breakdown omits these rather than
  // supplying invented percentages, and the block is not rendered.
  errorDescription?: string
  errorSegments?: { color: string; pct: number }[]
  errorLegend?: { color: string; label: string }[]
  bullets?: string[]
  /** Heading over `bullets`. Defaults to "Most common error" — set it when the
   *  bullets are something else (the students sheet lists chapter highlights,
   *  which that default mislabelled). */
  bulletsTitle?: string
}

interface AnalysisDetailSheetProps {
  open: boolean
  onClose: () => void
  data: AnalysisDetailData | null
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function SegmentedBar({ segments }: { segments: { color: string; pct: number }[] }) {
  return (
    <div className="flex h-[12px] w-full overflow-hidden rounded-full bg-secondary">
      {segments.map((s, i) => (
        <div key={i} className="h-full shrink-0" style={{ width: `${s.pct}%`, background: s.color }} />
      ))}
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-[11px] rounded-[2px] shrink-0" style={{ background: color }} />
      <span className="text-[16px] font-normal leading-6 text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  )
}

// ─── component ────────────────────────────────────────────────────────────────

export function AnalysisDetailSheet({ open, onClose, data }: AnalysisDetailSheetProps) {
  const showAddToPlan = useShowAddToPlan()
  if (!data) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[640px] sm:max-w-[640px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-4 flex items-start gap-4 shrink-0">
          <div className="flex flex-col gap-[2px] flex-1 min-w-0">
            {/* The header stays a single truncated line, so questions use the
                compact <LatexInline> (same renderer as the Questions table
                cell) rather than the block-level <LatexPreview> used in the
                body below. `fullText` is only set for questions — student and
                chapter titles are plain names and render as-is. */}
            <p className="text-[18px] font-semibold leading-7 tracking-[-0.108px] text-foreground truncate">
              {data.fullText ? <LatexInline text={data.title} /> : data.title}
            </p>
            <p className="text-[14px] font-normal leading-5 text-muted-foreground">
              {data.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showAddToPlan && (
              <button className="flex items-center gap-2 h-9 px-2 border border-border rounded-md bg-background text-[14px] font-medium tracking-[-0.084px] text-foreground hover:bg-muted/50 transition-colors whitespace-nowrap">
                <PlusCircle className="size-4 shrink-0" />
                Add to plan
              </button>
            )}
            <button
              onClick={onClose}
              className="opacity-70 hover:opacity-100 transition-opacity rounded-md p-0.5"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 min-h-0">
          {/* Full text repeated in body — questions only */}
          {data.fullText && (
            <div className="min-w-0 text-[16px] font-normal leading-6 text-foreground">
              <LatexPreview text={data.fullText} />
            </div>
          )}

          {/* Accuracy bar — questions only */}
          {data.accuracy && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-[2px]">
                <p className="text-[16px] font-normal leading-6 text-foreground">Accuracy</p>
                <p className="text-[14px] font-normal leading-5 text-muted-foreground">
                  {data.accuracy.description}
                </p>
              </div>
              <SegmentedBar segments={[{ color: 'oklch(0.129 0.041 264.695)', pct: data.accuracy.pct }]} />
            </div>
          )}

          {/* Error segmented bar — only when the caller has real data */}
          {(data.errorSegments?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-[2px]">
              <p className="text-[18px] font-medium leading-7 tracking-[-0.108px] text-foreground">
                Most common error
              </p>
              <p className="text-[16px] font-normal leading-6 text-muted-foreground">
                {data.errorDescription}
              </p>
            </div>
            <SegmentedBar segments={data.errorSegments ?? []} />
            <div className="flex items-center gap-4">
              {(data.errorLegend ?? []).map((item) => (
                <Swatch key={item.label} color={item.color} label={item.label} />
              ))}
            </div>
          </div>
          )}

          {/* Bullet list — only when the caller has real observations */}
          {(data.bullets?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[18px] font-medium leading-7 tracking-[-0.108px] text-foreground">
              {data.bulletsTitle ?? 'Most common error'}
            </p>
            {/* Figma sets the bullets in plain black; text-foreground is the
                same #020617 in light mode and keeps them readable in dark. */}
            <ul className="list-disc pl-5 flex flex-col gap-3">
              {(data.bullets ?? []).map((bullet, i) => (
                <li key={i} className="text-[16px] font-normal leading-6 tracking-[-0.084px] text-foreground">
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-4 flex justify-end shrink-0">
          {data.footerHref ? (
            <Link
              href={data.footerHref}
              className="flex items-center gap-2 h-9 px-4 bg-secondary rounded-md text-[14px] font-medium tracking-[-0.084px] text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <ArrowUpRight className="size-4 shrink-0" />
              {data.footerLabel}
            </Link>
          ) : (
            <button
              disabled
              className="flex items-center gap-2 h-9 px-4 bg-secondary rounded-md text-[14px] font-medium tracking-[-0.084px] text-secondary-foreground opacity-60 cursor-default"
            >
              <ArrowUpRight className="size-4 shrink-0" />
              {data.footerLabel}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
