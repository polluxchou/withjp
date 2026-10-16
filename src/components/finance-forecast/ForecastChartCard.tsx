'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { AXIS, GRID, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, seriesColor } from '@/lib/chart-theme'
import { FORECAST_ACCOUNT_TYPES, type ForecastMonthResult } from '@/lib/finance-forecast/calculations'
import {
  CHART_TAB_KEYS,
  buildBreakdownData,
  buildChartData,
  type ChartMode,
} from '@/lib/finance-forecast/dashboard'
import { CUM_PROFIT_FILL, accountTypeColor } from './dashboard-styles'
import { useAccountTypeLabels } from './useAccountTypeLabels'
import { useForecastFormatter } from './useForecastFormatter'

// 单年的月度图表卡:收支拆分 / 累计 / 按类型堆叠 / 按类型折线 / 指数化,五选一。
export default function ForecastChartCard({
  selectedYear,
  months,
  chartMode,
  onChartModeChange,
  cumulativeData,
  breakevenIndex,
}: {
  selectedYear:      number
  months:            ForecastMonthResult[]
  chartMode:         ChartMode
  onChartModeChange: (mode: ChartMode) => void
  cumulativeData:    { label: string; cum_revenue: number; cum_cost: number; cum_profit: number }[]
  breakevenIndex:    number
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()
  const fmtForecastCompact = fmtForecast
  const accountTypeLabels = useAccountTypeLabels()

  const chartData = useMemo(() => buildChartData(months, chartMode), [months, chartMode])
  const breakdownData = useMemo(() => buildBreakdownData(months), [months])

  const chartTabLabels: Record<ChartMode, string> = {
    breakdown:  t('chartBreakdown'),
    cumulative: t('chartCumulative'),
    stacked:    t('chartStacked'),
    lines:      t('chartLines'),
    indexed:    t('chartIndexed'),
  }

  const chartTabItems = CHART_TAB_KEYS.map((key) => ({ value: key, label: chartTabLabels[key] }))

  return (
    <div className="bg-surface border border-line rounded-card shadow-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900 tracking-section truncate">{t('chartTitle', { year: selectedYear })}</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {chartMode === 'breakdown'
              ? t('chartDescBreakdown')
              : chartMode === 'cumulative'
              ? t('chartDescCumulative')
              : t('chartDescOther')}
          </p>
        </div>
        {/* 5 项互斥切换 = design-system §6.1 的 SegmentedControl 场景；
            原来那圈灰底 + 白色激活块本就是它的手写复刻。 */}
        <SegmentedControl
          items={chartTabItems}
          value={chartMode}
          onChange={(v) => onChartModeChange(v as ChartMode)}
          label={t('chartTabsLabel')}
        />
      </div>

      <ResponsiveContainer width="100%" height={340}>
        {chartMode === 'breakdown' ? (
          <ComposedChart data={breakdownData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
            <Tooltip
              content={(props) => {
                const { active, payload, label } = props as unknown as {
                  active?: boolean
                  label?: string
                  payload?: { payload: { revenue: number; cost: number; profit: number } }[]
                }
                if (!active || !payload || payload.length === 0) return null
                const { revenue, cost, profit } = payload[0].payload
                const profitColor = profit >= 0 ? 'var(--success-dot)' : 'var(--danger-dot)'
                const profitWord  = profit >= 0 ? t('tooltipProfit') : t('tooltipLoss')
                return (
                  <div className="bg-surface border border-line rounded-field shadow-pop p-2.5 text-xs min-w-[180px]">
                    <p className="font-semibold text-ink-700 mb-1.5">{label}</p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-ink-500">{t('tooltipRevenue')}</span>
                      <span className="font-medium text-ink-900 tabular-nums">{fmtForecast(revenue)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-ink-500">{t('tooltipCost')}</span>
                      <span className="font-medium text-ink-900 tabular-nums">{fmtForecast(cost)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-line-soft">
                      <span className="text-ink-500">{profitWord}</span>
                      <span className="font-bold tabular-nums" style={{ color: profitColor }}>
                        {fmtForecast(profit)}
                      </span>
                    </p>
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="rgb(var(--ink-400) / 0.4)" strokeDasharray="2 4" />
            <Bar dataKey="revenue" name={t('legendRevenue')} fill={seriesColor(2)} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="cost"    name={t('legendCost')}    fill={seriesColor(5)} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Line
              type="monotone"
              dataKey="profit"
              name={t('legendProfitLine')}
              stroke={seriesColor(0)}
              strokeWidth={2}
              dot={{ fill: seriesColor(0), r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        ) : chartMode === 'stacked' ? (
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
            <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {FORECAST_ACCOUNT_TYPES.map((type) => (
              <Area
                key={type}
                type="monotone"
                dataKey={type}
                name={accountTypeLabels[type]}
                stackId="forecast"
                stroke={accountTypeColor(type)}
                fill={accountTypeColor(type)}
                fillOpacity={0.72}
              />
            ))}
            {/* NB: 6 个账户类型面积已用满 CHART_SERIES 全部 6 色，actual/budget
                这两条叠加参考线不可避免与其中两个类型撞色（mature/newbie 原本
                就分别是绿/橙——迁移前就是这个撞色，不是本次引入的新问题）；
                用不同 strokeDasharray 保持二者仍可辨识，未额外造新 hex。 */}
            <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="var(--success-dot)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="var(--warning-dot)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
          </ComposedChart>
        ) : chartMode === 'cumulative' ? (
          <ComposedChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={CUM_PROFIT_FILL.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CUM_PROFIT_FILL.from} />
                <stop offset="100%" stopColor={CUM_PROFIT_FILL.to} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
            <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="rgb(var(--ink-400) / 0.4)" strokeDasharray="2 4" />
            {breakevenIndex >= 0 && (
              <ReferenceLine
                x={cumulativeData[breakevenIndex].label}
                stroke="var(--success-dot)"
                strokeDasharray="4 4"
                label={{ value: t('breakevenLabel', { month: cumulativeData[breakevenIndex].label }), position: 'top', fontSize: 11, fill: 'var(--success-dot)' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="cum_profit"
              name={t('legendCumProfit')}
              stroke={seriesColor(0)}
              fill={`url(#${CUM_PROFIT_FILL.id})`}
              strokeWidth={2}
            />
            <Line type="monotone" dataKey="cum_revenue" name={t('legendCumRevenue')} stroke={seriesColor(2)} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cum_cost"    name={t('legendCumCost')}    stroke={seriesColor(3)} strokeWidth={2} dot={false} strokeDasharray="5 4" />
          </ComposedChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis
              {...AXIS}
              tickFormatter={chartMode === 'indexed' ? (v) => `${Number(v).toFixed(0)}` : fmtForecastCompact}
              width={56}
            />
            <Tooltip formatter={(value) => chartMode === 'indexed' ? Number(value).toFixed(0) : fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {FORECAST_ACCOUNT_TYPES.map((type) => (
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                name={accountTypeLabels[type]}
                stroke={accountTypeColor(type)}
                strokeWidth={2}
                dot={false}
              />
            ))}
            {chartMode === 'lines' && (
              <>
                <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="var(--success-dot)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="var(--warning-dot)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              </>
            )}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
