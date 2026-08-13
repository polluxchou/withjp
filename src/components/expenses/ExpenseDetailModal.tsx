'use client'

import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import { toneOf } from '@/lib/ui/status-tone'
import type { Expense } from '@/lib/types'
import {
  categoryHasQuantity,
  categoryHasPeriod,
  categoryHasLocation,
  crossBorderFee,
  effectiveCost,
  CROSS_BORDER_FEE_RATE,
} from '@/lib/expenses/costs'
import { useCurrency } from '@/lib/currency'

interface Props {
  expense: Expense | null
  onClose: () => void
}

// This is a read-only record viewer (label/value pairs), not a form — there
// are no input/select/textarea controls here to migrate to Field/Input/
// Select/Textarea. Only the status/category pills (STATUS_COLOR/
// CATEGORY_COLOR, now removed) and the footer close button are in scope.

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

export default function ExpenseDetailModal({ expense, onClose }: Props) {
  const t = useTranslations('expenses')
  const tForm = useTranslations('expenses.form')
  const tCommon = useTranslations('common')
  const { fmt: fmtRmb } = useCurrency()

  if (!expense) return null

  const cat = expense.expense_category
  const showQty      = categoryHasQuantity(cat)
  const showPeriod   = categoryHasPeriod(cat)
  const showLocation = categoryHasLocation(cat)

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-line-soft last:border-b-0">
      <div className="text-xs text-ink-500 font-medium pt-0.5">{label}</div>
      <div className="col-span-2 text-sm text-ink-900 break-words">{children}</div>
    </div>
  )

  return (
    <Modal
      open={!!expense}
      onClose={onClose}
      title={t('details')}
      width="max-w-2xl"
      footer={<Button variant="secondary" onClick={onClose}>{tCommon('close')}</Button>}
    >
      <div className="space-y-0">
        {/* Category isn't a status enum (no toneOf registration) — plain text
            keeps it from implying a semantic color it doesn't have. */}
        <Row label={t('category')}>
          <span className="font-medium">{t(`categories.${cat}`)}</span>
        </Row>

        <Row label={t('name')}>
          <span className="font-medium">{expense.item_name}</span>
        </Row>

        {showQty && (
          <>
            <Row label={tForm('unitPrice')}>{fmtRmb(Number(expense.unit_price))}</Row>
            <Row label={tForm('quantity')}>{expense.quantity}</Row>
          </>
        )}

        <Row label={t('amount')}>
          <span className="font-semibold">{fmtRmb(Number(expense.total_price))}</span>
        </Row>

        {crossBorderFee(expense) > 0 && (
          <>
            <Row label={t('crossBorderFee', { rate: `${(CROSS_BORDER_FEE_RATE * 100).toFixed(0)}%` })}>
              <span className="text-warning-text">+{fmtRmb(crossBorderFee(expense))}</span>
            </Row>
            <Row label={t('effectiveCost')}>
              <span className="font-semibold text-ink-900">{fmtRmb(effectiveCost(expense))}</span>
            </Row>
          </>
        )}

        <Row label={t('date')}>{expense.expense_date}</Row>

        {showPeriod && (
          <Row label={t('period')}>{expense.period || <span className="text-ink-400">—</span>}</Row>
        )}

        <Row label={t('purpose')}>
          {expense.purpose || <span className="text-ink-400">—</span>}
        </Row>

        {showLocation && (
          <Row label={t('location')}>
            {expense.location || <span className="text-ink-400">—</span>}
          </Row>
        )}

        <Row label={cat === 'salary' ? tForm('assignedPerson') : t('user')}>
          {expense.user_name || <span className="text-ink-400">—</span>}
        </Row>

        <Row label={t('buyer')}>
          {expense.buyer_name || <span className="text-ink-400">—</span>}
        </Row>

        <Row label={t('paymentMethod')}>
          {expense.payment_method
            ? t(`paymentMethods.${expense.payment_method}`)
            : expense.payment_method_legacy
              ? <span className="text-warning-text text-xs">{expense.payment_method_legacy}</span>
              : <span className="text-ink-400">—</span>}
        </Row>

        <Row label={t('paymentStatus')}>
          <Tag tone={toneOf('expense', expense.payment_status)} label={t(`paymentStatuses.${expense.payment_status}`)} />
        </Row>

        <Row label={t('notes')}>
          {expense.notes
            ? <span className="whitespace-pre-wrap">{expense.notes}</span>
            : <span className="text-ink-400">—</span>}
        </Row>

        <Row label={t('createdAt')}>
          <span className="text-ink-500">{fmtDateTime(expense.created_at)}</span>
        </Row>
      </div>
    </Modal>
  )
}
