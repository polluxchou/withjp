'use client'

interface TabsItem {
  value: string
  label: string
}

interface TabsProps {
  items: TabsItem[]
  value: string
  onChange: (v: string) => void
}

export default function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-5 border-b border-line overflow-x-auto scrollbar-thin">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={it.value === value}
          onClick={() => onChange(it.value)}
          className={`pb-2.5 px-px text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded-sm ${
            it.value === value
              ? 'text-ink-900 font-semibold shadow-[inset_0_-2px_0_theme(colors.primary.DEFAULT)]'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
