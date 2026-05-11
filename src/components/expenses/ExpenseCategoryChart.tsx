'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import type { Expense } from '@/lib/types'
import {
  getExpenseCategoryBreakdown,
  getExpenseCostTimeSeries,
  type CostGranularity,
} from '@/lib/expenses/costs'

interface Props {
  expenses: Expense[]
}

const CATEGORY_COLORS: Record<string, string> = {
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

export default function ExpenseCategoryChart({ expenses }: Props) {
  const [tab, setTab]         = useState<'category' | 'trend'>('category')
  const [granularity, setGranularity] = useState<CostGranularity>('month')

  const breakdown  = getExpenseCategoryBreakdown(expenses)
  const timeSeries = getExpenseCostTimeSeries(expenses, granularity)

  if (expenses.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab('category')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === 'category' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            类别占比
          </button>
          <button
            onClick={() => setTab('trend')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === 'trend' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            累计趋势
          </button>
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

      {/* Category breakdown */}
      {tab === 'category' && (
        <div className="space-y-2.5">
          {breakdown.map((item) => (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[item.category] ?? '#94a3b8' }}
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
                    backgroundColor: CATEGORY_COLORS[item.category] ?? '#94a3b8',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trend */}
      {tab === 'trend' && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timeSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
              tickFormatter={fmtRmb}
              width={52}
            />
            <Tooltip
              formatter={(v) => [`¥${Number(v).toFixed(2)}`, '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone" dataKey="paid"
              name="已付款" stroke="#10b981" strokeWidth={2} dot={false}
            />
            <Line
              type="monotone" dataKey="budgeted"
              name="已预算" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2"
            />
            <Line
              type="monotone" dataKey="ordered_unpaid"
              name="待付款" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
