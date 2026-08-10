'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
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
import Modal from '@/components/ui/Modal'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Tag from '@/components/ui/Tag'
import { Field, Input, Select } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'
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
import { AXIS, GRID, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, seriesColor, areaFill } from '@/lib/chart-theme'

// ForecastAccountType（重点号/成熟号/成长期/新号/测试号/其他）不是 design-system
// §1.3 已登记的"创作者生命周期"枚举（那组是 潜在客户/已联系/已互动/已入驻/准备
// 直播/直播中/已变现/已解约，站点、数量都不同），二者不是同一枚举，不能直接照搬
// 语义 tone——这里按纯系列色处理，取值沿用各类型原有色相位（key 紫 · growing 蓝 ·
// mature 绿 · newbie 橙 · test 粉 · other 灰）映射到 CHART_SERIES 对应位。
const ACCOUNT_TYPE_INDEX = {
  key:     0,
  growing: 1,
  mature:  2,
  newbie:  3,
  test:    4,
  other:   5,
} satisfies Record<ForecastAccountType, number>

const accountTypeColor = (type: ForecastAccountType): string => seriesColor(ACCOUNT_TYPE_INDEX[type])

// 累计利润面积图的渐变（§1.5 areaFill 14%→0 工厂）；只依赖静态系列色，模块级算一次即可。
const CUM_PROFIT_FILL = areaFill('ffd-cum-profit', seriesColor(0))

const CHART_TAB_KEYS = ['breakdown', 'cumulative', 'stacked', 'lines', 'indexed'] as const

// 本文件复用的裸样式组合：都写成完整类名字面量（不做 `text-${x}` 式拼接），
// Tailwind JIT 才能从源码里静态提取到——拼接出来的类名扫不到会静默失效。
// focus 环走 @/lib/ui/recipes 的 FOCUS_RING（§4 唯一登记处）。
// 月份/全年/视角这类互斥药丸：条目数远超 SegmentedControl 适用的「小范围互斥」
// （12 个月 + 全年），保留药丸行形态，只把配色换成 token。
const PILL_BASE = 'rounded-field border text-xs font-semibold transition-colors'
const PILL_ACTIVE = 'bg-primary text-white border-primary shadow-card'
const PILL_IDLE = 'bg-surface text-ink-700 border-line-strong hover:border-primary-border hover:text-primary'
// 表格上方的行级动作按钮（复制上月/顺延/清空）
const TOOL_BTN = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-field border border-line-strong bg-surface text-xs font-medium text-ink-700 hover:border-primary-border hover:text-primary transition-colors'
// 只读输入：Input 自带的 disabled: 样式对 readOnly 不生效，而 readOnly 又必须
// 保留（用户仍要能选中复制月度备注/账号名）。用 `read-only:` 变体补灰底与弱化
// 文字——伪类选择器特异性高于基础类，不受 Tailwind 生成顺序影响（同
// VenueInspector 的既有做法）。
const READONLY_INPUT = 'read-only:bg-canvas read-only:text-ink-500 read-only:cursor-not-allowed'
// 表头（design-system §6.2：表头 xs / ink-400）
const TH_LEFT = 'text-left px-4 py-3 text-xs font-medium text-ink-400'
const TH_RIGHT = 'text-right px-4 py-3 text-xs font-medium text-ink-400'

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

  // 盈利/亏损配色走 §1.3 语义 token（success 登记了「盈利」、danger 登记了「负值」），
  // 不再用 emerald/red 裸阶。
  const yearlyProfitColor = summary.yearly_profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
  const selectedProfitColor = selected && selected.profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'

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
    stacked:    t('chartStacked'),
    lines:      t('chartLines'),
    indexed:    t('chartIndexed'),
  }

  const chartTabItems = CHART_TAB_KEYS.map((key) => ({ value: key, label: chartTabLabels[key] }))

  return (
    <>
      {!activeView ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {viewMenu}
            <span className="text-sm text-ink-400">{t('noViewHint')}</span>
          </div>
          <div className="bg-surface border border-dashed border-line-strong rounded-card p-10 text-center">
            <p className="text-sm text-ink-500 mb-2">{t('noViewEmpty')}</p>
            <p className="text-xs text-ink-400">{t('noViewGuide')}</p>
          </div>
        </>
      ) : (<>

      {!canEditActive && (
        <div className="mb-4 px-4 py-2.5 rounded-field bg-warning-soft border border-warning-border text-xs text-warning-text flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
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
                  valueClassName={yearMarginPct >= 0 ? 'text-success-text' : 'text-danger-text'}
                />
                <KpiCard
                  label={t('kpiBreakeven')}
                  value={breakevenMonth ? (monthLabels[parseInt(breakevenMonth.slice(5), 10) - 1] ?? breakevenMonth.slice(5)) : '—'}
                  sub={breakevenMonth ? t('kpiBreakevenPositive') : t('kpiBreakevenNegative')}
                  valueClassName={breakevenMonth ? 'text-success-text' : 'text-ink-400'}
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
                  valueClassName={monthCumProfit >= 0 ? 'text-success-text' : 'text-danger-text'}
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
                      ? 'text-ink-400'
                      : monthsUntilBreakeven <= 0
                        ? 'text-success-text'
                        : 'text-ink-900'
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

          <section className="bg-surface border border-line rounded-card shadow-card overflow-hidden mb-4">
            <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${inputOpen ? 'border-b border-line-soft' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                {/* 刻意不套 §2 区块标题配方（lg/600/tracking-section）：这行不是
                    普通卡头，而是整个编辑面板的"当前年·当前月"定位锚——年份与
                    月份是用户在月份药丸行上反复切换的对象，需要比同屏其它卡头
                    更强的展示层级，故用 xl/700/tracking-title（§2 二级页头档）
                    并把月份染主色。同屏兄弟卡头（图表卡/贡献卡/年度图表卡）保持
                    lg/600/tracking-section 不变。 */}
                <h2 className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xl font-bold text-ink-900 tabular-nums tracking-title">
                    {selected?.month.slice(0, 4) ?? selectedYear}
                  </span>
                  {!showYearView && (
                    <>
                      <span aria-hidden className="text-xl font-bold text-ink-400">·</span>
                      <span className="text-xl font-bold text-primary tabular-nums tracking-title">
                        {selectedMonthLabel}
                      </span>
                    </>
                  )}
                  <span className="text-sm font-medium text-ink-500 ml-1.5">{t('revenueTitle')}</span>
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
                  className={`p-1.5 rounded-field text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${inputOpen ? '' : '-rotate-90'}`} strokeWidth={1.5} />
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
                              className={`min-w-[2.25rem] px-2.5 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${active ? PILL_ACTIVE : PILL_IDLE}`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowYearView((v) => !v)}
                        className={`px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${showYearView ? PILL_ACTIVE : PILL_IDLE}`}
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
                          className={`${TOOL_BTN} ${FOCUS_RING} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <Copy className="w-3 h-3" strokeWidth={1.5} /> {t('copyPrevMonth')}
                        </button>
                        <button
                          type="button"
                          onClick={applyForward}
                          className={`${TOOL_BTN} ${FOCUS_RING}`}
                        >
                          <Copy className="w-3 h-3" strokeWidth={1.5} /> {t('applyForward')}
                        </button>
                        <button
                          type="button"
                          onClick={clearMonth}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-field border border-line-strong bg-surface text-xs font-medium text-ink-500 hover:border-danger-border hover:text-danger-text transition-colors ${FOCUS_RING}`}
                        >
                          <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('clearMonth')}
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
                    <Field label={t('budgetSyncLabel')} hint={t('budgetSyncNote')}>
                      <Input value={fmtForecast(selectedRaw.budget_cost_usd)} readOnly className={READONLY_INPUT} />
                    </Field>
                    <Field label={t('noteLabel')}>
                      <Input
                        value={selectedRaw.note ?? ''}
                        onChange={(event) => updateSelectedMonth({ note: event.target.value })}
                        readOnly={!canEditActive}
                        className={READONLY_INPUT}
                      />
                    </Field>
                  </div>}
                </div>

                {showYearView ? (
                  <YearSummaryTable months={summary.months} onSelectMonth={(index) => { setShowYearView(false); setSelectedMonth(index) }} monthLabels={monthLabels} />
                ) : (
                  <>
                    {/* 递延：未迁 Table 原语。blocker 不是样式而是交互契约——
                        本表每格都是可编辑控件、且末列有行删除按钮，迁移本身可行；
                        真正卡住的是下面 YearSummaryTable 的整行点击（<tr onClick>），
                        Tr 契约明确不提供 onClick（<tr> 无原生键盘可达性），要迁就
                        得先把"点整行选月份"改造成行内 Link/button，属交互重设计而非
                        换皮。两张表同属本文件，一起迁才不会出现"半边 Table 原语 +
                        半边手写"的混用（§6）。 */}
                    <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1120px]">
                    <thead>
                      <tr className="border-y border-line bg-canvas">
                        <th className={TH_LEFT}>{t('colAccount')}</th>
                        <th className={TH_LEFT}>{t('colType')}</th>
                        <th className={TH_LEFT}>{t('colLiveDays')}</th>
                        <th className={TH_LEFT}>{t('colAvgHours')}</th>
                        <th className={TH_LEFT}>{t('colRevPerMin')}</th>
                        <th className={TH_LEFT}>{t('colShareRatio')}</th>
                        <th className={TH_RIGHT}>{t('colMonthRevenue')}</th>
                        <th className={TH_LEFT}>{t('colStatus')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(!selectedRaw || selectedRaw.rows.length === 0) ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">
                            {t('emptyMonth')}
                          </td>
                        </tr>
                      ) : calculatedRows.map((row, index) => (
                        <tr key={row.id} className="border-b border-line-soft hover:bg-row-hover transition-colors">
                          <td className="px-4 py-3">
                            <Input
                              value={row.account_name}
                              onChange={(event) => updateRow(index, { account_name: event.target.value })}
                              readOnly={!canEditActive}
                              className={READONLY_INPUT}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={row.account_type}
                              onChange={(event) => updateRow(index, { account_type: event.target.value as ForecastAccountType })}
                              disabled={!canEditActive}
                            >
                              {FORECAST_ACCOUNT_TYPES.map((type) => (
                                <option key={type} value={type}>{accountTypeLabels[type]}</option>
                              ))}
                            </Select>
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
                          <td className="px-4 py-3 text-right font-semibold text-ink-900 whitespace-nowrap tabular-nums bg-canvas border-l border-line-soft">{fmtForecast(row.monthly_revenue_usd)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge revenue={row.monthly_revenue_usd} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canEditActive && (<button
                              type="button"
                              aria-label={t('ariaDeleteRow')}
                              onClick={() => deleteRow(index)}
                              className={`inline-flex items-center rounded-field p-1 text-xs font-medium text-ink-400 hover:text-danger-text transition-colors ${FOCUS_RING}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                    <div className="m-5 rounded-card border border-dashed border-primary-border bg-primary-soft px-4 py-3 text-sm text-primary-hover">
                      {t('formula')}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="bg-surface border border-line rounded-card shadow-card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink-900 tracking-section truncate">{t('chartTitle', { year: selectedYear })}</h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {chartMode === 'breakdown'
                      ? t('chartDescBreakdown')
                      : chartMode === 'cumulative'
                      ? t('chartDescCumulative')
                      : t('chartDescOther')}
                  </p>
                </div>
                {/* 5 项互斥切换 = design-system §6.1 的 SegmentedControl 场景；
                    原来那圈灰底 + 白色激活块本就是它的手写复刻。 */}
                <SegmentedControl
                  items={chartTabItems}
                  value={chartMode}
                  onChange={(v) => setChartMode(v as ChartMode)}
                  label={t('chartTabsLabel')}
                />
              </div>

              <ResponsiveContainer width="100%" height={340}>
                {chartMode === 'breakdown' ? (
                  <ComposedChart data={breakdownData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
                    <Tooltip
                      content={(props) => {
                        const { active, payload, label } = props as unknown as {
                          active?: boolean
                          label?: string
                          payload?: { payload: { revenue: number; cost: number; profit: number } }[]
                        }
                        if (!active || !payload || payload.length === 0) return null
                        const { revenue, cost, profit } = payload[0].payload
                        const profitColor = profit >= 0 ? 'var(--success-dot)' : 'var(--danger-dot)'
                        const profitWord  = profit >= 0 ? t('tooltipProfit') : t('tooltipLoss')
                        return (
                          <div className="bg-surface border border-line rounded-field shadow-pop p-2.5 text-xs min-w-[180px]">
                            <p className="font-semibold text-ink-700 mb-1.5">{label}</p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-ink-500">{t('tooltipRevenue')}</span>
                              <span className="font-medium text-ink-900 tabular-nums">{fmtForecast(revenue)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-ink-500">{t('tooltipCost')}</span>
                              <span className="font-medium text-ink-900 tabular-nums">{fmtForecast(cost)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-line-soft">
                              <span className="text-ink-500">{profitWord}</span>
                              <span className="font-bold tabular-nums" style={{ color: profitColor }}>
                                {fmtForecast(profit)}
                              </span>
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="rgb(var(--ink-400) / 0.4)" strokeDasharray="2 4" />
                    <Bar dataKey="revenue" name={t('legendRevenue')} fill={seriesColor(2)} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="cost"    name={t('legendCost')}    fill={seriesColor(5)} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name={t('legendProfitLine')}
                      stroke={seriesColor(0)}
                      strokeWidth={2}
                      dot={{ fill: seriesColor(0), r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                ) : chartMode === 'stacked' ? (
                  <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
                    <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Area
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={accountTypeLabels[type]}
                        stackId="forecast"
                        stroke={accountTypeColor(type)}
                        fill={accountTypeColor(type)}
                        fillOpacity={0.72}
                      />
                    ))}
                    {/* NB: 6 个账户类型面积已用满 CHART_SERIES 全部 6 色，actual/budget
                        这两条叠加参考线不可避免与其中两个类型撞色（mature/newbie 原本
                        就分别是绿/橙——迁移前就是这个撞色，不是本次引入的新问题）；
                        用不同 strokeDasharray 保持二者仍可辨识，未额外造新 hex。 */}
                    <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="var(--success-dot)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="var(--warning-dot)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : chartMode === 'cumulative' ? (
                  <ComposedChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={CUM_PROFIT_FILL.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CUM_PROFIT_FILL.from} />
                        <stop offset="100%" stopColor={CUM_PROFIT_FILL.to} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
                    <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="rgb(var(--ink-400) / 0.4)" strokeDasharray="2 4" />
                    {breakevenIndex >= 0 && (
                      <ReferenceLine
                        x={cumulativeData[breakevenIndex].label}
                        stroke="var(--success-dot)"
                        strokeDasharray="4 4"
                        label={{ value: t('breakevenLabel', { month: cumulativeData[breakevenIndex].label }), position: 'top', fontSize: 11, fill: 'var(--success-dot)' }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="cum_profit"
                      name={t('legendCumProfit')}
                      stroke={seriesColor(0)}
                      fill={`url(#${CUM_PROFIT_FILL.id})`}
                      strokeWidth={2}
                    />
                    <Line type="monotone" dataKey="cum_revenue" name={t('legendCumRevenue')} stroke={seriesColor(2)} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cum_cost"    name={t('legendCumCost')}    stroke={seriesColor(3)} strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  </ComposedChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis
                      {...AXIS}
                      tickFormatter={chartMode === 'indexed' ? (v) => `${Number(v).toFixed(0)}` : fmtForecastCompact}
                      width={56}
                    />
                    <Tooltip formatter={(value) => chartMode === 'indexed' ? Number(value).toFixed(0) : fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <Line
                        key={type}
                        type="monotone"
                        dataKey={type}
                        name={accountTypeLabels[type]}
                        stroke={accountTypeColor(type)}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    {chartMode === 'lines' && (
                      <>
                        <Line type="monotone" dataKey="actual" name={t('legendActual')} stroke="var(--success-dot)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="budget" name={t('legendBudget')} stroke="var(--warning-dot)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                      </>
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <aside className="bg-surface border border-line rounded-card shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink-900 tracking-section truncate">{t('typeContribTitle', { year: selectedYear })}</h2>
                  <p className="text-xs text-ink-500 mt-0.5">{t('typeContribSub')}</p>
                </div>
              </div>
              <div className="space-y-1">
                {FORECAST_ACCOUNT_TYPES.map((type) => (
                  <div key={type} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 border-b border-line-soft last:border-0">
                    <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: accountTypeColor(type) }} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink-700">{accountTypeLabels[type]}</div>
                      <div className="text-xs text-ink-400">{accountTypeNotes[type]}</div>
                    </div>
                    <div className="text-xs font-semibold text-ink-900 tabular-nums">{fmtForecast(summary.by_account_type[type] || 0)}</div>
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
    // 阻断式创建流程 → 共享 Modal（design-system §6.1）：Escape/焦点圈定/portal/
    // 移动端底部弹出都由 Modal 兜底，不再手写 fixed inset-0 遮罩。
    // 原来的 autoFocus 一并去掉：Modal 打开时会把焦点收进面板本身，子元素的
    // autoFocus 必然被覆盖，留着只会误导读者。
    <Modal
      open
      onClose={onCancel}
      title={t('templateModalTitle')}
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{t('templateCancel')}</Button>
          <Button onClick={() => canConfirm && onConfirm(stage, name)} disabled={!canConfirm}>
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('templateCreate')}
          </Button>
        </>
      }
    >
      <p className="text-xs text-ink-500 mb-4">
        {t('templateModalDesc', {
          startLabel,
          startYear: horizonYears[0],
          endYear:   horizonYears[horizonYears.length - 1],
        })}
      </p>

      <div className="mb-3">
        <Field label={t('templateAccountLabel')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('templateAccountPlaceholder')}
          />
        </Field>
      </div>

      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-700">{t('templateStageLabel')}</span>
        <button
          type="button"
          onClick={onOpenEditor}
          className={`text-micro text-primary hover:text-primary-hover rounded-field px-1 ${FOCUS_RING}`}
        >
          {t('templateEditLink')}
        </button>
      </div>
      {/* 起始阶段是「选项 + 右侧说明」的纵向单选列表，不是 SegmentedControl
          那种等宽互斥条，保留本地形态只换配色 token。
          语义用 role="group" + aria-pressed（与 SegmentedControl.tsx 一致），
          不用 radiogroup/radio：APG 的 radiogroup 要求方向键在选项间移动焦点
          且组内只有一个 tab stop，这里没实现那套键盘契约，挂了 role 反而是
          对辅助技术撒谎——普通按钮的 Tab 逐项可达是诚实且可用的形态。 */}
      <div role="group" aria-label={t('templateStageLabel')} className="grid grid-cols-1 gap-1.5 mb-4">
        {LIFECYCLE_STARTING_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === stage}
            onClick={() => setStage(s)}
            className={`flex items-center justify-between gap-3 px-3 py-2 rounded-field border text-xs font-semibold transition-colors text-left ${FOCUS_RING} ${
              s === stage
                ? 'bg-primary-soft border-primary-border text-primary'
                : 'bg-surface border-line-strong text-ink-700 hover:border-primary-border'
            }`}
          >
            <span>{t('templateStageFrom', { stage: stageLabels[s] })}</span>
            <span className="text-micro font-normal text-ink-400 tabular-nums">{describeTemplate(s)}</span>
          </button>
        ))}
      </div>

      {!lifecycleSet && (
        <p className="text-micro text-warning-text">
          {t('templateLoading')}<button type="button" onClick={onOpenEditor} className={`underline mx-1 rounded-field ${FOCUS_RING}`}>{t('templateEditInline')}</button>{t('templateLoadingSuffix')}
        </p>
      )}
    </Modal>
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
  const statusClass = loading ? 'text-ink-500' : saveStatusClass(saveStatus)

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
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${open ? PILL_ACTIVE : PILL_IDLE}`}
      >
        <span className="text-micro font-medium uppercase tracking-wider opacity-80">{t('viewLabel')}</span>
        <span className="tabular-nums">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute top-full left-0 mt-2 min-w-[180px] bg-surface border border-line rounded-card shadow-pop z-40 p-1"
        >
          <ScopeOption
            label={t('annualView')}
            sub={t('annualSub')}
            active={viewMode === 'annual'}
            onClick={pickAnnual}
          />
          <div className="my-1 border-t border-line-soft" />
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
      // ring-inset：选项在 p-1 的窄弹层里，外扩 offset 环会被面板边缘裁掉（§4 第二配方 ③）
      className={`w-full text-left px-3 py-2 rounded-field text-xs font-semibold transition-colors flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
        active
          ? 'bg-primary-soft text-primary'
          : 'text-ink-700 hover:bg-line-soft'
      }`}
    >
      <span className="tabular-nums">{label}</span>
      <span className={`text-micro font-normal ${active ? 'text-primary' : 'text-ink-400'}`}>{sub}</span>
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
  const aggregateProfitColor = aggregate.profit >= 0 ? 'text-success-text' : 'text-danger-text'
  const aggregateMarginColor = aggregate.margin >= 0 ? 'text-success-text' : 'text-danger-text'

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
          const profitColor = summary.yearly_profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
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
              className={`w-full text-left bg-surface border border-line rounded-card shadow-card p-5 hover:border-primary-border transition-colors group ${FOCUS_RING}`}
            >
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums tracking-kpi text-ink-900">{year}</span>
                  {isCurrent && <Tag label={t('currentYearBadge')} tone="violet" size="sm" />}
                  <span className="text-xs text-ink-400 ml-1">
                    {t('configuredMonths', { count: configuredMonths })}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                  {t('editMonthly')} <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
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
                  valueClassName={margin >= 0 ? 'text-success-text' : 'text-danger-text'}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card p-5 mb-4">
        <h2 className="text-lg font-semibold text-ink-900 tracking-section mb-1">{t('annualChartTitle')}</h2>
        <p className="text-xs text-ink-500 mb-4">{t('annualChartSub')}</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="year" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtForecastCompact} width={56} />
            <Tooltip formatter={(value) => fmtForecast(Number(value))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="forecast" name={t('chartForecast')} fill={seriesColor(0)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual"   name={t('chartActual')}   fill={seriesColor(2)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="budget"   name={t('chartBudget')}   fill={seriesColor(3)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit"   name={t('chartProfit')}   fill={seriesColor(1)} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function YearStat({
  label,
  value,
  valueClassName = 'text-ink-900',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-micro sm:text-xs text-ink-500 font-medium uppercase tracking-wide truncate" title={label}>
        {label}
      </p>
      <p className={`text-md sm:text-lg font-bold tabular-nums truncate mt-0.5 ${valueClassName}`} title={value}>
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
      <div className="px-5 pb-8 pt-2 text-center text-sm text-ink-400">
        {t('yearTableEmpty')}
      </div>
    )
  }

  return (
    // 递延：未迁 Table 原语——下面的 <tr onClick> 是"点整行跳到该月"的主交互，
    // 而 Tr 契约不提供 onClick（§6.2：行级点击须由 RecordRow 或行内 Link/button
    // 承载）。迁移需要先重设计这段交互，超出本轮换皮范围。
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line bg-canvas">
            <th className={TH_LEFT}>{t('yearColMonth')}</th>
            <th className={TH_LEFT}>{t('yearColAccounts')}</th>
            <th className={TH_RIGHT}>{t('yearColForecast')}</th>
            <th className={TH_RIGHT}>{t('yearColActual')}</th>
            <th className={TH_RIGHT}>{t('yearColBudget')}</th>
            <th className={TH_RIGHT}>{t('yearColProfit')}</th>
          </tr>
        </thead>
        <tbody>
          {configured.map((m) => {
            const profitColor = m.profit_usd >= 0 ? 'text-success-text' : 'text-danger-text'
            const monthNum = parseInt(m.month.slice(5), 10) - 1
            const monthLabel = monthLabels[monthNum] ?? m.month.slice(5)
            return (
              <tr
                key={m.month}
                className="border-b border-line-soft hover:bg-row-hover transition-colors cursor-pointer"
                onClick={() => onSelectMonth(m.index)}
                title={t('yearClickHint')}
              >
                <td className="px-4 py-3 font-semibold text-ink-900 tabular-nums">
                  {monthLabel}
                  {m.note && (
                    <span className="ml-2 text-xs font-normal text-ink-400">{m.note}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {m.rows.map((r) => r.account_name).join('、')}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ink-900 tabular-nums">
                  {fmtForecast(m.forecast_revenue_usd)}
                </td>
                <td className="px-4 py-3 text-right text-ink-500 tabular-nums">
                  {m.actual_revenue_usd > 0 ? fmtForecast(m.actual_revenue_usd) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-ink-500 tabular-nums">
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
          <tr className="border-t-2 border-line bg-canvas">
            <td className="px-4 py-3 text-xs font-bold text-ink-700 uppercase tracking-wide">
              {t('yearTotal')}
            </td>
            <td className="px-4 py-3 text-xs text-ink-400">{t('yearTotalMonths', { count: configured.length })}</td>
            <td className="px-4 py-3 text-right font-bold text-ink-900 tabular-nums text-md">
              {fmtForecast(totalForecast)}
            </td>
            <td className="px-4 py-3 text-right font-bold text-ink-700 tabular-nums">
              {totalActual > 0 ? fmtForecast(totalActual) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-bold text-ink-700 tabular-nums">
              {fmtForecast(totalBudget)}
            </td>
            <td className={`px-4 py-3 text-right font-bold tabular-nums text-md ${totalProfit >= 0 ? 'text-success-text' : 'text-danger-text'}`}>
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
  if (status === 'saved') return 'text-success-text'
  if (status === 'error') return 'text-danger-text'
  if (status === 'saving') return 'text-ink-500'
  return 'text-transparent'
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName = 'text-ink-900',
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
      // 本文件里带 onClick 的 KPI 卡只有一种用途：折叠/展开下方输入面板，
      // active 就是展开态，故直接映射 aria-expanded。若将来出现非 disclosure
      // 语义的可点 KPI 卡，需要改成由调用方声明。
      aria-expanded={interactive ? Boolean(active) : undefined}
      // 激活态只留 border-primary-border + shadow-card（外加箭头转向与主色），
      // 不再叠 ring：ring 这一轨让给 §4 的 focus 环，两者共用会互相覆盖。
      className={`relative bg-surface rounded-card border p-4 sm:p-5 transition-colors select-none ${
        interactive ? `cursor-pointer ${FOCUS_RING}` : ''
      } ${
        active
          ? 'border-primary-border shadow-card'
          : interactive ? 'border-line hover:border-primary-border' : 'border-line'
      }`}
    >
      {linkTo && (
        <Link
          href={linkTo}
          title={linkLabel}
          aria-label={linkLabel}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-icon text-ink-400 hover:text-primary hover:bg-primary-soft transition-colors ${FOCUS_RING}`}
        >
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      )}
      {interactive && !linkTo && (
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={`absolute top-3 right-3 w-4 h-4 transition-transform duration-200 ${active ? 'text-primary rotate-0' : 'text-ink-400 -rotate-90'}`}
        />
      )}

      <p
        className={`text-micro sm:text-xs text-ink-500 font-medium uppercase tracking-wide truncate ${interactive || linkTo ? 'pr-6' : ''}`}
        title={label}
      >
        {label}
      </p>
      <p
        title={value}
        className={`text-lg lg:text-xl xl:text-2xl font-bold mt-1 tabular-nums tracking-kpi truncate ${valueClassName}`}
      >
        {value}
      </p>
      <p className="text-micro sm:text-xs text-ink-400 mt-1 truncate" title={sub}>{sub}</p>
    </div>
  )
}

function CostPlanningLinks() {
  const t = useTranslations('financeForecast')
  return (
    // 品牌软底 callout（§1.2 primary-soft 10% tinted，未做大面积彩色填充）
    <div className="mb-4 rounded-card border border-primary-border bg-primary-soft px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <span aria-hidden className="w-9 h-9 rounded-icon bg-surface text-primary inline-flex items-center justify-center flex-shrink-0">
          <MapIcon className="w-4 h-4" strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">{t('venueEntryTitle')}</span>
          <span className="block text-xs text-ink-500 truncate">{t('venueEntryBody')}</span>
        </span>
      </div>
      <Link
        href="/guild-venue"
        className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-btn border border-primary-border bg-surface px-4 text-sm font-medium text-primary-hover hover:bg-primary-soft-hover transition-colors flex-shrink-0 ${FOCUS_RING}`}
      >
        {t('goToVenue')} <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
      </Link>
    </div>
  )
}

function SideStat({ label, value, valueClassName = 'text-ink-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-3">
      <span className="text-xs text-ink-500">{label}</span>
      <strong className={`text-lg tabular-nums ${valueClassName}`}>{value}</strong>
    </div>
  )
}

// 数字输入：取值/钳位/草稿态行为原样保留，只把裸 input 换成共享 Input。
// `...rest` 必须整体透传：共享 Field 通过 cloneElement 往子元素上注入
// id / aria-describedby / aria-invalid / required，中间隔着这个包装组件时
// 不透传就会被整组吞掉——label 点击对不上焦点、hint 与错误也读不出来。
function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  disabled,
  ...rest
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min' | 'max' | 'disabled' | 'size'>) {
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
    <Input
      {...rest}
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
      className={`tabular-nums ${READONLY_INPUT}`}
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
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-field bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('addFromTemplate')}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('ariaAddAccountMenu')}
        className={`inline-flex items-center px-1.5 py-1.5 rounded-r-field bg-primary text-white border-l border-primary-hover hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
      >
        <ChevronDown aria-hidden className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="menu"
          // z-40 = §3 层级表的「下拉/popover」档（原来的 z-20 不在表内）
          className="absolute right-0 top-full mt-1 z-40 min-w-[10rem] bg-surface border border-line rounded-card shadow-pop overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddTemplate(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-line-soft text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
          >
            <Plus className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} /> {t('addFromTemplate')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddBlank(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-line-soft text-left border-t border-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
          >
            <Plus className="w-3.5 h-3.5 text-ink-400" strokeWidth={1.5} /> {t('addBlank')}
          </button>
        </div>
      )}
    </div>
  )
}

// 收入档 → tone 映射登记在 design-system §1.3 状态枚举表（财务预测账号收入档）。
function StatusBadge({ revenue }: { revenue: number }) {
  const t = useTranslations('financeForecast')
  if (revenue >= 8000) return <Tag label={t('statusPriority')} tone="success" size="sm" />
  if (revenue >= 3500) return <Tag label={t('statusStable')} tone="violet" size="sm" />
  return <Tag label={t('statusWatch')} tone="warning" size="sm" />
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

