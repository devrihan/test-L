'use client'

import { ChevronRight, PlusCircle } from 'lucide-react'
import { useShowAddToPlan } from '@/components/config-provider'

interface MistakeCardProps {
  color: string
  title: string
  description: string
  questions: string[]
  /** Suppress Add-to-plan even where the school flag is on — for surfaces
   * where the feature isn't ready yet, same idea as QuestionMistakeCard's
   * prop of the same name. */
  hideAddToPlan?: boolean
  /** When set, a "View" button (same as TopicTable's) signals that the
   * card opens the evidence drawer — the whole-card click alone wasn't
   * discoverable. */
  onView?: () => void
}

export function MistakeCard({ color, title, description, questions, hideAddToPlan = false, onView }: MistakeCardProps) {
  const showAddToPlan = useShowAddToPlan() && !hideAddToPlan
  return (
    <div className={`border border-border rounded-[8px] bg-background overflow-hidden${onView ? ' transition-colors group-hover:bg-[#fafafa]' : ''}`}>
      <div className="flex items-center p-[16px]">

        {/* Left: dot + title + description */}
        <div className="flex flex-1 gap-[6px] items-start min-w-0">
          <div className="flex items-center pt-[8px] shrink-0">
            <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: color }} />
          </div>
          <div className="flex flex-1 flex-col gap-[2px] min-w-0">
            <p className="text-[18px] font-semibold leading-[28px] tracking-[-0.108px] text-foreground">
              {title}
            </p>
            <p className="text-[16px] font-normal leading-[24px] text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {/* Right: seen in + divider + button */}
        <div className="flex items-center gap-[12px] shrink-0">
          <div className="flex items-center gap-[4px]">
            <span className="text-[16px] font-normal leading-[24px] text-foreground whitespace-nowrap">
              Seen in:
            </span>
            <div className="flex items-center gap-[6px]">
              {questions.map((q) => (
                <div
                  key={q}
                  className="border border-border rounded-[6px] w-9 flex items-center justify-center p-[6px] text-[16px] font-normal leading-[24px] text-foreground"
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
          {showAddToPlan && (
            <>
              <div className="w-px h-9 bg-[#d9d9d9] border border-border rounded-[0.5px] shrink-0" />
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="bg-background border border-border flex gap-[8px] h-9 items-center justify-center px-[8px] rounded-[6px] shrink-0"
              >
                <PlusCircle className="size-4 shrink-0" />
                <span className="text-[14px] font-medium leading-[20px] tracking-[-0.084px] text-foreground whitespace-nowrap">
                  Add to plan
                </span>
              </button>
            </>
          )}
          {onView && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onView()
              }}
              className="flex items-center gap-2 border border-border rounded-[6px] h-8 px-2 bg-background hover:bg-muted/50 transition-colors shrink-0"
            >
              <span className="text-[12px] font-medium leading-[16px] tracking-[-0.072px] text-foreground">
                View
              </span>
              <ChevronRight className="size-4 text-foreground" />
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
