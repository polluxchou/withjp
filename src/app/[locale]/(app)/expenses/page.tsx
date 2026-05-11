'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ExpenseCategoryChart from '@/components/expenses/ExpenseCategoryChart'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search, Receipt, RotateCcw } from 'lucide-react'
import type { Expense, ExpenseCategory, ExpensePaymentStatus } from '@/lib/types'
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_USER_OPTIONS,
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
  const [deleting,   setDeleting]   = useState<Expense | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)
  const [delLoading, setDelLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const res  = await fetch(`/api/expenses?${params.toString()}`)
    const json = await res.json()
    setLoadError(json.error ?? null)
    setExpenses(json.data ?? [])
    setLoading(false)
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
        title="支出管理"
        subtitle={`共 ${summary.itemCount} 条记录`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> 添加支出
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">总支出</p>
          <p className="text-xl font-bold text-slate-900">{fmtRmb(summary.totalCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">已付款</p>
          <p className="text-xl font-bold text-green-700">{fmtRmb(summary.paidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">预算/待付款</p>
          <p className="text-xl font-bold text-amber-700">{fmtRmb(summary.budgetedUnpaidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">本月支出</p>
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
              placeholder="搜索支出名称/用途..."
              className={`pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52`}
            />
          </div>

          {/* Category */}
          <select value={filters.category} onChange={setFilter('category')} className={`${INPUT} w-36`}>
            <option value="">全部类别</option>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Status */}
          <select value={filters.payment_status} onChange={setFilter('payment_status')} className={`${INPUT} w-36`}>
            <option value="">全部状态</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* User */}
          <select value={filters.user_name} onChange={setFilter('user_name')} className={`${INPUT} w-28`}>
            <option value="">全部使用人</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Buyer */}
          <select value={filters.buyer_name} onChange={setFilter('buyer_name')} className={`${INPUT} w-28`}>
            <option value="">全部经办人</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Period */}
          <input value={filters.period} onChange={setFilter('period')}
            placeholder="归属周期 2025-05" className={`${INPUT} w-36`} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-500">日期：</label>
          <input type="date" value={filters.date_from} onChange={setFilter('date_from')} className={INPUT} />
          <span className="text-xs text-slate-400">至</span>
          <input type="date" value={filters.date_to} onChange={setFilter('date_to')} className={INPUT} />
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 重置
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">加载中...</div>
        ) : loadError ? (
          <div className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无支出记录</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">
              添加第一条支出
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">类别</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">名称</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">金额</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">日期</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">归属周期</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">用途</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">使用人</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">经办人</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">支付方式</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[e.expense_category]}`}>
                        {EXPENSE_CATEGORY_LABELS[e.expense_category]}
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
                        ? EXPENSE_PAYMENT_METHOD_LABELS[e.payment_method]
                        : e.payment_method_legacy
                          ? <span className="text-amber-600 text-xs">{e.payment_method_legacy}</span>
                          : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[e.payment_status]}`}>
                        {EXPENSE_PAYMENT_STATUS_LABELS[e.payment_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(e)}
                        className="text-xs text-indigo-600 font-medium hover:text-indigo-800 mr-3"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => { setDeleting(e); setDeleteErr(null) }}
                        className="text-xs text-red-500 font-medium hover:text-red-700"
                      >
                        删除
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
      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加支出" width="max-w-2xl">
        <ExpenseForm
          onSuccess={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑支出" width="max-w-2xl">
        {editing && (
          <ExpenseForm
            expense={editing}
            onSuccess={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="确认删除">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              确认删除支出记录 <span className="font-semibold">「{deleting.item_name}」</span>？此操作不可撤销。
            </p>
            {deleteErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {deleteErr}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
              <Button variant="danger" loading={delLoading} onClick={confirmDelete}>删除</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
