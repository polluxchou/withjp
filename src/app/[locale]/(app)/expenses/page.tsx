'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import Header from '@/components/layout/Header'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ExpenseCategoryChart from '@/components/expenses/ExpenseCategoryChart'
import ExpenseDetailModal from '@/components/expenses/ExpenseDetailModal'
import SavedViewsBar from '@/components/expenses/SavedViewsBar'
import Modal from '@/components/ui/Modal'
import DateRangeSlider from '@/components/ui/DateRangeSlider'
import Button from '@/components/ui/Button'
import ClampedText from '@/components/ui/ClampedText'
import CurrencySwitcher from '@/components/layout/CurrencySwitcher'
import { openCommandBar } from '@/components/intent/CommandBar'
import { useCurrency } from '@/lib/currency'
import { Plus, Search, Receipt, RotateCcw, Copy, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCurrentUser, canEdit } from '@/lib/auth/useCurrentUser'
import type { Expense, ExpenseCategory, ExpensePaymentStatus } from '@/lib/types'
import {
  type Filters,
  EMPTY_FILTERS as SHARED_EMPTY_FILTERS,
  SERVER_FILTER_KEYS as SHARED_SERVER_FILTER_KEYS,
  filtersToParams,
  paramsToFilters,
} from '@/lib/expenses/filter-types'
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
  EXPENSE_USER_OPTIONS,
  EXPENSE_BUYER_OPTIONS,
  EXPENSE_PERIOD_OPTIONS,
  CROSS_BORDER_FEE_RATE,
  getExpenseSummary,
  crossBorderFee,
} from '@/lib/expenses/costs'
import { nextExpenseCategoryFilter } from '@/lib/expenses/category-filter'
import { INTENT_APPLIED_EVENT } from '@/lib/intent/events'
import { DiscussionProvider } from '@/components/discussions/DiscussionContext'
import { DiscussionBadge } from '@/components/discussions/DiscussionBadge'
import DiscussionPanel, { type PanelMode } from '@/components/discussions/DiscussionPanel'
import {
  expenseFilterSubject,
  expenseRecordSubject,
} from '@/lib/discussions/expense-subjects'
import type { SubjectInput } from '@/lib/discussions/types'

// Panel state combines the subject and how to open the panel. `mode`
// lets the row's "+" button always land on the compose form, even
// when there are already (possibly resolved) threads on the row.
interface PanelState {
  subject: SubjectInput
  mode:    PanelMode
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

type SortKey = 'date' | 'period' | 'amount'
type SortDir = 'asc' | 'desc'

// Priority chain for tiebreakers. Whichever is primary moves to the front;
// the others follow in this canonical order; finally created_at.
const SORT_CHAIN: SortKey[] = ['date', 'period', 'amount']

// Filters / EMPTY_FILTERS / SERVER_FILTER_KEYS now live in
// src/lib/expenses/filter-types.ts so URL encoding + saved-views logic
// can share the same types. Local aliases keep the rest of this file
// unchanged.
const EMPTY_FILTERS = SHARED_EMPTY_FILTERS
const SERVER_FILTER_KEYS = SHARED_SERVER_FILTER_KEYS

export default function ExpensesPage() {
  const currentUser = useCurrentUser()
  const [expenses,   setExpenses]   = useState<Expense[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [filters,    setFilters]    = useState<Filters>(EMPTY_FILTERS)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<Expense | null>(null)
  const [duplicating, setDuplicating] = useState<Expense | null>(null)
  const [viewing,    setViewing]    = useState<Expense | null>(null)
  const [deleting,   setDeleting]   = useState<Expense | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)
  const [delLoading, setDelLoading] = useState(false)
  const [sortBy,     setSortBy]     = useState<SortKey>('date')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [refreshSeq, setRefreshSeq] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [panel, setPanel] = useState<PanelState | null>(null)
  const loadCtrl = useRef<AbortController | null>(null)
  const t = useTranslations('expenses')
  const tCommon = useTranslations('common')
  const tDiscussFilter = useTranslations('discussions.filterDescribe')
  const { fmt: fmtRmb } = useCurrency()

  // ── Filter ↔ URL synchronisation ───────────────────────────
  const searchParams = useSearchParams()
  const pathname     = usePathname()
  const router       = useRouter()
  const urlHydrated  = useRef(false)
  const loadedOnce   = useRef(false)

  // First mount: pick up filters from the URL so deep links / refresh
  // restore the same view.
  useEffect(() => {
    setFilters(paramsToFilters(searchParams))
    urlHydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push filter changes back into the URL (replace, not push).
  useEffect(() => {
    if (!urlHydrated.current) return
    const qs   = filtersToParams(filters).toString()
    const next = qs ? `${pathname}?${qs}` : pathname
    router.replace(next, { scroll: false })
  }, [filters, pathname, router])

  // Debounce search input → filters.q (300ms)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((f) => ({ ...f, q: searchInput }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    loadCtrl.current?.abort()
    const ctrl = new AbortController()
    loadCtrl.current = ctrl
    // Only show the full loading skeleton on the very first fetch.
    if (!loadedOnce.current) setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => {
        if (SERVER_FILTER_KEYS.has(k as keyof Filters) && v) params.set(k, v)
      })
      const res  = await fetch(`/api/expenses?${params.toString()}`, { signal: ctrl.signal })
      const json = await res.json()
      setLoadError(json.error ?? null)
      setExpenses(json.data ?? [])
      loadedOnce.current = true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [filters, tCommon])

  useEffect(() => { load() }, [load, refreshSeq])

  useEffect(() => {
    const refreshAfterIntent = () => {
      setFilters(EMPTY_FILTERS)
      setRefreshSeq((seq) => seq + 1)
    }
    window.addEventListener(INTENT_APPLIED_EVENT, refreshAfterIntent)
    return () => window.removeEventListener(INTENT_APPLIED_EVENT, refreshAfterIntent)
  }, [])

  const visibleExpenses = useMemo(() => {
    let result = expenses
    if (filters.category) {
      result = result.filter((e) => e.expense_category === filters.category)
    }
    if (filters.unpaid_only === 'yes') {
      result = result.filter((e) => e.payment_status === 'budgeted' || e.payment_status === 'ordered_unpaid')
    }
    if (filters.cross_border_only === 'yes') {
      result = result.filter((e) => crossBorderFee(e) > 0)
    }
    return result
  }, [expenses, filters.category, filters.unpaid_only, filters.cross_border_only])

  // ── Month picker for the 月度支出 KPI ───────────────────────
  // Set of YYYY-MM strings that actually have a budget or expense row.
  // Populated once on mount via an unfiltered fetch, then grows as the
  // session sees new dates (never shrinks, so applying filters doesn't
  // hide months the user knows about).
  const [availableMonths, setAvailableMonths] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch('/api/expenses')
        const json = await res.json()
        if (cancelled) return
        const months = new Set<string>()
        for (const e of (json.data ?? []) as Expense[]) {
          if (e.expense_date) months.add(e.expense_date.slice(0, 7))
        }
        setAvailableMonths((prev) => {
          const next = new Set(prev)
          let added = false
          months.forEach((m) => { if (!next.has(m)) { next.add(m); added = true } })
          return added ? next : prev
        })
      } catch {
        // best-effort; the picker will fall back to defaults below
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Also pick up any new months from currently visible expenses (e.g. after
  // the user just added a record for a future budget month).
  useEffect(() => {
    if (expenses.length === 0) return
    setAvailableMonths((prev) => {
      const next = new Set(prev)
      let added = false
      for (const e of expenses) {
        if (e.expense_date) {
          const ym = e.expense_date.slice(0, 7)
          if (!next.has(ym)) { next.add(ym); added = true }
        }
      }
      return added ? next : prev
    })
  }, [expenses])

  const monthOptions = useMemo(() => {
    const now = new Date()
    const currentY  = now.getUTCFullYear()
    const currentM  = now.getUTCMonth()
    const currentYM = `${currentY}-${String(currentM + 1).padStart(2, '0')}`
    const prevDate  = new Date(Date.UTC(currentY, currentM - 1, 1))
    const previousYM = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`

    // Start with months that actually contain data; always include the
    // current month so the user can pre-filter for "本月" even when this
    // month has no records yet.
    const set = new Set(availableMonths)
    set.add(currentYM)

    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))                 // newest first
      .map((ym) => {
        const [y, m] = ym.split('-').map(Number)
        const first  = `${ym}-01`
        const last   = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
        const label  = ym === currentYM  ? t('thisMonth')
                     : ym === previousYM ? t('lastMonth')
                     : ym
        return { ym, first, last, label }
      })
  }, [availableMonths])

  // If filters.date_from/to exactly span a whole month, surface that
  // month as the "active month" for KPI highlighting + popover state.
  const activeMonth = useMemo(() => {
    const { date_from, date_to } = filters
    if (!date_from || !date_to) return null
    const fromYM = date_from.slice(0, 7)
    if (fromYM !== date_to.slice(0, 7)) return null
    if (date_from !== `${fromYM}-01`) return null
    const [y, m] = fromYM.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return date_to === lastDay ? fromYM : null
  }, [filters.date_from, filters.date_to])

  const activeKpi = (() => {
    if (filters.unpaid_only === 'yes')         return 'unpaid'
    if (filters.cross_border_only === 'yes')   return 'crossBorder'
    if (filters.payment_status === 'paid')     return 'paid'
    if (activeMonth)                           return 'monthFilter'
    return null
  })()

  function toggleKpi(target: 'paid' | 'unpaid' | 'crossBorder' | 'reset') {
    setFilters((f) => {
      if (target === 'reset') return EMPTY_FILTERS
      // Always clear other KPI-driven flags first, then toggle the target.
      // Date range is NOT cleared here — the month picker owns that filter
      // and clears it via clearMonth() below.
      const cleared: Filters = {
        ...f,
        payment_status:    f.payment_status === 'paid' ? '' : f.payment_status,
        unpaid_only:       '',
        cross_border_only: '',
      }
      if (activeKpi === target) return cleared
      if (target === 'paid')        return { ...cleared, payment_status: 'paid' }
      if (target === 'unpaid')      return { ...cleared, unpaid_only: 'yes', payment_status: '' }
      if (target === 'crossBorder') return { ...cleared, cross_border_only: 'yes' }
      return cleared
    })
  }

  function applyMonth(ym: string) {
    const opt = monthOptions.find((o) => o.ym === ym)
    if (!opt) return
    setFilters((f) => ({ ...f, date_from: opt.first, date_to: opt.last }))
    setMonthPickerOpen(false)
  }

  function clearMonth() {
    setFilters((f) => ({ ...f, date_from: '', date_to: '' }))
    setMonthPickerOpen(false)
  }

  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const monthPickerRef = useRef<HTMLDivElement | null>(null)

  // Close the picker on outside click / Escape
  useEffect(() => {
    if (!monthPickerOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!monthPickerRef.current?.contains(e.target as Node)) setMonthPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [monthPickerOpen])

  const summary = getExpenseSummary(visibleExpenses)

  // Range for the date slider — derived from the actual spend dates so the
  // track represents real data rather than a fixed 2-year window. Padded to
  // month boundaries for cleaner quarter ticks. Expands as new data arrives
  // outside the current bounds; never shrinks (so applying a date filter
  // doesn't trap the user inside it).
  const [sliderRange, setSliderRange] = useState<{ min: string; max: string } | null>(null)

  useEffect(() => {
    if (expenses.length === 0) return
    const dates = expenses
      .map((e) => e.expense_date)
      .filter((d): d is string => !!d)
      .sort()
    if (dates.length === 0) return
    const earliest = dates[0]
    const latest   = dates[dates.length - 1]
    // Pad to month boundaries (1st of month for min; last day of month for max).
    const minIso = `${earliest.slice(0, 7)}-01`
    const [ly, lm] = latest.slice(0, 7).split('-').map(Number)
    const endOfMonth = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10)
    setSliderRange((prev) => {
      if (!prev) return { min: minIso, max: endOfMonth }
      const min = minIso     < prev.min ? minIso     : prev.min
      const max = endOfMonth > prev.max ? endOfMonth : prev.max
      return min === prev.min && max === prev.max ? prev : { min, max }
    })
  }, [expenses])

  const setFilter = (k: keyof Filters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFilters((f) => ({ ...f, [k]: e.target.value }))

  const resetFilters = () => { setFilters(EMPTY_FILTERS); setSearchInput('') }

  function selectChartPeriod(period: string, gran: 'day' | 'month') {
    setFilters((f) => {
      if (gran === 'day') {
        if (f.date_from === period && f.date_to === period) {
          return { ...f, date_from: '', date_to: '' }   // toggle off
        }
        return { ...f, date_from: period, date_to: period }
      }
      // Month mode: period === 'YYYY-MM'
      const [y, m] = period.split('-').map(Number)
      const first = `${period}-01`
      const last  = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      if (f.date_from === first && f.date_to === last) {
        return { ...f, date_from: '', date_to: '' }
      }
      return { ...f, date_from: first, date_to: last }
    })
  }

  function selectChartCategory(category: ExpenseCategory) {
    setFilters((f) => ({
      ...f,
      category: nextExpenseCategoryFilter(f.category, category),
    }))
  }

  function toggleSort(key: SortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  const sortedExpenses = useMemo(() => {
    const ordered = [sortBy, ...SORT_CHAIN.filter((k) => k !== sortBy)]
    const dirMul  = sortDir === 'asc' ? 1 : -1

    function getVal(e: Expense, k: SortKey): string | number {
      if (k === 'date')   return e.expense_date ?? ''
      if (k === 'period') return e.period ?? ''
      return Number(e.total_price) || 0
    }
    function cmp(av: string | number, bv: string | number): number {
      if (av < bv) return -1
      if (av > bv) return 1
      return 0
    }

    return [...visibleExpenses].sort((a, b) => {
      for (const k of ordered) {
        const r = cmp(getVal(a, k), getVal(b, k)) * dirMul
        if (r !== 0) return r
      }
      return cmp(a.created_at ?? '', b.created_at ?? '') * dirMul
    })
  }, [visibleExpenses, sortBy, sortDir])

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300" />
    return sortDir === 'asc'
      ? <ArrowUp   className="w-3 h-3 text-indigo-600" />
      : <ArrowDown className="w-3 h-3 text-indigo-600" />
  }

  function sortableHeaderClass(col: SortKey) {
    const active = sortBy === col
    return `inline-flex items-center gap-1 transition-colors ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`
  }

  async function confirmDelete() {
    if (!deleting) return
    setDelLoading(true)
    setDeleteErr(null)
    try {
      const res  = await fetch(`/api/expenses/${deleting.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || json.error) { setDeleteErr(json.error ?? 'Delete failed'); return }
      setDeleting(null)
      load()
    } catch {
      setDeleteErr('Network error. Please try again.')
    } finally {
      setDelLoading(false)
    }
  }

  const INPUT = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <DiscussionProvider>
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle', { count: summary.itemCount })}
        actions={
          <>
            <CurrencySwitcher />
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> {t('addExpense')}
            </Button>
          </>
        }
      />

      {/* Natural-language trigger */}
      <button
        type="button"
        onClick={() => openCommandBar()}
        className="w-full mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 text-left text-sm text-slate-600 transition-colors"
      >
        <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <span>{t('kpi.nlHint')}</span>
        <kbd className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-white text-slate-500 border border-slate-200">⌘K</kbd>
      </button>

      {/* KPI Cards — click to filter, click active card again to clear */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <button
          type="button"
          onClick={() => toggleKpi('reset')}
          aria-pressed={activeKpi === null}
          className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all"
        >
          <p className="text-xs font-medium text-slate-500 mb-1">{t('totalExpense')}</p>
          <p className="text-lg sm:text-xl font-bold text-slate-900">{fmtRmb(summary.totalCost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{activeKpi ? t('kpi.clickToClearFilter') : t('includesFees')}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleKpi('paid')}
          aria-pressed={activeKpi === 'paid'}
          className={`bg-white border rounded-xl p-4 text-left transition-all ${
            activeKpi === 'paid'
              ? 'border-green-400 ring-2 ring-green-100 bg-green-50/40'
              : 'border-slate-200 hover:border-green-200 hover:shadow-sm'
          }`}
        >
          <p className="text-xs font-medium text-slate-500 mb-1">{t('paid')}</p>
          <p className="text-lg sm:text-xl font-bold text-green-700">{fmtRmb(summary.paidCost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{activeKpi === 'paid' ? t('kpi.filterActive') : t('kpi.clickToFilterPaid')}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleKpi('unpaid')}
          aria-pressed={activeKpi === 'unpaid'}
          className={`bg-white border rounded-xl p-4 text-left transition-all ${
            activeKpi === 'unpaid'
              ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/40'
              : 'border-slate-200 hover:border-amber-200 hover:shadow-sm'
          }`}
        >
          <p className="text-xs font-medium text-slate-500 mb-1">{t('budgetPending')}</p>
          <p className="text-lg sm:text-xl font-bold text-amber-700">{fmtRmb(summary.budgetedUnpaidCost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{activeKpi === 'unpaid' ? t('kpi.filterActive') : t('kpi.clickToFilterPending')}</p>
        </button>
        <div ref={monthPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setMonthPickerOpen((v) => !v)}
            aria-pressed={activeKpi === 'monthFilter'}
            aria-haspopup="listbox"
            aria-expanded={monthPickerOpen}
            className={`w-full bg-white border rounded-xl p-4 text-left transition-all ${
              activeKpi === 'monthFilter'
                ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/40'
                : 'border-slate-200 hover:border-indigo-200 hover:shadow-sm'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 mb-1">
              {activeMonth ? t('kpi.monthExpenseLabel', { month: activeMonth }) : t('thisMonth')}
            </p>
            <p className="text-lg sm:text-xl font-bold text-indigo-700">{fmtRmb(summary.currentMonthCost)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {activeMonth ? t('kpi.monthFilterActive') : t('kpi.clickToFilterMonth')}
            </p>
          </button>

          {monthPickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-2">
              <div className="text-[10px] font-medium text-slate-400 px-2 py-1 uppercase tracking-wider">
                {t('kpi.selectMonth')}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {monthOptions.map((opt) => {
                  const isActive = activeMonth === opt.ym
                  return (
                    <button
                      key={opt.ym}
                      type="button"
                      onClick={() => applyMonth(opt.ym)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className={isActive ? 'text-indigo-100' : 'text-slate-400'}>
                        {opt.ym}
                      </span>
                    </button>
                  )
                })}
              </div>
              {activeMonth && (
                <button
                  type="button"
                  onClick={clearMonth}
                  className="mt-1 w-full px-2 py-1.5 rounded-md text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  {t('kpi.clearMonthFilter')}
                </button>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggleKpi('crossBorder')}
          aria-pressed={activeKpi === 'crossBorder'}
          className={`bg-white border rounded-xl p-4 text-left transition-all ${
            activeKpi === 'crossBorder'
              ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40'
              : 'border-slate-200 hover:border-rose-200 hover:shadow-sm'
          }`}
        >
          <p className="text-xs font-medium text-slate-500 mb-1">{t('crossBorderCost')}</p>
          <p className="text-lg sm:text-xl font-bold text-rose-600">{fmtRmb(summary.crossBorderCost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {activeKpi === 'crossBorder' ? t('kpi.filterActive') : t('kpi.crossBorderHint', { rate: CROSS_BORDER_FEE_RATE * 100 })}
          </p>
        </button>
      </div>

      {/* Charts */}
      <ExpenseCategoryChart
        expenses={visibleExpenses}
        categoryBreakdownExpenses={expenses}
        selectedCategory={filters.category}
        onCategorySelect={selectChartCategory}
        selectedPeriod={{ from: filters.date_from, to: filters.date_to }}
        onPeriodSelect={selectChartPeriod}
      />

      {/* Saved filter views (localStorage) */}
      <div className="mb-3 flex items-center gap-3 flex-wrap group">
        <div className="flex-1 min-w-0">
          <SavedViewsBar currentFilters={filters} onApply={setFilters} />
        </div>
        <DiscussionBadge
          subject={expenseFilterSubject(filters, pathname, tDiscussFilter)}
          onClick={() => setPanel({ subject: expenseFilterSubject(filters, pathname, tDiscussFilter), mode: 'auto' })}
          onCreate={() => setPanel({ subject: expenseFilterSubject(filters, pathname, tDiscussFilter), mode: 'compose' })}
        />
      </div>

      {/* Filters — stack vertically (2-col) on mobile, single row from sm: up */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 mb-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
          {/* Search — full width on mobile */}
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-52"
            />
          </div>

          {/* Category */}
          <select value={filters.category} onChange={setFilter('category')} className={`${INPUT} w-full sm:w-36`}>
            <option value="">{t('allCategories')}</option>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`categories.${o.value}`)}</option>
            ))}
          </select>

          {/* Status */}
          <select value={filters.payment_status} onChange={setFilter('payment_status')} className={`${INPUT} w-full sm:w-36`}>
            <option value="">{t('allStatuses')}</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`paymentStatuses.${o.value}`)}</option>
            ))}
          </select>

          {/* User */}
          <select value={filters.user_name} onChange={setFilter('user_name')} className={`${INPUT} w-full sm:w-28`}>
            <option value="">{tCommon('all')} {t('user')}</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Buyer — full set: team members + company-account buyers */}
          <select value={filters.buyer_name} onChange={setFilter('buyer_name')} className={`${INPUT} w-full sm:w-28`}>
            <option value="">{tCommon('all')} {t('buyer')}</option>
            {EXPENSE_BUYER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Period (quarterly) */}
          <select value={filters.period} onChange={setFilter('period')} className={`${INPUT} w-full sm:w-36`}>
            <option value="">{t('allPeriods')}</option>
            {EXPENSE_PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="col-span-2 sm:col-span-1 sm:ml-auto flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors py-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {tCommon('reset')}
          </button>
        </div>
      </div>

      {/* Date range timeline — full width */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 pt-4 pb-4 mb-5">
        <DateRangeSlider
          from={filters.date_from}
          to={filters.date_to}
          minDate={sliderRange?.min}
          maxDate={sliderRange?.max}
          onChange={(from, to) => setFilters((f) => ({ ...f, date_from: from, date_to: to }))}
        />
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
        ) : visibleExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{t('empty')}</p>
            <button type="button" onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">
              {t('addFirst')}
            </button>
          </div>
        ) : (
          <>
          {/* Mobile card list — md:hidden. Each expense is a tap-to-view card with
              the most-used actions (edit / duplicate / delete) inline. Less-used
              columns (purpose, buyer, payment method) are surfaced via the
              detail modal opened by the card body. */}
          <ul className="md:hidden divide-y divide-slate-100">
            {sortedExpenses.map((e) => (
              <li key={e.id} className="px-4 py-3 group">
                <button
                  type="button"
                  onClick={() => setViewing(e)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${CATEGORY_COLOR[e.expense_category]}`}>
                          {t(`categories.${e.expense_category}`)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLOR[e.payment_status]}`}>
                          {t(`paymentStatuses.${e.payment_status}`)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 truncate">{e.item_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {e.expense_date}
                        {e.period ? ` · ${e.period}` : ''}
                        {e.user_name ? ` · ${e.user_name}` : ''}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap flex-shrink-0">
                      <div className="text-sm font-semibold text-slate-900">{fmtRmb(Number(e.total_price))}</div>
                      {crossBorderFee(e) > 0 && (
                        <div className="text-[10px] text-amber-600 mt-0.5">+{fmtRmb(crossBorderFee(e))} {t('crossBorderFeeShort')}</div>
                      )}
                    </div>
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-end gap-1">
                  <DiscussionBadge
                    subject={expenseRecordSubject(e)}
                    onClick={() => setPanel({ subject: expenseRecordSubject(e), mode: 'auto' })}
                    onCreate={() => setPanel({ subject: expenseRecordSubject(e), mode: 'compose' })}
                    compact
                  />
                  {canEdit(currentUser, e.created_by_user_id) && (
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      aria-label={tCommon('edit')}
                      className="p-2 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDuplicating(e)}
                    aria-label={t('duplicateExpense')}
                    className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {canEdit(currentUser, e.created_by_user_id) && (
                    <button
                      type="button"
                      onClick={() => { setDeleting(e); setDeleteErr(null) }}
                      aria-label={tCommon('delete')}
                      className="p-2 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('category')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('name')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium">
                    <button type="button" onClick={() => toggleSort('amount')} className={sortableHeaderClass('amount')}>
                      {t('amount')} <SortIcon col="amount" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium">
                    <button type="button" onClick={() => toggleSort('date')} className={sortableHeaderClass('date')}>
                      {t('date')} <SortIcon col="date" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium">
                    <button type="button" onClick={() => toggleSort('period')} className={sortableHeaderClass('period')}>
                      {t('period')} <SortIcon col="period" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('purpose')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('user')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('buyer')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('paymentMethod')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('paymentStatus')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('discussionsColumn')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CATEGORY_COLOR[e.expense_category]}`}>
                        {t(`categories.${e.expense_category}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[180px]">
                      <ClampedText text={e.item_name} onOverflowClick={() => setViewing(e)} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      <div>{fmtRmb(Number(e.total_price))}</div>
                      {crossBorderFee(e) > 0 && (
                        <div
                          className="text-[10px] text-amber-600 font-normal mt-0.5"
                          title={t('crossBorderFeeTooltip')}
                        >
                          +{fmtRmb(crossBorderFee(e))} {t('crossBorderFeeShort')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{e.expense_date}</td>
                    <td className="px-4 py-3 text-slate-500">{e.period || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[140px]">
                      <ClampedText text={e.purpose} onOverflowClick={() => setViewing(e)} />
                    </td>
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
                    <td className="px-4 py-3">
                      <DiscussionBadge
                        subject={expenseRecordSubject(e)}
                        onClick={() => setPanel({ subject: expenseRecordSubject(e), mode: 'auto' })}
                        onCreate={() => setPanel({ subject: expenseRecordSubject(e), mode: 'compose' })}
                        compact
                      />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {canEdit(currentUser, e.created_by_user_id) && (
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            aria-label={tCommon('edit')}
                            title={tCommon('edit')}
                            className="p-2 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDuplicating(e)}
                          aria-label={t('duplicateExpense')}
                          title={t('copyRecordTitle')}
                          className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {canEdit(currentUser, e.created_by_user_id) && (
                          <button
                            type="button"
                            onClick={() => { setDeleting(e); setDeleteErr(null) }}
                            aria-label={tCommon('delete')}
                            title={tCommon('delete')}
                            className="p-2 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
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

      {/* Detail Modal — read-only full record view */}
      <ExpenseDetailModal expense={viewing} onClose={() => setViewing(null)} />

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

      <DiscussionPanel
        open={panel !== null}
        subject={panel?.subject ?? null}
        mode={panel?.mode}
        onClose={() => setPanel(null)}
      />
    </div>
    </DiscussionProvider>
  )
}
