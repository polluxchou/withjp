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
  { key: 'stacked',    label: 'Stacked' },
  { key: 'lines',      label: 'Lines' },
  { key: 'indexed',    label: 'Indexed' },
  { key: 'cumulative', label: '累计' },
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
  const [viewMode, setViewMode] = useState<ViewMode>('annual')
  const [selectedYear, setSelectedYear] = useState<number>(anchorYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(initialSelectedMonth)
  const [showYearView, setShowYearView] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('stacked')
  const [inputOpen, setInputOpen] = useState(true)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loadingView, setLoadingView] = useState(false)
  const [viewBarBusy, setViewBarBusy] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

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

  return (
    <>
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
      />

      {!activeView ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
          <p className="text-sm text-slate-500 mb-2">还没有任何可见的预测视角。</p>
          <p className="text-xs text-slate-400">使用上方"新建视角"按钮创建第一个预测场景。</p>
        </div>
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
                    {chartMode === 'cumulative'
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
                {chartMode === 'stacked' ? (
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
    </>
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
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {(['annual', 'monthly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode === 'annual' ? '年度视图' : '月度编辑'}
            </button>
          ))}
        </div>

        {viewMode === 'monthly' && (
          <div className="flex gap-1">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onChangeYear(year)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors tabular-nums ${
                  year === selectedYear
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {year}{year === anchorYear ? ' · 本年' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={`text-xs font-medium ${statusClass}`}>{statusText}</span>
    </div>
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
