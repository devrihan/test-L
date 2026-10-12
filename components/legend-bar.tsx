export interface LegendBarItem {
  label: string
  color: string
}

interface LegendBarProps {
  items: LegendBarItem[]
  proportions: number[]
}

export function LegendBar({ items, proportions }: LegendBarProps) {
  return (
    <div>
      <div className="flex items-center gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-sm font-medium leading-5 text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-2.5 gap-[2px]">
        {proportions.map((p, i) => (
          <div
            key={i}
            className="rounded-lg"
            style={{ flex: p, backgroundColor: items[i]?.color }}
          />
        ))}
      </div>
    </div>
  )
}
