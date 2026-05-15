'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import type {
  Agent, Milestone,
  MilestoneType, MilestoneLevel, MilestonePriority, RiskLevel,
} from '@/lib/types'

// Option values — labels resolved at render time via t('type.<value>') etc.
const TYPE_VALUES:     MilestoneType[]     = ['campaign', 'launch', 'recruitment', 'finance', 'review']
const LEVEL_VALUES:    MilestoneLevel[]    = ['company', 'department', 'creator']
const PRIORITY_VALUES: MilestonePriority[] = ['high', 'medium', 'low']
const RISK_VALUES:     RiskLevel[]         = ['low', 'medium', 'high']

// ── Helpers ───────────────────────────────────────────────────

function toDateInput(iso: string | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function threeMonthsStr() {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  return d.toISOString().slice(0, 10)
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  initial?: Partial<Milestone>
  onSuccess: (m: Milestone) => void
  onCancel: () => void
}

interface FormState {
  title: string
  description: string
  type: MilestoneType
  level: MilestoneLevel
  priority: MilestonePriority
  risk_level: RiskLevel
  owner_agent_id: string
  involved_agent_ids: string[]
  start_date: string
  target_date: string
  metric_name: string
  metric_target: string
  metric_unit: string
  notes: string
}

export default function MilestoneForm({ initial, onSuccess, onCancel }: Props) {
  const t = useTranslations('timeline')
  const tCommon = useTranslations('common')
  const [agents, setAgents]   = useState<Agent[]>([])
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState<string | null>(null)

  const metric = initial?.success_metric as { name?: string; target?: string; unit?: string } | undefined

  const [form, setForm] = useState<FormState>({
    title:              initial?.title          ?? '',
    description:        initial?.description    ?? '',
    type:               initial?.type           ?? 'campaign',
    level:              initial?.level          ?? 'company',
    priority:           initial?.priority       ?? 'medium',
    risk_level:         initial?.risk_level     ?? 'low',
    owner_agent_id:     initial?.owner_agent_id ?? '',
    involved_agent_ids: initial?.involved_agent_ids ?? [],
    start_date:         toDateInput(initial?.start_date) || todayStr(),
    target_date:        toDateInput(initial?.target_date) || threeMonthsStr(),
    metric_name:        metric?.name   ?? '',
    metric_target:      metric?.target ?? '',
    metric_unit:        metric?.unit   ?? '',
    notes:              initial?.notes ?? '',
  })

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/agents', { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => setAgents(j.data ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const toggleAgent = (agentId: string, checked: boolean) =>
    set('involved_agent_ids', checked
      ? [...form.involved_agent_ids, agentId]
      : form.involved_agent_ids.filter(id => id !== agentId)
    )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('form.errTitle')); return }
    if (!form.start_date || !form.target_date) { setError(t('form.errDates')); return }
    if (new Date(form.start_date) >= new Date(form.target_date)) {
      setError(t('form.errDateOrder'))
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      title:              form.title.trim(),
      description:        form.description.trim() || null,
      type:               form.type,
      level:              form.level,
      priority:           form.priority,
      risk_level:         form.risk_level,
      owner_agent_id:     form.owner_agent_id || null,
      involved_agent_ids: form.involved_agent_ids,
      start_date:         `${form.start_date}T00:00:00.000Z`,
      target_date:        `${form.target_date}T00:00:00.000Z`,
      success_metric:     form.metric_name
        ? { name: form.metric_name, target: form.metric_target, unit: form.metric_unit }
        : {},
      notes: form.notes.trim() || null,
    }

    const isEdit = !!initial?.id
    try {
      const res  = await fetch(
        isEdit ? `/api/milestones/${initial!.id}` : '/api/milestones',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      )
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? t('form.errSaveFailed'))
        return
      }
      onSuccess(json.data)
    } catch {
      setError(t('form.errNetwork'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls  = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const labelCls  = 'block text-xs font-medium text-slate-600 mb-1'
  const sectionCls = 'grid grid-cols-2 gap-3'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Title */}
      <div>
        <label className={labelCls}>{t('form.title')}</label>
        <input className={inputCls} value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder={t('form.titlePlaceholder')} />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>{t('form.description')}</label>
        <textarea className={inputCls} rows={2} value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder={t('form.descriptionPlaceholder')} />
      </div>

      {/* Type + Level */}
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>{t('form.type')}</label>
          <select className={inputCls} value={form.type}
            onChange={e => set('type', e.target.value as MilestoneType)}>
            {TYPE_VALUES.map(v => <option key={v} value={v}>{t(`type.${v}`)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('form.level')}</label>
          <select className={inputCls} value={form.level}
            onChange={e => set('level', e.target.value as MilestoneLevel)}>
            {LEVEL_VALUES.map(v => <option key={v} value={v}>{t(`form.levelValue.${v}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Priority + Risk */}
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>{t('form.priority')}</label>
          <select className={inputCls} value={form.priority}
            onChange={e => set('priority', e.target.value as MilestonePriority)}>
            {PRIORITY_VALUES.map(v => <option key={v} value={v}>{t(`form.priorityValue.${v}`)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('form.riskLevel')}</label>
          <select className={inputCls} value={form.risk_level}
            onChange={e => set('risk_level', e.target.value as RiskLevel)}>
            {RISK_VALUES.map(v => <option key={v} value={v}>{t(`form.riskValue.${v}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Dates */}
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>{t('form.startDate')}</label>
          <input type="date" className={inputCls} value={form.start_date}
            onChange={e => set('start_date', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{t('form.targetDate')}</label>
          <input type="date" className={inputCls} value={form.target_date}
            onChange={e => set('target_date', e.target.value)} />
        </div>
      </div>

      {/* Owner Agent */}
      <div>
        <label className={labelCls}>{t('form.ownerAgent')}</label>
        <select className={inputCls} value={form.owner_agent_id}
          onChange={e => set('owner_agent_id', e.target.value)}>
          <option value="">{t('form.ownerAgentNone')}</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
          ))}
        </select>
      </div>

      {/* Involved Agents */}
      {agents.length > 0 && (
        <div>
          <label className={labelCls}>{t('form.involvedAgents')}</label>
          <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5 max-h-32 overflow-y-auto">
            {agents.map(a => (
              <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={form.involved_agent_ids.includes(a.id)}
                  onChange={e => toggleAgent(a.id, e.target.checked)}
                  className="rounded" />
                <span className="text-slate-700">{a.name}</span>
                <span className="text-slate-400 text-xs">({a.role})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Success Metric */}
      <div>
        <label className={labelCls}>{t('form.successMetric')}</label>
        <div className="grid grid-cols-3 gap-2">
          <input className={inputCls} placeholder={t('form.metricName')}
            value={form.metric_name} onChange={e => set('metric_name', e.target.value)} />
          <input className={inputCls} placeholder={t('form.metricTarget')}
            value={form.metric_target} onChange={e => set('metric_target', e.target.value)} />
          <input className={inputCls} placeholder={t('form.metricUnit')}
            value={form.metric_unit} onChange={e => set('metric_unit', e.target.value)} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>{t('form.notes')}</label>
        <textarea className={inputCls} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder={t('form.notesPlaceholder')} />
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={saving}>
          {initial?.id ? tCommon('saveChanges') : t('form.createBtn')}
        </Button>
      </div>
    </form>
  )
}
