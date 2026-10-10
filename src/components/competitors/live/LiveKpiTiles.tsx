// src/components/competitors/live/LiveKpiTiles.tsx
'use client'

import { useTranslations } from 'next-intl'
import { formatCount } from '@/lib/competitors/metrics'
import type { LiveWindowStats } from '@/lib/competitors/liveStats'
import { useLiveFormat } from './useLiveFormat'

/**
 * 开播记录弹窗顶部的 6 个指标。
 *
 * 近 30 天视图每格下面给前 30 天的同一个数，涨跌一眼可比；全部视图没有可比的前一段，
 * 改给周均、中位数这类补充口径。数全部由 windowStats 算好传进来，这里只负责摆。
 */
export default function LiveKpiTiles({
  cur,
  prev,
  from,
  maxLikes,
}: {
  cur: LiveWindowStats
  /** 前 30 天；只有近 30 天视图有，全部视图为 null。 */
  prev: LiveWindowStats | null
  /** 当前统计区间的起点 YYYY-MM-DD。 */
  from: string
  /** 区间内点赞最高的一场（全部视图的补充说明用）；没有任何点赞为 null。 */
  maxLikes: { likes: number; date: string } | null
}) {
  const t = useTranslations('competitors')
  const fmt = useLiveFormat()

  const avg = (s: LiveWindowStats) => (s.avgMinutes == null ? '—' : fmt.duration(s.avgMinutes))
  // 总时长按小时取整：几十上百小时的量级，分钟位没有信息量。
  const hours = (s: LiveWindowStats) => t('liveKpiHours', { h: Math.round(s.totalMinutes / 60) })
  const gap = (s: LiveWindowStats) => t('liveKpiGapDays', { days: s.longestGapDays })
  const days = (s: LiveWindowStats) => `${s.liveDays} / ${s.spanDays}`
  const vsPrev = (value: string | number) => t('liveKpiPrev', { value: String(value) })

  const tiles: { key: string; label: string; value: string; sub: string }[] = [
    {
      key: 'sessions',
      label: t('liveKpiSessions'),
      value: String(cur.sessions),
      sub: prev
        ? `${vsPrev(prev.sessions)} · ${t('liveKpiPerWeek', { n: cur.perWeek })}`
        : t('liveKpiPerWeek', { n: cur.perWeek }),
    },
    {
      key: 'days',
      label: t('liveKpiDays'),
      value: days(cur),
      sub: prev ? vsPrev(days(prev)) : t('liveKpiDaysNote'),
    },
    {
      key: 'avg',
      label: t('liveKpiAvg'),
      value: avg(cur),
      sub: prev
        ? vsPrev(avg(prev))
        : cur.medianMinutes == null ? '' : t('liveKpiMedianDuration', { value: fmt.duration(cur.medianMinutes) }),
    },
    {
      key: 'total',
      label: t('liveKpiTotal'),
      value: hours(cur),
      sub: prev ? vsPrev(hours(prev)) : t('liveKpiSpanDays', { days: cur.spanDays }),
    },
    {
      key: 'gap',
      label: t('liveKpiGap'),
      value: gap(cur),
      sub: prev ? vsPrev(gap(prev)) : t('liveKpiSince', { date: from.slice(5) }),
    },
    {
      key: 'likes',
      label: t('liveKpiLikes'),
      value: formatCount(cur.medianLikes),
      sub: prev
        ? vsPrev(formatCount(prev.medianLikes))
        : maxLikes ? t('liveKpiMaxLikes', { value: formatCount(maxLikes.likes), date: maxLikes.date.slice(5) }) : '',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((k) => (
        <div key={k.key} className="flex min-w-0 flex-col gap-0.5 rounded-field border border-line bg-surface px-3 py-2.5">
          <span className="truncate text-xs text-ink-500" title={k.label}>{k.label}</span>
          <span className="truncate text-xl font-semibold text-ink-900 tabular-nums">{k.value}</span>
          {/* 补充行留空也占一行高，六格底边才对得齐。 */}
          <span className="min-h-[14px] truncate text-micro text-ink-500 tabular-nums" title={k.sub || undefined}>
            {k.sub}
          </span>
        </div>
      ))}
    </div>
  )
}
