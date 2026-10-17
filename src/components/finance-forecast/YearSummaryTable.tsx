'use client'

import { useTranslations } from 'next-intl'
import type { ForecastMonthResult } from '@/lib/finance-forecast/calculations'
import { configuredMonthsSummary, monthLabelOf } from '@/lib/finance-forecast/dashboard'
import { TH_LEFT, TH_RIGHT } from './dashboard-styles'
import { useForecastFormatter } from './useForecastFormatter'

// 「全年」明细:只列已配置账号的月份,点整行跳到该月。
export default function YearSummaryTable({
  months,
  onSelectMonth,
  monthLabels,
}: {
  months: ForecastMonthResult[]
  onSelectMonth: (index: number) => void
  monthLabels: string[]
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()
  const { configured, totalForecast, totalActual, totalBudget, totalProfit } = configuredMonthsSummary(months)

  if (configured.length === 0) {
    return (
      <div className="px-5 pb-8 pt-2 text-center text-sm text-ink-400">
        {t('yearTableEmpty')}
      </div>
    )
  }

  return (
    // 递延：未迁 Table 原语——下面的 <tr onClick> 是"点整行跳到该月"的主交互，
    // 而 Tr 契约不提供 onClick（§6.2：行级点击须由 RecordRow 或行内 Link/button
    // 承载）。迁移需要先重设计这段交互，超出本轮换皮范围。
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line bg-canvas">
            <th className={TH_LEFT}>{t('yearColMonth')}</th>
            <th className={TH_LEFT}>{t('yearColAccounts')}</th>
            <th className={TH_RIGHT}>{t('yearColForecast')}</th>
            <th className={TH_RIGHT}>{t('yearColActual')}</th>
            <th className={TH_RIGHT}>{t('yearColBudget')}</th>
            <th className={TH_RIGHT}>{t('yearColProfit')}</th>
          </tr>
        </thead>
        <tbody>
          {configured.map((m) => {
            const profitColor = m.profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
            const monthLabel = monthLabelOf(m.month, monthLabels)
            return (
              <tr
                key={m.month}
                className="border-b border-line-soft hover:bg-row-hover transition-colors cursor-pointer"
                onClick={() => onSelectMonth(m.index)}
                title={t('yearClickHint')}
              >
                <td className="px-4 py-3 font-semibold text-ink-900 tabular-nums">
                  {monthLabel}
                  {m.note && (
                    <span className="ml-2 text-xs font-normal text-ink-400">{m.note}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {m.rows.map((r) => r.account_name).join('、')}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ink-900 tabular-nums">
                  {fmtForecast(m.forecast_revenue_usd)}
                </td>
                <td className="px-4 py-3 text-right text-ink-500 tabular-nums">
                  {m.actual_revenue_usd > 0 ? fmtForecast(m.actual_revenue_usd) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-ink-500 tabular-nums">
                  {fmtForecast(m.budget_cost_usd)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${profitColor}`}>
                  {fmtForecast(m.profit_usd)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-canvas">
            <td className="px-4 py-3 text-xs font-bold text-ink-700 uppercase tracking-wide">
              {t('yearTotal')}
            </td>
            <td className="px-4 py-3 text-xs text-ink-400">{t('yearTotalMonths', { count: configured.length })}</td>
            <td className="px-4 py-3 text-right font-bold text-ink-900 tabular-nums text-md">
              {fmtForecast(totalForecast)}
            </td>
            <td className="px-4 py-3 text-right font-bold text-ink-700 tabular-nums">
              {totalActual > 0 ? fmtForecast(totalActual) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-bold text-ink-700 tabular-nums">
              {fmtForecast(totalBudget)}
            </td>
            <td className={`px-4 py-3 text-right font-bold tabular-nums text-md ${totalProfit >= 0 ? 'text-success-text' : 'text-danger-text'}`}>
              {fmtForecast(totalProfit)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
