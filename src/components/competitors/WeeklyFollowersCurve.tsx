// src/components/competitors/WeeklyFollowersCurve.tsx
'use client'

import { useTranslations } from 'next-intl'
import { buildSparklinePoints } from '@/lib/competitors/chart'
import { formatCount } from '@/lib/competitors/metrics'
import type { WeeklyPoint } from '@/lib/competitors/types'

export default function WeeklyFollowersCurve({ weekly, compact = false }: { weekly: WeeklyPoint[]; compact?: boolean }) {
  const t = useTranslations('competitors')
  const recent = weekly.slice(-4)
  const values = recent.map((w) => w.followers)
  const latest = values.length ? values[values.length - 1] : null
  const prev = values.length >= 2 ? values[values.length - 2] : null
  const pct = latest != null && prev != null && prev !== 0
    ? Math.round(((latest - prev) / prev) * 1000) / 10
    : null
  const W = 140
  const H = 64
  const points = buildSparklinePoints(values, W, H)
  const delta = pct != null ? t('weeklyDelta', { pct: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}` }) : null

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs">
        <span className="text-zinc-500">{t('weeklyFollowers')}</span>
        <span className="font-medium tabular-nums">{formatCount(latest)}</span>
        {delta && <span className="text-sky-600">{delta}</span>}
        {points ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="ml-auto h-5 w-24 text-sky-500" preserveAspectRatio="none" role="img" aria-label={t('weeklyFollowers')}>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="ml-auto text-[11px] text-zinc-400">{t('weeklyEmpty')}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col self-start rounded-md bg-zinc-50 p-2.5">
      <span className="text-[11px] text-zinc-500">{t('weeklyFollowers')}</span>
      <span className="text-base font-medium leading-tight tabular-nums">{formatCount(latest)}</span>
      {delta && <span className="text-[11px] text-sky-600">{delta}</span>}
      {points ? (
        <svg
          viewBox={`0 0 ${W} ${H + 6}`}
          className="mt-1.5 w-full text-sky-500"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('weeklyFollowers')}
        >
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <span className="mt-1.5 text-[11px] text-zinc-400">{t('weeklyEmpty')}</span>
      )}
    </div>
  )
}
