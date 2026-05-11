'use client'

import { useState, useEffect } from 'react'
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
    if (!form.title.trim())    { setError('任务标题不能为空'); return }
    if (!form.task_date)       { setError('日期不能为空'); return }
    if (!form.owner_user_id)   { setError('请选择负责人'); return }

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
          <label className={LABEL}>任务类型</label>
          <select value={form.task_type} onChange={set('task_type')} className={INPUT}>
            {(['fixed', 'adhoc'] as WorkTaskType[]).map((t) => (
              <option key={t} value={t}>{WORK_TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className={LABEL}>任务标题 *</label>
          <input value={form.title} onChange={set('title')} placeholder="任务标题" className={INPUT} />
        </div>
      </div>

      {/* Row 2: Date + Department + Effort + Status */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>日期 *</label>
          <input type="date" value={form.task_date} onChange={set('task_date')} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>部门</label>
          <select value={form.department} onChange={set('department')} className={INPUT}>
            {DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>工时</label>
          <select value={form.effort_hours} onChange={set('effort_hours')} className={INPUT}>
            {([2, 4, 8] as WorkTaskEffort[]).map((h) => (
              <option key={h} value={h}>{EFFORT_LABELS[h]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>状态</label>
          <select value={form.status} onChange={set('status')} className={INPUT}>
            {WORK_TASK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Milestone */}
      <div>
        <label className={LABEL}>关联目标（战略时间轴）</label>
        <select value={form.milestone_id} onChange={set('milestone_id')} className={INPUT}>
          <option value="">不关联目标</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </div>

      {/* Row 4: Owner + Executors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>负责人 *</label>
          <select value={form.owner_user_id} onChange={set('owner_user_id')} className={INPUT}>
            <option value="">请选择负责人</option>
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
          <label className={LABEL}>执行人（多选）</label>
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
              <span className="text-xs text-slate-400">加载中...</span>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: Description + Notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>任务描述</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="任务详情" className={`${INPUT} resize-none`} />
        </div>
        <div>
          <label className={LABEL}>备注</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="可选备注" className={`${INPUT} resize-none`} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>取消</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? '保存更改' : '创建任务'}
        </Button>
      </div>
    </form>
  )
}
