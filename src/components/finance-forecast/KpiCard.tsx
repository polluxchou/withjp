'use client'

import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { Link } from '@/i18n/navigation'

export default function KpiCard({
  label,
  value,
  sub,
  valueClassName = 'text-ink-900',
  onClick,
  active,
  linkTo,
  linkLabel,
}: {
  label: string
  value: string
  sub: string
  valueClassName?: string
  onClick?: () => void
  active?: boolean
  linkTo?: string
  linkLabel?: string
}) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      // 财务预测里带 onClick 的 KPI 卡只有一种用途：折叠/展开下方输入面板，
      // active 就是展开态，故直接映射 aria-expanded。若将来出现非 disclosure
      // 语义的可点 KPI 卡，需要改成由调用方声明。
      aria-expanded={interactive ? Boolean(active) : undefined}
      // 激活态只留 border-primary-border + shadow-card（外加箭头转向与主色），
      // 不再叠 ring：ring 这一轨让给 §4 的 focus 环，两者共用会互相覆盖。
      className={`relative bg-surface rounded-card border p-4 sm:p-5 transition-colors select-none ${
        interactive ? `cursor-pointer ${FOCUS_RING}` : ''
      } ${
        active
          ? 'border-primary-border shadow-card'
          : interactive ? 'border-line hover:border-primary-border' : 'border-line'
      }`}
    >
      {linkTo && (
        <Link
          href={linkTo}
          title={linkLabel}
          aria-label={linkLabel}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-icon text-ink-400 hover:text-primary hover:bg-primary-soft transition-colors ${FOCUS_RING}`}
        >
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      )}
      {interactive && !linkTo && (
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={`absolute top-3 right-3 w-4 h-4 transition-transform duration-200 ${active ? 'text-primary rotate-0' : 'text-ink-400 -rotate-90'}`}
        />
      )}

      <p
        className={`text-micro sm:text-xs text-ink-500 font-medium uppercase tracking-wide truncate ${interactive || linkTo ? 'pr-6' : ''}`}
        title={label}
      >
        {label}
      </p>
      <p
        title={value}
        className={`text-lg lg:text-xl xl:text-2xl font-bold mt-1 tabular-nums tracking-kpi truncate ${valueClassName}`}
      >
        {value}
      </p>
      <p className="text-micro sm:text-xs text-ink-400 mt-1 truncate" title={sub}>{sub}</p>
    </div>
  )
}
