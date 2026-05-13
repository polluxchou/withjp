'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  Area,
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
import { Plus, RotateCcw, Copy, Trash2, ChevronDown, ArrowUpRight, MoreHorizontal } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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
} from '@/lib/finance-forecast/calculations'
import { createLatestSaveQueue } from '@/lib/finance-forecast/save-queue'

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

interface Props {
  initialMonths: ForecastMonthInput[]
  initialSelectedMonth?: number
}

const STORAGE_KEY_PREFIX = 'finance-forecast:draft'

export default function FinanceForecastDashboard({ initialMonths, initialSelectedMonth = 0 }: Props) {
  const t = useTranslations('financeForecast')
  const [months, setMonths] = useState<ForecastMonthInput[]>(initialMonths)
  const [selectedMonth, setSelectedMonth] = useState(initialSelectedMonth)
  const [showYearView, setShowYearView] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('stacked')
  const [inputOpen, setInputOpen] = useState(true)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  // Mobile-only UI state. On `<lg` the account list renders as a card list
  // where only one card can be expanded for editing at a time. `null` =
  // everything collapsed (the default state per UX spec).
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  // Pending-delete row drives the confirm modal. Shared between desktop
  // and mobile so deletions on either layout require a second tap.
  // We capture both the row's id and the month index it lives in at click
  // time, so a month-switch while the modal is open can't redirect the
  // delete to the wrong row.
  const [deletingRow, setDeletingRow] = useState<{ monthIndex: number; rowId: string; name: string } | null>(null)
  const storageKey = useMemo(() => buildStorageKey(initialMonths), [initialMonths])
  const didLoadDraft    = useRef(false)
  const storageKeyRef   = useRef(storageKey)
  const mountedRef      = useRef(false)
  const saveQueueRef = useRef<ReturnType<typeof createLatestSaveQueue<ForecastMonthInput[]>> | null>(null)
  // Always points at the latest months. The autosave timer's callback
  // reads this ref instead of the closure variable, so that a setTimeout
  // scheduled before a destructive op (delete / clear) — but firing
  // *after* it because React 18 hadn't yet committed the cleanup — can't
  // re-PUT the pre-delete snapshot and resurrect the deleted row.
  const monthsRef = useRef(months)
  monthsRef.current = months

  const summary = useMemo(() => summarizeForecast(months), [months])
  const selected = summary.months[selectedMonth]
  const selectedRaw = months[selectedMonth]

  const chartData = useMemo(() => buildChartData(summary.months, chartMode), [summary.months, chartMode])
  const calculatedRows = useMemo(() => calculateForecastRows(selectedRaw.rows), [selectedRaw.rows])

  // Cumulative running totals — used by both the "累计" chart tab and the
  // breakeven KPI card. Computed once so the chart and the card agree.
  const cumulativeData = useMemo(() => buildCumulativeData(summary.months), [summary.months])
  const breakevenIndex = cumulativeData.findIndex((row) => row.cum_profit >= 0 && row.cum_revenue > 0)
  const breakevenMonth = breakevenIndex >= 0 ? summary.months[breakevenIndex].month : null
  const yearMarginPct  = summary.yearly_forecast_usd > 0
    ? (summary.yearly_profit_usd / summary.yearly_forecast_usd) * 100
    : 0

  if (!saveQueueRef.current) {
    saveQueueRef.current = createLatestSaveQueue<ForecastMonthInput[]>(
      async (snapshot) => {
        const res = await fetch('/api/finance-forecast', {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            year: Number(snapshot[0]?.month.slice(0, 4)) || new Date().getUTCFullYear(),
            months: snapshot,
          }),
        })

        if (!res.ok) throw new Error('Failed to save finance forecast')
      },
      (status) => {
        if (mountedRef.current) setSaveStatus(status)
      },
    )
  }

  function updateSelectedMonth(patch: Partial<ForecastMonthInput>) {
    setMonths((prev) => prev.map((month, index) => index === selectedMonth ? { ...month, ...patch } : month))
  }

  function updateRow(rowIndex: number, patch: Partial<ForecastAccountInput>) {
    setMonths((prev) => prev.map((month, index) => {
      if (index !== selectedMonth) return month
      return {
        ...month,
        rows: month.rows.map((row, idx) => idx === rowIndex ? { ...row, ...patch } : row),
      }
    }))
  }

  function addRow() {
    // Capture the new id outside setMonths so we can auto-expand the new
    // card on mobile (the only natural follow-up to clicking "添加账号"
    // is filling in the name).
    const newId = `${selectedRaw.month}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setMonths((prev) => prev.map((month, i) => {
      if (i !== selectedMonth) return month
      return {
        ...month,
        rows: [
          ...month.rows,
          {
            id:                     newId,
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
    setExpandedRowId(newId)
  }

  // Queue destructive ops immediately so a slower previous autosave cannot
  // resurrect deleted rows.
  function persistNow(newMonths: ForecastMonthInput[]) {
    writeDraft(storageKeyRef.current, newMonths)
    saveQueueRef.current?.enqueue(newMonths)
  }

  // Delete by row id (not by array index). Order of `rows` is not
  // guaranteed stable across renders/reloads — the DB query has no
  // secondary sort, and the user can switch months while the confirm
  // modal is open. Filtering by id makes the delete robust to both.
  function deleteRowById(monthIndex: number, rowId: string) {
    const newMonths = months.map((month, index) =>
      index === monthIndex
        ? { ...month, rows: month.rows.filter((row) => row.id !== rowId) }
        : month
    )
    setMonths(newMonths)
    persistNow(newMonths)
    setExpandedRowId(null)
  }

  function requestDeleteRow(rowIndex: number) {
    const row = selectedRaw.rows[rowIndex]
    if (!row) return
    setDeletingRow({ monthIndex: selectedMonth, rowId: row.id, name: row.account_name || '此账号' })
  }

  function confirmDelete() {
    if (deletingRow) deleteRowById(deletingRow.monthIndex, deletingRow.rowId)
    setDeletingRow(null)
  }

  function clearMonth() {
    const newMonths = months.map((month, index) =>
      index === selectedMonth ? { ...month, rows: [], note: '' } : month
    )
    setMonths(newMonths)
    persistNow(newMonths)
  }

  function copyPreviousMonth() {
    if (selectedMonth === 0) return
    setMonths((prev) => {
      const previous = prev[selectedMonth - 1]
      const current  = prev[selectedMonth]
      return prev.map((month, i) => {
        if (i !== selectedMonth) return month
        return {
          ...month,
          rows: previous.rows.map((row) => ({ ...row, id: `${current.month}-${row.id}` })),
        }
      })
    })
  }

  function applyForward() {
    setMonths((prev) => {
      const source = prev[selectedMonth]
      return prev.map((month, index) => {
        if (index <= selectedMonth) return month
        return {
          ...month,
          rows: source.rows.map((row) => ({ ...row, id: `${month.month}-${row.id}` })),
        }
      })
    })
  }

  storageKeyRef.current = storageKey

  const yearlyProfitColor = summary.yearly_profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
  const selectedProfitColor = selected.profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (didLoadDraft.current) return
    didLoadDraft.current = true
    const draft = readDraft(storageKey)
    if (draft) {
      setMonths((current) => hasForecastInputs(current) ? current : mergeForecastDraft(current, draft))
    }
    setHydratedDraft(true)
  }, [storageKey])

  useEffect(() => {
    if (!hydratedDraft) return
    if (!saveQueueRef.current?.isSaving()) setSaveStatus('idle')
    writeDraft(storageKey, months)
    const timer = window.setTimeout(async () => {
      // Read latest from ref — not the closure — to avoid a stale
      // snapshot resurrecting rows that were just deleted.
      saveQueueRef.current?.enqueue(monthsRef.current)
    }, 700)

    return () => {
      window.clearTimeout(timer)
    }
  }, [hydratedDraft, months, storageKey])

  // Always collapse the expanded card when switching months. Editing is
  // strictly scoped to the currently-selected month, so an "open" state
  // is meaningless after the user moves to another month.
  useEffect(() => { setExpandedRowId(null) }, [selectedMonth])

  // Close the mobile actions dropdown on outside click / Escape.
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!actionsMenuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!actionsMenuRef.current?.contains(e.target as Node)) setActionsMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActionsMenuOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [actionsMenuOpen])

  const monthLabels = t.raw('months') as string[]
  const selectedMonthLabel = monthLabels[parseInt(selected.month.slice(5), 10) - 1] ?? selected.month.slice(5)

  // Wrap each action so the dropdown closes after invoking. Shared between
  // the desktop button row and the mobile menu.
  function runAction(fn: () => void) {
    fn()
    setActionsMenuOpen(false)
  }

  // Cumulative profit through the selected month (inclusive). Used by the
  // month-view "当月累计利润" KPI so users can see whether they've turned
  // the corner on a running basis without flipping back to the year view.
  const selectedCumulativeProfit = cumulativeData[selectedMonth]?.cum_profit ?? 0
  const selectedCumulativeProfitColor = selectedCumulativeProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
  const monthMarginColor = selected.margin_pct === null
    ? 'text-slate-400'
    : selected.margin_pct >= 0 ? 'text-emerald-700' : 'text-red-600'

  return (
    <>
      {/* Row 1: KPI summary. Two distinct shapes:
            - Year view (showYearView=true): 6 cards summarising the whole 12 months.
            - Month view (showYearView=false): 5 cards focused on the selected month
              so the user sees this-month metrics at a glance while editing. */}
      {showYearView ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-4">
          <KpiCard
            label="全年预测开播收益"
            value={formatUsd(summary.yearly_forecast_usd)}
            sub={inputOpen ? '点击收起账号明细' : '点击展开账号明细'}
            onClick={() => setInputOpen((o) => !o)}
            active={inputOpen}
          />
          <KpiCard
            label="全年成本预算"
            value={formatUsd(summary.yearly_budget_usd)}
            sub="当前预算 CNY 按 1 USD = 7 CNY 换算"
            linkTo="/expenses"
            linkLabel="去支出管理"
          />
          <KpiCard
            label="年度累计利润"
            value={formatUsd(summary.yearly_profit_usd)}
            sub={summary.yearly_profit_usd >= 0 ? '全年预计结余' : '全年预计亏损'}
            valueClassName={yearlyProfitColor}
          />
          <KpiCard
            label="年度毛利率"
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
            value={selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
            sub={`${selected.month} 正在编辑`}
            valueClassName={selectedProfitColor}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4">
          <KpiCard
            label="当月预测开播收益"
            value={formatUsd(selected.forecast_revenue_usd)}
            sub={inputOpen ? '点击收起账号明细' : '点击展开账号明细'}
            onClick={() => setInputOpen((o) => !o)}
            active={inputOpen}
          />
          <KpiCard
            label="当月成本预算"
            value={formatUsd(selected.budget_cost_usd)}
            sub="当前预算 CNY 按 1 USD = 7 CNY 换算"
            linkTo="/expenses"
            linkLabel="去支出管理"
          />
          <KpiCard
            label="当月利润"
            value={formatUsd(selected.profit_usd)}
            sub={selected.profit_usd >= 0 ? '本月预计结余' : '本月预计亏损'}
            valueClassName={selectedProfitColor}
          />
          <KpiCard
            label="当月累计利润"
            value={formatUsd(selectedCumulativeProfit)}
            sub={`截至 ${selectedMonthLabel} 累计`}
            valueClassName={selectedCumulativeProfitColor}
          />
          <KpiCard
            label="当月毛利率"
            value={selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
            sub="当月利润 / 当月收益"
            valueClassName={monthMarginColor}
          />
        </div>
      )}

      {/* Row 2: Account forecast input (collapsible) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
        <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${inputOpen ? 'border-b border-slate-100' : ''}`}>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                {selected.month.slice(0, 4)}
              </span>
              <span className="text-xl font-bold text-slate-300">·</span>
              <span className="text-xl font-bold text-indigo-600 tabular-nums tracking-tight">
                {selectedMonthLabel}
              </span>
              <span className="text-sm font-medium text-slate-500 ml-1.5">预测收入</span>
            </h2>
            <span className="hidden sm:block text-xs text-slate-400 truncate">每个月单独设置账号参数，输入自动保存</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-medium ${saveStatusClass(saveStatus)}`}>
              {saveStatus === 'saving' ? t('statusSaving') : saveStatus === 'saved' ? t('statusSaved') : saveStatus === 'error' ? t('statusError') : ''}
            </span>
            {/* Desktop: 4 buttons inline — same as before. */}
            {inputOpen && (
              <div className="hidden lg:flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={copyPreviousMonth} disabled={selectedMonth === 0}>
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
              </div>
            )}
            {/* Mobile: all 4 actions collapse into a single dropdown so the
                header stays one line and destructive actions sit away from
                the additive "添加账号" primary. */}
            {inputOpen && (
              <div ref={actionsMenuRef} className="lg:hidden relative">
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={actionsMenuOpen}
                  aria-label="操作"
                  className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {actionsMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runAction(addRow)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-indigo-600 font-medium hover:bg-indigo-50"
                    >
                      <Plus className="w-4 h-4" /> 添加账号
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={selectedMonth === 0}
                      onClick={() => runAction(copyPreviousMonth)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <Copy className="w-4 h-4" /> 复制上月
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runAction(applyForward)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="w-4 h-4" /> 应用到后续月份
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runAction(clearMonth)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4" /> 清空本月
                    </button>
                  </div>
                )}
              </div>
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
                {(() => {
                  const groups: { year: string; entries: { index: number; label: string; key: string }[] }[] = []
                  months.forEach((month, index) => {
                    const year     = month.month.slice(0, 4)
                    const monthNum = parseInt(month.month.slice(5), 10) - 1
                    const label    = monthLabels[monthNum] ?? month.month.slice(5)
                    const last = groups[groups.length - 1]
                    if (last && last.year === year) {
                      last.entries.push({ index, label, key: month.month })
                    } else {
                      groups.push({ year, entries: [{ index, label, key: month.month }] })
                    }
                  })
                  return groups.map(({ year, entries }) => (
                    <div key={year} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-400 tracking-wider tabular-nums">
                        {year}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {entries.map(({ index, label, key }) => {
                          const active = !showYearView && index === selectedMonth
                          return (
                            <button
                              key={key}
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
                  ))
                })()}
                <button
                  type="button"
                  onClick={() => setShowYearView((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    showYearView
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  全年
                </button>
              </div>

              {!showYearView && <div className="grid gap-3 md:grid-cols-3 mb-4">
                <Field label="当前月实际开播收益（美金）">
                  <NumberInput
                    value={selectedRaw.actual_revenue_usd}
                    onChange={(actual_revenue_usd) => updateSelectedMonth({ actual_revenue_usd })}
                    step={1000}
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
                    className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </Field>
              </div>}
            </div>

            {showYearView ? (
              <YearSummaryTable months={summary.months} onSelectMonth={(index) => { setShowYearView(false); setSelectedMonth(index) }} />
            ) : (
              <>
                {/* Desktop / tablet: wide editable table. */}
                <div className="hidden lg:block overflow-x-auto">
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
                  {selectedRaw.rows.length === 0 ? (
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
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.account_type}
                          onChange={(event) => updateRow(index, { account_type: event.target.value as ForecastAccountType })}
                          className={INPUT_CLASS}
                        >
                          {FORECAST_ACCOUNT_TYPES.map((type) => (
                            <option key={type} value={type}>{FORECAST_ACCOUNT_TYPE_LABELS[type]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput value={row.live_days} onChange={(live_days) => updateRow(index, { live_days })} />
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput value={row.avg_daily_hours} onChange={(avg_daily_hours) => updateRow(index, { avg_daily_hours })} step={0.5} />
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput value={row.revenue_per_minute_usd} onChange={(revenue_per_minute_usd) => updateRow(index, { revenue_per_minute_usd })} step={0.01} />
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput value={row.share_ratio_pct} onChange={(share_ratio_pct) => updateRow(index, { share_ratio_pct })} max={100} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{formatUsd(row.monthly_revenue_usd)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge revenue={row.monthly_revenue_usd} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          aria-label="Delete row"
                          onClick={() => requestDeleteRow(index)}
                          className="inline-flex items-center text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

                {/* Mobile: card list. Each row collapses to a one-glance summary
                    and expands inline into a stacked form. Only one card open
                    at a time. */}
                <MobileAccountList
                  rows={calculatedRows}
                  expandedRowId={expandedRowId}
                  onToggle={(id) => setExpandedRowId((cur) => cur === id ? null : id)}
                  onChange={updateRow}
                  onDelete={requestDeleteRow}
                  onAdd={addRow}
                />

                <div className="m-5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
                  计算公式：月开播收益 = 开播天数 × 平均每日开播时长 × 60 × 分钟收益 × 可分润比例。预测收入会保存到 Supabase；成本预算从当前预算同步，支出金额按 CNY 存储，并按 1 USD = 7 CNY 换算为美金后参与毛利润计算。
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
              <h2 className="text-sm font-semibold text-slate-900">预测曲线</h2>
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
                {/* Zero baseline so the user can read where cumulative profit crosses 0. */}
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 4" />
                {/* Breakeven marker — only drawn when cumulative profit has turned positive. */}
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
              <h2 className="text-sm font-semibold text-slate-900">账号类型贡献</h2>
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
            <SideStat label="当前月预测" value={formatUsd(selected.forecast_revenue_usd)} />
            <SideStat label="当前月同步预算" value={formatUsd(selected.budget_cost_usd)} />
            <SideStat label="当前月结余" value={formatUsd(selected.profit_usd)} valueClassName={selectedProfitColor} />
          </div>
        </aside>
      </div>

      {/* Delete confirmation — shared by the desktop table row trash icon
          and the mobile card's delete button so we never lose a row to a
          stray tap. */}
      <Modal open={!!deletingRow} onClose={() => setDeletingRow(null)} title="删除账号">
        {deletingRow && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              确定要删除 <strong className="text-slate-900">{deletingRow.name}</strong> 吗？删除后无法恢复，本月的账号类型贡献和 KPI 会立刻重新计算。
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingRow(null)}>取消</Button>
              <Button variant="danger" onClick={confirmDelete}>删除</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
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
        还没有任何月份配置了预测收入。
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

function buildStorageKey(months: ForecastMonthInput[]): string {
  const year = months[0]?.month.slice(0, 4) || 'default'
  return `${STORAGE_KEY_PREFIX}:${year}`
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
  /** Optional navigation target — renders an arrow chip top-right that links there. */
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
      {/* Top-right corner indicator: either a "go to page" arrow (linkTo)
          or a "click to expand" chevron (onClick). These are mutually
          exclusive in practice. The label below gets a little right
          padding so it never collides with the indicator. */}
      {linkTo && (
        <Link
          href={linkTo}
          title={linkLabel}
          aria-label={linkLabel}
          /* stopPropagation so the arrow doesn't trigger any future card onClick */
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
      {/* Value scales down on smaller breakpoints; tabular-nums keeps digit
          widths consistent across cards. The truncate + title pair is a
          safety net for the rare case a number is still wider than the
          card (hover surfaces the full value). */}
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

// ── Mobile account list ──────────────────────────────────────────
//
// On `<lg` we drop the wide editable table in favour of a card list.
// Each card has two states:
//   collapsed → one-line summary: name + type/status + key meta + 月开播收益
//   expanded  → stacked form with full-width inputs (good touch targets)
// Only one card can be expanded at a time so the page stays scannable.

type CalculatedRow = ForecastAccountInput & { monthly_revenue_usd: number }

function MobileAccountList({
  rows,
  expandedRowId,
  onToggle,
  onChange,
  onDelete,
  onAdd,
}: {
  rows:          CalculatedRow[]
  expandedRowId: string | null
  onToggle:      (id: string) => void
  onChange:      (rowIndex: number, patch: Partial<ForecastAccountInput>) => void
  onDelete:      (rowIndex: number) => void
  onAdd:         () => void
}) {
  if (rows.length === 0) {
    return (
      <div className="lg:hidden px-4 py-8 text-center">
        <p className="text-sm text-slate-500 mb-3">
          当前月份还没有预测输入。添加账号后，账号类型贡献、曲线和 KPI 才会开始计算。
        </p>
        <Button onClick={onAdd}>
          <Plus className="w-4 h-4" /> 添加账号
        </Button>
      </div>
    )
  }
  return (
    <ul className="lg:hidden divide-y divide-slate-100">
      {rows.map((row, index) => {
        const open = expandedRowId === row.id
        return (
          <li key={row.id}>
            {open
              ? <MobileAccountCardExpanded row={row} index={index} onCollapse={() => onToggle(row.id)} onChange={onChange} onDelete={onDelete} />
              : <MobileAccountCardCollapsed row={row} onExpand={() => onToggle(row.id)} />}
          </li>
        )
      })}
    </ul>
  )
}

function MobileAccountCardCollapsed({
  row,
  onExpand,
}: {
  row:      CalculatedRow
  onExpand: () => void
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-900 truncate">{row.account_name || '未命名'}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 flex-shrink-0">
            {FORECAST_ACCOUNT_TYPE_LABELS[row.account_type]}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <StatusBadge revenue={row.monthly_revenue_usd} />
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums truncate">
          {row.live_days}天 · {row.avg_daily_hours}h · ${row.revenue_per_minute_usd}/min · 分润{row.share_ratio_pct}%
        </div>
      </div>
      <div className="text-right whitespace-nowrap flex-shrink-0">
        <div className="text-base font-bold text-slate-900 tabular-nums">{formatUsd(row.monthly_revenue_usd)}</div>
        <div className="text-[10px] text-slate-400 mt-0.5">月开播收益</div>
      </div>
    </button>
  )
}

function MobileAccountCardExpanded({
  row,
  index,
  onCollapse,
  onChange,
  onDelete,
}: {
  row:        CalculatedRow
  index:      number
  onCollapse: () => void
  onChange:   (rowIndex: number, patch: Partial<ForecastAccountInput>) => void
  onDelete:   (rowIndex: number) => void
}) {
  return (
    <div className="px-4 py-4 bg-indigo-50/30 border-l-2 border-indigo-500 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">编辑账号</span>
        <span className="text-base font-bold text-slate-900 tabular-nums">{formatUsd(row.monthly_revenue_usd)}</span>
      </div>
      <Field label="账号名">
        <input
          value={row.account_name}
          onChange={(event) => onChange(index, { account_name: event.target.value })}
          className={INPUT_CLASS}
          autoFocus={!row.account_name || row.account_name === '新账号'}
        />
      </Field>
      <Field label="类型">
        <select
          value={row.account_type}
          onChange={(event) => onChange(index, { account_type: event.target.value as ForecastAccountType })}
          className={INPUT_CLASS}
        >
          {FORECAST_ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>{FORECAST_ACCOUNT_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="开播天数">
          <NumberInput value={row.live_days} onChange={(live_days) => onChange(index, { live_days })} />
        </Field>
        <Field label="平均时长 (h)">
          <NumberInput value={row.avg_daily_hours} onChange={(avg_daily_hours) => onChange(index, { avg_daily_hours })} step={0.5} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="分钟收益 ($)">
          <NumberInput value={row.revenue_per_minute_usd} onChange={(revenue_per_minute_usd) => onChange(index, { revenue_per_minute_usd })} step={0.01} />
        </Field>
        <Field label="分润比例 (%)">
          <NumberInput value={row.share_ratio_pct} onChange={(share_ratio_pct) => onChange(index, { share_ratio_pct })} max={100} />
        </Field>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-3.5 h-3.5" /> 删除账号
        </button>
        <Button variant="secondary" size="sm" onClick={onCollapse}>完成</Button>
      </div>
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
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  max?: number
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
      className={INPUT_CLASS}
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
