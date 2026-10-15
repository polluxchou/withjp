'use client'

import { useTranslations } from 'next-intl'
import type { OwnerFilter as OwnerFilterValue, OwnerOption } from '@/lib/org/quadrant'

/** 负责人筛选条。scroll=true（手机）时单行横滑、不画滚动条（右缘被裁的半截按钮就是可滑提示）、按钮高 44px；否则换行排列。 */
export default function OwnerFilter({ options, value, onChange, scroll = false }: {
  options: OwnerOption[]
  value: OwnerFilterValue
  onChange: (value: OwnerFilterValue) => void
  scroll?: boolean
}) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')
  const label = (o: OwnerOption) =>
    o.key === 'all' ? tCommon('all') : o.key === 'none' ? t('org.statUnassigned') : (o.name || '—')

  return (
    <div
      role="group"
      aria-label={t('org.owner')}
      className={scroll ? 'scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1' : 'flex flex-wrap items-center gap-1.5'}
    >
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`flex-none inline-flex items-center gap-1.5 rounded-btn border text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
              scroll ? 'h-11 px-3.5' : 'h-8 px-3'
            } ${on ? 'border-primary-border bg-primary-soft text-primary-hover' : 'border-line bg-surface text-ink-700 hover:border-line-strong'}`}
          >
            {label(o)}
            <span className="font-semibold tabular-nums opacity-70">{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}
