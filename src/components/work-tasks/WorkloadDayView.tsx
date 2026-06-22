'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Edit2, Trash2, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import WorkTaskForm from './WorkTaskForm'
import {
  WORK_TASK_TYPE_LABELS,
  WORK_TASK_STATUS_LABELS,
  DEPARTMENT_LABELS,
  utilisationColor,
  buildUserWorkloads,
  aggregateWorkload,
  toDateStr,
  WORKING_HOURS_PER_DAY,
} from '@/lib/work-tasks/cost'
import type { WorkTask, AgentRole, UserWorkload } from '@/lib/types'

interface Props {
  tasks:      WorkTask[]
  salaryMap:  Record<string, number>
  userMeta:   Record<string, { name: string; user_code: string; role: AgentRole }>
  date:       string
  onRefresh:  () => void
}

const STATUS_COLOR: Record<string, string> = {
  planned:   'bg-zinc-100 text-zinc-600',
  doing:     'bg-blue-100 text-blue-700',
  done:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
}

const TYPE_COLOR: Record<string, string> = {
  fixed: 'bg-amber-100 text-amber-700',
  adhoc: 'bg-purple-100 text-purple-700',
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
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: t('summary.totalHours'),    value: t('summary.hoursValue',         { hours: summary.totalHours }) },
          { label: t('summary.participants'),  value: t('summary.participantsValue', { count: summary.totalPeople }) },
          { label: t('summary.labourCost'),    value: fmtRmb(summary.totalLabourCost) },
          { label: t('summary.taskCount'),     value: t('summary.taskCountValue',    { count: tasks.filter(task => task.status !== 'cancelled').length }) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-zinc-200 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
            <p className="text-lg font-bold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Department summary */}
      {Object.keys(summary.byDepartment).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(Object.entries(summary.byDepartment) as [AgentRole, { hours: number; cost: number }][])
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([dept, { hours, cost }]) => (
              <div key={dept} className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-medium text-zinc-700">{DEPARTMENT_LABELS[dept]}</span>
                <span className="text-zinc-400 mx-1">·</span>
                <span className="text-zinc-600">{hours}h</span>
                <span className="text-zinc-400 mx-1">·</span>
                <span className="text-zinc-600">{fmtRmb(cost)}</span>
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
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-sm text-zinc-400">
          {t('emptyDay')}
        </div>
      ) : (
        <div className="space-y-3">
          {workloads.map((row) => (
            <div key={row.user_id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              {/* Person header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-zinc-50">
                <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary">
                  {row.user_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-zinc-900">{row.user_name}</span>
                  <span className="ml-2 text-xs text-zinc-400">{DEPARTMENT_LABELS[row.department]}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Utilisation bar */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: WORKING_HOURS_PER_DAY }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-sm ${i < row.total_hours ? 'bg-violet-500' : 'bg-zinc-200'}`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${utilisationColor(row.total_hours)}`}>
                    {row.total_hours}h
                  </span>
                  <span className="text-xs text-zinc-400">{fmtRmb(row.daily_cost * (row.total_hours / WORKING_HOURS_PER_DAY))}</span>
                </div>
              </div>

              {/* Task list */}
              <div className="divide-y divide-zinc-50">
                {row.tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                    <div className="flex gap-1.5 mt-0.5 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLOR[task.task_type]}`}>
                        {WORK_TASK_TYPE_LABELS[task.task_type]}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[task.status]}`}>
                        {WORK_TASK_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{task.title}</p>
                      {task.milestone && (
                        <p className="text-xs text-zinc-400 mt-0.5">🎯 {task.milestone.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                      <span className="font-medium text-zinc-600">{task.effort_hours}h</span>
                      <span>·</span>
                      <span>{task.owner_user_id === row.user_id ? t('roleOwner') : t('roleAssignee')}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setDupTarget(task); setDupDate('') }}
                        className="p-1 text-zinc-400 hover:text-primary transition-colors" title={t('rowAction.duplicate')}>
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditing(task)}
                        className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors" title={t('rowAction.edit')}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleting(task)}
                        className="p-1 text-zinc-400 hover:text-red-600 transition-colors" title={t('rowAction.delete')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
            <p className="text-sm text-zinc-600">
              {t.rich('duplicateConfirm', {
                name: dupTarget.title,
                title: (chunks) => <span className="font-medium">{chunks}</span>,
              })}
            </p>
            <input type="date" value={dupDate} onChange={(e) => setDupDate(e.target.value)}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
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
            <p className="text-sm text-zinc-700">
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
