'use client'

interface SegmentedControlItem {
  value: string
  label: string
}

interface SegmentedControlProps {
  items: SegmentedControlItem[]
  value: string
  onChange: (v: string) => void
  label?: string
}

export default function SegmentedControl({ items, value, onChange, label }: SegmentedControlProps) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 p-0.5 rounded-field bg-line-soft">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={it.value === value}
          onClick={() => onChange(it.value)}
          // rounded-[8px] = 内嵌几何圆角（外层 rounded-field 10px − 容器 p-0.5 内边距 2px）
          className={`px-2.5 py-1.5 text-xs rounded-[8px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
            it.value === value ? 'bg-surface text-ink-900 font-semibold shadow-card' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
