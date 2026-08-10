'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Title — no native `required` (handleSubmit does its own JS check +
          error banner instead of browser-native validation), same rationale
          as CreatorForm.tsx: the literal " *" already baked into
          t('form.title') carries the visual required-marker, so Field's own
          `required` prop (which would add a real `required` attribute AND a
          second asterisk) is deliberately omitted here and on every other
          "*"-suffixed field below. */}
      <Field label={t('form.title')}>
        <Input value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder={t('form.titlePlaceholder')} />
      </Field>

      {/* Description */}
      <Field label={t('form.description')}>
        <Textarea rows={2} value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder={t('form.descriptionPlaceholder')} />
      </Field>

      {/* Type + Level */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('form.type')}>
          <Select value={form.type}
            onChange={e => set('type', e.target.value as MilestoneType)}>
            {TYPE_VALUES.map(v => <option key={v} value={v}>{t(`type.${v}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('form.level')}>
          <Select value={form.level}
            onChange={e => set('level', e.target.value as MilestoneLevel)}>
            {LEVEL_VALUES.map(v => <option key={v} value={v}>{t(`form.levelValue.${v}`)}</option>)}
          </Select>
        </Field>
      </div>

      {/* Priority + Risk */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('form.priority')}>
          <Select value={form.priority}
            onChange={e => set('priority', e.target.value as MilestonePriority)}>
            {PRIORITY_VALUES.map(v => <option key={v} value={v}>{t(`form.priorityValue.${v}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('form.riskLevel')}>
          <Select value={form.risk_level}
            onChange={e => set('risk_level', e.target.value as RiskLevel)}>
            {RISK_VALUES.map(v => <option key={v} value={v}>{t(`form.riskValue.${v}`)}</option>)}
          </Select>
        </Field>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('form.startDate')}>
          <Input type="date" value={form.start_date}
            onChange={e => set('start_date', e.target.value)} />
        </Field>
        <Field label={t('form.targetDate')}>
          <Input type="date" value={form.target_date}
            onChange={e => set('target_date', e.target.value)} />
        </Field>
      </div>

      {/* Owner Agent */}
      <Field label={t('form.ownerAgent')}>
        <Select value={form.owner_agent_id}
          onChange={e => set('owner_agent_id', e.target.value)}>
          <option value="">{t('form.ownerAgentNone')}</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
          ))}
        </Select>
      </Field>

      {/* Involved Agents — a checkbox GROUP, not a single control, so it
          can't go through Field's one-child cloning (same composite-field
          rationale as CreatorForm.tsx's broadcast-account row). Unlike a
          plain hand-rolled <label> (which associates with nothing — there's
          no single control for htmlFor to point at), <fieldset>/<legend> is
          the correct native grouping semantic for "one caption over N
          checkboxes"; border-0/p-0/m-0 strip the browser's default fieldset
          box so it still reads as plain text, matching the original
          label's visual weight exactly. */}
      {agents.length > 0 && (
        <fieldset className="min-w-0 m-0 border-0 p-0">
          <legend className="block text-xs font-medium text-ink-700 mb-1.5 p-0">{t('form.involvedAgents')}</legend>
          <div className="border border-line rounded-field p-2.5 space-y-1.5 max-h-32 overflow-y-auto">
            {agents.map(a => (
              <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={form.involved_agent_ids.includes(a.id)}
                  onChange={e => toggleAgent(a.id, e.target.checked)}
                  className="rounded accent-primary" />
                <span className="text-ink-700">{a.name}</span>
                <span className="text-ink-400 text-xs">({a.role})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Success Metric — three inputs sharing one visual heading. The
          heading stays a plain <label> (it's not `htmlFor`-linked to any
          one of the three, so it's decorative, not an accessible name) —
          each Input instead gets its own aria-label reusing the same copy
          already shown as its placeholder, so a screen reader still
          announces a real name per field even after the placeholder itself
          is gone (placeholders aren't reliably exposed as an accessible
          name across browsers/AT). */}
      <div className="min-w-0">
        <label className="block text-xs font-medium text-ink-700 mb-1.5">{t('form.successMetric')}</label>
        <div className="grid grid-cols-3 gap-2">
          <Input aria-label={t('form.metricName')} placeholder={t('form.metricName')}
            value={form.metric_name} onChange={e => set('metric_name', e.target.value)} />
          <Input aria-label={t('form.metricTarget')} placeholder={t('form.metricTarget')}
            value={form.metric_target} onChange={e => set('metric_target', e.target.value)} />
          <Input aria-label={t('form.metricUnit')} placeholder={t('form.metricUnit')}
            value={form.metric_unit} onChange={e => set('metric_unit', e.target.value)} />
        </div>
      </div>

      {/* Notes */}
      <Field label={t('form.notes')}>
        <Textarea rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder={t('form.notesPlaceholder')} />
      </Field>

      {error && (
        <div role="alert" className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={saving}>
          {initial?.id ? tCommon('saveChanges') : t('form.createBtn')}
        </Button>
      </div>
    </form>
  )
}
