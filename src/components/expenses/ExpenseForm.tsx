'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
  EXPENSE_USER_OPTIONS,
  categoryHasQuantity,
  categoryHasPeriod,
  categoryHasLocation,
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
  period:           string
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
  const [form, setForm] = useState<FormData>({
    expense_category: source?.expense_category ?? 'tangible_asset',
    item_name:        source?.item_name        ?? '',
    unit_price:       source?.unit_price?.toString()  ?? '0',
    quantity:         source?.quantity?.toString()    ?? '1',
    expense_date:     source?.expense_date     ?? '',
    location:         source?.location         ?? '',
    purpose:          source?.purpose          ?? '',
    period:           source?.period           ?? '',
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
          if (!categoryHasPeriod(newCat))   updated.period   = ''
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
    if (!form.item_name.trim())   { setError('支出名称不能为空'); return }
    if (!form.expense_date)       { setError('日期不能为空'); return }
    if (!form.payment_status)     { setError('请选择支付状态'); return }

    if (isCompanyAcct && !(COMPANY_ACCOUNT_BUYERS as readonly string[]).includes(form.buyer_name)) {
      setError(`公司公共账户的经办人必须为：${COMPANY_ACCOUNT_BUYERS.join('、')}`)
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
      period:           showPeriod && form.period ? form.period : null,
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
          原支付方式：<span className="font-medium">{expense.payment_method_legacy}</span>
          ——请从下方选择新支付方式覆盖
        </div>
      )}

      {/* Row: Category + Item Name */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>支出类别 *</label>
          <select value={form.expense_category} onChange={set('expense_category')} className={INPUT}>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={LABEL}>支出名称 *</label>
          <input
            value={form.item_name} onChange={set('item_name')}
            placeholder={cat === 'salary' ? '如：5月份工资 - 张三' : cat === 'rent' ? '如：5月办公室租金' : cat === 'cloud_services' ? '如：Anthropic API 5月账单' : '支出名称'}
            className={INPUT}
          />
        </div>
      </div>

      {/* Row: Amount */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>{showQty ? '单价 (¥)' : '金额 (¥)'}</label>
          <input
            type="number" min="0" step="0.01"
            value={form.unit_price} onChange={set('unit_price')}
            placeholder="0.00" className={INPUT}
          />
        </div>
        {showQty && (
          <div>
            <label className={LABEL}>数量</label>
            <input
              type="number" min="1" step="1"
              value={form.quantity} onChange={set('quantity')}
              placeholder="1" className={INPUT}
            />
          </div>
        )}
        <div>
          <label className={LABEL}>合计</label>
          <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium">
            ¥{displayTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          </div>
        </div>
      </div>

      {/* Row: Date + Period (conditional) */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>日期 *</label>
          <input type="date" value={form.expense_date} onChange={set('expense_date')} className={INPUT} />
        </div>
        {showPeriod && (
          <div>
            <label className={LABEL}>归属周期</label>
            <input
              value={form.period} onChange={set('period')}
              placeholder="如 2025-05"
              className={INPUT}
            />
          </div>
        )}
        <div>
          <label className={LABEL}>用途说明</label>
          <input value={form.purpose} onChange={set('purpose')} placeholder="用途" className={INPUT} />
        </div>
      </div>

      {/* Row: Location (conditional) */}
      {showLocation && (
        <div>
          <label className={LABEL}>
            {cat === 'travel' ? '出行地点' : cat === 'rent' ? '地址' : '购买渠道'}
          </label>
          <input
            value={form.location} onChange={set('location')}
            placeholder={cat === 'travel' ? '如：北京 → 上海' : cat === 'rent' ? '如：上海市长宁区xxx路' : '如：京东、天猫'}
            className={INPUT}
          />
        </div>
      )}

      {/* Row: User + Buyer */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>{cat === 'salary' ? '归属人员' : '使用人'}</label>
          <select value={form.user_name} onChange={set('user_name')} className={INPUT}>
            <option value="">请选择</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>经办人</label>
          <select value={form.buyer_name} onChange={set('buyer_name')} className={INPUT}>
            <option value="">请选择经办人</option>
            {isCompanyAcct
              ? COMPANY_ACCOUNT_BUYERS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))
              : EXPENSE_USER_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))
            }
          </select>
        </div>
      </div>

      {/* Row: Payment Method + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>支付方式</label>
          <select value={form.payment_method} onChange={set('payment_method')} className={INPUT}>
            <option value="">请选择支付方式</option>
            {EXPENSE_PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>支付状态 *</label>
          <select value={form.payment_status} onChange={set('payment_status')} className={INPUT}>
            <option value="">请选择状态</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={LABEL}>备注</label>
        <textarea
          value={form.notes} onChange={set('notes')}
          rows={2} placeholder="可选备注"
          className={`${INPUT} resize-none`}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>取消</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? '保存更改' : '添加支出'}
        </Button>
      </div>
    </form>
  )
}
