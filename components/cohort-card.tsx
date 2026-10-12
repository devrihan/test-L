'use client'

import { PlusCircle } from 'lucide-react'
import { useShowAddToPlan } from '@/components/config-provider'

interface CohortCardProps {
  title: string
  students: string
  moreCount: number
}

export function CohortCard({ title, students, moreCount }: CohortCardProps) {
  const showAddToPlan = useShowAddToPlan()
  return (
    <div className="bg-background border border-border rounded-lg p-4 flex flex-col gap-3 items-start">
      {/* Title + dashed divider */}
      <div className="flex flex-col items-center shrink-0 w-fit">
        <p className="text-[18px] font-semibold leading-[28px] tracking-[-0.108px] text-foreground whitespace-nowrap">
          {title}
        </p>
        <div className="w-full border-t-0 h-0 relative">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        </div>
      </div>

      {/* Students */}
      <p className="text-[0px] leading-[0] text-muted-foreground w-full">
        <span className="text-[16px] leading-[24px] font-normal">{students} </span>
        <span className="text-[16px] leading-[24px] font-medium text-[#3b82f6]">+{moreCount} more</span>
      </p>

      {/* Button */}
      {showAddToPlan && (
        <button type="button" className="h-8 px-2 gap-2 text-[12px] font-medium leading-4 tracking-[-0.072px] text-foreground rounded-[6px] border border-border bg-background flex items-center justify-center shrink-0">
          <PlusCircle className="size-4 shrink-0" />
          Add to plan
        </button>
      )}
    </div>
  )
}
