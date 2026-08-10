'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Edit2, Trash2, Plus, Target } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Stat, StatBand } from '@/components/ui/Stat'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Field'
import { toneOf } from '@/lib/ui/status-tone'
import WorkTaskForm from './WorkTaskForm'
import {
  WORK_TASK_TYPE_LABELS,
  WORK_TASK_STATUS_LABELS,
  DEPARTMENT_LABELS,
  utilisationTone,
  buildUserWorkloads,
  aggregateWorkload,
  WORKING_HOURS_PER_DAY,
} from '@/lib/work-tasks/cost'
import type { WorkTask, AgentRole } from '@/lib/types'

interface Props {
  tasks:      WorkTask[]
  salaryMap:  Record<string, number>
  userMeta:   Record<string, { name: string; user_code: string; role: AgentRole }>
  date:       string
  onRefresh:  () => void
}

// Task type isn't a registered status-tone enum (docs/design-system.md §1.3
// only registers real state-machine statuses) — it's a category tag, so a
// locally-scoped tone pick is fine here, same idiom as the dashboard's
// `<Tag tone="violet" label={task.agent.name} />` for agent names.
const TYPE_TONE: Record<string, 'violet' | 'neutral'> = {
  fixed: 'violet',
  adhoc: 'neutral',
}

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function WorkloadDayView({ tasks, salaryMap, userMeta, date, onRefresh }: Props) {
  const t = useTranslations('workTasks')
  const tCommon = useTranslations('common')
  const [editing,   setEditing]   = useState<WorkTask | null>(null)
  const [creating,  setCreating]  = useState(false)
  const [dupTarget, setDupTarget] = useState<WorkTask | null>(null)
  const [dupDate,   setDupDate]   = useState('')
  const [deleting,  setDeleting]  = useState<WorkTask | null>(null)
  const [delLoading,setDelLoading]= useState(false)

  const workloads = buildUserWorkloads(tasks, salaryMap, userMeta)
  const summary   = aggregateWorkload(tasks, salaryMap)

  async function handleDelete() {
    if (!deleting) return
    setDelLoading(true)
    await fetch(`/api/work-tasks/${deleting.id}`, { method: 'DELETE' })
    setDelLoading(false)
    setDeleting(null)
    onRefresh()
  }

  async function handleDuplicate() {
    if (!dupTarget || !dupDate) return
    await fetch(`/api/work-tasks/${dupTarget.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_date: dupDate }),
    })
    setDupTarget(null)
    setDupDate('')
    onRefresh()
  }

  return (
    <div>
      {/* KPI band */}
      <div className="mb-5">
        <StatBand>
          <Stat label={t('summary.totalHours')}   value={t('summary.hoursValue', { hours: summary.totalHours })} />
          <Stat label={t('summary.participants')} value={t('summary.participantsValue', { count: summary.totalPeople })} />
          <Stat label={t('summary.labourCost')}   value={fmtRmb(summary.totalLabourCost)} />
          <Stat label={t('summary.taskCount')}    value={t('summary.taskCountValue', { count: tasks.filter((task) => task.status !== 'cancelled').length })} />
        </StatBand>
      </div>

      {/* Department summary */}
      {Object.keys(summary.byDepartment).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(Object.entries(summary.byDepartment) as [AgentRole, { hours: number; cost: number }][])
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([dept, { hours, cost }]) => (
              <div key={dept} className="bg-surface border border-line rounded-field px-3 py-1.5 text-xs">
                <span className="font-medium text-ink-700">{DEPARTMENT_LABELS[dept]}</span>
                <span className="text-ink-400 mx-1">·</span>
                <span className="text-ink-700 tabular-nums">{hours}h</span>
                <span className="text-ink-400 mx-1">·</span>
                <span className="text-ink-700 tabular-nums">{fmtRmb(cost)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end mb-3">
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> {t('addTask')}
        </Button>
      </div>

      {/* Per-person rows */}
      {workloads.length === 0 ? (
        <EmptyState title={t('emptyDay')} />
      ) : (
        <div className="space-y-3">
          {workloads.map((row) => (
            <div key={row.user_id} className="bg-surface border border-line rounded-card overflow-hidden">
              {/* Person header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line-soft bg-canvas">
                <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary">
                  {row.user_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-ink-900">{row.user_name}</span>
                  <span className="ml-2 text-xs text-ink-400">{DEPARTMENT_LABELS[row.department]}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Utilisation bar */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: WORKING_HOURS_PER_DAY }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-sm ${i < row.total_hours ? 'bg-primary' : 'bg-line-strong'}`}
                      />
                    ))}
                  </div>
                  <Tag variant="soft" size="sm" tone={utilisationTone(row.total_hours)} label={`${row.total_hours}h`} />
                  <span className="text-xs text-ink-400 tabular-nums">{fmtRmb(row.daily_cost * (row.total_hours / WORKING_HOURS_PER_DAY))}</span>
                </div>
              </div>

              {/* Task list */}
              <div className="divide-y divide-line-soft">
                {row.tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-row-hover transition-colors">
                    <div className="flex gap-1.5 mt-0.5 flex-shrink-0">
                      <Tag size="sm" tone={TYPE_TONE[task.task_type]} label={WORK_TASK_TYPE_LABELS[task.task_type]} />
                      <Tag size="sm" tone={toneOf('work_task', task.status)} label={WORK_TASK_STATUS_LABELS[task.status]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{task.title}</p>
                      {task.milestone && (
                        <p className="flex items-center gap-1 text-xs text-ink-400 mt-0.5">
                          <Target className="w-[13px] h-[13px] flex-none" strokeWidth={1.5} aria-hidden />
                          {task.milestone.title}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-ink-400 flex-shrink-0">
                      <span className="font-medium text-ink-700 tabular-nums">{task.effort_hours}h</span>
                      <span>·</span>
                      <span>{task.owner_user_id === row.user_id ? t('roleOwner') : t('roleAssignee')}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        aria-label={t('rowAction.duplicate')} title={t('rowAction.duplicate')}
                        onClick={() => { setDupTarget(task); setDupDate('') }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        aria-label={t('rowAction.edit')} title={t('rowAction.edit')}
                        onClick={() => setEditing(task)}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        aria-label={t('rowAction.delete')} title={t('rowAction.delete')}
                        onClick={() => setDeleting(task)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title={t('addTask')} width="max-w-2xl">
        <WorkTaskForm
          defaultDate={date}
          onSuccess={() => { setCreating(false); onRefresh() }}
          onCancel={() => setCreating(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('editTask')} width="max-w-2xl">
        {editing && (
          <WorkTaskForm
            task={editing}
            onSuccess={() => { setEditing(null); onRefresh() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Duplicate Modal */}
      <Modal open={!!dupTarget} onClose={() => setDupTarget(null)} title={t('duplicateTaskTo')}>
        {dupTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              {t.rich('duplicateConfirm', {
                name: dupTarget.title,
                title: (chunks) => <span className="font-medium">{chunks}</span>,
              })}
            </p>
            <Field label={t('targetDateField')}>
              <Input type="date" value={dupDate} onChange={(e) => setDupDate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDupTarget(null)}>{tCommon('cancel')}</Button>
              <Button onClick={handleDuplicate} disabled={!dupDate}>{t('confirmDuplicate')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={tCommon('confirmDelete')}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              {t.rich('deleteConfirm', {
                name: deleting.title,
                title: (chunks) => <span className="font-semibold">{chunks}</span>,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>{tCommon('cancel')}</Button>
              <Button variant="danger" loading={delLoading} onClick={handleDelete}>{tCommon('delete')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
