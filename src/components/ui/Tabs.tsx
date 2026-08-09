'use client'
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface TabsItem {
  value: string
  label: string
}

interface TabsProps {
  items: TabsItem[]
  value: string
  onChange: (v: string) => void
  label?: string
}

export default function Tabs({ items, value, onChange, label }: TabsProps) {
  // roving tabindex：tablist 本身不在 Tab 序列里，只有激活 tab 是 tabIndex 0，
  // 方向键在 tab 之间移动焦点（APG tabs 模式，automatic activation）。
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function activate(nextValue: string) {
    onChange(nextValue)
    btnRefs.current[nextValue]?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % items.length
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = items.length - 1
    if (nextIndex !== null) {
      e.preventDefault()
      activate(items[nextIndex].value)
    }
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-5 border-b border-line overflow-x-auto scrollbar-thin">
      {items.map((it, index) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            ref={(el) => {
              btnRefs.current[it.value] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            // rounded-sm = 内嵌几何圆角（外层圆角 − 内边距），容器本身无圆角，
            // 这里的圆角只服务于 focus ring 的视觉收边。
            // ring-inset（而非默认外扩）：容器 overflow-x-auto 会把纵向 visible
            // 计算为 auto，外扩的 ring 会被上下裁掉；inset 环画在按钮内部不受影响，
            // 因此不需要 ring-offset。
            className={`pb-2.5 px-px text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset rounded-sm ${
              active
                ? 'text-ink-900 font-semibold shadow-[inset_0_-2px_0_theme(colors.primary.DEFAULT)]'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
