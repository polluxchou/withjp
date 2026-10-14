'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { buildMilestoneOverview, formatMilestoneDate, getMilestoneDaysLeft, groupMilestonesForList, type MilestoneListGroupKey } from '@/lib/milestones/list-view'
import { MilestoneStatusBadge } from '@/components/milestones/MilestoneStatusBadge'
import MilestoneTiming from '@/components/milestones/MilestoneTiming'
import MilestoneListOverview from '@/components/milestones/MilestoneListOverview'
import type { Milestone } from '@/lib/types'

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] lg:grid-cols-[minmax(0,1fr)_9rem_7rem_9rem] gap-x-4 gap-y-2 items-center'
const GROUP_COLOR: Record<MilestoneListGroupKey, string> = {
  overdue: 'text-danger-text', due: 'text-warning-text', active: 'text-info-text',
  planned: 'text-ink-700', completed: 'text-success-text',
}

export default function MilestoneListView({ milestones, onUpdated, expandCompleted = false }: {
  milestones: Milestone[]
  onUpdated: () => void
  expandCompleted?: boolean
}) {
  const t = useTranslations('timeline')
  const common = useTranslations('common')
  const locale = useLocale()
  const [now, setNow] = useState(() => new Date())
  const groups = useMemo(() => groupMilestonesForList(milestones, now), [milestones, now])
  const numbers = useMemo(() => buildMilestoneOverview(milestones, now).numbers, [milestones, now])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [completedOpen, setCompletedOpen] = useState(expandCompleted)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const rowButtons = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef(false)

  useEffect(() => { setNow(new Date()) }, [milestones])

  useEffect(() => { setCompletedOpen(expandCompleted) }, [expandCompleted])

  useEffect(() => {
    if (!pendingFocus.current || !selectedId) return
    const row = rowButtons.current.get(selectedId)
    if (!row) return
    pendingFocus.current = false
    row.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [selectedId, expanded, completedOpen])

  function selectFromTimeline(id: string) {
    setSelectedId(id)
    setExpanded(current => new Set(current).add(id))
    const milestone = milestones.find(item => item.id === id)
    if (milestone?.completed_date || milestone?.status === 'completed') setCompletedOpen(true)
    pendingFocus.current = true
  }

  function toggleRow(id: string) {
    setSelectedId(id)
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    setDeletingId(id)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')
      onUpdated()
    } catch {
      setDeleteError(t('list.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  function renderRow(milestone: Milestone) {
    const open = expanded.has(milestone.id)
    const owner = milestone.owner_agent?.name
    const ownerShort = owner?.replace(/\s*\([^)]*\)\s*$/, '')
    return (
      <li key={milestone.id} className="border-b border-line-soft last:border-b-0">
        <button ref={element => { if (element) rowButtons.current.set(milestone.id, element); else rowButtons.current.delete(milestone.id) }}
          id={`milestone-row-${milestone.id}`} type="button" aria-expanded={open} aria-controls={`milestone-details-${milestone.id}`}
          onClick={() => toggleRow(milestone.id)}
          className={`${ROW_GRID} w-full px-4 py-3 text-left hover:bg-row-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 ${selectedId === milestone.id ? 'bg-primary-soft' : ''}`}>
          <span className="min-w-0 col-start-1 row-start-1 lg:row-auto">
            <span className="flex items-start gap-2">
              <span aria-hidden className="text-micro text-ink-400 tabular-nums shrink-0 pt-0.5">{numbers[milestone.id] ?? '—'}</span>
              <span className="min-w-0 text-sm font-medium text-ink-900 break-words">{milestone.title}</span>
              <ChevronDown aria-hidden className={`w-3.5 h-3.5 text-ink-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
            <span className="block text-xs text-ink-500 mt-1">{t(`type.${milestone.type}`)} · {t('list.priority', { value: t(`form.priorityValue.${milestone.priority}`) })}</span>
          </span>
          <span className="min-w-0 col-start-1 row-start-2 lg:col-start-2 lg:row-start-1 text-xs text-ink-700 truncate" title={owner}>
            <span className="sr-only">{t('table.owner')}: </span>{ownerShort ?? t('list.unassigned')}
          </span>
          <span className="col-start-2 row-start-2 lg:col-start-3 lg:row-start-1 text-xs text-ink-500 whitespace-nowrap text-right lg:text-left tabular-nums">
            <span className="sr-only">{t('table.target')}: </span>{formatMilestoneDate(milestone.target_date, locale, now)}
          </span>
          <span className="col-start-2 row-start-1 lg:col-start-4 text-right text-xs font-medium whitespace-nowrap">
            <MilestoneTiming milestone={milestone} daysLeft={getMilestoneDaysLeft(milestone.target_date, now)} />
          </span>
        </button>
        <div id={`milestone-details-${milestone.id}`} hidden={!open} className="border-t border-line-soft px-4 py-3 bg-canvas">
          {milestone.description && <p className="text-sm text-ink-700 whitespace-pre-wrap break-words mb-3">{milestone.description}</p>}
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-500">
            <div><dt className="inline mr-2">{t('detail.startDate')}</dt><dd className="inline text-ink-700">{formatMilestoneDate(milestone.start_date, locale, now, true)}</dd></div>
            <div><dt className="inline mr-2">{t('detail.targetDate')}</dt><dd className="inline text-ink-700">{formatMilestoneDate(milestone.target_date, locale, now, true)}</dd></div>
            {milestone.completed_date && <div><dt className="inline mr-2">{t('detail.completedDate')}</dt><dd className="inline text-ink-700">{formatMilestoneDate(milestone.completed_date, locale, now, true)}</dd></div>}
            <div><dt className="inline mr-2">{t('table.owner')}</dt><dd className="inline text-ink-700">{owner ?? t('list.unassigned')}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <span className="whitespace-nowrap"><MilestoneStatusBadge status={milestone.completed_date ? 'completed' : milestone.status} size="sm" /></span>
            <Link href={`/timeline/${milestone.id}`} className="text-xs text-primary font-medium inline-flex items-center gap-1 py-2">{common('details')}<ChevronRight aria-hidden className="w-3.5 h-3.5" /></Link>
            <details className="text-xs text-ink-500">
              <summary className="cursor-pointer py-2">{t('list.more')}</summary>
              <button type="button" disabled={deletingId !== null} onClick={() => handleDelete(milestone.id)} className="text-danger-text py-2 disabled:opacity-50">
                {deletingId === milestone.id ? common('loading') : common('delete')}
              </button>
            </details>
          </div>
        </div>
      </li>
    )
  }

  return (
    <div>
      <MilestoneListOverview milestones={milestones} selectedId={selectedId} onSelect={selectFromTimeline} now={now} />
      {deleteError && <p role="alert" className="text-sm text-danger-text mb-4">{deleteError}</p>}
      <div aria-hidden className={`${ROW_GRID} hidden lg:grid px-4 mb-2 text-xs text-ink-500`}>
        <span>{t('table.milestone')}</span><span>{t('table.owner')}</span><span>{t('table.target')}</span><span className="text-right">{t('list.timing')}</span>
      </div>
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`milestone-group-${group.key}`} className="mb-5">
          <h2 id={`milestone-group-${group.key}`} className={`text-sm font-semibold mb-2 ${GROUP_COLOR[group.key]}`}>
            {group.key === 'completed' ? (
              <button type="button" aria-expanded={completedOpen} aria-controls="milestone-completed-rows" onClick={() => setCompletedOpen(current => !current)} className="inline-flex items-center gap-2 py-2">
                <ChevronRight aria-hidden className={`w-4 h-4 ${completedOpen ? 'rotate-90' : ''}`} />{t('list.groups.completed')}
                <span className="text-xs text-ink-500 font-normal tabular-nums">{group.milestones.length}</span>
              </button>
            ) : <>{t(`list.groups.${group.key}`)}<span className="ml-2 text-xs text-ink-500 font-normal tabular-nums">{group.milestones.length}</span></>}
          </h2>
          <ul id={group.key === 'completed' ? 'milestone-completed-rows' : undefined} hidden={group.key === 'completed' && !completedOpen}
            className="bg-surface border border-line rounded-card overflow-hidden">
            {group.milestones.map(renderRow)}
          </ul>
        </section>
      ))}
    </div>
  )
}
