'use client'

import { useTranslations } from 'next-intl'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountType,
  type ForecastMonthResult,
} from '@/lib/finance-forecast/calculations'
import { accountTypeColor } from './dashboard-styles'
import { useAccountTypeLabels } from './useAccountTypeLabels'
import { useForecastFormatter } from './useForecastFormatter'

// 图表右侧栏:全年按账号类型的收入贡献 + 当前月的预测/预算/利润。
export default function AccountTypeContribution({
  selectedYear,
  byAccountType,
  selected,
}: {
  selectedYear:  number
  byAccountType: Record<ForecastAccountType, number>
  selected:      ForecastMonthResult | undefined
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()
  const accountTypeLabels = useAccountTypeLabels()
  const selectedProfitColor = selected && selected.profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'

  const accountTypeNotes: Record<ForecastAccountType, string> = {
    key:     t('typeNoteKey'),
    mature:  t('typeNoteMature'),
    growing: t('typeNoteGrowing'),
    newbie:  t('typeNoteNewbie'),
    test:    t('typeNoteTest'),
    other:   t('typeNoteOther'),
  }

  return (
    <aside className="bg-surface border border-line rounded-card shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900 tracking-section truncate">{t('typeContribTitle', { year: selectedYear })}</h2>
          <p className="text-xs text-ink-500 mt-0.5">{t('typeContribSub')}</p>
        </div>
      </div>
      <div className="space-y-1">
        {FORECAST_ACCOUNT_TYPES.map((type) => (
          <div key={type} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 border-b border-line-soft last:border-0">
            <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: accountTypeColor(type) }} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink-700">{accountTypeLabels[type]}</div>
              <div className="text-xs text-ink-400">{accountTypeNotes[type]}</div>
            </div>
            <div className="text-xs font-semibold text-ink-900 tabular-nums">{fmtForecast(byAccountType[type] || 0)}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <SideStat label={t('sideMonthForecast')} value={fmtForecast(selected?.forecast_revenue_usd ?? 0)} />
        <SideStat label={t('sideMonthBudget')}   value={fmtForecast(selected?.budget_cost_usd ?? 0)} />
        <SideStat label={t('sideMonthProfit')}   value={fmtForecast(selected?.profit_usd ?? 0)} valueClassName={selectedProfitColor} />
      </div>
    </aside>
  )
}

function SideStat({ label, value, valueClassName = 'text-ink-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-3">
      <span className="text-xs text-ink-500">{label}</span>
      <strong className={`text-lg tabular-nums ${valueClassName}`}>{value}</strong>
    </div>
  )
}
