'use client'

import type { LucideIcon } from 'lucide-react'

export default function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  primary,
  iconOnly,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  // Always render as an icon-only square (label lives in the tooltip), trimming
  // the horizontal footprint for self-explanatory utility controls.
  iconOnly?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      // h-8 = §3 控件高度默认档 32px。iconOnly 的方形也取 32×32（正好落在
      // §4 点击目标下限），整条工具栏因此与 SegmentedControl 同高。
      className={`h-8 shrink-0 inline-flex items-center justify-center rounded-field border text-xs font-semibold leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
        iconOnly ? 'w-8' : 'gap-1.5 px-3'
      } ${
        primary
          ? 'border-ink-900 bg-ink-900 text-white hover:bg-ink-700'
          : active
            ? 'border-primary-border bg-primary-soft text-primary-hover'
            : 'border-line-strong bg-surface text-ink-700 hover:border-primary-border hover:text-primary-hover'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
      {!iconOnly && <span className="hidden whitespace-nowrap xl:inline">{label}</span>}
    </button>
  )
}
