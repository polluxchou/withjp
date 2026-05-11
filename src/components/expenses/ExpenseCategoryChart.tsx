'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { Expense, ExpenseCategory } from '@/lib/types'
import {
  EXPENSE_CATEGORY_OPTIONS,
  getExpenseCategoryBreakdown,
  getExpenseCostTimeSeries,
  getMonthlyExpenseSummary,
  getDailyExpenseSummary,
  type CostGranularity,
} from '@/lib/expenses/costs'
import { useLocale, useTranslations } from 'next-intl'

interface Props {
  expenses: Expense[]
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  tangible_asset:  '#6366f1',
  salary:          '#f59e0b',
  rent:            '#10b981',
  travel:          '#3b82f6',
  office_supplies: '#8b5cf6',
  cloud_services:  '#ec4899',
}

function fmtRmb(v: number, locale: string) {
  if (locale === 'zh' && v >= 10000) return `¥${(v / 10000).toFixed(1)}万`
  if (locale === 'en' && v >= 1000) return `¥${(v / 1000).toFixed(1)}K`
  return `¥${v.toFixed(0)}`
}

function fmtFull(v: number) {
  return '¥' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

type Tab = 'category' | 'trend' | 'monthly'
type MonthlyView = 'table' | 'chart'
type MonthlyGran = 'day' | 'month'

export default function ExpenseCategoryChart({ expenses }: Props) {
  const [tab, setTab]                 = useState<Tab>('category')
  const [granularity, setGranularity] = useState<CostGranularity>('month')
  const [monthlyView, setMonthlyView] = useState<MonthlyView>('table')
  const [monthlyGran, setMonthlyGran] = useState<MonthlyGran>('day')
  const locale = useLocale()
  const t = useTranslations('expenses')

  const breakdown      = getExpenseCategoryBreakdown(expenses)
  const timeSeries     = getExpenseCostTimeSeries(expenses, granularity)
  const monthlySummary = getMonthlyExpenseSummary(expenses)
  const dailySummary   = getDailyExpenseSummary(expenses)

  const chartData = monthlyGran === 'day'
    ? dailySummary.map((r) => ({ period: r.date, total: r.total, paid: r.paid }))
    : [...monthlySummary].reverse().map((r) => ({ period: r.month, total: r.total, paid: r.paid }))

  // Only show categories that have data in the monthly view
  const activeCategories = EXPENSE_CATEGORY_OPTIONS.filter((o) =>
    monthlySummary.some((row) => (row.byCategory[o.value] ?? 0) > 0)
  )

  if (expenses.length === 0) return null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'category', label: t('categoryShare') },
    { key: 'trend',    label: t('cumulativeTrend') },
    { key: 'monthly',  label: t('monthlySummary') },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'trend' && (
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {(['month', 'quarter', 'year'] as CostGranularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  granularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t(g)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab 1: 类别占比 ── */}
      {tab === 'category' && (
        <div className="space-y-2.5">
          {breakdown.map((item) => (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                  />
                  <span className="text-xs font-medium text-slate-700">{t(`categories.${item.category}`)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{item.pct.toFixed(1)}%</span>
                  <span className="text-xs font-semibold text-slate-900 w-20 text-right">
                    {fmtRmb(item.total, locale)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width:           `${item.pct}%`,
                    backgroundColor: CATEGORY_COLORS[item.category],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab 2: 累计趋势 ── */}
      {tab === 'trend' && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timeSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtRmb(v, locale)} width={52} />
            <Tooltip
              formatter={(v) => [`¥${Number(v).toFixed(2)}`, '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="paid"          name={t('paymentStatuses.paid')} stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="budgeted"      name={t('paymentStatuses.budgeted')} stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="ordered_unpaid" name={t('paymentStatuses.ordered_unpaid')} stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ── Tab 3: 月度汇总 ── */}
      {tab === 'monthly' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['table', 'chart'] as MonthlyView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setMonthlyView(v)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    monthlyView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {v === 'table' ? t('tableView') : t('chartView')}
                </button>
              ))}
            </div>
            {monthlyView === 'chart' && (
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {(['day', 'month'] as MonthlyGran[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setMonthlyGran(g)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      monthlyGran === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {t(g)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {monthlyView === 'chart' ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtRmb(v, locale)} width={56} />
                <Tooltip
                  formatter={(v) => [`¥${Number(v).toFixed(2)}`, '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {monthlyGran === 'day' && (
                  <>
                    <ReferenceLine
                      y={30000}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{ value: t('dailyAlert30k'), position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                    />
                    <ReferenceLine
                      y={100000}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{ value: t('dailyAlert100k'), position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
                    />
                  </>
                )}
                <Line type="monotone" dataKey="total" name={t('totalExpense')} stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="paid"  name={t('paid')}         stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 font-medium text-slate-500 whitespace-nowrap">{t('monthColumn')}</th>
                {activeCategories.map((o) => (
                  <th key={o.value} className="text-right py-2 px-3 font-medium whitespace-nowrap" style={{ color: CATEGORY_COLORS[o.value] }}>
                    {t(`categories.${o.value}`)}
                  </th>
                ))}
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">{t('total')}</th>
                <th className="text-right py-2 pl-3 font-medium text-green-600 whitespace-nowrap">{t('paid')}</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.map((row) => (
                <tr key={row.month} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-slate-700 whitespace-nowrap">{row.month}</td>
                  {activeCategories.map((o) => {
                    const amt = row.byCategory[o.value] ?? 0
                    return (
                      <td key={o.value} className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                        {amt > 0 ? fmtFull(amt) : <span className="text-slate-300">—</span>}
                      </td>
                    )
                  })}
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                    {fmtFull(row.total)}
                  </td>
                  <td className="py-2.5 pl-3 text-right text-green-700 whitespace-nowrap">
                    {row.paid > 0 ? fmtFull(row.paid) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Footer: column totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="py-2.5 pr-4 font-semibold text-slate-700">{t('grandTotal')}</td>
                {activeCategories.map((o) => {
                  const total = monthlySummary.reduce((s, r) => s + (r.byCategory[o.value] ?? 0), 0)
                  return (
                    <td key={o.value} className="py-2.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {fmtFull(total)}
                    </td>
                  )
                })}
                <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                  {fmtFull(monthlySummary.reduce((s, r) => s + r.total, 0))}
                </td>
                <td className="py-2.5 pl-3 text-right font-semibold text-green-700 whitespace-nowrap">
                  {fmtFull(monthlySummary.reduce((s, r) => s + r.paid, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
          )}
        </>
      )}
    </div>
  )
}
