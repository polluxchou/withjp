'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Plus, RotateCcw, Copy, Trash2, ChevronDown, ArrowUpRight, ChevronRight, Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Link } from '@/i18n/navigation'
import {
  FORECAST_ACCOUNT_TYPE_LABELS,
  FORECAST_ACCOUNT_TYPES,
  calculateForecastRows,
  mergeForecastDraft,
  summarizeForecast,
  type ForecastDraft,
  type ForecastAccountInput,
  type ForecastAccountType,
  type ForecastMonthInput,
  type ForecastSummary,
} from '@/lib/finance-forecast/calculations'
import { createLatestSaveQueue } from '@/lib/finance-forecast/save-queue'
import type { ForecastView } from '@/lib/finance-forecast/views'
import ForecastViewBar from '@/components/finance-forecast/ForecastViewBar'
import LifecycleTemplateEditor from '@/components/finance-forecast/LifecycleTemplateEditor'
import {
  LIFECYCLE_STARTING_STAGES,
  LIFECYCLE_STARTING_STAGE_LABELS,
  type LifecycleStartingStage,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle'
import { planLifecycleApplication } from '@/lib/finance-forecast/lifecycle-apply'

const ACCOUNT_TYPE_COLORS: Record<ForecastAccountType, string> = {
  key:     '#6366f1',
  mature:  '#10b981',
  growing: '#3b82f6',
  newbie:  '#f59e0b',
  test:    '#ec4899',
  other:   '#64748b',
}

const ACCOUNT_TYPE_NOTES: Record<ForecastAccountType, string> = {
  key:     '高 ROI 账号',
  mature:  '稳定贡献',
  growing: '爬坡账号',
  newbie:  '新开账号',
  test:    '活动测试',
  other:   '未分类',
}

const CHART_TABS = [
  { key: 'breakdown',  label: '盈亏分解' },
  { key: 'cumulative', label: '累计' },
  { key: 'stacked',    label: 'Stacked' },
  { key: 'lines',      label: 'Lines' },
  { key: 'indexed',    label: 'Indexed' },
] as const

type ChartMode = typeof CHART_TABS[number]['key']
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type ViewMode = 'annual' | 'monthly'

interface Props {
  views:                 ForecastView[]
  defaultViewId:         string | null
  monthsByYear:          Record<number, ForecastMonthInput[]>
  years:                 number[]
  anchorYear:            number
  initialSelectedMonth?: number
  currentUserId:         string
  isAdmin:               boolean
}

const STORAGE_KEY_PREFIX = 'finance-forecast:draft'

export default function FinanceForecastDashboard({
  views: initialViews,
  defaultViewId,
  monthsByYear: initialByYear,
  years,
  anchorYear,
  initialSelectedMonth = 0,
  currentUserId,
  isAdmin,
}: Props) {
  const t = useTranslations('financeForecast')
  const [views, setViews] = useState<ForecastView[]>(initialViews)
  const [activeViewId, setActiveViewId] = useState<string | null>(defaultViewId)
  const [byYear, setByYear] = useState<Record<number, ForecastMonthInput[]>>(initialByYear)
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [selectedYear, setSelectedYear] = useState<number>(anchorYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(initialSelectedMonth)
  const [showYearView, setShowYearView] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('breakdown')
  const [inputOpen, setInputOpen] = useState(true)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loadingView, setLoadingView] = useState(false)
  const [viewBarBusy, setViewBarBusy] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  // Lifecycle template plumbing.
  // - `lifecycleEditorOpen` controls the per-user templates modal.
  // - `addFromTemplateOpen` controls the "pick stage + name → fan out 12
  //    months" modal that lives next to the "+ 添加账号" button.
  // - `lifecycleSet` caches the user's templates so the add-from-template
  //    flow doesn't refetch on every modal open. Hydrated lazily.
  const [lifecycleEditorOpen, setLifecycleEditorOpen] = useState(false)
  const [addFromTemplateOpen, setAddFromTemplateOpen] = useState(false)
  const [lifecycleSet, setLifecycleSet] = useState<LifecycleTemplateSet | null>(null)

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const canEditActive = activeView ? (isAdmin || activeView.owner_id === currentUserId) : false

  const didLoadDraft = useRef(false)
  const mountedRef   = useRef(false)
  // Save queues are keyed by `${view_id}:${year}` so a slow in-flight save
  // for view A won't ship a snapshot under view B after the user switches.
  const saveQueuesRef = useRef(new Map<string, ReturnType<typeof createLatestSaveQueue<ForecastMonthInput[]>>>())
  // Track the last persisted reference per (view, year) so the autosave
  // effect only enqueues years that actually changed.
  const prevByYearRef = useRef<Record<number, ForecastMonthInput[]>>(initialByYear)
  // Tracks which view id `prevByYearRef` belongs to. When we swap views we
  // reset the ref to the freshly-fetched snapshot.
  const prevViewIdRef = useRef<string | null>(defaultViewId)

  const months = byYear[selectedYear] ?? []
  const summary = useMemo(() => summarizeForecast(months), [months])
  const safeSelectedMonth = Math.min(Math.max(0, selectedMonth), Math.max(0, summary.months.length - 1))
  const selected = summary.months[safeSelectedMonth]
  const selectedRaw = months[safeSelectedMonth]

  // Per-year summaries fuel the annual rollup view.
  const summaryByYear = useMemo(() => {
    const out: Record<number, ForecastSummary> = {}
    for (const y of years) out[y] = summarizeForecast(byYear[y] ?? [])
    return out
  }, [byYear, years])

  // Three-year aggregate KPIs.
  const aggregate = useMemo(() => {
    let forecast = 0
    let actual   = 0
    let budget   = 0
    for (const y of years) {
      const s = summaryByYear[y]
      forecast += s.yearly_forecast_usd
      actual   += s.yearly_actual_usd
      budget   += s.yearly_budget_usd
    }
    const profit = forecast - budget
    return {
      forecast,
      actual,
      budget,
      profit,
      margin: forecast > 0 ? (profit / forecast) * 100 : 0,
    }
  }, [summaryByYear, years])

  // Bar chart input: one group per year, four metrics each.
  const multiYearChartData = useMemo(() => years.map((y) => {
    const s = summaryByYear[y]
    return {
      year:     String(y),
      forecast: s.yearly_forecast_usd,
      actual:   s.yearly_actual_usd,
      budget:   s.yearly_budget_usd,
      profit:   s.yearly_profit_usd,
    }
  }), [years, summaryByYear])

  const chartData = useMemo(() => buildChartData(summary.months, chartMode), [summary.months, chartMode])
  const calculatedRows = useMemo(
    () => (selectedRaw ? calculateForecastRows(selectedRaw.rows) : []),
    [selectedRaw],
  )

  // Cumulative running totals — used by both the "累计" chart tab and the
  // breakeven KPI card. Computed once so the chart and the card agree.
  const cumulativeData = useMemo(() => buildCumulativeData(summary.months), [summary.months])

  // 盈亏分解 — one record per month with the three quantities the user
  // really wants to compare in the formula 收入 − 成本 = 利润.
  const breakdownData = useMemo(() => buildBreakdownData(summary.months), [summary.months])
  const breakevenIndex = cumulativeData.findIndex((row) => row.cum_profit >= 0 && row.cum_revenue > 0)
  const breakevenMonth = breakevenIndex >= 0 ? summary.months[breakevenIndex].month : null
  const yearMarginPct  = summary.yearly_forecast_usd > 0
    ? (summary.yearly_profit_usd / summary.yearly_forecast_usd) * 100
    : 0

  function getOrCreateQueue(viewId: string, year: number) {
    const key = `${viewId}:${year}`
    let queue = saveQueuesRef.current.get(key)
    if (queue) return queue
    queue = createLatestSaveQueue<ForecastMonthInput[]>(
      async (snapshot) => {
        const res = await fetch('/api/finance-forecast', {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ view_id: viewId, year, months: snapshot }),
        })
        if (!res.ok) throw new Error('Failed to save finance forecast')
      },
      (status) => {
        if (mountedRef.current) setSaveStatus(status)
      },
    )
    saveQueuesRef.current.set(key, queue)
    return queue
  }

  function setMonthsForYear(year: number, updater: (prev: ForecastMonthInput[]) => ForecastMonthInput[]) {
    setByYear((prev) => ({ ...prev, [year]: updater(prev[year] ?? []) }))
  }

  function updateSelectedMonth(patch: Partial<ForecastMonthInput>) {
    setMonthsForYear(selectedYear, (prev) =>
      prev.map((month, index) => index === safeSelectedMonth ? { ...month, ...patch } : month)
    )
  }

  function updateRow(rowIndex: number, patch: Partial<ForecastAccountInput>) {
    setMonthsForYear(selectedYear, (prev) => prev.map((month, index) => {
      if (index !== safeSelectedMonth) return month
      return {
        ...month,
        rows: month.rows.map((row, idx) => idx === rowIndex ? { ...row, ...patch } : row),
      }
    }))
  }

  function addRow() {
    setMonthsForYear(selectedYear, (prev) => prev.map((month, i) => {
      if (i !== safeSelectedMonth) return month
      const id = `${month.month}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      return {
        ...month,
        rows: [
          ...month.rows,
          {
            id,
            account_name:           '新账号',
            account_type:           'newbie',
            live_days:              0,
            avg_daily_hours:        0,
            revenue_per_minute_usd: 0,
            share_ratio_pct:        0,
          },
        ],
      }
    }))
  }

  // Lazy-fetch the user's lifecycle templates the first time the
  // add-from-template flow opens. Subsequent opens reuse the cache; the
  // editor refreshes the cache via its onSaved callback.
  async function ensureLifecycleSet(): Promise<LifecycleTemplateSet | null> {
    if (lifecycleSet) return lifecycleSet
    try {
      const res = await fetch('/api/finance-forecast/lifecycle')
      const body = await res.json() as { data: LifecycleTemplateSet | null; error: string | null }
      if (!res.ok || !body.data) return null
      setLifecycleSet(body.data)
      return body.data
    } catch {
      return null
    }
  }

  // Apply a template starting at the current (selectedYear,
  // safeSelectedMonth). For each of the 12 month cells, work out the
  // target (year, monthIndex), group rows by year, then merge into
  // byYear. The autosave effect picks the changes up per-year.
  function applyLifecycleTemplate(stage: LifecycleStartingStage, accountName: string) {
    if (!activeViewId || !canEditActive) return
    const set = lifecycleSet
    if (!set) return
    const template = set[stage]
    const planned = planLifecycleApplication({
      template,
      startYear:       selectedYear,
      startMonthIndex: safeSelectedMonth,
      horizonYears:    years,
      accountName,
      idSeed:          `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    })
    if (planned.length === 0) return

    const rowsByYear = new Map<number, typeof planned>()
    for (const row of planned) {
      const list = rowsByYear.get(row.year) ?? []
      list.push(row)
      rowsByYear.set(row.year, list)
    }

    setByYear((prev) => {
      const next = { ...prev }
      for (const [year, rows] of rowsByYear) {
        const yearMonths = prev[year] ?? []
        next[year] = yearMonths.map((month) => {
          const additions = rows.filter((r) => r.monthKey === month.month)
          if (additions.length === 0) return month
          return {
            ...month,
            rows: [
              ...month.rows,
              ...additions.map((r) => ({
                id:                     r.rowId,
                account_name:           accountName.trim() || '新账号',
                account_type:           r.account_type,
                live_days:              r.live_days,
                avg_daily_hours:        r.avg_daily_hours,
                revenue_per_minute_usd: r.revenue_per_minute_usd,
                share_ratio_pct:        r.share_ratio_pct,
              })),
            ],
          }
        })
      }
      return next
    })

    // Move the editor focus to the first inserted row's month so the
    // user can immediately see the freshly-applied data.
    const first = planned[0]
    if (first) {
      setSelectedYear(first.year)
      setSelectedMonth(first.monthIndex)
      setExpandedRowId(first.rowId)
    }
  }

  // Destructive ops: state update + immediate save (bypass the 700ms debounce)
  // so a stale in-flight save can't resurrect a deleted row.
  function persistImmediate(year: number, newMonths: ForecastMonthInput[]) {
    if (!activeViewId || !canEditActive) return
    setByYear((prev) => ({ ...prev, [year]: newMonths }))
    writeDraft(buildStorageKey(activeViewId, year), newMonths)
    prevByYearRef.current = { ...prevByYearRef.current, [year]: newMonths }
    getOrCreateQueue(activeViewId, year).enqueue(newMonths)
  }

  function deleteRow(rowIndex: number) {
    const current = byYear[selectedYear] ?? []
    const newMonths = current.map((month, index) =>
      index === safeSelectedMonth
        ? { ...month, rows: month.rows.filter((_, i) => i !== rowIndex) }
        : month
    )
    persistImmediate(selectedYear, newMonths)
  }

  function clearMonth() {
    const current = byYear[selectedYear] ?? []
    const newMonths = current.map((month, index) =>
      index === safeSelectedMonth ? { ...month, rows: [], note: '' } : month
    )
    persistImmediate(selectedYear, newMonths)
  }

  function copyPreviousMonth() {
    // Stops at January of the active year — crossing year boundaries on a
    // simple "copy previous" would be surprising. Use "apply forward" or
    // edit the next year directly if needed.
    if (safeSelectedMonth === 0) return
    setMonthsForYear(selectedYear, (prev) => {
      const previous = prev[safeSelectedMonth - 1]
      const current  = prev[safeSelectedMonth]
      return prev.map((month, i) => {
        if (i !== safeSelectedMonth) return month
        return {
          ...month,
          rows: previous.rows.map((row) => ({ ...row, id: `${current.month}-${row.id}` })),
        }
      })
    })
  }

  function applyForward() {
    // Applies only within the current year — keeps the action predictable.
    setMonthsForYear(selectedYear, (prev) => {
      const source = prev[safeSelectedMonth]
      return prev.map((month, index) => {
        if (index <= safeSelectedMonth) return month
        return {
          ...month,
          rows: source.rows.map((row) => ({ ...row, id: `${month.month}-${row.id}` })),
        }
      })
    })
  }

  const yearlyProfitColor = summary.yearly_profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
  const selectedProfitColor = selected && selected.profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'

  // Cumulative profit through the selected month (inclusive). Used by
  // the month-view KPI strip so users can see running profit without
  // flipping back to the year view.
  const selectedCumulativeProfit = cumulativeData[safeSelectedMonth]?.cum_profit ?? 0
  const selectedCumulativeProfitColor = selectedCumulativeProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
  const monthMarginColor = !selected || selected.margin_pct === null
    ? 'text-slate-400'
    : selected.margin_pct >= 0 ? 'text-emerald-700' : 'text-red-600'

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Hydrate localStorage drafts for the active view's 3 years. Each (view,
  // year) pair owns its own draft slot so editing one view never disturbs
  // another. Re-runs after view switches.
  useEffect(() => {
    if (!activeViewId) return
    if (didLoadDraft.current && prevViewIdRef.current === activeViewId) return
    didLoadDraft.current = true
    prevViewIdRef.current = activeViewId

    setByYear((current) => {
      const next = { ...current }
      for (const year of years) {
        const draft = readDraft(buildStorageKey(activeViewId, year))
        if (!draft) continue
        const existing = next[year] ?? []
        if (hasForecastInputs(existing)) continue
        next[year] = mergeForecastDraft(existing, draft)
      }
      prevByYearRef.current = next
      return next
    })
    setHydratedDraft(true)
  }, [activeViewId, years])

  // Per-(view, year) debounced autosave. We only enqueue years whose
  // snapshot ref changed — typing into 2026 must not retransmit 2027. We
  // also skip entirely when the active view is read-only.
  useEffect(() => {
    if (!hydratedDraft) return
    if (!activeViewId || !canEditActive) return

    // If nothing is in flight, reset the visible status.
    const anySaving = Array.from(saveQueuesRef.current.values()).some((q) => q.isSaving())
    if (!anySaving) setSaveStatus('idle')

    const timers: number[] = []
    const prev = prevByYearRef.current
    const viewId = activeViewId
    for (const year of years) {
      const cur = byYear[year]
      if (!cur || cur === prev[year]) continue
      writeDraft(buildStorageKey(viewId, year), cur)
      const timer = window.setTimeout(() => {
        getOrCreateQueue(viewId, year).enqueue(cur)
      }, 700)
      timers.push(timer)
    }
    prevByYearRef.current = byYear

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [hydratedDraft, byYear, years, activeViewId, canEditActive])

  const monthLabels = t.raw('months') as string[]
  const selectedMonthLabel = selected
    ? monthLabels[parseInt(selected.month.slice(5), 10) - 1] ?? selected.month.slice(5)
    : ''

  function drillIntoYear(year: number) {
    setSelectedYear(year)
    setSelectedMonth(year === anchorYear ? initialSelectedMonth : 0)
    setShowYearView(false)
    setViewMode('monthly')
  }

  // Fetch a view's forecast data over the full 3-year horizon. Used when
  // the user switches views (server-loaded data only covers the default).
  async function fetchViewForecast(viewId: string) {
    setLoadingView(true)
    try {
      const yearsParam = years.join(',')
      const res = await fetch(`/api/finance-forecast?view_id=${viewId}&years=${yearsParam}`)
      if (!res.ok) {
        console.error('Failed to load view', viewId, await res.text())
        setSaveStatus('error')
        return
      }
      const body = await res.json() as { data: Record<number, ForecastMonthInput[]> | null }
      if (body.data) {
        const next: Record<number, ForecastMonthInput[]> = {}
        for (const year of years) next[year] = body.data[year] ?? []
        // Reset draft hydration; the new view gets its own draft pass.
        didLoadDraft.current = false
        prevViewIdRef.current = viewId
        prevByYearRef.current = next
        setByYear(next)
        setHydratedDraft(false)
      }
    } catch (e) {
      console.error('Failed to load view forecast', viewId, e)
      setSaveStatus('error')
    } finally {
      setLoadingView(false)
    }
  }

  async function handleSelectView(viewId: string) {
    if (viewId === activeViewId) return
    setActiveViewId(viewId)
    setSelectedYear(anchorYear)
    setSelectedMonth(initialSelectedMonth)
    setShowYearView(false)
    await fetchViewForecast(viewId)
  }

  async function handleCreateView(input: { name: string; note: string }) {
    setViewBarBusy(true)
    try {
      const res = await fetch('/api/finance-forecast/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      const body = await res.json() as { data: ForecastView | null; error: string | null }
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Failed to create view')
      const newView = body.data
      setViews((prev) => [...prev, newView])
      // Auto-switch into the newly created (empty) view.
      setActiveViewId(newView.id)
      setSelectedYear(anchorYear)
      setSelectedMonth(initialSelectedMonth)
      setShowYearView(false)
      await fetchViewForecast(newView.id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '创建失败')
    } finally {
      setViewBarBusy(false)
    }
  }

  async function handleUpdateView(
    id: string,
    patch: { name?: string; note?: string; is_public?: boolean },
  ) {
    setViewBarBusy(true)
    try {
      const res = await fetch(`/api/finance-forecast/views/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const body = await res.json() as { data: ForecastView | null; error: string | null }
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Failed to update view')
      const updated = body.data
      setViews((prev) => prev.map((v) => v.id === id ? updated : v))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '更新失败')
    } finally {
      setViewBarBusy(false)
    }
  }

  async function handleDeleteView(id: string) {
    setViewBarBusy(true)
    try {
      const res = await fetch(`/api/finance-forecast/views/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to delete view')
      }
      // Drop the deleted view; switch to another visible one if it was active.
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== id)
        if (id === activeViewId) {
          const fallback = next.find((v) => v.owner_id === currentUserId) ?? next[0] ?? null
          setActiveViewId(fallback?.id ?? null)
          if (fallback) void fetchViewForecast(fallback.id)
          else {
            const empty: Record<number, ForecastMonthInput[]> = {}
            for (const year of years) empty[year] = []
            setByYear(empty)
          }
        }
        return next
      })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '删除失败')
    } finally {
      setViewBarBusy(false)
    }
  }

  const viewMenu = (
    <ForecastViewBar
      views={views}
      activeViewId={activeViewId}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      busy={viewBarBusy || loadingView}
      onSelect={handleSelectView}
      onCreate={handleCreateView}
      onUpdate={handleUpdateView}
      onDelete={handleDeleteView}
      onOpenLifecycle={() => setLifecycleEditorOpen(true)}
    />
  )

  return (
    <>
      {!activeView ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {viewMenu}
            <span className="text-sm text-slate-400">还没有任何可见的预测视角 — 点击左侧创建第一个</span>
          </div>
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-500 mb-2">还没有任何可见的预测视角。</p>
            <p className="text-xs text-slate-400">在上方"视角"菜单里新建一个预测场景即可开始。</p>
          </div>
        </>
      ) : (<>

      {!canEditActive && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          只读视角 — 此视角属于 {activeView.owner_id === null ? '系统' : activeView.owner_name ?? '其他用户'}，你可以查看但无法修改。
        </div>
      )}

      <ViewModeToolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        years={years}
        anchorYear={anchorYear}
        selectedYear={selectedYear}
        onChangeYear={(year) => {
          setSelectedYear(year)
          setSelectedMonth(year === anchorYear ? initialSelectedMonth : 0)
          setShowYearView(false)
        }}
        saveStatus={saveStatus}
        savingLabel={t('statusSaving')}
        savedLabel={t('statusSaved')}
        errorLabel={t('statusError')}
        loading={loadingView}
        leftSlot={viewMenu}
      />

      {viewMode === 'annual' ? (
        <AnnualOverview
          years={years}
          anchorYear={anchorYear}
          byYear={byYear}
          summaryByYear={summaryByYear}
          aggregate={aggregate}
          chartData={multiYearChartData}
          onDrillDown={drillIntoYear}
        />
      ) : (
        <>
          {/* Row 1: KPI summary — 6 cards covering revenue, cost, profit, margin
              and breakeven; collapses to 2-col on mobile, 3-col on tablet. */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-4">
            <KpiCard
              label={`${selectedYear} 预测开播收益`}
              value={formatUsd(summary.yearly_forecast_usd)}
              sub={inputOpen ? '点击收起账号明细' : '点击展开账号明细'}
              onClick={() => setInputOpen((o) => !o)}
              active={inputOpen}
            />
            <KpiCard
              label={`${selectedYear} 成本预算`}
              value={formatUsd(summary.yearly_budget_usd)}
              sub="当前预算 CNY 按 1 USD = 7 CNY 换算"
              linkTo="/expenses"
              linkLabel="去支出管理"
            />
            <KpiCard
              label={`${selectedYear} 累计利润`}
              value={formatUsd(summary.yearly_profit_usd)}
              sub={summary.yearly_profit_usd >= 0 ? '本年预计结余' : '本年预计亏损'}
              valueClassName={yearlyProfitColor}
            />
            <KpiCard
              label={`${selectedYear} 毛利率`}
              value={`${Math.round(yearMarginPct)}%`}
              sub="年度利润 / 年度收益"
              valueClassName={yearMarginPct >= 0 ? 'text-emerald-700' : 'text-red-600'}
            />
            <KpiCard
              label="首个盈利月"
              value={breakevenMonth ? breakevenMonth.slice(5) + '月' : '—'}
              sub={breakevenMonth ? '累计利润首次转正' : '本年度累计未转正'}
              valueClassName={breakevenMonth ? 'text-emerald-700' : 'text-slate-400'}
            />
            <KpiCard
              label="当前月毛利率"
              value={!selected || selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
              sub={selected ? `${selected.month} 正在编辑` : ''}
              valueClassName={selectedProfitColor}
            />
          </div>

          {/* Row 2: Account forecast input (collapsible) */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${inputOpen ? 'border-b border-slate-100' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                    {selected?.month.slice(0, 4) ?? selectedYear}
                  </span>
                  <span className="text-xl font-bold text-slate-300">·</span>
                  <span className="text-xl font-bold text-indigo-600 tabular-nums tracking-tight">
                    {selectedMonthLabel}
                  </span>
                  <span className="text-sm font-medium text-slate-500 ml-1.5">账号预测输入</span>
                </h2>
                <span className="hidden sm:block text-xs text-slate-400 truncate">每个月单独设置账号参数，输入自动保存</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {inputOpen && canEditActive && (
                  <>
                    <Button variant="secondary" size="sm" onClick={copyPreviousMonth} disabled={safeSelectedMonth === 0}>
                      <Copy className="w-3.5 h-3.5" /> 复制上月
                    </Button>
                    <Button variant="secondary" size="sm" onClick={applyForward}>
                      <Copy className="w-3.5 h-3.5" /> 应用到后续月份
                    </Button>
                    <Button variant="secondary" size="sm" onClick={clearMonth}>
                      <RotateCcw className="w-3.5 h-3.5" /> 清空本月
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await ensureLifecycleSet()
                        setAddFromTemplateOpen(true)
                      }}
                      title="按生命周期模板一次性创建 12 个月的数据"
                    >
                      <Plus className="w-3.5 h-3.5" /> 从模板新增
                    </Button>
                    <Button size="sm" onClick={addRow}>
                      <Plus className="w-3.5 h-3.5" /> 添加账号
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setInputOpen((o) => !o)}
                  aria-label={inputOpen ? '折叠' : '展开'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${inputOpen ? '' : '-rotate-90'}`} />
                </button>
              </div>
            </div>

            {inputOpen && (
              <>
                <div className="px-5 pt-4">
                  <div className="flex gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-400 tracking-wider tabular-nums">
                        {selectedYear}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {months.map((month, index) => {
                          const monthNum = parseInt(month.month.slice(5), 10) - 1
                          const label = monthLabels[monthNum] ?? month.month.slice(5)
                          const active = !showYearView && index === safeSelectedMonth
                          return (
                            <button
                              key={month.month}
                              type="button"
                              onClick={() => { setShowYearView(false); setSelectedMonth(index) }}
                              className={`min-w-[2.25rem] px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowYearView((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        showYearView
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {selectedYear} 全年
                    </button>
                  </div>

                  {!showYearView && selectedRaw && <div className="grid gap-3 md:grid-cols-3 mb-4">
                    <Field label="当前月实际开播收益（美金）">
                      <NumberInput
                        value={selectedRaw.actual_revenue_usd}
                        onChange={(actual_revenue_usd) => updateSelectedMonth({ actual_revenue_usd })}
                        step={1000}
                        disabled={!canEditActive}
                      />
                    </Field>
                    <Field label="当前月成本预算（同步）">
                      <input
                        value={formatUsd(selectedRaw.budget_cost_usd)}
                        readOnly
                        className="w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                      />
                      <div className="text-xs text-indigo-600 font-medium mt-1">已同步当前预算成本，并换算为美金</div>
                    </Field>
                    <Field label="备注事件标注">
                      <input
                        value={selectedRaw.note ?? ''}
                        onChange={(event) => updateSelectedMonth({ note: event.target.value })}
                        readOnly={!canEditActive}
                        className={!canEditActive
                          ? 'w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500'
                          : 'w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'}
                      />
                    </Field>
                  </div>}
                </div>

                {showYearView ? (
                  <YearSummaryTable months={summary.months} onSelectMonth={(index) => { setShowYearView(false); setSelectedMonth(index) }} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1120px]">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">账号</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">类型</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">开播天数</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">平均每日开播时长</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">分钟收益（美金）</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">可分润比例（%）</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">月开播收益</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(!selectedRaw || selectedRaw.rows.length === 0) ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                            当前月份还没有预测输入。添加账号后，账号类型贡献、曲线和 KPI 才会开始计算。
                          </td>
                        </tr>
                      ) : calculatedRows.map((row, index) => (
                        <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              value={row.account_name}
                              onChange={(event) => updateRow(index, { account_name: event.target.value })}
                              readOnly={!canEditActive}
                              className={!canEditActive ? `${INPUT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed` : INPUT_CLASS}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={row.account_type}
                              onChange={(event) => updateRow(index, { account_type: event.target.value as ForecastAccountType })}
                              disabled={!canEditActive}
                              className={!canEditActive ? `${INPUT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed` : INPUT_CLASS}
                            >
                              {FORECAST_ACCOUNT_TYPES.map((type) => (
                                <option key={type} value={type}>{FORECAST_ACCOUNT_TYPE_LABELS[type]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.live_days} onChange={(live_days) => updateRow(index, { live_days })} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.avg_daily_hours} onChange={(avg_daily_hours) => updateRow(index, { avg_daily_hours })} step={0.5} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.revenue_per_minute_usd} onChange={(revenue_per_minute_usd) => updateRow(index, { revenue_per_minute_usd })} step={0.01} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.share_ratio_pct} onChange={(share_ratio_pct) => updateRow(index, { share_ratio_pct })} max={100} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{formatUsd(row.monthly_revenue_usd)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge revenue={row.monthly_revenue_usd} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canEditActive && (<button
                              type="button"
                              aria-label="Delete row"
                              onClick={() => deleteRow(index)}
                              className="inline-flex items-center text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                    <div className="m-5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
                      计算公式：月开播收益 = 开播天数 × 平均每日开播时长 × 60 × 分钟收益 × 可分润比例。账号预测输入会保存到 Supabase；成本预算从当前预算同步，支出金额按 CNY 存储，并按 1 USD = 7 CNY 换算为美金后参与毛利润计算。
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {/* Row 3: Forecast curve + account type breakdown */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{selectedYear} 预测曲线</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {chartMode === 'breakdown'
                      ? '每月「收入 − 成本 = 利润」分解 — 柱长直观，折线即结余'
                      : chartMode === 'cumulative'
                      ? '累计收益 vs 累计成本 — 交叉点即首次盈利月'
                      : '按账户类型展示开播收益、实际收益和同步预算成本'}
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {CHART_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setChartMode(tab.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        chartMode === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={340}>
                {chartMode === 'breakdown' ? (
                  <ComposedChart data={breakdownData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatUsdCompact}
                      width={56}
                    />
                    {/* Custom tooltip spells out the formula */}
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      content={(props) => {
                        const { active, payload, label } = props as unknown as {
                          active?: boolean
                          label?: string
                          payload?: { payload: { revenue: number; cost: number; profit: number } }[]
                        }
                        if (!active || !payload || payload.length === 0) return null
                        const { revenue, cost, profit } = payload[0].payload
                        const profitColor = profit >= 0 ? '#10b981' : '#e11d48'
                        const profitWord  = profit >= 0 ? '利润' : '亏损'
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-md p-2.5 text-xs min-w-[180px]">
                            <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">收入</span>
                              <span className="font-medium text-slate-900 tabular-nums">{formatUsd(revenue)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">− 成本</span>
                              <span className="font-medium text-slate-900 tabular-nums">{formatUsd(cost)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-slate-100">
                              <span className="text-slate-500">= {profitWord}</span>
                              <span className="font-bold tabular-nums" style={{ color: profitColor }}>
                                {formatUsd(profit)}
                              </span>
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {/* Zero baseline so negative profit bars read clearly below it. */}
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 4" />
                    <Bar dataKey="revenue" name="收入" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="cost"    name="成本" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="利润 (= 收入 − 成本)"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ fill: '#6366f1', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                ) : chartMode === 'stacked' ? (
                  <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatUsdCompact} width={56} />
                    <Tooltip formatter={(value) => formatUsd(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Area
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={FORECAST_ACCOUNT_TYPE_LABELS[type]}
                        stackId="forecast"
                        stroke={ACCOUNT_TYPE_COLORS[type]}
                        fill={ACCOUNT_TYPE_COLORS[type]}
                        fillOpacity={0.72}
                      />
                    ))}
                    <Line type="monotone" dataKey="actual" name="实际开播收益" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="budget" name="同步预算成本" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : chartMode === 'cumulative' ? (
                  <ComposedChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatUsdCompact} width={56} />
                    <Tooltip formatter={(value) => formatUsd(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 4" />
                    {breakevenIndex >= 0 && (
                      <ReferenceLine
                        x={cumulativeData[breakevenIndex].label}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        label={{ value: `盈亏平衡 ${cumulativeData[breakevenIndex].label}`, position: 'top', fontSize: 11, fill: '#10b981' }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="cum_profit"
                      name="累计净利润"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                    <Line type="monotone" dataKey="cum_revenue" name="累计开播收益" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cum_cost"    name="累计预算成本" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={chartMode === 'indexed' ? (v) => `${Number(v).toFixed(0)}` : formatUsdCompact}
                      width={56}
                    />
                    <Tooltip formatter={(value) => chartMode === 'indexed' ? Number(value).toFixed(0) : formatUsd(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Line
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={FORECAST_ACCOUNT_TYPE_LABELS[type]}
                        stroke={ACCOUNT_TYPE_COLORS[type]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    {chartMode === 'lines' && (
                      <>
                        <Line type="monotone" dataKey="actual" name="实际开播收益" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="budget" name="同步预算成本" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                      </>
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <aside className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{selectedYear} 账号类型贡献</h2>
                  <p className="text-xs text-slate-500 mt-0.5">12 个月预测输入汇总</p>
                </div>
              </div>
              <div className="space-y-1">
                {FORECAST_ACCOUNT_TYPES.map((type) => (
                  <div key={type} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 border-b border-slate-50 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ACCOUNT_TYPE_COLORS[type] }} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">{FORECAST_ACCOUNT_TYPE_LABELS[type]}</div>
                      <div className="text-xs text-slate-400">{ACCOUNT_TYPE_NOTES[type]}</div>
                    </div>
                    <div className="text-xs font-semibold text-slate-900">{formatUsd(summary.by_account_type[type] || 0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <SideStat label="当前月预测" value={formatUsd(selected?.forecast_revenue_usd ?? 0)} />
                <SideStat label="当前月同步预算" value={formatUsd(selected?.budget_cost_usd ?? 0)} />
                <SideStat label="当前月结余" value={formatUsd(selected?.profit_usd ?? 0)} valueClassName={selectedProfitColor} />
              </div>
            </aside>
          </div>
        </>
      )}
      </>)}

      {/* Lifecycle templates editor (per-user, opened from the view popover). */}
      <LifecycleTemplateEditor
        open={lifecycleEditorOpen}
        onClose={() => setLifecycleEditorOpen(false)}
        onSaved={(set) => setLifecycleSet(set)}
      />

      {/* Add-from-template picker — small modal launched by "+ 从模板新增". */}
      {addFromTemplateOpen && (
        <AddFromTemplateModal
          lifecycleSet={lifecycleSet}
          startLabel={selected?.month ?? `${selectedYear}-${String(safeSelectedMonth + 1).padStart(2, '0')}`}
          horizonYears={years}
          onOpenEditor={() => {
            setAddFromTemplateOpen(false)
            setLifecycleEditorOpen(true)
          }}
          onCancel={() => setAddFromTemplateOpen(false)}
          onConfirm={(stage, name) => {
            applyLifecycleTemplate(stage, name)
            setAddFromTemplateOpen(false)
          }}
        />
      )}
    </>
  )
}

function AddFromTemplateModal({
  lifecycleSet,
  startLabel,
  horizonYears,
  onOpenEditor,
  onCancel,
  onConfirm,
}: {
  lifecycleSet: LifecycleTemplateSet | null
  startLabel:   string
  horizonYears: number[]
  onOpenEditor: () => void
  onCancel:     () => void
  onConfirm:    (stage: LifecycleStartingStage, name: string) => void
}) {
  const [stage, setStage] = useState<LifecycleStartingStage>('newbie')
  const [name, setName]   = useState('')
  const canConfirm = !!lifecycleSet && name.trim().length > 0

  function describeTemplate(s: LifecycleStartingStage): string {
    const tpl = lifecycleSet?.[s]
    if (!tpl) return '加载中…'
    // A quick at-a-glance hint: total broadcasting hours implied by the
    // template, so users can sanity-check the assumption before applying.
    const totalHours = tpl.reduce((sum, c) => sum + c.live_days * c.avg_daily_hours, 0)
    return `${totalHours.toFixed(0)} 小时 / 12 个月`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-5">
        <h2 className="text-base font-bold text-slate-900 mb-1">从生命周期模板新增账号</h2>
        <p className="text-xs text-slate-500 mb-4">
          从 <strong className="text-slate-700">{startLabel}</strong> 起，按所选模板自动填充未来 12 个月的账号数据。
          跨年时会写入 {horizonYears[0]}–{horizonYears[horizonYears.length - 1]} 范围内的对应月份。
        </p>

        <label className="block mb-3">
          <span className="block text-xs font-medium text-slate-700 mb-1">账号名称</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：A 主播 / 新号-Zoe"
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">起始阶段</span>
          <button
            type="button"
            onClick={onOpenEditor}
            className="text-[11px] text-indigo-600 hover:text-indigo-700"
          >
            编辑模板 →
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1.5 mb-4">
          {LIFECYCLE_STARTING_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors text-left ${
                s === stage
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
              }`}
            >
              <span>从 {LIFECYCLE_STARTING_STAGE_LABELS[s]} 起步</span>
              <span className="text-[10px] font-normal text-slate-400 tabular-nums">{describeTemplate(s)}</span>
            </button>
          ))}
        </div>

        {!lifecycleSet && (
          <p className="text-[11px] text-amber-600 mb-3">
            模板还在加载… 也可以先<button type="button" onClick={onOpenEditor} className="underline">编辑模板</button>把参数填好。
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={() => canConfirm && onConfirm(stage, name)} disabled={!canConfirm}>
            <Plus className="w-3.5 h-3.5" /> 创建 12 个月
          </Button>
        </div>
      </div>
    </div>
  )
}

function ViewModeToolbar({
  viewMode,
  onChangeViewMode,
  years,
  anchorYear,
  selectedYear,
  onChangeYear,
  saveStatus,
  savingLabel,
  savedLabel,
  errorLabel,
  loading,
  leftSlot,
}: {
  viewMode:         ViewMode
  onChangeViewMode: (mode: ViewMode) => void
  years:            number[]
  anchorYear:       number
  selectedYear:     number
  onChangeYear:     (year: number) => void
  saveStatus:       SaveStatus
  savingLabel:      string
  savedLabel:       string
  errorLabel:       string
  loading?:         boolean
  // Optional left-edge content (eg. the view-picker popover trigger).
  // Rendered before the view-mode toggle so the whole control row
  // collapses to a single line of chrome on most viewports.
  leftSlot?:        ReactNode
}) {
  const statusText = loading
    ? '加载视角中…'
    : saveStatus === 'saving' ? savingLabel
    : saveStatus === 'saved'  ? savedLabel
    : saveStatus === 'error'  ? errorLabel
    : ''
  const statusClass = loading ? 'text-slate-500' : saveStatusClass(saveStatus)

  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {leftSlot}
        <ViewScopeSelector
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
          years={years}
          anchorYear={anchorYear}
          selectedYear={selectedYear}
          onChangeYear={onChangeYear}
        />
      </div>

      <span className={`text-xs font-medium ${statusClass}`}>{statusText}</span>
    </div>
  )
}

// Unified scope selector — merges the previous [annual | monthly] toggle
// and the year buttons into a single drop-down. The annual rollup is
// listed alongside each year as four picker options:
//   - 年度视图
//   - 2026 · 本年
//   - 2027
//   - 2028
function ViewScopeSelector({
  viewMode,
  onChangeViewMode,
  years,
  anchorYear,
  selectedYear,
  onChangeYear,
}: {
  viewMode:         ViewMode
  onChangeViewMode: (mode: ViewMode) => void
  years:            number[]
  anchorYear:       number
  selectedYear:     number
  onChangeYear:     (year: number) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pickAnnual() {
    onChangeViewMode('annual')
    setOpen(false)
  }
  function pickYear(year: number) {
    if (viewMode !== 'monthly') onChangeViewMode('monthly')
    onChangeYear(year)
    setOpen(false)
  }

  const triggerLabel = viewMode === 'annual'
    ? '年度视图'
    : `${selectedYear}${selectedYear === anchorYear ? ' · 本年' : ''}`

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          open
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
        }`}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">视图</span>
        <span className="tabular-nums">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute top-full left-0 mt-2 min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-1"
        >
          <ScopeOption
            label="年度视图"
            sub="3 年汇总对比"
            active={viewMode === 'annual'}
            onClick={pickAnnual}
          />
          <div className="my-1 border-t border-slate-100" />
          {years.map((year) => (
            <ScopeOption
              key={year}
              label={`${year}${year === anchorYear ? ' · 本年' : ''}`}
              sub="月度编辑"
              active={viewMode === 'monthly' && year === selectedYear}
              onClick={() => pickYear(year)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScopeOption({
  label,
  sub,
  active,
  onClick,
}: {
  label:   string
  sub:     string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between gap-3 ${
        active
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className="tabular-nums">{label}</span>
      <span className={`text-[10px] font-normal ${active ? 'text-indigo-500' : 'text-slate-400'}`}>{sub}</span>
    </button>
  )
}

function AnnualOverview({
  years,
  anchorYear,
  byYear,
  summaryByYear,
  aggregate,
  chartData,
  onDrillDown,
}: {
  years:         number[]
  anchorYear:    number
  byYear:        Record<number, ForecastMonthInput[]>
  summaryByYear: Record<number, ForecastSummary>
  aggregate:     { forecast: number; actual: number; budget: number; profit: number; margin: number }
  chartData:     { year: string; forecast: number; actual: number; budget: number; profit: number }[]
  onDrillDown:   (year: number) => void
}) {
  const aggregateProfitColor = aggregate.profit >= 0 ? 'text-emerald-700' : 'text-red-600'
  const aggregateMarginColor = aggregate.margin >= 0 ? 'text-emerald-700' : 'text-red-600'

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label="三年累计预测开播收益"
          value={formatUsd(aggregate.forecast)}
          sub={`${years[0]}–${years[years.length - 1]}`}
        />
        <KpiCard
          label="三年累计成本预算"
          value={formatUsd(aggregate.budget)}
          sub="预算同步当前支出"
          linkTo="/expenses"
          linkLabel="去支出管理"
        />
        <KpiCard
          label="三年累计利润"
          value={formatUsd(aggregate.profit)}
          sub={aggregate.profit >= 0 ? '三年预计结余' : '三年预计亏损'}
          valueClassName={aggregateProfitColor}
        />
        <KpiCard
          label="三年综合毛利率"
          value={`${Math.round(aggregate.margin)}%`}
          sub="累计利润 / 累计收益"
          valueClassName={aggregateMarginColor}
        />
      </div>

      <div className="space-y-3 mb-4">
        {years.map((year) => {
          const summary = summaryByYear[year]
          const months  = byYear[year] ?? []
          const configuredMonths = months.filter((m) => m.rows.length > 0).length
          const margin = summary.yearly_forecast_usd > 0
            ? (summary.yearly_profit_usd / summary.yearly_forecast_usd) * 100
            : 0
          const profitColor = summary.yearly_profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
          const isCurrent = year === anchorYear

          // First profitable month indicator (uses the same logic the monthly KPI cards use).
          let cumProfit = 0
          let cumRevenue = 0
          let breakevenMonth: string | null = null
          for (const m of summary.months) {
            cumProfit += m.profit_usd
            cumRevenue += m.forecast_revenue_usd
            if (breakevenMonth === null && cumProfit >= 0 && cumRevenue > 0) {
              breakevenMonth = m.month
            }
          }

          return (
            <button
              key={year}
              type="button"
              onClick={() => onDrillDown(year)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{year}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      本年
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-1">
                    已配置 {configuredMonths}/12 月
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                  编辑月度 <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3">
                <YearStat label="预测开播收益" value={formatUsd(summary.yearly_forecast_usd)} />
                <YearStat label="实际开播收益" value={summary.yearly_actual_usd > 0 ? formatUsd(summary.yearly_actual_usd) : '—'} />
                <YearStat label="同步预算成本" value={formatUsd(summary.yearly_budget_usd)} />
                <YearStat label="预测利润" value={formatUsd(summary.yearly_profit_usd)} valueClassName={profitColor} />
                <YearStat
                  label="毛利率 / 盈亏平衡"
                  value={`${Math.round(margin)}%${breakevenMonth ? ` · ${breakevenMonth.slice(5)}月` : ''}`}
                  valueClassName={margin >= 0 ? 'text-emerald-700' : 'text-red-600'}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">三年走势对比</h2>
        <p className="text-xs text-slate-500 mb-4">每年聚合预测、实收、预算与利润；点击上方卡片下钻到月度</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatUsdCompact} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(value) => formatUsd(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="forecast" name="预测开播收益" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual"   name="实际开播收益" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="budget"   name="同步预算成本" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit"   name="预测利润"   fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function YearStat({
  label,
  value,
  valueClassName = 'text-slate-900',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide truncate" title={label}>
        {label}
      </p>
      <p className={`text-base sm:text-lg font-bold tabular-nums truncate mt-0.5 ${valueClassName}`} title={value}>
        {value}
      </p>
    </div>
  )
}

function YearSummaryTable({
  months,
  onSelectMonth,
}: {
  months: ReturnType<typeof summarizeForecast>['months']
  onSelectMonth: (index: number) => void
}) {
  const configured = months
    .map((m, index) => ({ ...m, index }))
    .filter((m) => m.rows.length > 0)

  const totalForecast = configured.reduce((sum, m) => sum + m.forecast_revenue_usd, 0)
  const totalActual   = configured.reduce((sum, m) => sum + m.actual_revenue_usd,   0)
  const totalBudget   = configured.reduce((sum, m) => sum + m.budget_cost_usd,      0)
  const totalProfit   = configured.reduce((sum, m) => sum + m.profit_usd,           0)

  if (configured.length === 0) {
    return (
      <div className="px-5 pb-8 pt-2 text-center text-sm text-slate-400">
        还没有任何月份配置了账号预测输入。
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">月份</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">已配置账号</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">预测开播收益</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">实际开播收益</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">预算成本</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">预测毛利润</th>
          </tr>
        </thead>
        <tbody>
          {configured.map((m) => {
            const profitColor = m.profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
            return (
              <tr
                key={m.month}
                className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onSelectMonth(m.index)}
                title="点击进入该月详情"
              >
                <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">
                  {m.month}
                  {m.note && (
                    <span className="ml-2 text-xs font-normal text-slate-400">{m.note}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {m.rows.map((r) => r.account_name).join('、')}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                  {formatUsd(m.forecast_revenue_usd)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {m.actual_revenue_usd > 0 ? formatUsd(m.actual_revenue_usd) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {formatUsd(m.budget_cost_usd)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${profitColor}`}>
                  {formatUsd(m.profit_usd)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wide">
              全年合计
            </td>
            <td className="px-4 py-3 text-xs text-slate-400">共 {configured.length} 个月</td>
            <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums text-base">
              {formatUsd(totalForecast)}
            </td>
            <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
              {totalActual > 0 ? formatUsd(totalActual) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
              {formatUsd(totalBudget)}
            </td>
            <td className={`px-4 py-3 text-right font-bold tabular-nums text-base ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatUsd(totalProfit)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function buildStorageKey(viewId: string, year: number | string): string {
  return `${STORAGE_KEY_PREFIX}:${viewId}:${year}`
}

function readDraft(storageKey: string): ForecastDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) as ForecastDraft : null
  } catch {
    return null
  }
}

function writeDraft(storageKey: string, months: ForecastMonthInput[]) {
  if (typeof window === 'undefined') return
  const draft: ForecastDraft = {
    version: 1,
    months: months.map((month) => ({
      month:              month.month,
      rows:               month.rows,
      actual_revenue_usd: month.actual_revenue_usd,
      note:               month.note,
    })),
  }
  window.localStorage.setItem(storageKey, JSON.stringify(draft))
}

function hasForecastInputs(months: ForecastMonthInput[]): boolean {
  return months.some((month) =>
    month.rows.length > 0 ||
    month.actual_revenue_usd > 0 ||
    Boolean(month.note?.trim())
  )
}

function saveStatusClass(status: SaveStatus): string {
  if (status === 'saved') return 'text-emerald-600'
  if (status === 'error') return 'text-red-500'
  if (status === 'saving') return 'text-slate-500'
  return 'text-transparent'
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName = 'text-slate-900',
  onClick,
  active,
  linkTo,
  linkLabel,
}: {
  label: string
  value: string
  sub: string
  valueClassName?: string
  onClick?: () => void
  active?: boolean
  linkTo?: string
  linkLabel?: string
}) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`relative bg-white rounded-xl border p-4 sm:p-5 transition-all select-none ${
        interactive ? 'cursor-pointer hover:shadow-sm' : ''
      } ${
        active
          ? 'border-indigo-400 ring-2 ring-indigo-50 shadow-sm'
          : interactive ? 'border-slate-200 hover:border-indigo-200' : 'border-slate-200'
      }`}
    >
      {linkTo && (
        <Link
          href={linkTo}
          title={linkLabel}
          aria-label={linkLabel}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      )}
      {interactive && !linkTo && (
        <ChevronDown
          className={`absolute top-3 right-3 w-4 h-4 transition-transform duration-200 ${active ? 'text-indigo-500 rotate-0' : 'text-slate-400 -rotate-90'}`}
        />
      )}

      <p
        className={`text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide truncate ${interactive || linkTo ? 'pr-6' : ''}`}
        title={label}
      >
        {label}
      </p>
      <p
        title={value}
        className={`text-lg lg:text-xl xl:text-2xl font-bold mt-1 tabular-nums truncate ${valueClassName}`}
      >
        {value}
      </p>
      <p className="text-[10px] sm:text-xs text-slate-400 mt-1 truncate" title={sub}>{sub}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

function SideStat({ label, value, valueClassName = 'text-slate-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-3">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className={`text-lg ${valueClassName}`}>{value}</strong>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  step = 1,
  max,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  max?: number
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
      readOnly={disabled}
      className={disabled
        ? `${INPUT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed`
        : INPUT_CLASS}
    />
  )
}

function StatusBadge({ revenue }: { revenue: number }) {
  if (revenue >= 8000) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">重点跟进</span>
  }
  if (revenue >= 3500) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">稳定</span>
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">观察</span>
}

function buildBreakdownData(months: ReturnType<typeof summarizeForecast>['months']) {
  return months.map((month) => {
    const revenue = month.forecast_revenue_usd
    const cost    = month.budget_cost_usd
    const profit  = revenue - cost
    return {
      label: month.month.slice(5),
      revenue,
      cost,
      profit,
    }
  })
}

function buildCumulativeData(months: ReturnType<typeof summarizeForecast>['months']) {
  let runningRevenue = 0
  let runningCost    = 0
  return months.map((month) => {
    runningRevenue += month.forecast_revenue_usd
    runningCost    += month.budget_cost_usd
    return {
      label:        month.month.slice(5),
      cum_revenue:  runningRevenue,
      cum_cost:     runningCost,
      cum_profit:   runningRevenue - runningCost,
    }
  })
}

function buildChartData(months: ReturnType<typeof summarizeForecast>['months'], mode: ChartMode) {
  if (mode !== 'indexed') {
    return months.map((month) => ({
      label:  month.month.slice(5),
      actual: month.actual_revenue_usd,
      budget: month.budget_cost_usd,
      ...month.by_account_type,
    }))
  }

  const bases = Object.fromEntries(
    FORECAST_ACCOUNT_TYPES.map((type) => [
      type,
      months.find((month) => month.by_account_type[type] > 0)?.by_account_type[type] ?? 0,
    ])
  ) as Record<ForecastAccountType, number>

  return months.map((month) => {
    const row: Record<string, number | string> = { label: month.month.slice(5) }
    for (const type of FORECAST_ACCOUNT_TYPES) {
      row[type] = bases[type] > 0 ? (month.by_account_type[type] / bases[type]) * 100 : 0
    }
    return row
  })
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatUsdCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${Number(value).toFixed(0)}`
}

const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
