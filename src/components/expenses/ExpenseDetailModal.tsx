'use client'

import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import type { Expense, ExpenseCategory, ExpensePaymentStatus } from '@/lib/types'
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

const STATUS_COLOR: Record<ExpensePaymentStatus, string> = {
  budgeted:           'bg-zinc-100 text-zinc-600',
  ordered_unpaid:     'bg-amber-100 text-amber-700',
  paid:               'bg-green-100 text-green-700',
  refunded:           'bg-red-100 text-red-600',
  partially_refunded: 'bg-orange-100 text-orange-700',
}

const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  tangible_asset:  'bg-primary-soft text-primary',
  salary:          'bg-amber-100 text-amber-700',
  rent:            'bg-emerald-100 text-emerald-700',
  travel:          'bg-blue-100 text-blue-700',
  office_supplies: 'bg-purple-100 text-purple-700',
  cloud_services:  'bg-pink-100 text-pink-700',
}

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
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-zinc-100 last:border-b-0">
      <div className="text-xs text-zinc-500 font-medium pt-0.5">{label}</div>
      <div className="col-span-2 text-sm text-zinc-900 break-words">{children}</div>
    </div>
  )

  return (
    <Modal open={!!expense} onClose={onClose} title={t('details')} width="max-w-2xl">
      <div className="space-y-0">
        <Row label={t('category')}>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CATEGORY_COLOR[cat]}`}>
            {t(`categories.${cat}`)}
          </span>
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
              <span className="text-amber-700">+{fmtRmb(crossBorderFee(expense))}</span>
            </Row>
            <Row label={t('effectiveCost')}>
              <span className="font-semibold text-zinc-900">{fmtRmb(effectiveCost(expense))}</span>
            </Row>
          </>
        )}

        <Row label={t('date')}>{expense.expense_date}</Row>

        {showPeriod && (
          <Row label={t('period')}>{expense.period || <span className="text-zinc-400">—</span>}</Row>
        )}

        <Row label={t('purpose')}>
          {expense.purpose || <span className="text-zinc-400">—</span>}
        </Row>

        {showLocation && (
          <Row label={t('location')}>
            {expense.location || <span className="text-zinc-400">—</span>}
          </Row>
        )}

        <Row label={cat === 'salary' ? tForm('assignedPerson') : t('user')}>
          {expense.user_name || <span className="text-zinc-400">—</span>}
        </Row>

        <Row label={t('buyer')}>
          {expense.buyer_name || <span className="text-zinc-400">—</span>}
        </Row>

        <Row label={t('paymentMethod')}>
          {expense.payment_method
            ? t(`paymentMethods.${expense.payment_method}`)
            : expense.payment_method_legacy
              ? <span className="text-amber-600 text-xs">{expense.payment_method_legacy}</span>
              : <span className="text-zinc-400">—</span>}
        </Row>

        <Row label={t('paymentStatus')}>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[expense.payment_status]}`}>
            {t(`paymentStatuses.${expense.payment_status}`)}
          </span>
        </Row>

        <Row label={t('notes')}>
          {expense.notes
            ? <span className="whitespace-pre-wrap">{expense.notes}</span>
            : <span className="text-zinc-400">—</span>}
        </Row>

        <Row label={t('createdAt')}>
          <span className="text-zinc-500">{fmtDateTime(expense.created_at)}</span>
        </Row>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          {tCommon('close')}
        </button>
      </div>
    </Modal>
  )
}
