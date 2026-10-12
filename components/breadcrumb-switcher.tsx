'use client'

import { trackDrilldown, type DrilldownEntity } from '@/app/lib/analytics'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Check, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export function BreadcrumbSwitcher({
  parentLabel,
  parentHref,
  activeId,
  activeLabel,
  sectionLabel,
  items,
  onSelect,
  drilldownEntity,
  searchable = false,
  searchPlaceholder = 'Search...',
}: {
  parentLabel: string
  parentHref: string
  activeId: string
  activeLabel: string
  sectionLabel: string
  items: { id: string; label: string }[]
  onSelect: (id: string) => void
  /** GA: record picking an item as a drilldown into this entity — one prop
   * here instead of a hand-inlined trackDrilldown at every onSelect, which
   * is how the student and question switchers ended up untracked. */
  drilldownEntity?: DrilldownEntity
  /** shows a filter box above the list — for long lists like the student roster */
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const shown = searchable && q
    ? items.filter((item) => item.label.toLowerCase().includes(q))
    : items

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Link href={parentHref} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        {parentLabel}
      </Link>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) { setQuery(''); return }
          // Radix focuses the first menu item on open; take focus back for the
          // search box once that has happened.
          if (searchable) requestAnimationFrame(() => inputRef.current?.focus())
        }}
      >
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-1 text-foreground hover:text-foreground/80 transition-colors min-w-0 outline-hidden">
            <span className="truncate">{activeLabel}</span>
            <ChevronDown className="size-4 text-muted-foreground ml-0.5 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="p-0 min-w-[240px] rounded-[6px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] border border-border bg-background overflow-hidden"
        >
          <div className="flex h-[28px] items-center px-[8px] py-[6px] shrink-0">
            <span className="text-[12px] font-medium leading-[16px] tracking-[-0.072px] text-muted-foreground">
              {sectionLabel}
            </span>
          </div>
          {searchable && (
            <div className="flex items-center gap-[6px] border-b border-border px-[8px] pb-[6px]">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                // Radix's menu typeahead would otherwise swallow the keystrokes
                // and jump focus to a matching item; arrows/Escape stay with the
                // menu so keyboard navigation still works from the input.
                onKeyDown={(e) => {
                  if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(e.key)) e.stopPropagation()
                }}
                className="h-[24px] w-full bg-transparent text-[14px] leading-[20px] text-popover-foreground placeholder:text-muted-foreground outline-hidden"
              />
            </div>
          )}
          <div className="max-h-[320px] overflow-y-auto">
            {searchable && shown.length === 0 && (
              <div className="px-[8px] py-[10px] text-[14px] leading-[20px] text-muted-foreground">
                No results found.
              </div>
            )}
            {shown.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => {
                  if (drilldownEntity) trackDrilldown(drilldownEntity)
                  onSelect(item.id)
                }}
                className={`flex h-[32px] w-full items-center gap-[8px] px-[8px] py-[6px] text-[16px] font-normal leading-[20px] text-popover-foreground transition-colors ${
                  item.id === activeId ? 'bg-secondary' : 'hover:bg-secondary rounded-[6px]'
                }`}
              >
                <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                  {item.label}
                </span>
                {item.id === activeId && <Check className="size-4 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
