'use client'

import { useTranslations } from 'next-intl'
import { ArrowUpRight, Map as MapIcon } from 'lucide-react'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { Link } from '@/i18n/navigation'

export default function CostPlanningLinks() {
  const t = useTranslations('financeForecast')
  return (
    // 品牌软底 callout（§1.2 primary-soft 10% tinted，未做大面积彩色填充）
    <div className="mb-4 rounded-card border border-primary-border bg-primary-soft px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <span aria-hidden className="w-9 h-9 rounded-icon bg-surface text-primary inline-flex items-center justify-center flex-shrink-0">
          <MapIcon className="w-4 h-4" strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">{t('venueEntryTitle')}</span>
          <span className="block text-xs text-ink-500 truncate">{t('venueEntryBody')}</span>
        </span>
      </div>
      <Link
        href="/guild-venue"
        className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-btn border border-primary-border bg-surface px-4 text-sm font-medium text-primary-hover hover:bg-primary-soft-hover transition-colors flex-shrink-0 ${FOCUS_RING}`}
      >
        {t('goToVenue')} <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
      </Link>
    </div>
  )
}
