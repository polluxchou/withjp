'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
  EXPENSE_USER_OPTIONS,
  categoryHasQuantity,
  categoryHasPeriod,
  categoryHasLocation,
  dateToQuarter,
} from '@/lib/expenses/costs'
import { COMPANY_ACCOUNT_BUYERS } from '@/lib/types'
import type { Expense, ExpenseCategory, ExpensePaymentMethod, ExpensePaymentStatus } from '@/lib/types'

interface FormData {
  expense_category: ExpenseCategory
  item_name:        string
  unit_price:       string
  quantity:         string
  expense_date:     string
  location:         string
  purpose:          string
  user_name:        string
  buyer_name:       string
  payment_method:   ExpensePaymentMethod | ''
  payment_status:   ExpensePaymentStatus | ''
  notes:            string
}

interface Props {
  expense?:       Expense
  duplicateFrom?: Expense
  onSuccess:      () => void
  onCancel:       () => void
}

const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
const LABEL = 'block text-xs font-medium text-slate-700 mb-1'

export default function ExpenseForm({ expense, duplicateFrom, onSuccess, onCancel }: Props) {
  const source = expense ?? duplicateFrom
  const t = useTranslations('expenses.form')
  const tExpenses = useTranslations('expenses')
  const tCommon = useTranslations('common')
  const [form, setForm] = useState<FormData>({
    expense_category: source?.expense_category ?? 'tangible_asset',
    item_name:        source?.item_name        ?? '',
    unit_price:       source?.unit_price?.toString()  ?? '0',
    quantity:         source?.quantity?.toString()    ?? '1',
    expense_date:     source?.expense_date     ?? '',
    location:         source?.location         ?? '',
    purpose:          source?.purpose          ?? '',
    user_name:        source?.user_name        ?? '',
    buyer_name:       source?.buyer_name       ?? '',
    payment_method:   source?.payment_method   ?? '',
    payment_status:   source?.payment_status   ?? '',
    notes:            source?.notes            ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const isEditing = !!expense

  // Derived flags
  const cat            = form.expense_category
  const showQty        = categoryHasQuantity(cat)
  const showPeriod     = categoryHasPeriod(cat)
  const showLocation   = categoryHasLocation(cat)
  const isCompanyAcct  = form.payment_method === 'company_account'

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => {
        const updated = { ...f, [k]: e.target.value }
        // When switching category, reset quantity to 1 if new category doesn't use it
        if (k === 'expense_category') {
          const newCat = e.target.value as ExpenseCategory
          if (!categoryHasQuantity(newCat)) updated.quantity = '1'
          if (!categoryHasLocation(newCat)) updated.location = ''
        }
        // When switching away from company_account, clear buyer if it was a preset value
        if (k === 'payment_method' && e.target.value !== 'company_account') {
          if ((COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(f.buyer_name)) {
            updated.buyer_name = ''
          }
        }
        return updated
      })
    }

  // Computed total for display
  const displayTotal = showQty
    ? (parseFloat(form.unit_price) || 0) * (parseInt(form.quantity, 10) || 1)
    : (parseFloat(form.unit_price) || 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.item_name.trim())   { setError(t('itemNameRequired')); return }
    if (!form.expense_date)       { setError(t('dateRequired')); return }
    if (!form.payment_status)     { setError(t('paymentStatusRequired')); return }

    if (isCompanyAcct && !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(form.buyer_name)) {
      setError(t('companyBuyerRequired', { buyers: COMPANY_ACCOUNT_BUYERS.join(', ') }))
      return
    }

    setLoading(true)
    setError(null)

    const payload = {
      expense_category: form.expense_category,
      item_name:        form.item_name.trim(),
      unit_price:       parseFloat(form.unit_price) || 0,
      quantity:         showQty ? (parseInt(form.quantity, 10) || 1) : 1,
      expense_date:     form.expense_date,
      location:         showLocation ? form.location : '',
      purpose:          form.purpose,
      period:           showPeriod ? (dateToQuarter(form.expense_date) || null) : null,
      user_name:        form.user_name,
      buyer_name:       form.buyer_name,
      payment_method:   form.payment_method || null,
      payment_status:   form.payment_status,
      notes:            form.notes || null,
    }

    const url    = isEditing ? `/api/expenses/${expense.id}` : '/api/expenses'
    const method = isEditing ? 'PATCH' : 'POST'

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json()
    setLoading(false)
    if (json.error) { setError(json.error); return }
    onSuccess()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Legacy payment method notice */}
      {isEditing && expense?.payment_method_legacy && !expense.payment_method && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('legacyPaymentMethod', { method: expense.payment_method_legacy })}
        </div>
      )}

      {/* Row: Category + Item Name */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className={LABEL}>{t('category')}</label>
          <select value={form.expense_category} onChange={set('expense_category')} className={INPUT}>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{tExpenses(`categories.${o.value}`)}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>{t('itemName')}</label>
          <input
            value={form.item_name} onChange={set('item_name')}
            placeholder={tExpenses('name')}
            className={INPUT}
          />
        </div>
      </div>

      {/* Row: Amount */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className={LABEL}>{showQty ? t('unitPrice') : t('amount')}</label>
          <input
            type="number" min="0" step="0.01"
            value={form.unit_price} onChange={set('unit_price')}
            placeholder="0.00" className={INPUT}
          />
        </div>
        {showQty && (
          <div>
            <label className={LABEL}>{t('quantity')}</label>
            <input
              type="number" min="1" step="1"
              value={form.quantity} onChange={set('quantity')}
              placeholder="1" className={INPUT}
            />
          </div>
        )}
        <div className={showQty ? 'col-span-2 sm:col-span-1' : ''}>
          <label className={LABEL}>{t('total')}</label>
          <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium">
            ¥{displayTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          </div>
        </div>
      </div>

      {/* Row: Date + Period (conditional) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className={LABEL}>{t('date')}</label>
          <input type="date" value={form.expense_date} onChange={set('expense_date')} className={INPUT} />
        </div>
        {showPeriod && (
          <div>
            <label className={LABEL}>{t('period')}</label>
            <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium">
              {dateToQuarter(form.expense_date) || <span className="text-slate-400 font-normal">{t('periodAutoFromDate')}</span>}
            </div>
          </div>
        )}
        <div>
          <label className={LABEL}>{t('purpose')}</label>
          <input value={form.purpose} onChange={set('purpose')} placeholder={tExpenses('purpose')} className={INPUT} />
        </div>
      </div>

      {/* Row: Location (conditional) */}
      {showLocation && (
        <div>
          <label className={LABEL}>
            {cat === 'travel' ? t('travelLocation') : cat === 'rent' ? t('address') : t('locationOrChannel')}
          </label>
          <input
            value={form.location} onChange={set('location')}
            placeholder={cat === 'travel' ? t('travelLocation') : cat === 'rent' ? t('address') : t('locationOrChannel')}
            className={INPUT}
          />
        </div>
      )}

      {/* Row: User + Buyer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className={LABEL}>{cat === 'salary' ? t('assignedPerson') : t('user')}</label>
          <select value={form.user_name} onChange={set('user_name')} className={INPUT}>
            <option value="">{tCommon('none')}</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('buyer')}</label>
          <select value={form.buyer_name} onChange={set('buyer_name')} className={INPUT}>
            <option value="">{t('selectBuyer')}</option>
            {/* Two grouped sets so the user can see the full universe of
                buyers regardless of payment_method. When payment_method is
                'company_account', personal members are disabled (the DB
                constraint only accepts the 3 company-account names). */}
            <optgroup label={tExpenses('user')}>
              {EXPENSE_USER_OPTIONS.map((u) => (
                <option key={u} value={u} disabled={isCompanyAcct}>{u}</option>
              ))}
            </optgroup>
            <optgroup label="公司账户经办人">
              {COMPANY_ACCOUNT_BUYERS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </optgroup>
          </select>
          {isCompanyAcct && (
            <p className="mt-1 text-[10px] text-amber-600">
              选择公司账户支付，经办人必须为：{COMPANY_ACCOUNT_BUYERS.join(' / ')}
            </p>
          )}
        </div>
      </div>

      {/* Row: Payment Method + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>{t('paymentMethod')}</label>
          <select value={form.payment_method} onChange={set('payment_method')} className={INPUT}>
            <option value="">{t('selectPaymentMethod')}</option>
            {EXPENSE_PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{tExpenses(`paymentMethods.${o.value}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('paymentStatus')}</label>
          <select value={form.payment_status} onChange={set('payment_status')} className={INPUT}>
            <option value="">{t('selectStatus')}</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{tExpenses(`paymentStatuses.${o.value}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={LABEL}>{t('notes')}</label>
        <textarea
          value={form.notes} onChange={set('notes')}
          rows={2} placeholder={t('optionalNotes')}
          className={`${INPUT} resize-none`}
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? t('saveExpense') : t('addExpense')}
        </Button>
      </div>
    </form>
  )
}
