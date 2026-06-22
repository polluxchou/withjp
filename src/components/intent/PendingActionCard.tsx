'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import type { Expense } from '@/lib/types'
import type { ExpenseWritePayload } from '@/lib/intent/schema'

export interface PendingActionState {
  pendingActionId: string
  op:              'create' | 'update' | 'delete'
  preview:         string
  targetId?:       string
  expiresAt:       string
  // For Edit-flow only: the writer needs to know the intended payload.
  payload?:        ExpenseWritePayload   // create
  patch?:          ExpenseWritePayload   // update
  target?:         Expense               // update / delete
}

interface Props {
  state:    PendingActionState
  onApplied: () => void
  onCancel:  () => void
}

export default function PendingActionCard({ state, onApplied, onCancel }: Props) {
  const t = useTranslations('intent.pending')
  const tCommon = useTranslations('common')
  const [busy,     setBusy]     = useState<'apply' | 'cancel' | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [editing,  setEditing]  = useState(false)
  const canEdit = state.op !== 'delete'

  async function apply() {
    setBusy('apply'); setError(null)
    const res = await fetch(`/api/intent/pending-actions/${state.pendingActionId}`, { method: 'POST' })
    const json = await res.json()
    setBusy(null)
    if (json.error) { setError(json.error); return }
    onApplied()
  }

  async function cancel() {
    setBusy('cancel'); setError(null)
    const res = await fetch(`/api/intent/pending-actions/${state.pendingActionId}`, { method: 'DELETE' })
    const json = await res.json()
    setBusy(null)
    if (json.error) { setError(json.error); return }
    onCancel()
  }

  async function onEditSuccess() {
    // Form already wrote the row directly. Cancel the staged pending_action.
    await fetch(`/api/intent/pending-actions/${state.pendingActionId}`, { method: 'DELETE' }).catch(() => {})
    setEditing(false)
    onApplied()
  }

  // Build the form's source object for Edit mode.
  const formExpense    = state.op === 'update' && state.target
    ? mergeExpense(state.target, state.patch ?? {})
    : undefined
  const formDuplicate  = state.op === 'create' && state.payload
    ? payloadAsExpense(state.payload)
    : undefined

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500">
        {t('autoExpire', { expiry: formatExpiry(state.expiresAt) })}
      </div>

      <pre className="text-sm text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed">
        {state.preview}
      </pre>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost"     onClick={cancel} loading={busy === 'cancel'} disabled={busy !== null}>{tCommon('cancel')}</Button>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>{tCommon('edit')}</Button>
        )}
        <Button variant="primary"   onClick={apply}  loading={busy === 'apply'}  disabled={busy !== null}>{t('apply')}</Button>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={t('editModalTitle')} width="max-w-2xl">
        <ExpenseForm
          expense={formExpense}
          duplicateFrom={formDuplicate}
          onSuccess={onEditSuccess}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function mergeExpense(target: Expense, patch: ExpenseWritePayload): Expense {
  return {
    ...target,
    expense_category: patch.expense_category ?? target.expense_category,
    item_name:        patch.item_name        ?? target.item_name,
    unit_price:       patch.unit_price       ?? target.unit_price,
    quantity:         patch.quantity         ?? target.quantity,
    expense_date:     patch.expense_date     ?? target.expense_date,
    location:         patch.location         ?? target.location,
    purpose:          patch.purpose          ?? target.purpose,
    period:           'period'         in patch ? patch.period         ?? null : target.period,
    user_name:        patch.user_name        ?? target.user_name,
    buyer_name:       patch.buyer_name       ?? target.buyer_name,
    payment_method:   'payment_method' in patch ? patch.payment_method ?? null : target.payment_method,
    payment_status:   patch.payment_status   ?? target.payment_status,
    notes:            'notes'          in patch ? patch.notes          ?? null : target.notes,
  }
}

function payloadAsExpense(p: ExpenseWritePayload): Expense {
  // ExpenseForm reads from .id only when treating the source as "editing"; with
  // duplicateFrom it reads field values only. So a synthetic id is fine.
  return {
    id:                    '',
    expense_category:      p.expense_category ?? 'tangible_asset',
    item_name:             p.item_name        ?? '',
    unit_price:            p.unit_price       ?? 0,
    quantity:              p.quantity         ?? 1,
    total_price:           (p.unit_price ?? 0) * (p.quantity ?? 1),
    expense_date:          p.expense_date     ?? '',
    location:              p.location         ?? '',
    purpose:               p.purpose          ?? '',
    period:                p.period           ?? null,
    user_name:             p.user_name        ?? '',
    buyer_name:            p.buyer_name       ?? '',
    payment_method:        p.payment_method   ?? null,
    payment_method_legacy: null,
    payment_status:        p.payment_status   ?? 'budgeted',
    notes:                 p.notes            ?? null,
    created_by_user_id:    null,
    created_at:            '',
    updated_at:            '',
  }
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
