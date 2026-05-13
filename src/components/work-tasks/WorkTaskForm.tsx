'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import {
  WORK_TASK_TYPE_LABELS,
  WORK_TASK_STATUS_OPTIONS,
  DEPARTMENT_OPTIONS,
  EFFORT_LABELS,
} from '@/lib/work-tasks/cost'
import { EXPENSE_USER_OPTIONS } from '@/lib/expenses/costs'
import type {
  WorkTask, WorkTaskType, WorkTaskStatus, AgentRole, WorkTaskEffort,
} from '@/lib/types'

interface Props {
  task?:          WorkTask
  duplicateFrom?: WorkTask
  defaultDate?:   string
  onSuccess:      (task: WorkTask) => void
  onCancel:       () => void
}

interface Milestone { id: string; title: string }
interface UserOption { id: string; name: string; user_code: string }

const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
const LABEL = 'block text-xs font-medium text-slate-700 mb-1'

export default function WorkTaskForm({ task, duplicateFrom, defaultDate, onSuccess, onCancel }: Props) {
  const t = useTranslations('workTasks.form')
  const tCommon = useTranslations('common')
  const source    = task ?? duplicateFrom
  const isEditing = !!task

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [users,      setUsers]      = useState<UserOption[]>([])

  const [form, setForm] = useState({
    task_type:     (source?.task_type     ?? 'adhoc')     as WorkTaskType,
    title:         source?.title          ?? '',
    description:   source?.description   ?? '',
    department:    (source?.department    ?? 'ops')        as AgentRole,
    milestone_id:  source?.milestone_id  ?? '',
    owner_user_id: source?.owner_user_id ?? '',
    executor_ids:  source?.executor_ids  ?? [] as string[],
    task_date:     source?.task_date     ?? defaultDate ?? '',
    effort_hours:  (source?.effort_hours ?? 2)             as WorkTaskEffort,
    status:        (source?.status       ?? 'planned')     as WorkTaskStatus,
    notes:         source?.notes         ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/milestones').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ]).then(([ms, us]) => {
      setMilestones(ms.data ?? [])
      setUsers(us.data ?? [])
    })
  }, [])

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  function toggleExecutor(userId: string) {
    setForm((f) => ({
      ...f,
      executor_ids: f.executor_ids.includes(userId)
        ? f.executor_ids.filter((id) => id !== userId)
        : [...f.executor_ids, userId],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim())    { setError(t('errTitle')); return }
    if (!form.task_date)       { setError(t('errDate')); return }
    if (!form.owner_user_id)   { setError(t('errOwner')); return }

    setLoading(true)
    setError(null)

    const payload = {
      ...form,
      title:        form.title.trim(),
      description:  form.description  || null,
      milestone_id: form.milestone_id || null,
      notes:        form.notes        || null,
      effort_hours: Number(form.effort_hours),
    }

    const url    = isEditing ? `/api/work-tasks/${task.id}` : '/api/work-tasks'
    const method = isEditing ? 'PATCH' : 'POST'

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    setLoading(false)
    if (json.error) { setError(json.error); return }
    onSuccess(json.data)
  }

  const ownerUser = users.find((u) => u.id === form.owner_user_id)

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Row 1: Type + Title */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>{t('taskType')}</label>
          <select value={form.task_type} onChange={set('task_type')} className={INPUT}>
            {(['fixed', 'adhoc'] as WorkTaskType[]).map((tt) => (
              <option key={tt} value={tt}>{WORK_TASK_TYPE_LABELS[tt]}</option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className={LABEL}>{t('titleField')}</label>
          <input value={form.title} onChange={set('title')} placeholder={t('titlePlaceholder')} className={INPUT} />
        </div>
      </div>

      {/* Row 2: Date + Department + Effort + Status */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>{t('date')}</label>
          <input type="date" value={form.task_date} onChange={set('task_date')} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>{t('department')}</label>
          <select value={form.department} onChange={set('department')} className={INPUT}>
            {DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('hours')}</label>
          <select value={form.effort_hours} onChange={set('effort_hours')} className={INPUT}>
            {([2, 4, 8] as WorkTaskEffort[]).map((h) => (
              <option key={h} value={h}>{EFFORT_LABELS[h]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('status')}</label>
          <select value={form.status} onChange={set('status')} className={INPUT}>
            {WORK_TASK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Milestone */}
      <div>
        <label className={LABEL}>{t('milestone')}</label>
        <select value={form.milestone_id} onChange={set('milestone_id')} className={INPUT}>
          <option value="">{t('milestoneNone')}</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </div>

      {/* Row 4: Owner + Executors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>{t('owner')}</label>
          <select value={form.owner_user_id} onChange={set('owner_user_id')} className={INPUT}>
            <option value="">{t('ownerSelect')}</option>
            {EXPENSE_USER_OPTIONS.map((name) => {
              const u = users.find((u) => u.name === name || u.user_code === name)
              return u ? (
                <option key={u.id} value={u.id}>{u.name}</option>
              ) : (
                <option key={name} value={name} disabled>{name}</option>
              )
            })}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('assignees')}</label>
          <div className="flex flex-wrap gap-1.5 border border-slate-200 rounded-lg p-2 min-h-[38px]">
            {users.filter((u) => u.id !== form.owner_user_id).map((u) => {
              const selected = form.executor_ids.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleExecutor(u.id)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {u.name}
                </button>
              )
            })}
            {users.length === 0 && (
              <span className="text-xs text-slate-400">{tCommon('loading')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: Description + Notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>{t('description')}</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder={t('descriptionPlaceholder')} className={`${INPUT} resize-none`} />
        </div>
        <div>
          <label className={LABEL}>{t('notes')}</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder={t('notesPlaceholder')} className={`${INPUT} resize-none`} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? tCommon('saveChanges') : t('submitCreate')}
        </Button>
      </div>
    </form>
  )
}
