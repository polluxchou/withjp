'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useCurrency } from '@/lib/currency'
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
import { Plus, RotateCcw, Copy, Trash2, ChevronDown, ArrowUpRight, ChevronRight, Lock, Map as MapIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Link } from '@/i18n/navigation'
import {
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

const CHART_TAB_KEYS = ['breakdown', 'cumulative', 'stacked', 'lines', 'indexed'] as const

type ChartMode = typeof CHART_TAB_KEYS[number]
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
  const [showYearView, setShowYearView] = useState(true)
  const [chartMode, setChartMode] = useState<ChartMode>('breakdown')
  const [inputOpen, setInputOpen] = useState(true)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loadingView, setLoadingView] = useState(false)
  const [viewBarBusy, setViewBarBusy] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  const [lifecycleEditorOpen, setLifecycleEditorOpen] = useState(false)
  const [addFromTemplateOpen, setAddFromTemplateOpen] = useState(false)
  const [lifecycleSet, setLifecycleSet] = useState<LifecycleTemplateSet | null>(null)

  // ── Currency formatting ──────────────────────────────────────────────────
  // Forecast amounts are stored in USD. The shared CurrencyContext uses CNY
  // as its base unit, so we convert USD → CNY (× 7) before calling fmt().
  const { fmt: fmtCurrency } = useCurrency()
  const USD_TO_CNY = 7
  const fmtForecast = useCallback(
    (usd: number) => fmtCurrency(usd * USD_TO_CNY, { compact: true }),
    [fmtCurrency],
  )
  // Alias kept for chart axis/tooltip call sites that pass fmtForecastCompact by name.
  const fmtForecastCompact = fmtForecast

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const canEditActive = activeView ? (isAdmin || activeView.owner_id === currentUserId) : false

  const didLoadDraft = useRef(false)
  const mountedRef   = useRef(false)
  const saveQueuesRef = useRef(new Map<string, ReturnType<typeof createLatestSaveQueue<ForecastMonthInput[]>>>())
  const prevByYearRef = useRef<Record<number, ForecastMonthInput[]>>(initialByYear)
  const prevViewIdRef = useRef<string | null>(defaultViewId)

  const months = byYear[selectedYear] ?? []
  const summary = useMemo(() => summarizeForecast(months), [months])
  const safeSelectedMonth = Math.min(Math.max(0, selectedMonth), Math.max(0, summary.months.length - 1))
  const selected = summary.months[safeSelectedMonth]
  const selectedRaw = months[safeSelectedMonth]

  const summaryByYear = useMemo(() => {
    const out: Record<number, ForecastSummary> = {}
    for (const y of years) out[y] = summarizeForecast(byYear[y] ?? [])
    return out
  }, [byYear, years])

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

  const cumulativeData = useMemo(() => buildCumulativeData(summary.months), [summary.months])
  const breakdownData = useMemo(() => buildBreakdownData(summary.months), [summary.months])
  const breakevenIndex = cumulativeData.findIndex((row) => row.cum_profit >= 0 && row.cum_revenue > 0)
  const breakevenMonth = breakevenIndex >= 0 ? summary.months[breakevenIndex].month : null
  const yearMarginPct  = summary.yearly_forecast_usd > 0
    ? (summary.yearly_profit_usd / summary.yearly_forecast_usd) * 100
    : 0

  const monthCumProfit      = cumulativeData[safeSelectedMonth]?.cum_profit ?? 0
  const monthsUntilBreakeven = breakevenIndex < 0 ? null : breakevenIndex - safeSelectedMonth

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
            account_name:           t('newAccountName'),
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
      for (const [year, rows] of Array.from(rowsByYear.entries())) {
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
                account_name:           accountName.trim() || t('newAccountName'),
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

    const first = planned[0]
    if (first) {
      setSelectedYear(first.year)
      setSelectedMonth(first.monthIndex)
      setExpandedRowId(first.rowId)
    }
  }

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

  useEffect(() => {
    if (!hydratedDraft) return
    if (!activeViewId || !canEditActive) return

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
        didLoadDraft.current = false
        prevViewIdRef.current = viewId
        prevByYearRef.current = next
        setByYear(next)
        setHydratedDraft(true)
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
      setActiveViewId(newView.id)
      setSelectedYear(anchorYear)
      setSelectedMonth(initialSelectedMonth)
      setShowYearView(false)
      await fetchViewForecast(newView.id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('alertCreateFailed'))
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
      window.alert(e instanceof Error ? e.message : t('alertUpdateFailed'))
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
      window.alert(e instanceof Error ? e.message : t('alertDeleteFailed'))
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

  const accountTypeLabels: Record<ForecastAccountType, string> = {
    key:     t('typeNameKey'),
    mature:  t('typeNameMature'),
    growing: t('typeNameGrowing'),
    newbie:  t('typeNameNewbie'),
    test:    t('typeNameTest'),
    other:   t('typeNameOther'),
  }

  const stageLabels: Record<LifecycleStartingStage, string> = {
    key:     t('stageNameKey'),
    mature:  t('stageNameMature'),
    growing: t('stageNameGrowing'),
    newbie:  t('stageNameNewbie'),
    test:    t('stageNameTest'),
  }

  const accountTypeNotes: Record<ForecastAccountType, string> = {
    key:     t('typeNoteKey'),
    mature:  t('typeNoteMature'),
    growing: t('typeNoteGrowing'),
    newbie:  t('typeNoteNewbie'),
    test:    t('typeNoteTest'),
    other:   t('typeNoteOther'),
  }

  const chartTabLabels: Record<ChartMode, string> = {
    breakdown:  t('chartBreakdown'),
    cumulative: t('chartCumulative'),
    stacked:    'Stacked',
    lines:      'Lines',
    indexed:    'Indexed',
  }

  return (
    <>
      {!activeView ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {viewMenu}
            <span className="text-sm text-slate-400">{t('noViewHint')}</span>
          </div>
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-500 mb-2">{t('noViewEmpty')}</p>
            <p className="text-xs text-slate-400">{t('noViewGuide')}</p>
          </div>
        </>
      ) : (<>

      {!canEditActive && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          {t('readOnlyBanner', {
            owner: activeView.owner_id === null ? t('readOnlySystem') : activeView.owner_name ?? t('readOnlyOther'),
          })}
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
          monthLabels={monthLabels}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-4">
            {showYearView ? (
              <>
                <KpiCard
                  label={t('kpiYearForecast', { year: selectedYear })}
                  value={fmtForecast(summary.yearly_forecast_usd)}
                  sub={inputOpen ? t('kpiCollapseHint') : t('kpiExpandHint')}
                  onClick={() => setInputOpen((o) => !o)}
                  active={inputOpen}
                />
                <KpiCard
                  label={t('kpiYearBudget', { year: selectedYear })}
                  value={fmtForecast(summary.yearly_budget_usd)}
                  sub={t('kpiYearBudgetSub')}
                  linkTo="/expenses"
                  linkLabel={t('goToExpenses')}
                />
                <KpiCard
                  label={t('kpiYearProfit', { year: selectedYear })}
                  value={fmtForecast(summary.yearly_profit_usd)}
                  sub={summary.yearly_profit_usd >= 0 ? t('kpiProfitSurplus') : t('kpiProfitLoss')}
                  valueClassName={yearlyProfitColor}
                />
                <KpiCard
                  label={t('kpiYearMargin', { year: selectedYear })}
                  value={`${Math.round(yearMarginPct)}%`}
                  sub={t('kpiYearMarginSub')}
                  valueClassName={yearMarginPct >= 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <KpiCard
                  label={t('kpiBreakeven')}
                  value={breakevenMonth ? (monthLabels[parseInt(breakevenMonth.slice(5), 10) - 1] ?? breakevenMonth.slice(5)) : '—'}
                  sub={breakevenMonth ? t('kpiBreakevenPositive') : t('kpiBreakevenNegative')}
                  valueClassName={breakevenMonth ? 'text-emerald-700' : 'text-slate-400'}
                />
                <KpiCard
                  label={t('kpiMonthMargin')}
                  value={!selected || selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
                  sub={selected ? t('kpiMonthEditing', { month: selected.month }) : ''}
                  valueClassName={selectedProfitColor}
                />
              </>
            ) : (
              <>
                <KpiCard
                  label={t('kpiMonthForecast')}
                  value={selected ? fmtForecast(selected.forecast_revenue_usd) : '—'}
                  sub={inputOpen ? t('kpiCollapseHint') : t('kpiExpandHint')}
                  onClick={() => setInputOpen((o) => !o)}
                  active={inputOpen}
                />
                <KpiCard
                  label={t('kpiMonthBudget')}
                  value={selected ? fmtForecast(selected.budget_cost_usd) : '—'}
                  sub={t('kpiYearBudgetSub')}
                  linkTo="/expenses"
                  linkLabel={t('goToExpenses')}
                />
                <KpiCard
                  label={t('kpiMonthProfit')}
                  value={selected ? fmtForecast(selected.profit_usd) : '—'}
                  sub={selected && selected.profit_usd >= 0 ? t('kpiMonthProfitSurplus') : t('kpiMonthProfitLoss')}
                  valueClassName={selectedProfitColor}
                />
                <KpiCard
                  label={t('kpiMonthCumProfit')}
                  value={fmtForecast(monthCumProfit)}
                  sub={selected ? t('kpiMonthCumProfitSub', { month: selected.month }) : ''}
                  valueClassName={monthCumProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <KpiCard
                  label={t('kpiMonthUntilBreakeven')}
                  value={
                    monthsUntilBreakeven === null
                      ? '—'
                      : monthsUntilBreakeven <= 0
                        ? t('kpiBreakevenReached')
                        : t('kpiBreakevenInMonths', { n: monthsUntilBreakeven })
                  }
                  sub={
                    monthsUntilBreakeven === null
                      ? t('kpiBreakevenNegative')
                      : monthsUntilBreakeven <= 0
                        ? t('kpiBreakevenPositive')
                        : breakevenMonth
                          ? (monthLabels[parseInt(breakevenMonth.slice(5), 10) - 1] ?? breakevenMonth.slice(5))
                          : ''
                  }
                  valueClassName={
                    monthsUntilBreakeven === null
                      ? 'text-slate-400'
                      : monthsUntilBreakeven <= 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                  }
                />
                <KpiCard
                  label={t('kpiMonthMargin')}
                  value={!selected || selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
                  sub={t('kpiMonthMarginSub')}
                  valueClassName={selectedProfitColor}
                />
              </>
            )}
          </div>

          <CostPlanningLinks />

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${inputOpen ? 'border-b border-slate-100' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                    {selected?.month.slice(0, 4) ?? selectedYear}
                  </span>
                  {!showYearView && (
                    <>
                      <span className="text-xl font-bold text-slate-300">·</span>
                      <span className="text-xl font-bold text-indigo-600 tabular-nums tracking-tight">
                        {selectedMonthLabel}
                      </span>
                    </>
                  )}
                  <span className="text-sm font-medium text-slate-500 ml-1.5">{t('revenueTitle')}</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {inputOpen && canEditActive && (
                  <AddAccountMenu
                    onAddTemplate={async () => {
                      await ensureLifecycleSet()
                      setAddFromTemplateOpen(true)
                    }}
                    onAddBlank={addRow}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setInputOpen((o) => !o)}
                  aria-label={inputOpen ? t('ariaCollapse') : t('ariaExpand')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${inputOpen ? '' : '-rotate-90'}`} />
                </button>
              </div>
            </div>

            {inputOpen && (
              <>
                <div className="px-5 pt-4">
                  <div className="flex items-center gap-3 flex-wrap mb-4 justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      <button
                        type="button"
                        onClick={() => setShowYearView((v) => !v)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          showYearView
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                      >
                        {t('allYear')}
                      </button>
                    </div>

                    {!showYearView && canEditActive && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={copyPreviousMonth}
                          disabled={safeSelectedMonth === 0}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Copy className="w-3 h-3" /> {t('copyPrevMonth')}
                        </button>
                        <button
                          type="button"
                          onClick={applyForward}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                        >
                          <Copy className="w-3 h-3" /> {t('applyForward')}
                        </button>
                        <button
                          type="button"
                          onClick={clearMonth}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:border-rose-300 hover:text-rose-600 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> {t('clearMonth')}
                        </button>
                      </div>
                    )}
                  </div>

                  {!showYearView && selectedRaw && <div className="grid gap-3 md:grid-cols-3 mb-4">
                    <Field label={t('actualRevenueLabel')}>
                      <NumberInput
                        value={selectedRaw.actual_revenue_usd}
                        onChange={(actual_revenue_usd) => updateSelectedMonth({ actual_revenue_usd })}
                        step={1000}
                        disabled={!canEditActive}
                      />
                    </Field>
                    <Field label={t('budgetSyncLabel')}>
                      <input
                        value={fmtForecast(selectedRaw.budget_cost_usd)}
                        readOnly
                        className="w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                      />
                      <div className="text-xs text-indigo-600 font-medium mt-1">{t('budgetSyncNote')}</div>
                    </Field>
                    <Field label={t('noteLabel')}>
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
                  <YearSummaryTable months={summary.months} onSelectMonth={(index) => { setShowYearView(false); setSelectedMonth(index) }} monthLabels={monthLabels} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1120px]">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colAccount')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colType')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colLiveDays')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colAvgHours')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colRevPerMin')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colShareRatio')}</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('colMonthRevenue')}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('colStatus')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(!selectedRaw || selectedRaw.rows.length === 0) ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                            {t('emptyMonth')}
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
                                <option key={type} value={type}>{accountTypeLabels[type]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.live_days} onChange={(live_days) => updateRow(index, { live_days })} max={31} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.avg_daily_hours} onChange={(avg_daily_hours) => updateRow(index, { avg_daily_hours })} step={0.5} max={24} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.revenue_per_minute_usd} onChange={(revenue_per_minute_usd) => updateRow(index, { revenue_per_minute_usd })} step={0.01} max={10000} />
                          </td>
                          <td className="px-4 py-3">
                            <NumberInput disabled={!canEditActive} value={row.share_ratio_pct} onChange={(share_ratio_pct) => updateRow(index, { share_ratio_pct })} step={0.1} max={100} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap tabular-nums bg-slate-50/70 border-l border-slate-100">{fmtForecast(row.monthly_revenue_usd)}</td>
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
                      {t('formula')}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{t('chartTitle', { year: selectedYear })}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {chartMode === 'breakdown'
                      ? t('chartDescBreakdown')
                      : chartMode === 'cumulative'
                      ? t('chartDescCumulative')
                      : t('chartDescOther')}
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {CHART_TAB_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChartMode(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        chartMode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {chartTabLabels[key]}
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
                      tickFormatter={fmtForecastCompact}
                      width={56}
                    />
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
                        const profitWord  = profit >= 0 ? t('tooltipProfit') : t('tooltipLoss')
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-md p-2.5 text-xs min-w-[180px]">
                            <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">{t('tooltipRevenue')}</span>
                              <span className="font-medium text-slate-900 tabular-nums">{fmtForecast(revenue)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">{t('tooltipCost')}</span>
                              <span className="font-medium text-slate-900 tabular-nums">{fmtForecast(cost)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-slate-100">
                              <span className="text-slate-500">{profitWord}</span>
                              <span className="font-bold tabular-nums" style={{ color: profitColor }}>
                                {fmtForecast(profit)}
                              </span>
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 4" />
                    <Bar dataKey="revenue" name={t('legendRevenue')} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="cost"    name={t('legendCost')}    fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name={t('legendProfitLine')}
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
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtForecastCompact} width={56} />
                    <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Area
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={accountTypeLabels[type]}
                        stackId="forecast"
                        stroke={ACCOUNT_TYPE_COLORS[type]}
                        fill={ACCOUNT_TYPE_COLORS[type]}
                        fillOpacity={0.72}
                      />
                    ))}
                    <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : chartMode === 'cumulative' ? (
                  <ComposedChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtForecastCompact} width={56} />
                    <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 4" />
                    {breakevenIndex >= 0 && (
                      <ReferenceLine
                        x={cumulativeData[breakevenIndex].label}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        label={{ value: t('breakevenLabel', { month: cumulativeData[breakevenIndex].label }), position: 'top', fontSize: 11, fill: '#10b981' }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="cum_profit"
                      name={t('legendCumProfit')}
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                    <Line type="monotone" dataKey="cum_revenue" name={t('legendCumRevenue')} stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cum_cost"    name={t('legendCumCost')}    stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={chartMode === 'indexed' ? (v) => `${Number(v).toFixed(0)}` : fmtForecastCompact}
                      width={56}
                    />
                    <Tooltip formatter={(value) => chartMode === 'indexed' ? Number(value).toFixed(0) : fmtForecast(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Line
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={accountTypeLabels[type]}
                        stroke={ACCOUNT_TYPE_COLORS[type]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    {chartMode === 'lines' && (
                      <>
                        <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                      </>
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <aside className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{t('typeContribTitle', { year: selectedYear })}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{t('typeContribSub')}</p>
                </div>
              </div>
              <div className="space-y-1">
                {FORECAST_ACCOUNT_TYPES.map((type) => (
                  <div key={type} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 border-b border-slate-50 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ACCOUNT_TYPE_COLORS[type] }} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">{accountTypeLabels[type]}</div>
                      <div className="text-xs text-slate-400">{accountTypeNotes[type]}</div>
                    </div>
                    <div className="text-xs font-semibold text-slate-900">{fmtForecast(summary.by_account_type[type] || 0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <SideStat label={t('sideMonthForecast')} value={fmtForecast(selected?.forecast_revenue_usd ?? 0)} />
                <SideStat label={t('sideMonthBudget')}   value={fmtForecast(selected?.budget_cost_usd ?? 0)} />
                <SideStat label={t('sideMonthProfit')}   value={fmtForecast(selected?.profit_usd ?? 0)} valueClassName={selectedProfitColor} />
              </div>
            </aside>
          </div>
        </>
      )}
      </>)}

      <LifecycleTemplateEditor
        open={lifecycleEditorOpen}
        onClose={() => setLifecycleEditorOpen(false)}
        onSaved={(set) => setLifecycleSet(set)}
      />

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
  const t = useTranslations('financeForecast')
  const [stage, setStage] = useState<LifecycleStartingStage>('newbie')
  const [name, setName]   = useState('')
  const canConfirm = !!lifecycleSet && name.trim().length > 0

  // Mirror parent's stage labels — the i18n migration defined these only
  // on FinanceForecastDashboard, but this child modal references them at
  // render time. Production build caught the out-of-scope reference even
  // though preview builds (with cached compilation) silently passed.
  const stageLabels: Record<LifecycleStartingStage, string> = {
    key:     t('stageNameKey'),
    mature:  t('stageNameMature'),
    growing: t('stageNameGrowing'),
    newbie:  t('stageNameNewbie'),
    test:    t('stageNameTest'),
  }

  function describeTemplate(s: LifecycleStartingStage): string {
    const tpl = lifecycleSet?.[s]
    if (!tpl) return t('lifecycleLoading')
    const totalHours = tpl.reduce((sum, c) => sum + c.live_days * c.avg_daily_hours, 0)
    return t('templateHours', { hours: totalHours.toFixed(0) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-5">
        <h2 className="text-base font-bold text-slate-900 mb-1">{t('templateModalTitle')}</h2>
        <p className="text-xs text-slate-500 mb-4">
          {t('templateModalDesc', {
            startLabel,
            startYear: horizonYears[0],
            endYear:   horizonYears[horizonYears.length - 1],
          })}
        </p>

        <label className="block mb-3">
          <span className="block text-xs font-medium text-slate-700 mb-1">{t('templateAccountLabel')}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('templateAccountPlaceholder')}
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">{t('templateStageLabel')}</span>
          <button
            type="button"
            onClick={onOpenEditor}
            className="text-[11px] text-indigo-600 hover:text-indigo-700"
          >
            {t('templateEditLink')}
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
              <span>{t('templateStageFrom', { stage: stageLabels[s] })}</span>
              <span className="text-[10px] font-normal text-slate-400 tabular-nums">{describeTemplate(s)}</span>
            </button>
          ))}
        </div>

        {!lifecycleSet && (
          <p className="text-[11px] text-amber-600 mb-3">
            {t('templateLoading')}<button type="button" onClick={onOpenEditor} className="underline mx-1">{t('templateEditInline')}</button>{t('templateLoadingSuffix')}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>{t('templateCancel')}</Button>
          <Button size="sm" onClick={() => canConfirm && onConfirm(stage, name)} disabled={!canConfirm}>
            <Plus className="w-3.5 h-3.5" /> {t('templateCreate')}
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
  leftSlot?:        ReactNode
}) {
  const t = useTranslations('financeForecast')
  const statusText = loading
    ? t('loadingView')
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
  const t = useTranslations('financeForecast')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
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
    ? t('annualView')
    : `${selectedYear}${selectedYear === anchorYear ? t('currentYearSuffix') : ''}`

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
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{t('viewLabel')}</span>
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
            label={t('annualView')}
            sub={t('annualSub')}
            active={viewMode === 'annual'}
            onClick={pickAnnual}
          />
          <div className="my-1 border-t border-slate-100" />
          {years.map((year) => (
            <ScopeOption
              key={year}
              label={`${year}${year === anchorYear ? t('currentYearSuffix') : ''}`}
              sub={t('monthlySub')}
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
  monthLabels,
}: {
  years:         number[]
  anchorYear:    number
  byYear:        Record<number, ForecastMonthInput[]>
  summaryByYear: Record<number, ForecastSummary>
  aggregate:     { forecast: number; actual: number; budget: number; profit: number; margin: number }
  chartData:     { year: string; forecast: number; actual: number; budget: number; profit: number }[]
  onDrillDown:   (year: number) => void
  monthLabels:   string[]
}) {
  const t = useTranslations('financeForecast')
  const { fmt: fmtCurrency } = useCurrency()
  const USD_TO_CNY = 7
  const fmtForecast        = (usd: number) => fmtCurrency(usd * USD_TO_CNY, { compact: true })
  const fmtForecastCompact = fmtForecast
  const aggregateProfitColor = aggregate.profit >= 0 ? 'text-emerald-700' : 'text-red-600'
  const aggregateMarginColor = aggregate.margin >= 0 ? 'text-emerald-700' : 'text-red-600'

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <KpiCard
          label={t('annualForecastTotal')}
          value={fmtForecast(aggregate.forecast)}
          sub={`${years[0]}–${years[years.length - 1]}`}
        />
        <KpiCard
          label={t('annualBudgetTotal')}
          value={fmtForecast(aggregate.budget)}
          sub={t('annualBudgetSub')}
          linkTo="/expenses"
          linkLabel={t('goToExpenses')}
        />
        <KpiCard
          label={t('annualProfitTotal')}
          value={fmtForecast(aggregate.profit)}
          sub={aggregate.profit >= 0 ? t('annualProfitSurplus') : t('annualProfitLoss')}
          valueClassName={aggregateProfitColor}
        />
        <KpiCard
          label={t('annualMarginTotal')}
          value={`${Math.round(aggregate.margin)}%`}
          sub={t('annualMarginSub')}
          valueClassName={aggregateMarginColor}
        />
      </div>

      <CostPlanningLinks />

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

          const breakevenLabel = breakevenMonth
            ? ` · ${monthLabels[parseInt(breakevenMonth.slice(5), 10) - 1] ?? breakevenMonth.slice(5)}`
            : ''

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
                      {t('currentYearBadge')}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-1">
                    {t('configuredMonths', { count: configuredMonths })}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                  {t('editMonthly')} <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3">
                <YearStat label={t('annualForecastRevenue')} value={fmtForecast(summary.yearly_forecast_usd)} />
                <YearStat label={t('annualActualRevenue')}   value={summary.yearly_actual_usd > 0 ? fmtForecast(summary.yearly_actual_usd) : '—'} />
                <YearStat label={t('annualBudgetCost')}      value={fmtForecast(summary.yearly_budget_usd)} />
                <YearStat label={t('annualForecastProfit')}  value={fmtForecast(summary.yearly_profit_usd)} valueClassName={profitColor} />
                <YearStat
                  label={t('annualMarginBreakeven')}
                  value={`${Math.round(margin)}%${breakevenLabel}`}
                  valueClassName={margin >= 0 ? 'text-emerald-700' : 'text-red-600'}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">{t('annualChartTitle')}</h2>
        <p className="text-xs text-slate-500 mb-4">{t('annualChartSub')}</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtForecastCompact} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="forecast" name={t('chartForecast')} fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual"   name={t('chartActual')}   fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="budget"   name={t('chartBudget')}   fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit"   name={t('chartProfit')}   fill="#3b82f6" radius={[4, 4, 0, 0]} />
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
  monthLabels,
}: {
  months: ReturnType<typeof summarizeForecast>['months']
  onSelectMonth: (index: number) => void
  monthLabels: string[]
}) {
  const t = useTranslations('financeForecast')
  const { fmt: fmtCurrency } = useCurrency()
  const USD_TO_CNY = 7
  const fmtForecast = (usd: number) => fmtCurrency(usd * USD_TO_CNY, { compact: true })
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
        {t('yearTableEmpty')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('yearColMonth')}</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">{t('yearColAccounts')}</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('yearColForecast')}</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('yearColActual')}</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('yearColBudget')}</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">{t('yearColProfit')}</th>
          </tr>
        </thead>
        <tbody>
          {configured.map((m) => {
            const profitColor = m.profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
            const monthNum = parseInt(m.month.slice(5), 10) - 1
            const monthLabel = monthLabels[monthNum] ?? m.month.slice(5)
            return (
              <tr
                key={m.month}
                className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onSelectMonth(m.index)}
                title={t('yearClickHint')}
              >
                <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">
                  {monthLabel}
                  {m.note && (
                    <span className="ml-2 text-xs font-normal text-slate-400">{m.note}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {m.rows.map((r) => r.account_name).join('、')}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                  {fmtForecast(m.forecast_revenue_usd)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {m.actual_revenue_usd > 0 ? fmtForecast(m.actual_revenue_usd) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {fmtForecast(m.budget_cost_usd)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${profitColor}`}>
                  {fmtForecast(m.profit_usd)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wide">
              {t('yearTotal')}
            </td>
            <td className="px-4 py-3 text-xs text-slate-400">{t('yearTotalMonths', { count: configured.length })}</td>
            <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums text-base">
              {fmtForecast(totalForecast)}
            </td>
            <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
              {totalActual > 0 ? fmtForecast(totalActual) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
              {fmtForecast(totalBudget)}
            </td>
            <td className={`px-4 py-3 text-right font-bold tabular-nums text-base ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmtForecast(totalProfit)}
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

function CostPlanningLinks() {
  const t = useTranslations('financeForecast')
  return (
    <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg bg-white text-indigo-600 border border-indigo-100 inline-flex items-center justify-center flex-shrink-0">
          <MapIcon className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">{t('venueEntryTitle')}</span>
          <span className="block text-xs text-slate-500 truncate">{t('venueEntryBody')}</span>
        </span>
      </div>
      <Link
        href="/guild-venue"
        className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors flex-shrink-0"
      >
        {t('goToVenue')} <ArrowUpRight className="w-4 h-4" />
      </Link>
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
  min = 0,
  max,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
}) {
  const format = (v: number) => (Number.isFinite(v) ? String(v) : '')
  const [draft, setDraft] = useState(() => format(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(format(value))
  }, [value, focused])

  const clamp = (n: number) => {
    let r = n
    if (r < min) r = min
    if (max !== undefined && r > max) r = max
    return r
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setDraft(raw)
    if (raw === '' || raw === '.') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = clamp(n)
    if (clamped !== value) onChange(clamped)
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    const raw = event.target.value
    const parsed = raw === '' || raw === '.' ? min : Number(raw)
    const next = Number.isFinite(parsed) ? clamp(parsed) : min
    if (next !== value) onChange(next)
    setDraft(format(next))
  }

  return (
    <input
      type="text"
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      pattern="[0-9]*\.?[0-9]*"
      value={draft}
      onChange={handleChange}
      onFocus={(event) => { setFocused(true); event.currentTarget.select() }}
      onBlur={handleBlur}
      onWheel={(event) => event.currentTarget.blur()}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      readOnly={disabled}
      className={disabled
        ? `${INPUT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed`
        : INPUT_CLASS}
    />
  )
}

function AddAccountMenu({
  onAddTemplate,
  onAddBlank,
}: {
  onAddTemplate: () => void
  onAddBlank: () => void
}) {
  const t = useTranslations('financeForecast')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => { onAddTemplate(); setOpen(false) }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> {t('addFromTemplate')}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center px-1.5 py-1.5 rounded-r-lg bg-indigo-600 text-white border-l border-indigo-500 hover:bg-indigo-700 transition-colors"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[10rem] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddTemplate(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" /> {t('addFromTemplate')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddBlank(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100"
          >
            <Plus className="w-3.5 h-3.5 text-slate-400" /> {t('addBlank')}
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ revenue }: { revenue: number }) {
  const t = useTranslations('financeForecast')
  if (revenue >= 8000) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{t('statusPriority')}</span>
  }
  if (revenue >= 3500) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{t('statusStable')}</span>
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{t('statusWatch')}</span>
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


const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
