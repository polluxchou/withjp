'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { format } from 'date-fns/format'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MilestoneForm from '@/components/milestones/MilestoneForm'
import {
  MilestoneStatusBadge,
  MilestonePriorityBadge,
  MilestoneTypeBadge,
  MilestoneRiskBadge,
} from '@/components/milestones/MilestoneStatusBadge'
import { ArrowLeft, CheckSquare, Users, Bot, Target, ChevronRight } from 'lucide-react'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'
import type { MilestoneDetail, MilestoneStatus, MilestoneLevel, Milestone } from '@/lib/types'

// Status values for the inline selector — labels resolved via t('status.<key>').
const STATUS_VALUES: MilestoneStatus[] = ['planned', 'active', 'at_risk', 'completed', 'missed']

const TASK_STATUS_COLOR: Record<string, string> = {
  pending: 'text-amber-600',
  running: 'text-blue-600',
  done:    'text-green-600',
  failed:  'text-red-500',
}

// ── Page ──────────────────────────────────────────────────────

export default function MilestoneDetailPage() {
  const t = useTranslations('timeline')
  const tCommon = useTranslations('common')
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [milestone,  setMilestone]  = useState<MilestoneDetail | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showEdit,   setShowEdit]   = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [executing,  setExecuting]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/milestones/${id}`)
      const json = await res.json()
      if (json.data) setMilestone(json.data as MilestoneDetail)
    } catch (err) {
      console.error('Failed to load milestone:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

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

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-zinc-400">{t('detail.loading')}</div>
    )
  }

  if (!milestone) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-zinc-500 mb-3">{t('detail.notFound')}</p>
        <Link href="/timeline" className="text-sm text-primary font-medium">{t('detail.back')}</Link>
      </div>
    )
  }

  const { task_progress, linked_tasks, linked_creators, involved_agents, children } = milestone
  const progressPct = task_progress.total > 0
    ? Math.round((task_progress.done / task_progress.total) * 100)
    : 0

  const daysLeft  = milestone.days_until_target ?? 0
  const daysColor = daysLeft < 0 ? 'text-red-500' : daysLeft <= AT_RISK_DAYS ? 'text-amber-600' : 'text-zinc-700'

  const metric = milestone.success_metric as { name?: string; target?: string; unit?: string }

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link href="/timeline"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-4 transition-colors">
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
        <span className="text-zinc-300">|</span>
        {/* Status selector */}
        <div className="flex items-center gap-1">
          {STATUS_VALUES.map(value => (
            <button key={value}
              onClick={() => handleStatusChange(value)}
              disabled={statusBusy}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all disabled:opacity-50 ${
                milestone.status === value
                  ? 'ring-2 ring-offset-1 ring-violet-400 opacity-100'
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
        <div className="col-span-2 bg-white border border-zinc-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500">{t('detail.taskProgress')}</span>
            <span className="text-xs font-semibold text-zinc-700">
              {t('detail.taskProgressValue', { done: task_progress.done, total: task_progress.total, pct: progressPct })}
            </span>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-2">
            <div className="bg-violet-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Days left */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 mb-1">{t('detail.daysUntilTarget')}</div>
          <div className={`text-2xl font-bold ${daysColor}`}>
            {daysLeft < 0 ? Math.abs(daysLeft) : daysLeft}
          </div>
          <div className="text-xs text-zinc-400">{daysLeft < 0 ? t('detail.overdue') : t('detail.remaining')}</div>
        </div>

        {/* Level */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 mb-1">{t('detail.level')}</div>
          <div className="text-sm font-semibold text-zinc-700">{t(`form.levelValue.${milestone.level as MilestoneLevel}`)}</div>
        </div>
      </div>

      {/* Dates + owner */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">{t('detail.startDate')}</div>
          <div className="text-sm font-medium text-zinc-800">
            {format(new Date(milestone.start_date), 'MMM d, yyyy')}
          </div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">{t('detail.targetDate')}</div>
          <div className="text-sm font-medium text-zinc-800">
            {format(new Date(milestone.target_date), 'MMM d, yyyy')}
          </div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">{t('detail.ownerAgent')}</div>
          <div className="text-sm font-medium text-zinc-800">
            {milestone.owner_agent
              ? `${milestone.owner_agent.name} (${milestone.owner_agent.role})`
              : '—'}
          </div>
        </div>
      </div>

      {/* Success metric */}
      {metric?.name && (
        <div className="bg-primary-soft border border-violet-100 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-violet-900">{t('detail.successMetric')}</span>
          </div>
          <p className="text-sm text-violet-800">
            {metric.name}
            {metric.target && <> — {t('detail.metricTarget')}<strong>{metric.target}{metric.unit ? ` ${metric.unit}` : ''}</strong></>}
          </p>
        </div>
      )}

      {/* Notes */}
      {milestone.notes && (
        <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 mb-6">
          <p className="text-xs font-medium text-zinc-500 mb-1">{t('detail.notes')}</p>
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{milestone.notes}</p>
        </div>
      )}

      {/* Involved agents */}
      {involved_agents.length > 0 && (
        <Section icon={<Bot className="w-4 h-4" />} title={t('detail.involvedAgents')}>
          <div className="flex flex-wrap gap-2">
            {involved_agents.map(a => (
              <span key={a.id}
                className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-700 rounded-full px-3 py-1 text-xs font-medium">
                <Bot className="w-3 h-3" /> {a.name} <span className="text-zinc-400">({a.role})</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Linked creators */}
      {linked_creators.length > 0 && (
        <Section icon={<Users className="w-4 h-4" />} title={t('detail.linkedCreators', { count: linked_creators.length })}>
          <div className="divide-y divide-zinc-50">
            {linked_creators.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm font-medium text-zinc-800">{c.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">{c.platform}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 capitalize">{c.status.replace('_', ' ')}</span>
                  <Link href={`/creators/${c.id}`}
                    className="text-xs text-primary hover:text-violet-800 font-medium">
                    {t('detail.viewLink')} <ChevronRight className="inline w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Linked tasks */}
      <Section icon={<CheckSquare className="w-4 h-4" />} title={t('detail.linkedTasks', { count: linked_tasks.length })}>
        {linked_tasks.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {t('detail.noLinkedTasks')}
          </p>
        ) : (
          <div className="divide-y divide-zinc-50">
            {linked_tasks.map(task => (
              <div key={task.id} className="flex items-center justify-between py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{task.title}</p>
                  <p className="text-xs text-zinc-400">
                    {(task.creator as { name?: string } | null)?.name ?? '—'}
                    {(task.agent as { name?: string } | null)?.name && (
                      <> · {(task.agent as { name?: string }).name}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <span className={`text-xs font-medium capitalize ${TASK_STATUS_COLOR[task.status] ?? 'text-zinc-500'}`}>
                    {task.status}
                  </span>
                  {task.status === 'pending' && (task.agent as { id?: string } | null)?.id && (
                    <button
                      onClick={() => handleExecuteTask(task.id, (task.agent as { id: string }).id)}
                      disabled={executing === task.id}
                      className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50">
                      {executing === task.id ? t('detail.executeRunning') : t('detail.executeBtn')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Child milestones */}
      {(children ?? []).length > 0 && (
        <Section icon={<ChevronRight className="w-4 h-4" />} title={t('detail.subMilestones', { count: children!.length })}>
          <div className="divide-y divide-zinc-50">
            {(children as Milestone[]).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <Link href={`/timeline/${c.id}`}
                    className="text-sm font-medium text-zinc-800 hover:text-primary transition-colors">
                    {c.title}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <MilestoneTypeBadge   type={c.type}     size="sm" />
                  <MilestoneStatusBadge status={c.status} size="sm" />
                  <span className="text-xs text-zinc-400">
                    {format(new Date(c.target_date), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
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

// ── Shared section wrapper ────────────────────────────────────

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-zinc-500">{icon}</span>
        <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}
