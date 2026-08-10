'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import type { AgentRole } from '@/lib/types'

interface SalaryRecord {
  id:             string
  user_id:        string
  monthly_salary: number
  effective_from: string
  effective_to:   string | null
  notes:          string | null
  user: {
    id:        string
    name:      string
    user_code: string
    role:      AgentRole
  }
}

interface UserOption { id: string; name: string; user_code: string; role: AgentRole }

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function SalaryManager() {
  const t = useTranslations('workTasks.salary')
  const tWorkTasks = useTranslations('workTasks')
  const tCommon = useTranslations('common')
  const [records,  setRecords]  = useState<SalaryRecord[]>([])
  const [users,    setUsers]    = useState<UserOption[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing,  setEditing]  = useState<SalaryRecord | null>(null)
  const [deleting, setDeleting] = useState<SalaryRecord | null>(null)
  const [delLoading, setDelLoading] = useState(false)

  const [form, setForm] = useState({
    user_id:        '',
    monthly_salary: '',
    effective_from: '',
    effective_to:   '',
    notes:          '',
  })
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [sr, ur] = await Promise.all([
        fetch('/api/user-salary').then((r) => {
          if (!r.ok) { console.error('Failed to load salary records:', r.status); throw new Error(tCommon('loadFailed')) }
          return r.json()
        }),
        fetch('/api/users').then((r) => {
          if (!r.ok) { console.error('Failed to load users:', r.status); throw new Error(tCommon('loadFailed')) }
          return r.json()
        }),
      ])
      setRecords(sr.data ?? [])
      setUsers(ur.data ?? [])
    } catch (err) {
      console.error('Failed to load salary records:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ user_id: '', monthly_salary: '', effective_from: '', effective_to: '', notes: '' })
    setFormError(null)
    setCreating(true)
  }

  function openEdit(r: SalaryRecord) {
    setForm({
      user_id:        r.user_id,
      monthly_salary: String(r.monthly_salary),
      effective_from: r.effective_from,
      effective_to:   r.effective_to ?? '',
      notes:          r.notes ?? '',
    })
    setFormError(null)
    setEditing(r)
  }

  async function handleSave() {
    if (!form.user_id)         { setFormError(t('errEmployee')); return }
    if (!form.monthly_salary)  { setFormError(t('errMonthly')); return }
    if (!form.effective_from)  { setFormError(t('errEffective')); return }
    if (Number(form.monthly_salary) < 0) { setFormError(t('errNegative')); return }

    setSaving(true)
    setFormError(null)

    const payload = {
      user_id:        form.user_id,
      monthly_salary: Number(form.monthly_salary),
      effective_from: form.effective_from,
      effective_to:   form.effective_to || null,
      notes:          form.notes || null,
    }

    let res
    if (editing) {
      res = await fetch(`/api/user-salary/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch('/api/user-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    const json = await res.json()
    setSaving(false)

    if (json.error) { setFormError(json.error); return }

    setCreating(false)
    setEditing(null)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    setDelLoading(true)
    await fetch(`/api/user-salary/${deleting.id}`, { method: 'DELETE' })
    setDelLoading(false)
    setDeleting(null)
    load()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{t('title')}</h3>
          <p className="text-xs text-ink-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> {t('addRecord')}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState variant="plain" />
      ) : loadError ? (
        <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
      ) : records.length === 0 ? (
        <EmptyState title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          <Table label={t('title')}>
            <THead>
              <Th>{t('tableEmployee')}</Th>
              <Th>{t('tableDepartment')}</Th>
              <Th align="right">{t('tableMonthly')}</Th>
              <Th>{t('tableEffectiveFrom')}</Th>
              <Th>{t('tableEffectiveTo')}</Th>
              <Th>{t('tableNotes')}</Th>
              <Th align="right">{t('tableActions')}</Th>
            </THead>
            <TBody>
              {records.map((r) => {
                const isCurrent = !r.effective_to
                // Hoisted once per row and applied to every Td (including
                // actions, which the ternary-per-cell version had missed) —
                // a lapsed salary record should read as dimmed end-to-end,
                // not have its edit/delete buttons stay at full opacity.
                const dim = isCurrent ? '' : 'opacity-60'
                return (
                  <Tr key={r.id}>
                    <Td className={dim}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary">
                          {r.user.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-ink-900">{r.user.name}</span>
                        {isCurrent && <Tag size="sm" tone="success" label={t('current')} />}
                      </div>
                    </Td>
                    <Td className={dim}>{tWorkTasks(`department.${r.user.role}`)}</Td>
                    <Td align="right" numeric className={dim}>{fmtRmb(r.monthly_salary)}</Td>
                    <Td className={dim}>{r.effective_from}</Td>
                    <Td className={`text-ink-400 ${dim}`}>{r.effective_to ?? '—'}</Td>
                    <Td className={`text-ink-400 max-w-[160px] truncate ${dim}`}>{r.notes ?? '—'}</Td>
                    <Td align="right" className={dim}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="sm"
                          aria-label={t('editTooltip')} title={t('editTooltip')}
                          onClick={() => openEdit(r)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          aria-label={t('deleteTooltip')} title={t('deleteTooltip')}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null) }}
        title={editing ? t('modalEdit') : t('modalAdd')}
      >
        <div className="space-y-4">
          {formError && (
            <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('employeeField')}>
              <Select
                value={form.user_id}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                disabled={!!editing}
              >
                <option value="">{t('employeeSelect')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({tWorkTasks(`department.${u.role}`)})</option>
                ))}
              </Select>
            </Field>
            <Field label={t('monthlyField')}>
              <Input
                type="number"
                min={0}
                value={form.monthly_salary}
                onChange={(e) => setForm((f) => ({ ...f, monthly_salary: e.target.value }))}
                placeholder={t('monthlyPlaceholder')}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('effectiveFromField')}>
              <Input
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
              />
            </Field>
            <Field label={t('effectiveToField')}>
              <Input
                type="date"
                value={form.effective_to}
                onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
              />
            </Field>
          </div>

          <Field label={t('notesField')}>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t('notesPlaceholder')}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null) }}>{tCommon('cancel')}</Button>
            <Button loading={saving} onClick={handleSave}>
              {editing ? tCommon('saveChanges') : t('addRecordBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={tCommon('confirmDelete')}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              {t.rich('deleteConfirm', {
                name: deleting.user.name,
                from: deleting.effective_from,
                strong: (chunks) => <span className="font-semibold">{chunks}</span>,
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
