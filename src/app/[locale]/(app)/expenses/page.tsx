'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import Header from '@/components/layout/Header'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import ExpenseCategoryChart, { type ExpenseChartView } from '@/components/expenses/ExpenseCategoryChart'
import ExpenseDetailModal from '@/components/expenses/ExpenseDetailModal'
import SavedViewsBar from '@/components/expenses/SavedViewsBar'
import Modal from '@/components/ui/Modal'
import DateRangeSlider from '@/components/ui/DateRangeSlider'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import { SearchInput, Select } from '@/components/ui/Field'
import { CountChip } from '@/components/ui/FilterChip'
import { Stat, StatBand } from '@/components/ui/Stat'
import SectionCard from '@/components/ui/SectionCard'
import RecordRow from '@/components/ui/RecordRow'
import Tag from '@/components/ui/Tag'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import { toneOf } from '@/lib/ui/status-tone'
import CurrencySwitcher from '@/components/layout/CurrencySwitcher'
import { openCommandBar } from '@/components/intent/CommandBar'
import { useCurrency } from '@/lib/currency'
import EmptyState from '@/components/ui/EmptyState'
import {
  Plus, RotateCcw, Copy, Pencil, Trash2, Eye, ArrowUp, ArrowDown, Sparkles,
  Receipt, Calendar, Package, Wallet, Home, Plane, Paperclip, Cloud,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCurrentUser, canEdit } from '@/lib/auth/useCurrentUser'
import type { Expense, ExpenseCategory } from '@/lib/types'
import {
  type Filters,
  EMPTY_FILTERS as SHARED_EMPTY_FILTERS,
  SERVER_FILTER_KEYS as SHARED_SERVER_FILTER_KEYS,
  filtersToParams,
  paramsToFilters,
  isEmptyFilters,
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
import DiscussionPanel from '@/components/discussions/DiscussionPanel'
import {
  expenseFilterSubject,
  expenseRecordSubject,
} from '@/lib/discussions/expense-subjects'
import type { SubjectInput } from '@/lib/discussions/types'


// Category → icon (meta row, RecordRow). Payment status no longer gets a
// bespoke color map — it goes through the shared toneOf('expense', status)
// registry (docs/design-system.md §1.3) instead, same as every other status
// enum in the app.
const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  tangible_asset:  Package,
  salary:          Wallet,
  rent:            Home,
  travel:          Plane,
  office_supplies: Paperclip,
  cloud_services:  Cloud,
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

// Page-level view switch, rendered as the header's <Tabs>. 'list' renders the
// RecordRow table here on the page; the other three used to be a pill
// tablist owned by ExpenseCategoryChart and are now passed down as its
// `view` prop (see ExpenseChartView).
type PageView = 'list' | ExpenseChartView
const PAGE_VIEWS: PageView[] = ['list', 'category', 'trend', 'monthly']
function isPageView(v: string | null): v is PageView {
  return !!v && (PAGE_VIEWS as string[]).includes(v)
}

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
  const [viewTab, setViewTab] = useState<PageView>('list')
  const [panelSubject, setPanelSubject] = useState<SubjectInput | null>(null)
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

  // First mount: pick up filters + the active chart tab from the URL so deep
  // links / refresh restore the same view (e.g. a link straight into
  // "累计趋势" instead of always landing on the list).
  useEffect(() => {
    setFilters(paramsToFilters(searchParams))
    const tabParam = searchParams.get('tab')
    if (isPageView(tabParam)) setViewTab(tabParam)
    urlHydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push filter + tab changes back into the URL (replace, not push). 'list'
  // is the default landing tab, so it's omitted from the URL to keep the
  // plain /expenses link clean.
  useEffect(() => {
    if (!urlHydrated.current) return
    const params = filtersToParams(filters)
    if (viewTab !== 'list') params.set('tab', viewTab)
    const qs   = params.toString()
    const next = qs ? `${pathname}?${qs}` : pathname
    router.replace(next, { scroll: false })
  }, [filters, viewTab, pathname, router])

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
    // 'reset' now defers to resetFilters() itself rather than duplicating its
    // EMPTY_FILTERS assignment inline — resetFilters also clears the stale
    // searchInput text, which the old inline `return EMPTY_FILTERS` here
    // never did (filters.q would reset but the visible search box wouldn't).
    if (target === 'reset') { resetFilters(); return }
    setFilters((f) => {
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
  // monthPickerRef anchors the trigger (Stat wrapper) — used both for the
  // outside-click check and to measure where to plant the portaled panel.
  const monthPickerRef = useRef<HTMLDivElement | null>(null)
  // monthPanelRef is the portaled dropdown itself. It lives under
  // document.body (see createPortal below), not under monthPickerRef, so the
  // outside-click handler must treat "inside the panel" as a second,
  // independent containment check — `monthPickerRef.contains()` alone would
  // never be true for clicks on the panel and would close it on every click.
  const monthPanelRef = useRef<HTMLDivElement | null>(null)
  const [monthPanelPos, setMonthPanelPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // StatBand is `overflow-x-auto`, and per spec a non-`visible` value on one
  // overflow axis forces the other axis to compute as `auto` too — so an
  // absolutely-positioned child (the old implementation) gets clipped by
  // StatBand's own box the moment it overflows vertically. Clipped ≠ hidden:
  // the panel was still painted (sort of) but pointer-events landed on
  // whatever was underneath, so it was open-but-unclickable. Portaling to
  // document.body (Modal's own escape hatch, see components/ui/Modal.tsx)
  // and positioning via getBoundingClientRect() sidesteps the clipping
  // ancestor entirely.
  function toggleMonthPicker() {
    if (monthPickerOpen) { setMonthPickerOpen(false); return }
    const rect = monthPickerRef.current?.getBoundingClientRect()
    if (rect) setMonthPanelPos({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    setMonthPickerOpen(true)
  }

  // Close the picker on outside click / Escape; reposition on scroll/resize
  // while open (position:fixed + a one-time rect snapshot would otherwise
  // drift away from the trigger as soon as the page scrolls).
  useEffect(() => {
    if (!monthPickerOpen) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (monthPickerRef.current?.contains(target)) return
      if (monthPanelRef.current?.contains(target)) return
      setMonthPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthPickerOpen(false)
    }
    const reposition = () => {
      const rect = monthPickerRef.current?.getBoundingClientRect()
      if (rect) setMonthPanelPos({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    // capture:true so this also fires for scrolls inside nested scroll
    // containers, not just the window/document itself.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [monthPickerOpen])

  const summary = getExpenseSummary(visibleExpenses)
  // Status-summary counts for the CountChip row — derived from the same
  // filtered list the KPIs/table already use, so switching a chip filter
  // shrinks/grows every other chip's count exactly like the existing KPI
  // cards already do via toggleKpi.
  const paidCount    = visibleExpenses.filter((e) => e.payment_status === 'paid').length
  const pendingCount = visibleExpenses.filter((e) => e.payment_status === 'budgeted' || e.payment_status === 'ordered_unpaid').length
  // "全部" chip is only the active one when NOTHING is filtered — activeKpi
  // alone misses e.g. a category/user/buyer/period select or a typed search
  // term (those don't drive activeKpi at all). Mirrors exactly what
  // resetFilters() clears (Filters shape + searchInput), so "全部 active" and
  // "reset would be a no-op" always agree.
  const allActive = activeKpi === null && isEmptyFilters(filters) && searchInput === ''

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

  // Shared three-state gate for all four view tabs (list/category/trend/
  // monthly) — computed once, consumed at both render sites below (the
  // chart slot above the filter row, and the list slot below it) so every
  // tab shows the exact same loading/error/empty precedence and copy.
  // `null` means "have data, render the real tab content instead".
  const threeState = loading ? (
    <LoadingState variant="plain" />
  ) : loadError ? (
    <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
  ) : visibleExpenses.length === 0 ? (
    <EmptyState
      title={t('empty')}
      action={<Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>{t('addFirst')}</Button>}
    />
  ) : null

  return (
    <DiscussionProvider>
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle', { count: summary.itemCount })}
        tabs={
          <Tabs
            items={[
              { value: 'list',     label: t('viewList') },
              { value: 'category', label: t('categoryShare') },
              { value: 'trend',    label: t('cumulativeTrend') },
              { value: 'monthly',  label: t('monthlySummary') },
            ]}
            value={viewTab}
            onChange={(v) => setViewTab(v as PageView)}
          />
        }
        search={
          <div className="w-56">
            {/* No kbdHint here — ⌘K is bound to the CommandBar (see the
                natural-language trigger below), not to focusing this plain
                search box. Claiming it here would be a second, false claim
                on the same shortcut. */}
            <SearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('searchPlaceholder')}
            />
          </div>
        }
        actions={
          <>
            <CurrencySwitcher />
            <Button size="lg" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> {t('addExpense')}
            </Button>
          </>
        }
      />

      {/* Natural-language trigger */}
      <button
        type="button"
        onClick={() => openCommandBar()}
        className="w-full mb-4 flex items-center gap-2 px-4 py-2.5 rounded-card border border-primary-border bg-primary-soft hover:bg-primary-soft-hover text-left text-sm text-primary-hover transition-colors"
      >
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={1.5} />
        <span>{t('kpi.nlHint')}</span>
        <kbd className="ml-auto px-1.5 py-0.5 text-micro rounded bg-surface text-ink-500 border border-line">⌘K</kbd>
      </button>

      {/* Status summary — same underlying filter as the KPI cards below, just
          a quick count-based entry point (toggleKpi is the single source of
          truth for what "active" means). */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <CountChip
          label={tCommon('all')}
          count={visibleExpenses.length}
          tone="neutral"
          active={allActive}
          onClick={() => toggleKpi('reset')}
        />
        <CountChip
          label={t('paid')}
          count={paidCount}
          tone="success"
          active={activeKpi === 'paid'}
          onClick={() => toggleKpi('paid')}
        />
        <CountChip
          label={t('pendingPayment')}
          count={pendingCount}
          tone="warning"
          active={activeKpi === 'unpaid'}
          onClick={() => toggleKpi('unpaid')}
        />
      </div>

      {/* KPI — click to filter, click active card again to clear (same
          toggleKpi/activeKpi source of truth as the CountChip row above). */}
      <StatBand>
        <Stat
          label={t('totalExpense')}
          value={fmtRmb(summary.totalCost, { compact: true })}
          note={activeKpi ? t('kpi.clickToClearFilter') : t('includesFees')}
          onClick={() => toggleKpi('reset')}
          pressed={activeKpi === null}
        />
        <Stat
          label={t('paid')}
          value={fmtRmb(summary.paidCost, { compact: true })}
          note={activeKpi === 'paid' ? t('kpi.filterActive') : t('kpi.clickToFilterPaid')}
          onClick={() => toggleKpi('paid')}
          pressed={activeKpi === 'paid'}
        />
        <Stat
          label={t('budgetPending')}
          value={fmtRmb(summary.budgetedUnpaidCost, { compact: true })}
          note={activeKpi === 'unpaid' ? t('kpi.filterActive') : t('kpi.clickToFilterPending')}
          onClick={() => toggleKpi('unpaid')}
          pressed={activeKpi === 'unpaid'}
        />
        {/* Month-filter KPI keeps its popover — wraps Stat instead of using
            RecordRow-style composition since StatBand's flex children need
            `relative` positioning to anchor the trigger for rect
            measurement (the panel itself is portaled out, see below).
            The border lives on this wrapper rather than Stat's own
            `last:border-r-0`: Stat is this div's ONLY child, so `last-child`
            always matches here regardless of this wrapper's own position in
            the StatBand row — Stat would silently drop its border even
            though it's the 4th of 5 stats, not the actual last one. Moving
            the border to the wrapper (which IS positioned correctly in the
            row) sidesteps that mismatch. If this wrapper ever needs to
            become the *actual* last Stat in the band, drop the hardcoded
            border-r here and let Stat's own last:border-r-0 take over. */}
        <div ref={monthPickerRef} className="relative flex-1 min-w-fit border-r border-line-soft">
          <Stat
            label={activeMonth ? t('kpi.monthExpenseLabel', { month: activeMonth }) : t('thisMonth')}
            value={fmtRmb(summary.currentMonthCost, { compact: true })}
            note={activeMonth ? t('kpi.monthFilterActive') : t('kpi.clickToFilterMonth')}
            onClick={toggleMonthPicker}
            ariaProps={{ 'aria-haspopup': 'listbox', 'aria-expanded': monthPickerOpen }}
          />

          {monthPickerOpen && monthPanelPos && createPortal(
            <div
              ref={monthPanelRef}
              style={{ position: 'fixed', top: monthPanelPos.top, left: monthPanelPos.left, width: monthPanelPos.width }}
              className="z-40 bg-surface border border-line rounded-card shadow-pop p-2"
            >
              <div className="text-micro font-medium text-ink-400 px-2 py-1 uppercase tracking-wider">
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
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-field text-xs transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-ink-700 hover:bg-line-soft'
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className={isActive ? 'text-white/70' : 'text-ink-400'}>
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
                  className="mt-1 w-full px-2 py-1.5 rounded-field text-xs text-ink-500 hover:text-danger-text hover:bg-danger-soft transition-colors"
                >
                  {t('kpi.clearMonthFilter')}
                </button>
              )}
            </div>,
            document.body
          )}
        </div>
        <Stat
          label={t('crossBorderCost')}
          value={fmtRmb(summary.crossBorderCost, { compact: true })}
          note={activeKpi === 'crossBorder' ? t('kpi.filterActive') : t('kpi.crossBorderHint', { rate: CROSS_BORDER_FEE_RATE * 100 })}
          onClick={() => toggleKpi('crossBorder')}
          pressed={activeKpi === 'crossBorder'}
        />
      </StatBand>

      {/* Charts — rendered for the category/trend/monthly tabs; the 'list' tab
          renders the RecordRow table further down instead. Both render sites
          consult the shared `threeState` computed below the JSX return, so
          loading/error/empty look and behave identically across all four
          tabs instead of only being handled on 'list' (previously, landing
          on a chart tab during the initial fetch — or after a fetch error —
          rendered nothing at all, since ExpenseCategoryChart's own guard
          just returns null on empty data). */}
      {viewTab !== 'list' && (
        threeState ? (
          <div className="mb-6"><SectionCard>{threeState}</SectionCard></div>
        ) : (
          <ExpenseCategoryChart
            view={viewTab}
            expenses={visibleExpenses}
            categoryBreakdownExpenses={expenses}
            selectedCategory={filters.category}
            onCategorySelect={selectChartCategory}
            selectedPeriod={{ from: filters.date_from, to: filters.date_to }}
            onPeriodSelect={selectChartPeriod}
          />
        )
      )}

      {/* Saved filter views (localStorage) */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <SavedViewsBar currentFilters={filters} onApply={setFilters} />
        </div>
        <DiscussionBadge
          subject={expenseFilterSubject(filters, pathname, tDiscussFilter)}
          onClick={() => setPanelSubject(expenseFilterSubject(filters, pathname, tDiscussFilter))}
        />
      </div>

      {/* Filters — stack vertically (2-col) on mobile, single row from sm: up.
          The text search box lives in the page header (SearchInput, Step a) —
          not duplicated here. */}
      <div className="bg-surface border border-line rounded-card p-3 sm:p-4 mb-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
          {/* Category */}
          <Select value={filters.category} onChange={setFilter('category')} className="w-full sm:w-36">
            <option value="">{t('allCategories')}</option>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`categories.${o.value}`)}</option>
            ))}
          </Select>

          {/* Status */}
          <Select value={filters.payment_status} onChange={setFilter('payment_status')} className="w-full sm:w-36">
            <option value="">{t('allStatuses')}</option>
            {EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(`paymentStatuses.${o.value}`)}</option>
            ))}
          </Select>

          {/* User */}
          <Select value={filters.user_name} onChange={setFilter('user_name')} className="w-full sm:w-28">
            <option value="">{tCommon('all')} {t('user')}</option>
            {EXPENSE_USER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>

          {/* Buyer — full set: team members + company-account buyers */}
          <Select value={filters.buyer_name} onChange={setFilter('buyer_name')} className="w-full sm:w-28">
            <option value="">{tCommon('all')} {t('buyer')}</option>
            {EXPENSE_BUYER_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>

          {/* Period (quarterly) */}
          <Select value={filters.period} onChange={setFilter('period')} className="w-full sm:w-36">
            <option value="">{t('allPeriods')}</option>
            {EXPENSE_PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="col-span-2 sm:col-span-1 sm:ml-auto justify-center sm:justify-start"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {tCommon('reset')}
          </Button>
        </div>
      </div>

      {/* Date range timeline — full width */}
      <div className="bg-surface border border-line rounded-card px-6 pt-4 pb-4 mb-5">
        <DateRangeSlider
          from={filters.date_from}
          to={filters.date_to}
          minDate={sliderRange?.min}
          maxDate={sliderRange?.max}
          onChange={(from, to) => setFilters((f) => ({ ...f, date_from: from, date_to: to }))}
        />
      </div>

      {/* List — 'list' tab only; charts render above for the other three.
          A single RecordRow-based list replaces the old dual mobile-card /
          desktop-table split: RecordRow already hides meta/who under the sm
          breakpoint internally, so one render serves both. */}
      {viewTab === 'list' && (
        <SectionCard
          padding="none"
          icon={<Receipt />}
          title={t('listTitle')}
          accent="violet"
          actions={
            !threeState ? (
              <div className="flex items-center gap-1.5">
                <Select
                  aria-label={t('sortByLabel')}
                  size="sm"
                  className="w-28"
                  value={sortBy}
                  onChange={(e) => toggleSort(e.target.value as SortKey)}
                >
                  <option value="date">{t('date')}</option>
                  <option value="period">{t('period')}</option>
                  <option value="amount">{t('amount')}</option>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('toggleSortDir')}
                  onClick={() => toggleSort(sortBy)}
                >
                  {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ) : undefined
          }
        >
          {threeState ?? (
            <div>
              {sortedExpenses.map((e) => {
                const CategoryIcon = CATEGORY_ICON[e.expense_category]
                const fee = crossBorderFee(e)
                return (
                  <RecordRow
                    key={e.id}
                    status={toneOf('expense', e.payment_status)}
                    title={e.item_name}
                    meta={[
                      { text: `#${e.id.slice(0, 8)}`, mono: true },
                      { icon: <Calendar />, text: e.period ? `${e.expense_date} · ${e.period}` : e.expense_date },
                      { icon: <CategoryIcon />, text: t(`categories.${e.expense_category}`) },
                    ]}
                    amount={fmtRmb(Number(e.total_price))}
                    tags={
                      <div className="flex items-center gap-1.5 flex-none">
                        <Tag size="sm" tone={toneOf('expense', e.payment_status)} label={t(`paymentStatuses.${e.payment_status}`)} />
                        {fee > 0 && (
                          <span title={t('crossBorderFeeTooltip')}>
                            <Tag size="sm" variant="dot" tone="warning" label={`+${fmtRmb(fee)} ${t('crossBorderFeeShort')}`} />
                          </span>
                        )}
                      </div>
                    }
                    who={e.buyer_name || '—'}
                    actions={
                      <div className="flex items-center gap-1">
                        <DiscussionBadge
                          subject={expenseRecordSubject(e)}
                          onClick={() => setPanelSubject(expenseRecordSubject(e))}
                          compact
                        />
                        <Button variant="ghost" size="sm" aria-label={tCommon('view')} title={tCommon('view')} onClick={() => setViewing(e)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {canEdit(currentUser, e.created_by_user_id) && (
                          <Button variant="ghost" size="sm" aria-label={tCommon('edit')} title={tCommon('edit')} onClick={() => setEditing(e)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" aria-label={t('duplicateExpense')} title={t('copyRecordTitle')} onClick={() => setDuplicating(e)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {canEdit(currentUser, e.created_by_user_id) && (
                          <Button variant="ghost" size="sm" aria-label={tCommon('delete')} title={tCommon('delete')} onClick={() => { setDeleting(e); setDeleteErr(null) }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    }
                  />
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

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

      {/* Delete Confirmation — danger-action pattern: buttons live in Modal's
          footer prop, not inline in the body. */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={tCommon('confirmDelete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>{tCommon('cancel')}</Button>
            <Button variant="danger" loading={delLoading} onClick={confirmDelete}>{tCommon('delete')}</Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              {t('deleteMessage', { name: deleting.item_name })}
            </p>
            {deleteErr && (
              <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
                {deleteErr}
              </div>
            )}
          </div>
        )}
      </Modal>

      <DiscussionPanel
        open={panelSubject !== null}
        subject={panelSubject}
        onClose={() => setPanelSubject(null)}
      />
    </div>
    </DiscussionProvider>
  )
}
