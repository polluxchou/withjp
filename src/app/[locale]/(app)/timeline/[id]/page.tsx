'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { format } from 'date-fns/format'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import ProgressBar from '@/components/ui/ProgressBar'
import Tag from '@/components/ui/Tag'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import { toneOf } from '@/lib/ui/status-tone'
import MilestoneForm from '@/components/milestones/MilestoneForm'
import {
  MilestoneStatusBadge,
  MilestonePriorityBadge,
  MilestoneTypeBadge,
  MilestoneRiskBadge,
  MILESTONE_STATUSES,
} from '@/components/milestones/MilestoneStatusBadge'
import { ArrowLeft, CheckSquare, Users, Bot, Target, ChevronRight } from 'lucide-react'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'
import type { MilestoneStatus, MilestoneLevel, MilestoneDetail, Milestone } from '@/lib/types'

// ── Page ──────────────────────────────────────────────────────

export default function MilestoneDetailPage() {
  const t = useTranslations('timeline')
  const tCommon = useTranslations('common')
  const tTasks = useTranslations('tasks')
  const tStatus = useTranslations('status')
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [milestone,  setMilestone]  = useState<MilestoneDetail | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [showEdit,   setShowEdit]   = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [executing,  setExecuting]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/milestones/${id}`)
      const json = await res.json()
      // /api/milestones/[id] maps every lookup failure to 404 ("Milestone
      // not found") — mostly "no such milestone", but also rare system
      // faults (bad uuid, RLS, DB down) it can't tell apart. With no finer
      // signal, 404 renders as the plain not-found state below (no retry).
      // Any other non-ok status (401/403/500/…) is a real error: prefer the
      // response's own json.error text, falling back to the generic copy
      // (same split as creators/[id]/page.tsx's own load()).
      if (!res.ok && res.status !== 404) {
        console.error('Failed to load milestone:', res.status, json.error)
        setLoadError(json.error ?? tCommon('loadFailed'))
        setMilestone(null)
      } else {
        setLoadError(null)
        setMilestone(json.data as MilestoneDetail)
      }
    } catch (err) {
      console.error('Failed to load milestone:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setMilestone(null)
    } finally {
      setLoading(false)
    }
  }, [id, tCommon])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (newStatus: MilestoneStatus) => {
    if (!milestone || newStatus === milestone.status) return
    setStatusBusy(true)
    try {
      const res  = await fetch(`/api/milestones/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (res.ok && json.data) setMilestone(m => m ? { ...m, status: json.data.status } : m)
    } catch (err) {
      console.error('Failed to update milestone status:', err)
    } finally {
      setStatusBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('detail.deleteConfirm'))) return
    const res = await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/timeline')
  }

  const handleExecuteTask = async (taskId: string, agentId: string) => {
    setExecuting(taskId)
    try {
      await fetch(`/api/agents/${agentId}/execute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ task_id: taskId }),
      })
      load()
    } catch (err) {
      console.error('Failed to execute task:', err)
    } finally {
      setExecuting(null)
    }
  }

  if (loading) return <LoadingState />

  if (!milestone) {
    // loadError only ever comes from a real system failure (non-404
    // response, or a network/parse exception) — a clean 404 "no such
    // milestone" has no loadError and gets no retry button, since retrying
    // a missing record can't succeed (same not-found/error split as
    // creators/[id]/page.tsx's own load()).
    return loadError
      ? <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
      : (
        <EmptyState
          title={t('detail.notFound')}
          action={<Link href="/timeline" className="text-sm text-primary font-medium hover:text-primary-hover">{t('detail.back')}</Link>}
        />
      )
  }

  const { task_progress, linked_tasks, linked_creators, involved_agents, children } = milestone
  const progressPct = task_progress.total > 0
    ? Math.round((task_progress.done / task_progress.total) * 100)
    : 0

  const daysLeft  = milestone.days_until_target ?? 0
  const daysColor = daysLeft < 0 ? 'text-danger-text' : daysLeft <= AT_RISK_DAYS ? 'text-warning-text' : 'text-ink-700'

  const metric = milestone.success_metric as { name?: string; target?: string; unit?: string }

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link href="/timeline"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('detail.backLink')}
      </Link>

      {/* Header */}
      <Header
        title={milestone.title}
        subtitle={milestone.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>{tCommon('edit')}</Button>
            <Button variant="danger"    size="sm" onClick={handleDelete}>{tCommon('delete')}</Button>
          </div>
        }
      />

      {/* Badges row */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <MilestoneTypeBadge     type={milestone.type} />
        <MilestonePriorityBadge priority={milestone.priority} />
        <MilestoneRiskBadge     risk={milestone.risk_level} />
        <span aria-hidden className="w-px h-4 bg-line" />
        {/* Status selector — any-of-N quick switcher, not a linear
            state-machine "advance" button (milestones have no nextStatus()),
            so this stays a row of Tag-backed toggle buttons rather than a
            single "next stage" CTA. */}
        <div className="flex items-center gap-1">
          {MILESTONE_STATUSES.map(value => (
            <button key={value}
              onClick={() => handleStatusChange(value)}
              disabled={statusBusy}
              className={`rounded-btn font-medium transition-all disabled:opacity-50 ${
                milestone.status === value
                  ? 'ring-2 ring-offset-1 ring-primary opacity-100'
                  : 'opacity-50 hover:opacity-80'
              }`}>
              <MilestoneStatusBadge status={value} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {/* Progress + dates grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Task progress */}
        <div className="col-span-2 bg-surface border border-line rounded-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-ink-500">{t('detail.taskProgress')}</span>
            <span className="text-xs font-semibold text-ink-700">
              {t('detail.taskProgressValue', { done: task_progress.done, total: task_progress.total, pct: progressPct })}
            </span>
          </div>
          {/* tone="default" pinned explicitly — ProgressBar's own >90%
              auto-warning heuristic reads as risk, but a milestone that's
              90%+ done on its tasks is good news, not a warning signal
              (same rationale as the pipeline funnel bars on the dashboard). */}
          <ProgressBar value={task_progress.done} max={task_progress.total} label={t('detail.taskProgress')} tone="default" />
        </div>

        {/* Days left */}
        <div className="bg-surface border border-line rounded-card p-4 text-center">
          <div className="text-xs text-ink-500 mb-1">{t('detail.daysUntilTarget')}</div>
          <div className={`text-2xl font-bold tabular-nums ${daysColor}`}>
            {daysLeft < 0 ? Math.abs(daysLeft) : daysLeft}
          </div>
          <div className="text-xs text-ink-400">{daysLeft < 0 ? t('detail.overdue') : t('detail.remaining')}</div>
        </div>

        {/* Level */}
        <div className="bg-surface border border-line rounded-card p-4 text-center">
          <div className="text-xs text-ink-500 mb-1">{t('detail.level')}</div>
          <div className="text-sm font-semibold text-ink-700">{t(`form.levelValue.${milestone.level as MilestoneLevel}`)}</div>
        </div>
      </div>

      {/* Dates + owner */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-xs text-ink-400 mb-1">{t('detail.startDate')}</div>
          <div className="text-sm font-medium text-ink-900">
            {format(new Date(milestone.start_date), 'MMM d, yyyy')}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-xs text-ink-400 mb-1">{t('detail.targetDate')}</div>
          <div className="text-sm font-medium text-ink-900">
            {format(new Date(milestone.target_date), 'MMM d, yyyy')}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-xs text-ink-400 mb-1">{t('detail.ownerAgent')}</div>
          <div className="text-sm font-medium text-ink-900">
            {milestone.owner_agent
              ? `${milestone.owner_agent.name} (${milestone.owner_agent.role})`
              : '—'}
          </div>
        </div>
      </div>

      {/* Success metric */}
      {metric?.name && (
        <div className="bg-primary-soft border border-primary-border rounded-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary-hover">{t('detail.successMetric')}</span>
          </div>
          <p className="text-sm text-primary-hover">
            {metric.name}
            {metric.target && <> — {t('detail.metricTarget')}<strong>{metric.target}{metric.unit ? ` ${metric.unit}` : ''}</strong></>}
          </p>
        </div>
      )}

      {/* Notes */}
      {milestone.notes && (
        <div className="bg-canvas border border-line rounded-card p-4 mb-6">
          <p className="text-xs font-medium text-ink-500 mb-1">{t('detail.notes')}</p>
          <p className="text-sm text-ink-700 whitespace-pre-wrap">{milestone.notes}</p>
        </div>
      )}

      {/* Involved agents */}
      {involved_agents.length > 0 && (
        <div className="mb-4">
          <SectionCard icon={<Bot />} title={t('detail.involvedAgents')}>
            <div className="flex flex-wrap gap-2">
              {involved_agents.map(a => (
                <span key={a.id}
                  className="inline-flex items-center gap-1.5 bg-muted-soft text-muted-text rounded-btn px-3 py-1 text-xs font-medium">
                  <Bot className="w-3 h-3" /> {a.name} <span className="text-ink-400">({a.role})</span>
                </span>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Linked creators */}
      {linked_creators.length > 0 && (
        <div className="mb-4">
          <SectionCard icon={<Users />} title={t('detail.linkedCreators', { count: linked_creators.length })}>
            <div className="divide-y divide-line-soft">
              {linked_creators.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-ink-900">{c.name}</span>
                    <span className="text-xs text-ink-400 ml-2">{c.platform}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Tag size="sm" tone={toneOf('creator', c.status)} label={tStatus(c.status)} />
                    <Link href={`/creators/${c.id}`}
                      className="text-xs text-primary hover:text-primary-hover font-medium">
                      {t('detail.viewLink')} <ChevronRight className="inline w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Linked tasks */}
      <div className="mb-4">
        <SectionCard icon={<CheckSquare />} title={t('detail.linkedTasks', { count: linked_tasks.length })}>
          {linked_tasks.length === 0 ? (
            <p className="text-xs text-ink-400">
              {t('detail.noLinkedTasks')}
            </p>
          ) : (
            <div className="divide-y divide-line-soft">
              {linked_tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{task.title}</p>
                    <p className="text-xs text-ink-400">
                      {(task.creator as { name?: string } | null)?.name ?? '—'}
                      {(task.agent as { name?: string } | null)?.name && (
                        <> · {(task.agent as { name?: string }).name}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <Tag size="sm" tone={toneOf('task', task.status)} label={tTasks(task.status)} />
                    {task.status === 'pending' && (task.agent as { id?: string } | null)?.id && (
                      <Button
                        size="sm"
                        loading={executing === task.id}
                        onClick={() => handleExecuteTask(task.id, (task.agent as { id: string }).id)}
                      >
                        {executing === task.id ? t('detail.executeRunning') : t('detail.executeBtn')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Child milestones */}
      {(children ?? []).length > 0 && (
        <div className="mb-4">
          <SectionCard icon={<ChevronRight />} title={t('detail.subMilestones', { count: children!.length })}>
            <div className="divide-y divide-line-soft">
              {(children as Milestone[]).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/timeline/${c.id}`}
                      className="text-sm font-medium text-ink-900 hover:text-primary transition-colors">
                      {c.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <MilestoneTypeBadge   type={c.type}     size="sm" />
                    <MilestoneStatusBadge status={c.status} size="sm" />
                    <span className="text-xs text-ink-400">
                      {format(new Date(c.target_date), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={t('detail.editTitle')} width="max-w-2xl">
        <MilestoneForm
          initial={milestone}
          onSuccess={updated => { setMilestone(m => m ? { ...m, ...updated } : m); setShowEdit(false) }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  )
}
