'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRight } from 'lucide-react'
import Tag from '@/components/ui/Tag'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { AXIS, GRID, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, seriesColor } from '@/lib/chart-theme'
import type { ForecastMonthInput, ForecastSummary } from '@/lib/finance-forecast/calculations'
import {
  annualBreakevenMonth,
  countConfiguredMonths,
  marginPct,
  monthLabelOf,
  type ForecastAggregate,
  type MultiYearChartRow,
} from '@/lib/finance-forecast/dashboard'
import CostPlanningLinks from './CostPlanningLinks'
import KpiCard from './KpiCard'
import { useForecastFormatter } from './useForecastFormatter'

// 「全部年份」视图:区间合计 KPI + 每年一张可点进月度的卡片 + 年度对比柱状图。
export default function AnnualOverview({
  years,
  anchorYear,
  byYear,
  summaryByYear,
  aggregate,
  chartData,
  onDrillDown,
  monthLabels,
  expensesHref,
}: {
  years:         number[]
  anchorYear:    number
  byYear:        Record<number, ForecastMonthInput[]>
  summaryByYear: Record<number, ForecastSummary>
  aggregate:     ForecastAggregate
  chartData:     MultiYearChartRow[]
  onDrillDown:   (year: number) => void
  monthLabels:   string[]
  expensesHref:  string | undefined
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast        = useForecastFormatter()
  const fmtForecastCompact = fmtForecast
  const aggregateProfitColor = aggregate.profit >= 0 ? 'text-success-text' : 'text-danger-text'
  const aggregateMarginColor = aggregate.margin >= 0 ? 'text-success-text' : 'text-danger-text'

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label={t('annualForecastTotal')}
          value={fmtForecast(aggregate.forecast)}
          sub={`${years[0]}–${years[years.length - 1]}`}
        />
        <KpiCard
          label={t('annualBudgetTotal')}
          value={fmtForecast(aggregate.budget)}
          sub={t('annualBudgetSub')}
          linkTo={expensesHref}
          linkLabel={t('goToExpenses')}
        />
        <KpiCard
          label={t('annualProfitTotal')}
          value={fmtForecast(aggregate.profit)}
          sub={aggregate.profit >= 0 ? t('annualProfitSurplus') : t('annualProfitLoss')}
          valueClassName={aggregateProfitColor}
        />
        <KpiCard
          label={t('annualMarginTotal')}
          value={`${Math.round(aggregate.margin)}%`}
          sub={t('annualMarginSub')}
          valueClassName={aggregateMarginColor}
        />
      </div>

      <CostPlanningLinks />

      <div className="space-y-3 mb-4">
        {years.map((year) => {
          const summary = summaryByYear[year]
          const months  = byYear[year] ?? []
          const configuredMonths = countConfiguredMonths(months)
          const margin = marginPct(summary.yearly_profit_usd, summary.yearly_forecast_usd)
          const profitColor = summary.yearly_profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
          const isCurrent = year === anchorYear

          const breakevenMonth = annualBreakevenMonth(summary.months)
          const breakevenLabel = breakevenMonth
            ? ` · ${monthLabelOf(breakevenMonth, monthLabels)}`
            : ''

          return (
            <button
              key={year}
              type="button"
              onClick={() => onDrillDown(year)}
              className={`w-full text-left bg-surface border border-line rounded-card shadow-card p-5 hover:border-primary-border transition-colors group ${FOCUS_RING}`}
            >
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums tracking-kpi text-ink-900">{year}</span>
                  {isCurrent && <Tag label={t('currentYearBadge')} tone="violet" size="sm" />}
                  <span className="text-xs text-ink-400 ml-1">
                    {t('configuredMonths', { count: configuredMonths })}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                  {t('editMonthly')} <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3">
                <YearStat label={t('annualForecastRevenue')} value={fmtForecast(summary.yearly_forecast_usd)} />
                <YearStat label={t('annualActualRevenue')}   value={summary.yearly_actual_usd > 0 ? fmtForecast(summary.yearly_actual_usd) : '—'} />
                <YearStat label={t('annualBudgetCost')}      value={fmtForecast(summary.yearly_budget_usd)} />
                <YearStat label={t('annualForecastProfit')}  value={fmtForecast(summary.yearly_profit_usd)} valueClassName={profitColor} />
                <YearStat
                  label={t('annualMarginBreakeven')}
                  value={`${Math.round(margin)}%${breakevenLabel}`}
                  valueClassName={margin >= 0 ? 'text-success-text' : 'text-danger-text'}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card p-5 mb-4">
        <h2 className="text-lg font-semibold text-ink-900 tracking-section mb-1">{t('annualChartTitle')}</h2>
        <p className="text-xs text-ink-500 mb-4">{t('annualChartSub')}</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="year" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
            <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="forecast" name={t('chartForecast')} fill={seriesColor(0)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual"   name={t('chartActual')}   fill={seriesColor(2)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="budget"   name={t('chartBudget')}   fill={seriesColor(3)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit"   name={t('chartProfit')}   fill={seriesColor(1)} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function YearStat({
  label,
  value,
  valueClassName = 'text-ink-900',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-micro sm:text-xs text-ink-500 font-medium uppercase tracking-wide truncate" title={label}>
        {label}
      </p>
      <p className={`text-md sm:text-lg font-bold tabular-nums truncate mt-0.5 ${valueClassName}`} title={value}>
        {value}
      </p>
    </div>
  )
}
