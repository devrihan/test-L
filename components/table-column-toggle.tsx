'use client'

import { Eye } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

export interface ColumnToggleOption {
  key: string
  label: string
}

interface TableColumnToggleProps {
  columns: ColumnToggleOption[]
  visible: Record<string, boolean>
  onToggle: (key: string) => void
}

export function TableColumnToggle({ columns, visible, onToggle }: TableColumnToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-8 px-3 flex items-center gap-2 border border-border rounded-md bg-background text-[12px] font-medium tracking-[-0.072px] text-foreground hover:bg-muted/50 transition-colors">
          <Eye className="size-4" />
          View
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
          Toggle Columns
        </DropdownMenuLabel>
        {columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={visible[col.key] !== false}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(col.key)}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
