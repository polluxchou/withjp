'use client'
import { X } from 'lucide-react'
import type { Tone } from '@/lib/ui/status-tone'

// dot 系 token 是固定透明度的 hex/var()，不支持 `/N` 修饰符（Task 1 审查
// 结论：alpha-on-fixed 门禁会拦截且 Tailwind 静默不生成类）。40% 透明描边
// 改走 globals.css 里单独登记的 *-border rgba 变量（tailwind.config.ts 同步
// 映射 success/warning/danger/info 的 `border` 档），而不是 `border-*-dot/40`。
const COUNT_TONE: Record<Tone, { chip: string; dot: string }> = {
  success: { chip: 'text-success-text border-success-border bg-success-soft', dot: 'bg-success-dot' },
  warning: { chip: 'text-warning-text border-warning-border bg-warning-soft', dot: 'bg-warning-dot' },
  danger:  { chip: 'text-danger-text border-danger-border bg-danger-soft',   dot: 'bg-danger-dot' },
  info:    { chip: 'text-info-text border-info-border bg-info-soft',         dot: 'bg-info-dot' },
  neutral: { chip: 'text-ink-700 border-line-strong bg-surface',             dot: 'bg-muted-dot' },
  violet:  { chip: 'text-primary-hover border-primary-border bg-primary-soft', dot: 'bg-primary' },
}

interface FilterChipProps {
  label: string
  set?: boolean
  onClick?: () => void
  onClear?: () => void
}

export function FilterChip({ label, set, onClick, onClear }: FilterChipProps) {
  return (
    <span
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-field text-xs text-ink-700 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
        set ? 'border border-line-strong bg-surface shadow-card' : 'border border-dashed border-line-strong hover:bg-line-soft'
      }`}
    >
      {label}
      {set && onClear && (
        <button
          type="button"
          aria-label="clear"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="text-ink-400 hover:text-ink-700"
        >
          <X className="w-[13px] h-[13px]" strokeWidth={1.5} />
        </button>
      )}
    </span>
  )
}

interface CountChipProps {
  label: string
  count: number
  tone?: Tone
  active?: boolean
  onClick?: () => void
}

export function CountChip({ label, count, tone = 'neutral', active, onClick }: CountChipProps) {
  const c = COUNT_TONE[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 h-8 px-3 rounded-btn text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${c.chip} ${active ? 'ring-1 ring-primary-ring' : ''}`}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
      <span className="font-bold tabular-nums">{count}</span>
    </button>
  )
}
