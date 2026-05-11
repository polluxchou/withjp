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
} from 'recharts'
import type { Expense, ExpenseCategory } from '@/lib/types'
import {
  EXPENSE_CATEGORY_OPTIONS,
  getExpenseCategoryBreakdown,
  getExpenseCostTimeSeries,
  getMonthlyExpenseSummary,
  type CostGranularity,
} from '@/lib/expenses/costs'

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

function fmtRmb(v: number) {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`
  return `¥${v.toFixed(0)}`
}

function fmtFull(v: number) {
  return '¥' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

type Tab = 'category' | 'trend' | 'monthly'

export default function ExpenseCategoryChart({ expenses }: Props) {
  const [tab, setTab]               = useState<Tab>('category')
  const [granularity, setGranularity] = useState<CostGranularity>('month')

  const breakdown    = getExpenseCategoryBreakdown(expenses)
  const timeSeries   = getExpenseCostTimeSeries(expenses, granularity)
  const monthlySummary = getMonthlyExpenseSummary(expenses)

  // Only show categories that have data in the monthly view
  const activeCategories = EXPENSE_CATEGORY_OPTIONS.filter((o) =>
    monthlySummary.some((row) => (row.byCategory[o.value] ?? 0) > 0)
  )

  if (expenses.length === 0) return null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'category', label: '类别占比' },
    { key: 'trend',    label: '累计趋势' },
    { key: 'monthly',  label: '月度汇总' },
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
                {g === 'month' ? '月' : g === 'quarter' ? '季' : '年'}
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
                  <span className="text-xs font-medium text-slate-700">{item.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{item.pct.toFixed(1)}%</span>
                  <span className="text-xs font-semibold text-slate-900 w-20 text-right">
                    {fmtRmb(item.total)}
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
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtRmb} width={52} />
            <Tooltip
              formatter={(v) => [`¥${Number(v).toFixed(2)}`, '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="paid"          name="已付款" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="budgeted"      name="已预算" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="ordered_unpaid" name="待付款" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ── Tab 3: 月度汇总 ── */}
      {tab === 'monthly' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 font-medium text-slate-500 whitespace-nowrap">月份</th>
                {activeCategories.map((o) => (
                  <th key={o.value} className="text-right py-2 px-3 font-medium whitespace-nowrap" style={{ color: CATEGORY_COLORS[o.value] }}>
                    {o.label}
                  </th>
                ))}
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">合计</th>
                <th className="text-right py-2 pl-3 font-medium text-green-600 whitespace-nowrap">已付款</th>
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
                <td className="py-2.5 pr-4 font-semibold text-slate-700">总计</td>
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
    </div>
  )
}
