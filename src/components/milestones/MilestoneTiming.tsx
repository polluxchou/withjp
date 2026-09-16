'use client'

import { useTranslations } from 'next-intl'
import { getMilestoneTiming } from '@/lib/milestones/completion'
import type { Milestone } from '@/lib/types'

const TIMING_COLOR = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  neutral: 'text-ink-500',
}

const COMPACT_LABEL = {
  'detail.completedOnTime': 'table.onTime',
  'detail.completedEarly': 'table.earlyBy',
  'detail.completedLate': 'table.lateBy',
} as const

export default function MilestoneTiming({
  milestone,
  daysLeft,
  detail = false,
}: {
  milestone: Pick<Milestone, 'status' | 'completed_date' | 'target_date'>
  daysLeft: number
  detail?: boolean
}) {
  const t = useTranslations('timeline')
  const timing = getMilestoneTiming(milestone, daysLeft)
  const labelKey = !detail && timing.label in COMPACT_LABEL
    ? COMPACT_LABEL[timing.label as keyof typeof COMPACT_LABEL]
    : timing.label
  const label = t(labelKey, { days: timing.days ?? 0 })
  const color = TIMING_COLOR[timing.tone]

  if (!detail) return <span className={color}>{label}</span>

  return (
    <>
      <div className="text-xs text-ink-500 mb-1">
        {t(timing.completed ? 'table.daysLeftOrCompleted' : 'detail.daysUntilTarget')}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>
        {timing.completed ? t('status.completed') : timing.days}
      </div>
      <div className="text-xs text-ink-400">
        {timing.completed ? label : t(daysLeft < 0 ? 'detail.overdue' : 'detail.remaining')}
      </div>
    </>
  )
}
