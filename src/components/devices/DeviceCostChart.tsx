'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { Device } from '@/lib/types'
import {
  getDeviceCostTimeSeries,
  type DeviceCostGranularity,
} from '@/lib/devices/costs'

interface Props {
  devices: Device[]
}

const GRANULARITY_VALUES: DeviceCostGranularity[] = ['month', 'quarter', 'year']

const SERIES_KEYS = [
  { key: 'budgeted',       color: '#94a3b8' }, // zinc-400
  { key: 'ordered_unpaid', color: '#f59e0b' }, // amber-500
  { key: 'paid',           color: '#10b981' }, // emerald-500
] as const

function fmtRmbShort(v: number): string {
  if (v >= 1_000_000) return '¥' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '¥' + (v / 1_000).toFixed(1) + 'k'
  return '¥' + v.toFixed(0)
}

function fmtRmbFull(v: number): string {
  return '¥' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function DeviceCostChart({ devices }: Props) {
  const t = useTranslations('devices')
  const tExpenses = useTranslations('expenses')
  const [granularity, setGranularity] = useState<DeviceCostGranularity>('month')

  const data = useMemo(
    () => getDeviceCostTimeSeries(devices, granularity),
    [devices, granularity],
  )

  const hasData = data.length > 0

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{t('chartTitle')}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{t('chartSubtitle')}</p>
        </div>
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50">
          {GRANULARITY_VALUES.map((value) => {
            const active = value === granularity
            return (
              <button
                key={value}
                onClick={() => setGranularity(value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {tExpenses(value)}
              </button>
            )
          })}
        </div>
      </div>

      {hasData ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {SERIES_KEYS.map((s) => (
                  <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={s.color} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtRmbShort}
                width={60}
              />
              <Tooltip
                formatter={(value, name) => [fmtRmbFull(Number(value) || 0), String(name)]}
                labelStyle={{ color: '#0f172a', fontWeight: 600, fontSize: 12 }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              {SERIES_KEYS.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={tExpenses(`paymentStatuses.${s.key}`)}
                  stackId="1"
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#grad-${s.key})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-72 flex items-center justify-center text-sm text-zinc-400">
          {t('chartEmpty')}
        </div>
      )}
    </div>
  )
}
