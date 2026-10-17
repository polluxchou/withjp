'use client'

import { useTranslations } from 'next-intl'
import type { ForecastMonthResult, ForecastSummary } from '@/lib/finance-forecast/calculations'
import { marginPct, monthLabelOf } from '@/lib/finance-forecast/dashboard'
import KpiCard from './KpiCard'
import { useForecastFormatter } from './useForecastFormatter'

// 月度视图顶部 6 张 KPI 卡。「全年」与「单月」两套口径;第一张卡负责折叠/展开下方输入面板。
export default function ForecastKpiGrid({
  showYearView,
  selectedYear,
  summary,
  selected,
  inputOpen,
  onToggleInput,
  expensesHref,
  monthLabels,
  breakevenMonth,
  monthCumProfit,
  monthsUntilBreakeven,
}: {
  showYearView:         boolean
  selectedYear:         number
  summary:              ForecastSummary
  selected:             ForecastMonthResult | undefined
  inputOpen:            boolean
  onToggleInput:        () => void
  expensesHref:         string | undefined
  monthLabels:          string[]
  breakevenMonth:       string | null
  monthCumProfit:       number
  monthsUntilBreakeven: number | null
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()
  const yearMarginPct = marginPct(summary.yearly_profit_usd, summary.yearly_forecast_usd)

  // 盈利/亏损配色走 §1.3 语义 token（success 登记了「盈利」、danger 登记了「负值」），
  // 不再用 emerald/red 裸阶。
  const yearlyProfitColor = summary.yearly_profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
  const selectedProfitColor = selected && selected.profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-4">
      {showYearView ? (
        <>
          <KpiCard
            label={t('kpiYearForecast', { year: selectedYear })}
            value={fmtForecast(summary.yearly_forecast_usd)}
            sub={inputOpen ? t('kpiCollapseHint') : t('kpiExpandHint')}
            onClick={onToggleInput}
            active={inputOpen}
          />
          <KpiCard
            label={t('kpiYearBudget', { year: selectedYear })}
            value={fmtForecast(summary.yearly_budget_usd)}
            sub={t('kpiYearBudgetSub')}
            linkTo={expensesHref}
            linkLabel={t('goToExpenses')}
          />
          <KpiCard
            label={t('kpiYearProfit', { year: selectedYear })}
            value={fmtForecast(summary.yearly_profit_usd)}
            sub={summary.yearly_profit_usd >= 0 ? t('kpiProfitSurplus') : t('kpiProfitLoss')}
            valueClassName={yearlyProfitColor}
          />
          <KpiCard
            label={t('kpiYearMargin', { year: selectedYear })}
            value={`${Math.round(yearMarginPct)}%`}
            sub={t('kpiYearMarginSub')}
            valueClassName={yearMarginPct >= 0 ? 'text-success-text' : 'text-danger-text'}
          />
          <KpiCard
            label={t('kpiBreakeven')}
            value={breakevenMonth ? monthLabelOf(breakevenMonth, monthLabels) : '—'}
            sub={breakevenMonth ? t('kpiBreakevenPositive') : t('kpiBreakevenNegative')}
            valueClassName={breakevenMonth ? 'text-success-text' : 'text-ink-400'}
          />
          <KpiCard
            label={t('kpiMonthMargin')}
            value={!selected || selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
            sub={selected ? t('kpiMonthEditing', { month: selected.month }) : ''}
            valueClassName={selectedProfitColor}
          />
        </>
      ) : (
        <>
          <KpiCard
            label={t('kpiMonthForecast')}
            value={selected ? fmtForecast(selected.forecast_revenue_usd) : '—'}
            sub={inputOpen ? t('kpiCollapseHint') : t('kpiExpandHint')}
            onClick={onToggleInput}
            active={inputOpen}
          />
          <KpiCard
            label={t('kpiMonthBudget')}
            value={selected ? fmtForecast(selected.budget_cost_usd) : '—'}
            sub={t('kpiYearBudgetSub')}
            linkTo={expensesHref}
            linkLabel={t('goToExpenses')}
          />
          <KpiCard
            label={t('kpiMonthProfit')}
            value={selected ? fmtForecast(selected.profit_usd) : '—'}
            sub={selected && selected.profit_usd >= 0 ? t('kpiMonthProfitSurplus') : t('kpiMonthProfitLoss')}
            valueClassName={selectedProfitColor}
          />
          <KpiCard
            label={t('kpiMonthCumProfit')}
            value={fmtForecast(monthCumProfit)}
            sub={selected ? t('kpiMonthCumProfitSub', { month: selected.month }) : ''}
            valueClassName={monthCumProfit >= 0 ? 'text-success-text' : 'text-danger-text'}
          />
          <KpiCard
            label={t('kpiMonthUntilBreakeven')}
            value={
              monthsUntilBreakeven === null
                ? '—'
                : monthsUntilBreakeven <= 0
                  ? t('kpiBreakevenReached')
                  : t('kpiBreakevenInMonths', { n: monthsUntilBreakeven })
            }
            sub={
              monthsUntilBreakeven === null
                ? t('kpiBreakevenNegative')
                : monthsUntilBreakeven <= 0
                  ? t('kpiBreakevenPositive')
                  : breakevenMonth
                    ? monthLabelOf(breakevenMonth, monthLabels)
                    : ''
            }
            valueClassName={
              monthsUntilBreakeven === null
                ? 'text-ink-400'
                : monthsUntilBreakeven <= 0
                  ? 'text-success-text'
                  : 'text-ink-900'
            }
          />
          <KpiCard
            label={t('kpiMonthMargin')}
            value={!selected || selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
            sub={t('kpiMonthMarginSub')}
            valueClassName={selectedProfitColor}
          />
        </>
      )}
    </div>
  )
}
