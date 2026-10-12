'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'

export interface FilterGroup {
  label: string
  options: string[]
}

// Composite key so options that repeat across groups (e.g. "Determinants" as
// both a Strongest and a Weakest value) don't share selection state.
export function filterKey(group: string, option: string) {
  return `${group}::${option}`
}

interface TableFilterPopoverProps {
  groups: FilterGroup[]
  selected: Set<string>
  onToggle: (option: string) => void
}

export function TableFilterPopover({ groups, selected, onToggle }: TableFilterPopoverProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative h-8 px-2 flex items-center justify-center border border-border rounded-md bg-background hover:bg-muted/50 transition-colors">
          <SlidersHorizontal className="size-5 text-foreground" />
          {selected.size > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-foreground text-background text-[10px] font-semibold rounded-full size-4 flex items-center justify-center leading-none">
              {selected.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[213px] p-0">
        <Command>
          <CommandList className="max-h-[300px]">
            {groups.map((group, i) => (
              <div key={group.label}>
                {i > 0 && <CommandSeparator />}
                <CommandGroup heading={group.label}>
                  {group.options.map((option) => {
                    const key = filterKey(group.label, option)
                    return (
                      <CommandItem key={key} value={key} onSelect={() => onToggle(key)}>
                        <Checkbox checked={selected.has(key)} className="pointer-events-none" />
                        <span className="truncate">{option}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
