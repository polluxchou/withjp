'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ExpenseCategoryChart from '@/components/expenses/ExpenseCategoryChart'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search, Receipt, RotateCcw, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Expense, ExpenseCategory, ExpensePaymentStatus } from '@/lib/types'
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
  EXPENSE_USER_OPTIONS,
  EXPENSE_PERIOD_OPTIONS,
  getExpenseSummary,
} from '@/lib/expenses/costs'

function fmtRmb(amount: number) {
  return '¥' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const STATUS_COLOR: Record<ExpensePaymentStatus, string> = {
  budgeted:           'bg-slate-100 text-slate-600',
  ordered_unpaid:     'bg-amber-100 text-amber-700',
  paid:               'bg-green-100 text-green-700',
  refunded:           'bg-red-100 text-red-600',
  partially_refunded: 'bg-orange-100 text-orange-700',
}

const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  tangible_asset:  'bg-indigo-100 text-indigo-700',
  salary:          'bg-amber-100 text-amber-700',
  rent:            'bg-emerald-100 text-emerald-700',
  travel:          'bg-blue-100 text-blue-700',
  office_supplies: 'bg-purple-100 text-purple-700',
  cloud_services:  'bg-pink-100 text-pink-700',
}

interface Filters {
  q:              string
  category:       string
  payment_status: string
  payment_method: string
  user_name:      string
  buyer_name:     string
  date_from:      string
  date_to:        string
  period:         string
}

const EMPTY_FILTERS: Filters = {
  q: '', category: '', payment_status: '', payment_method: '',
  user_name: '', buyer_name: '', date_from: '', date_to: '', period: '',
}

export default function ExpensesPage() {
  const [expenses,   setExpenses]   = useState<Expense[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [filters,    setFilters]    = useState<Filters>(EMPTY_FILTERS)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<Expense | null>(null)
  const [duplicating, setDuplicating] = useState<Expense | null>(null)
  const [deleting,   setDeleting]   = useState<Expense | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)
  const [delLoading, setDelLoading] = useState(false)
  const t = useTranslations('expenses')
  const tCommon = useTranslations('common')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const res  = await fetch(`/api/expenses?${params.toString()}`)
      const json = await res.json()
      setLoadError(json.error ?? null)
      setExpenses(json.data ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败')
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const summary = getExpenseSummary(expenses)

  const setFilter = (k: keyof Filters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFilters((f) => ({ ...f, [k]: e.target.value }))

  const resetFilters = () => setFilters(EMPTY_FILTERS)

  async function confirmDelete() {
    if (!deleting) return
    setDelLoading(true)
    setDeleteErr(null)
    const res  = await fetch(`/api/expenses/${deleting.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDelLoading(false)
    if (json.error) { setDeleteErr(json.error); return }
    setDeleting(null)
    load()
  }

  const INPUT = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle', { count: summary.itemCount })}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> {t('addExpense')}
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">{t('totalExpense')}</p>
          <p className="text-xl font-bold text-slate-900">{fmtRmb(summary.totalCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">{t('paid')}</p>
          <p className="text-xl font-bold text-green-700">{fmtRmb(summary.paidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">{t('budgetPending')}</p>
          <p className="text-xl font-bold text-amber-700">{fmtRmb(summary.budgetedUnpaidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">{t('thisMonth')}</p>
          <p className="text-xl font-bold text-indigo-700">{fmtRmb(summary.currentMonthCost)}</p>
        </div>
      </div>

      {/* Charts */}
      <ExpenseCategoryChart expenses={expenses} />

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.q} onChange={setFilter('q')}
              placeholder={t('searchPlaceholder')}
              className={`pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52`}
            />
          </div>

          {/* Category */}
          <select value={filters.category} onChange={setFilter('category')} className={`${INPUT} w-36`}>
            <option value="">{t('allCategories')}</option>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`categories.${o.value}`)}</option>
            ))}
          </select>

          {/* Status */}
          <select value={filters.payment_status} onChange={setFilter('payment_status')} className={`${INPUT} w-36`}>
            <option value="">{t('allStatuses')}</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`paymentStatuses.${o.value}`)}</option>
            ))}
          </select>

          {/* User */}
          <select value={filters.user_name} onChange={setFilter('user_name')} className={`${INPUT} w-28`}>
            <option value="">{tCommon('all')} {t('user')}</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Buyer */}
          <select value={filters.buyer_name} onChange={setFilter('buyer_name')} className={`${INPUT} w-28`}>
            <option value="">{tCommon('all')} {t('buyer')}</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Period (quarterly) */}
          <select value={filters.period} onChange={setFilter('period')} className={`${INPUT} w-36`}>
            <option value="">{t('allPeriods')}</option>
            {EXPENSE_PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-500">{t('date')}:</label>
          <input type="date" value={filters.date_from} onChange={setFilter('date_from')} className={INPUT} />
          <span className="text-xs text-slate-400">{t('to')}</span>
          <input type="date" value={filters.date_to} onChange={setFilter('date_to')} className={INPUT} />
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {tCommon('reset')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">{tCommon('loading')}</div>
        ) : loadError ? (
          <div className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{t('empty')}</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">
              {t('addFirst')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('category')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('name')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('amount')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('date')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('period')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('purpose')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('user')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('buyer')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('paymentMethod')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('paymentStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[e.expense_category]}`}>
                        {t(`categories.${e.expense_category}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap max-w-[180px] truncate">
                      {e.item_name}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {fmtRmb(Number(e.total_price))}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{e.expense_date}</td>
                    <td className="px-4 py-3 text-slate-500">{e.period || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[120px] truncate">{e.purpose || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{e.user_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{e.buyer_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {e.payment_method
                        ? t(`paymentMethods.${e.payment_method}`)
                        : e.payment_method_legacy
                          ? <span className="text-amber-600 text-xs">{e.payment_method_legacy}</span>
                          : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[e.payment_status]}`}>
                        {t(`paymentStatuses.${e.payment_status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(e)}
                        className="text-xs text-indigo-600 font-medium hover:text-indigo-800 mr-3"
                      >
                        {tCommon('edit')}
                      </button>
                      <button
                        onClick={() => setDuplicating(e)}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium hover:text-slate-900 mr-3"
                        title={t('copyRecordTitle')}
                      >
                        <Copy className="w-3 h-3" /> {t('duplicateExpense')}
                      </button>
                      <button
                        onClick={() => { setDeleting(e); setDeleteErr(null) }}
                        className="text-xs text-red-500 font-medium hover:text-red-700"
                      >
                        {tCommon('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('addExpense')} width="max-w-2xl">
        <ExpenseForm
          onSuccess={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('editExpense')} width="max-w-2xl">
        {editing && (
          <ExpenseForm
            expense={editing}
            onSuccess={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Duplicate Modal — pre-fills with source data, creates new record on save */}
      <Modal open={!!duplicating} onClose={() => setDuplicating(null)} title={t('duplicateExpenseTitle')} width="max-w-2xl">
        {duplicating && (
          <ExpenseForm
            duplicateFrom={duplicating}
            onSuccess={() => { setDuplicating(null); load() }}
            onCancel={() => setDuplicating(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={tCommon('confirmDelete')}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {t('deleteMessage', { name: deleting.item_name })}
            </p>
            {deleteErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {deleteErr}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>{tCommon('cancel')}</Button>
              <Button variant="danger" loading={delLoading} onClick={confirmDelete}>{tCommon('delete')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
