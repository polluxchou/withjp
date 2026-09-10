'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { buildMilestoneOverview, formatMilestoneDate, getMilestoneDaysLeft } from '@/lib/milestones/list-view'
import { getMilestoneTiming } from '@/lib/milestones/completion'
import type { Milestone } from '@/lib/types'

const MARKER_COLOR = {
  success: 'bg-success-soft text-success-text border-success-border',
  warning: 'bg-warning-soft text-warning-text border-warning-border',
  danger: 'bg-danger-soft text-danger-text border-danger-border',
  neutral: 'bg-surface text-ink-700 border-line',
}

export default function MilestoneListOverview({ milestones, selectedId, onSelect, now }: {
  milestones: Milestone[]
  selectedId: string | null
  onSelect: (id: string) => void
  now: Date
}) {
  const t = useTranslations('timeline.list')
  const locale = useLocale()
  const overview = useMemo(() => buildMilestoneOverview(milestones, now), [milestones, now])
  const [clusterId, setClusterId] = useState<string | null>(null)
  const cluster = overview.groups.find(group => group.id === clusterId)
  const selected = milestones.find(milestone => milestone.id === selectedId)
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })

  return (
    <section aria-label={t('overview')} className="bg-surface border border-line rounded-card px-4 py-3 mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">{t('overview')}</h2>
        <p className="text-xs text-ink-500">{t('overviewHint')}</p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="relative min-w-[640px] h-32" aria-label={t('targetAxis')}>
          <div aria-hidden className="absolute left-[5%] right-[5%] top-16 h-px bg-line-strong" />
          {overview.ticks.map(tick => (
            <div key={tick.date} className="absolute top-24 -translate-x-1/2 text-micro text-ink-500 whitespace-nowrap" style={{ left: `${tick.x}%` }}>
              {monthFormat.format(new Date(tick.date))}
            </div>
          ))}
          <div className="absolute top-4 -translate-x-1/2 text-micro text-primary text-center whitespace-nowrap" style={{ left: `${overview.todayX}%` }}>
            {t('today')}
            <div aria-hidden className="mx-auto mt-1 w-px h-12 bg-primary" />
          </div>
          {overview.groups.map(group => {
            const isCluster = group.milestones.length > 1
            const milestone = group.milestones[0]
            const active = group.milestones.some(item => item.id === selectedId)
            const timing = getMilestoneTiming(milestone, getMilestoneDaysLeft(milestone.target_date, now))
            const label = isCluster
              ? t('clusterLabel', { count: group.milestones.length })
              : t('nodeLabel', { number: overview.numbers[milestone.id], title: milestone.title, date: formatMilestoneDate(milestone.target_date, locale, now, true) })
            return (
              <button key={group.id} type="button" aria-label={label} title={label}
                aria-pressed={active}
                aria-expanded={isCluster ? clusterId === group.id : undefined}
                aria-controls={isCluster ? 'milestone-overview-cluster' : undefined}
                onClick={() => {
                  if (isCluster) setClusterId(current => current === group.id ? null : group.id)
                  else { setClusterId(null); onSelect(milestone.id) }
                }}
                className={`absolute top-11 -translate-x-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full border text-xs font-semibold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${isCluster ? MARKER_COLOR.neutral : MARKER_COLOR[timing.tone]} ${active ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                style={{ left: `${group.x}%` }}>
                {isCluster ? `+${group.milestones.length}` : overview.numbers[milestone.id]}
              </button>
            )
          })}
        </div>
      </div>
      {cluster && (
        <div id="milestone-overview-cluster" className="flex flex-wrap gap-2 border-t border-line-soft pt-3 mb-2">
          {cluster.milestones.map(milestone => (
            <button key={milestone.id} type="button" onClick={() => onSelect(milestone.id)}
              aria-pressed={selectedId === milestone.id}
              className="text-xs text-ink-700 border border-line rounded-btn px-3 py-2 hover:bg-row-hover text-left">
              <span className="text-primary tabular-nums mr-2">{overview.numbers[milestone.id]}</span>{milestone.title}
              <span className="text-ink-500 whitespace-nowrap ml-2">{formatMilestoneDate(milestone.target_date, locale, now)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-ink-500" aria-live="polite">
        {selected ? t('selected', { title: selected.title }) : t('selectionHint')}
      </p>
    </section>
  )
}
