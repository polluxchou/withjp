'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import {
  WORK_TASK_TYPE_LABELS,
  WORK_TASK_STATUS_OPTIONS,
  DEPARTMENT_OPTIONS,
  EFFORT_LABELS,
} from '@/lib/work-tasks/cost'
import { WORK_TASK_REPEAT_INTERVAL_LABELS } from '@/lib/types'
import { prefillFromItem } from '@/lib/work-tasks/org-link'
import type {
  WorkTask, WorkTaskType, WorkTaskStatus, AgentRole, WorkTaskEffort, WorkTaskRepeatInterval,
  OrgSnapshot, Business, BusinessTask, TaskItem, Position,
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

const REPEAT_OPTIONS = Object.entries(WORK_TASK_REPEAT_INTERVAL_LABELS) as [WorkTaskRepeatInterval, string][]

export default function WorkTaskForm({ task, duplicateFrom, defaultDate, onSuccess, onCancel }: Props) {
  const t = useTranslations('workTasks.form')
  const tCommon = useTranslations('common')
  const source    = task ?? duplicateFrom
  const isEditing = !!task

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [users,      setUsers]      = useState<UserOption[]>([])

  const [org,            setOrg]            = useState<OrgSnapshot | null>(null)
  const [selBusinessId,  setSelBusinessId]  = useState('')
  const [selTaskId,      setSelTaskId]      = useState('')
  const [ownerFromCreator, setOwnerFromCreator] = useState(false)

  const [form, setForm] = useState({
    task_type:            (source?.task_type            ?? 'adhoc')  as WorkTaskType,
    title:                source?.title                 ?? '',
    description:          source?.description           ?? '',
    department:           (source?.department           ?? 'ops')    as AgentRole,
    milestone_id:         source?.milestone_id          ?? '',
    owner_user_id:        source?.owner_user_id         ?? '',
    reviewer_user_id:     source?.reviewer_user_id      ?? '',
    executor_ids:         source?.executor_ids          ?? [] as string[],
    task_date:            source?.task_date             ?? defaultDate ?? '',
    due_date:             source?.due_date              ?? '',
    effort_hours:         (source?.effort_hours         ?? 2)        as WorkTaskEffort,
    repeat_interval:      (source?.repeat_interval      ?? '')       as WorkTaskRepeatInterval | '',
    completion_criteria:  source?.completion_criteria   ?? '',
    status:               (source?.status               ?? 'planned') as WorkTaskStatus,
    notes:                source?.notes                 ?? '',
    business_task_item_id:   source?.business_task_item_id   ?? '',
    business_task_item_name: source?.business_task_item_name ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Title fuzzy search
  const [suggestions,     setSuggestions]     = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 三个请求相互独立,任一失败都不应拖垮其它(否则会导致负责人/事项等选项加载不出)
    fetch('/api/milestones').then((r) => r.json()).then((ms) => setMilestones(ms.data ?? [])).catch(() => {})
    fetch('/api/users').then((r) => r.json()).then((us) => setUsers(us.data ?? [])).catch(() => {})
    fetch('/api/org').then((r) => r.json()).then((orgRes) => {
      const snap: OrgSnapshot | null = orgRes.data ?? null
      setOrg(snap)
      const existingItemId = source?.business_task_item_id
      if (snap && existingItemId) {
        for (const b of snap.businesses) {
          for (const tk of b.tasks) {
            if (tk.items.some((it) => it.id === existingItemId)) {
              setSelBusinessId(b.id)
              setSelTaskId(tk.id)
            }
          }
        }
      }
    }).catch(() => {})
  }, [source?.business_task_item_id])

  // Debounced title search
  useEffect(() => {
    const q = form.title.trim()
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const timer = setTimeout(async () => {
      const res  = await fetch(`/api/work-tasks?title_search=${encodeURIComponent(q)}&limit=8`)
      const json = await res.json()
      const titles = (json.data ?? []).map((t: WorkTask) => t.title) as string[]
      const unique  = Array.from(new Set(titles)).filter((t) => t !== q)
      setSuggestions(unique.slice(0, 5))
      setShowSuggestions(unique.length > 0)
    }, 300)
    return () => clearTimeout(timer)
  }, [form.title])

  // Close suggestions on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
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

  function pickSuggestion(title: string) {
    setForm((f) => ({ ...f, title }))
    setShowSuggestions(false)
  }

  const businesses: Business[] = org?.businesses ?? []
  const posKeyById = new Map<string, string>((org?.positions ?? []).map((p: Position) => [p.id, p.key]))
  const tasksOfBiz: BusinessTask[] = businesses.find((b) => b.id === selBusinessId)?.tasks ?? []
  const itemsOfTask: TaskItem[] = tasksOfBiz.find((t) => t.id === selTaskId)?.items ?? []

  function onPickItem(itemId: string) {
    const task = tasksOfBiz.find((t) => t.id === selTaskId)
    const item = task?.items.find((it) => it.id === itemId)
    if (!task || !item) {
      setOwnerFromCreator(false)
      setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' }))
      return
    }
    const posKeys = task.position_ids.map((pid) => posKeyById.get(pid)).filter(Boolean) as string[]
    const p = prefillFromItem(item, posKeys)
    setOwnerFromCreator(p.ownerIsCreator)
    setForm((f) => ({
      ...f,
      business_task_item_id:   p.business_task_item_id,
      business_task_item_name: p.business_task_item_name,
      title:                   f.title.trim() ? f.title : p.title,
      owner_user_id:           p.owner_user_id ?? f.owner_user_id,
      department:              (p.department ?? f.department) as AgentRole,
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.business_task_item_id) { setError(t('errItem')); return }
    if (!form.title.trim())    { setError(t('errTitle')); return }
    if (!form.task_date)       { setError(t('errDate')); return }
    if (!form.owner_user_id)   { setError(t('errOwner')); return }

    setLoading(true)
    setError(null)

    const payload = {
      ...form,
      title:               form.title.trim(),
      description:         form.description         || null,
      milestone_id:        form.milestone_id        || null,
      reviewer_user_id:    form.reviewer_user_id    || null,
      due_date:            form.due_date            || null,
      repeat_interval:     form.repeat_interval     || null,
      completion_criteria: form.completion_criteria || null,
      notes:               form.notes               || null,
      effort_hours:        Number(form.effort_hours),
    }

    const url    = isEditing ? `/api/work-tasks/${task.id}` : '/api/work-tasks'
    const method = isEditing ? 'PATCH' : 'POST'

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    setLoading(false)
    if (json.error) { setError(json.error); return }
    onSuccess(json.data)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">{error}</div>
      )}

      {/* Row 0: 业务 → 任务 → 事项(必填) */}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('selectBusiness')}>
          <Select value={selBusinessId}
            onChange={(e) => { setSelBusinessId(e.target.value); setSelTaskId(''); setOwnerFromCreator(false); setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' })) }}>
            <option value="">{t('itemPlaceholder')}</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label={t('selectTask')}>
          <Select value={selTaskId} disabled={!selBusinessId}
            onChange={(e) => { setSelTaskId(e.target.value); setOwnerFromCreator(false); setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' })) }}>
            <option value="">{t('selectTask')}</option>
            {tasksOfBiz.map((tk) => <option key={tk.id} value={tk.id}>{tk.name}</option>)}
          </Select>
        </Field>
        <Field label={t('itemField')}>
          <Select value={form.business_task_item_id} disabled={!selTaskId}
            onChange={(e) => onPickItem(e.target.value)}>
            <option value="">{t('selectItem')}</option>
            {itemsOfTask.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </Select>
        </Field>
      </div>
      {ownerFromCreator && (
        <div className="text-xs text-warning-text">{t('ownerFromCreatorHint')}</div>
      )}

      {/* Row 1: Type + Title with fuzzy suggestions */}
      <div className="grid grid-cols-4 gap-3">
        <Field label={t('taskType')}>
          <Select value={form.task_type} onChange={set('task_type')}>
            {(['fixed', 'adhoc'] as WorkTaskType[]).map((tt) => (
              <option key={tt} value={tt}>{WORK_TASK_TYPE_LABELS[tt]}</option>
            ))}
          </Select>
        </Field>
        <div className="col-span-3 relative" ref={suggestionsRef}>
          <Field label={t('titleField')}>
            <Input
              value={form.title}
              onChange={set('title')}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder={t('titleSuggestionPlaceholder')}
              autoComplete="off"
            />
          </Field>
          {showSuggestions && (
            <ul className="absolute z-20 top-full mt-1 w-full bg-surface border border-line rounded-field shadow-pop overflow-hidden text-sm">
              {suggestions.map((s) => (
                <li
                  key={s}
                  onMouseDown={() => pickSuggestion(s)}
                  className="px-3 py-2 cursor-pointer hover:bg-primary-soft text-ink-700 truncate"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row 2: Start date + Due date + Department + Effort */}
      <div className="grid grid-cols-4 gap-3">
        <Field label={t('date')}>
          <Input type="date" value={form.task_date} onChange={set('task_date')} />
        </Field>
        <Field label={t('dueDate')}>
          <Input type="date" value={form.due_date} onChange={set('due_date')} />
        </Field>
        <Field label={t('department')}>
          <Select value={form.department} onChange={set('department')}>
            {DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('hours')}>
          <Select value={form.effort_hours} onChange={set('effort_hours')}>
            {([2, 4, 8] as WorkTaskEffort[]).map((h) => (
              <option key={h} value={h}>{EFFORT_LABELS[h]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Row 3: Status + Repeat interval (only for fixed tasks) */}
      <div className="grid grid-cols-4 gap-3">
        <Field label={t('status')}>
          <Select value={form.status} onChange={set('status')}>
            {WORK_TASK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        {form.task_type === 'fixed' && (
          <Field label={t('repeatInterval')}>
            <Select value={form.repeat_interval} onChange={set('repeat_interval')}>
              <option value="">{t('noRepeat')}</option>
              {REPEAT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {/* Row 4: Milestone */}
      <Field label={t('milestone')}>
        <Select value={form.milestone_id} onChange={set('milestone_id')}>
          <option value="">{t('milestoneNone')}</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </Select>
      </Field>

      {/* Row 5: Owner + Reviewer + Executors */}
      <div className="grid grid-cols-4 gap-3">
        <Field label={t('owner')}>
          <Select value={form.owner_user_id} onChange={set('owner_user_id')}>
            <option value="">{t('ownerSelect')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('reviewer')}>
          <Select value={form.reviewer_user_id} onChange={set('reviewer_user_id')}>
            <option value="">{t('reviewerNone')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2">
          <Field label={t('assignees')}>
            <div role="group" aria-label={t('assignees')} className="flex flex-wrap gap-1.5 border border-line-strong rounded-field p-2 min-h-[38px]">
              {users.filter((u) => u.id !== form.owner_user_id).map((u) => {
                const selected = form.executor_ids.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleExecutor(u.id)}
                    className={`px-2 py-0.5 rounded-btn text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
                      selected
                        ? 'bg-primary text-white'
                        : 'bg-muted-soft text-muted-text hover:bg-line-soft'
                    }`}
                  >
                    {u.name}
                  </button>
                )
              })}
              {users.length === 0 && (
                <span className="text-xs text-ink-400">{tCommon('loading')}</span>
              )}
            </div>
          </Field>
        </div>
      </div>

      {/* Row 6: Completion criteria */}
      <Field label={t('completionCriteria')}>
        <Textarea
          value={form.completion_criteria}
          onChange={set('completion_criteria')}
          rows={2}
          placeholder={t('completionCriteriaPlaceholder')}
        />
      </Field>

      {/* Row 7: Description + Notes */}
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('description')}>
          <Textarea value={form.description} onChange={set('description')} rows={2}
            placeholder={t('descriptionPlaceholder')} />
        </Field>
        <Field label={t('notes')}>
          <Textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder={t('notesPlaceholder')} />
        </Field>
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
