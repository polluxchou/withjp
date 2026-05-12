'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { Flag, Globe, Workflow } from 'lucide-react'
import type { Expense, ExpenseCategory, MilestoneStatus, MilestonePriority } from '@/lib/types'
import ExpenseSankeyChart from './ExpenseSankeyChart'
import {
  EXPENSE_CATEGORY_OPTIONS,
  getExpenseCategoryBreakdown,
  getExpenseCostTimeSeries,
  getMonthlyExpenseSummary,
  getDailyExpenseSummary,
  crossBorderFee,
  effectiveCost,
  type CostGranularity,
} from '@/lib/expenses/costs'
import { useTranslations } from 'next-intl'
import { useCurrency } from '@/lib/currency'

interface Props {
  expenses: Expense[]
  categoryBreakdownExpenses?: Expense[]
  selectedCategory?: string
  onCategorySelect?: (category: ExpenseCategory) => void
  /** Currently filtered date range. Used to highlight the active period on the monthly chart. */
  selectedPeriod?: { from: string; to: string }
  /** Click a point on the monthly chart to filter by that period. */
  onPeriodSelect?: (period: string, granularity: 'day' | 'month') => void
}

interface MilestoneMarker {
  id:          string
  title:       string
  target_date: string   // YYYY-MM-DD
  status:      MilestoneStatus
  priority:    MilestonePriority
}

const PRIORITY_COLOR: Record<MilestonePriority, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#6366f1',
}

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned:   '计划中',
  active:    '进行中',
  at_risk:   '有风险',
  completed: '已完成',
  missed:    '已逾期',
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  tangible_asset:  '#6366f1',
  salary:          '#f59e0b',
  rent:            '#10b981',
  travel:          '#3b82f6',
  office_supplies: '#8b5cf6',
  cloud_services:  '#ec4899',
}

type Tab = 'category' | 'trend' | 'monthly'
type MonthlyView = 'table' | 'chart'
type MonthlyGran = 'day' | 'month'

interface ChartTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  fmt:    (cny: number, opts?: { compact?: boolean }) => string
}

interface CategoryTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  fmt: (cny: number, opts?: { compact?: boolean }) => string
  categoryLabel: (category: ExpenseCategory) => string
  amountLabel: string
  shareLabel: string
}

function CategoryTooltip({
  active,
  payload,
  fmt,
  categoryLabel,
  amountLabel,
  shareLabel,
}: CategoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const item = payload[0]?.payload as { category?: ExpenseCategory; total?: number; pct?: number } | undefined
  if (!item?.category) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-2.5 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-1.5">{categoryLabel(item.category)}</p>
      <div className="space-y-1">
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500">{amountLabel}</span>
          <span className="font-medium text-slate-900">{fmt(Number(item.total ?? 0))}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500">{shareLabel}</span>
          <span className="font-medium text-slate-900">{Number(item.pct ?? 0).toFixed(1)}%</span>
        </p>
      </div>
    </div>
  )
}

// ── Custom tooltip: shows expense count on days that exceed ¥100k CNY ──
function DayTooltip({ active, payload, label, fmt }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const total = (payload.find((p) => p.dataKey === 'total')?.value as number) ?? 0
  const count = (payload[0]?.payload?.count as number) ?? 0

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-500">{p.name}:</span>
            <span className="font-medium text-slate-800 ml-auto pl-2">
              {fmt(Number(p.value ?? 0))}
            </span>
          </p>
        ))}
      </div>
      {total >= 100000 && count > 0 && (
        <div className="mt-2 pt-2 border-t border-red-100">
          <p className="text-red-600 font-semibold flex items-center gap-1">
            <span>⚠️</span>
            <span>共 {count} 笔支出，超 {fmt(100000, { compact: true })}</span>
          </p>
        </div>
      )}
    </div>
  )
}

export default function ExpenseCategoryChart({
  expenses,
  categoryBreakdownExpenses = expenses,
  selectedCategory = '',
  onCategorySelect,
  selectedPeriod,
  onPeriodSelect,
}: Props) {
  const [tab, setTab]                 = useState<Tab>('category')
  const [catView, setCatView]         = useState<'pie' | 'sankey'>('pie')
  const [granularity, setGranularity] = useState<CostGranularity>('month')
  const [monthlyView, setMonthlyView] = useState<MonthlyView>('table')
  const [monthlyGran, setMonthlyGran] = useState<MonthlyGran>('day')
  const t = useTranslations('expenses')
  const { fmt } = useCurrency()
  const fmtCompact = (v: number) => fmt(v, { compact: true })

  // ── Milestone overlay (non-default, lazy-loaded) ──────────────
  const [showMilestones, setShowMilestones] = useState(false)
  const [milestones,     setMilestones]     = useState<MilestoneMarker[]>([])
  const [msLoaded,       setMsLoaded]       = useState(false)
  const [msLoading,      setMsLoading]      = useState(false)
  // Tracks which X-axis period the cursor is hovering on (null when not hovering).
  // Used to filter the milestone list to only the hovered date's nodes.
  const [hoveredPeriod,  setHoveredPeriod]  = useState<string | null>(null)

  const loadMilestones = useCallback(async () => {
    if (msLoaded) return
    setMsLoading(true)
    const res  = await fetch('/api/milestones')
    const json = await res.json()
    setMilestones(
      (json.data ?? []).map((m: MilestoneMarker) => ({
        id:          m.id,
        title:       m.title,
        target_date: m.target_date,
        status:      m.status,
        priority:    m.priority,
      }))
    )
    setMsLoaded(true)
    setMsLoading(false)
  }, [msLoaded])

  function toggleMilestones() {
    if (!showMilestones && !msLoaded) loadMilestones()
    setShowMilestones((v) => !v)
  }

  /**
   * Map a milestone's target_date to the nearest period value in chartData.
   * Day mode: YYYY-MM-DD → exact match or nearest date
   * Month mode: YYYY-MM-DD → YYYY-MM match
   */
  function nearestPeriod(targetDate: string, periods: string[]): string | null {
    if (periods.length === 0) return null
    if (monthlyGran === 'month') {
      const ym = targetDate.slice(0, 7)
      return periods.find((p) => p === ym) ?? null
    }
    // Day mode
    if (periods.includes(targetDate)) return targetDate
    const target = new Date(targetDate).getTime()
    let best = periods[0]
    let bestDiff = Math.abs(new Date(periods[0]).getTime() - target)
    for (const p of periods) {
      const diff = Math.abs(new Date(p).getTime() - target)
      if (diff < bestDiff) { bestDiff = diff; best = p }
    }
    // Only snap if within 15 days (day mode) to avoid cross-chart phantom lines
    return bestDiff <= 15 * 86400000 ? best : null
  }

  const CROSS_BORDER_BUYERS = new Set(['chenhao', 'xiaoshou'])
  const BUYER_DISPLAY: Record<string, string> = { chenhao: '陈昊', xiaoshou: '小兽' }

  const buyerBreakdown = useMemo(() => {
    const source = selectedCategory
      ? categoryBreakdownExpenses.filter((e) => e.expense_category === selectedCategory)
      : categoryBreakdownExpenses
    const map = new Map<string, { total: number; crossBorder: number }>()
    for (const e of source) {
      const b = (e.buyer_name ?? '').trim() || '—'
      const prev = map.get(b) ?? { total: 0, crossBorder: 0 }
      map.set(b, {
        total:       prev.total       + effectiveCost(e),
        crossBorder: prev.crossBorder + crossBorderFee(e),
      })
    }
    return Array.from(map.entries())
      .map(([buyer, d]) => ({ buyer, ...d }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [categoryBreakdownExpenses, selectedCategory])

  const breakdown      = getExpenseCategoryBreakdown(categoryBreakdownExpenses)
  const timeSeries     = getExpenseCostTimeSeries(expenses, granularity)
  const monthlySummary = getMonthlyExpenseSummary(expenses)
  const dailySummary   = getDailyExpenseSummary(expenses)

  // Fill missing days between first and last spend with zero rows so the
  // X-axis represents one tick per real day, not one tick per "day with a record".
  const dailyFilled = (() => {
    if (dailySummary.length === 0) return dailySummary
    const map = new Map(dailySummary.map((r) => [r.date, r]))
    const out: typeof dailySummary = []
    const cur = new Date(dailySummary[0].date + 'T00:00:00Z')
    const end = new Date(dailySummary[dailySummary.length - 1].date + 'T00:00:00Z')
    while (cur <= end) {
      const ymd = cur.toISOString().slice(0, 10)
      out.push(map.get(ymd) ?? { date: ymd, total: 0, paid: 0, count: 0 })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return out
  })()

  const chartData = monthlyGran === 'day'
    ? dailyFilled.map((r) => ({ period: r.date, total: r.total, paid: r.paid, count: r.count }))
    : [...monthlySummary].reverse().map((r) => ({ period: r.month, total: r.total, paid: r.paid, count: 0 }))

  // Only show categories that have data in the monthly view
  const activeCategories = EXPENSE_CATEGORY_OPTIONS.filter((o) =>
    monthlySummary.some((row) => (row.byCategory[o.value] ?? 0) > 0)
  )

  if (categoryBreakdownExpenses.length === 0) return null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'category', label: t('categoryShare') },
    { key: 'trend',    label: t('cumulativeTrend') },
    { key: 'monthly',  label: t('monthlySummary') },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'category' && (
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setCatView('pie')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                catView === 'pie' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              饼图
            </button>
            <button
              onClick={() => setCatView('sankey')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                catView === 'sankey' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Workflow className="w-3 h-3" />
              流向图
            </button>
          </div>
        )}

        {tab === 'trend' && (
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {(['month', 'quarter', 'year'] as CostGranularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  granularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t(g)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab 1: 类别占比 — Sankey 流向图 ── */}
      {tab === 'category' && catView === 'sankey' && (
        <ExpenseSankeyChart
          expenses={categoryBreakdownExpenses}
          selectedCategory={selectedCategory}
        />
      )}

      {/* ── Tab 1: 类别占比 — 饼图 | 主成本分类 | 经办人分类 ── */}
      {tab === 'category' && catView === 'pie' && (
        <div className="grid gap-x-5 gap-y-4 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_minmax(160px,240px)]">

          {/* ① 饼图 */}
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={2}
                  onClick={(entry) => {
                    const category = (entry as { category?: ExpenseCategory; payload?: { category?: ExpenseCategory } }).category
                      ?? (entry as { payload?: { category?: ExpenseCategory } }).payload?.category
                    if (category) onCategorySelect?.(category)
                  }}
                >
                  {breakdown.map((item) => {
                    const active = selectedCategory === item.category
                    return (
                      <Cell
                        key={item.category}
                        fill={CATEGORY_COLORS[item.category]}
                        stroke={active ? '#0f172a' : '#ffffff'}
                        strokeWidth={active ? 3 : 2}
                        className="cursor-pointer outline-none transition-opacity hover:opacity-80"
                      />
                    )
                  })}
                </Pie>
                <Tooltip
                  content={
                    <CategoryTooltip
                      fmt={fmt}
                      categoryLabel={(category) => t(`categories.${category}`)}
                      amountLabel={t('amount')}
                      shareLabel={t('categoryShare')}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* ② 主成本分类 */}
          <div className="space-y-2 self-start border-l border-slate-100 pl-5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5 px-1">
              {t('categoryShare')}
            </p>
            {breakdown.map((item) => {
              const active = selectedCategory === item.category
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => onCategorySelect?.(item.category)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                      />
                      <span className="text-xs font-medium text-slate-700 truncate">{t(`categories.${item.category}`)}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {fmtCompact(item.total)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{item.pct.toFixed(1)}%</div>
                </button>
              )
            })}
          </div>

          {/* ③ 经办人分类 */}
          {buyerBreakdown.length > 0 && (
            <div className="space-y-1 self-start border-l border-slate-100 pl-5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5 px-1">
                {selectedCategory
                  ? `${t(`categories.${selectedCategory as ExpenseCategory}`)} · ${t('buyer')}`
                  : `全部 · ${t('buyer')}`
                }
              </p>
              {buyerBreakdown.map(({ buyer, total, crossBorder }) => {
                const isCrossBorder = CROSS_BORDER_BUYERS.has(buyer)
                const displayName   = BUYER_DISPLAY[buyer] ?? buyer
                return (
                  <div
                    key={buyer}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-slate-700 truncate">{displayName}</span>
                      {isCrossBorder && (
                        <span
                          title={`跨境转账成本 ${fmtCompact(crossBorder)}`}
                          className="flex items-center gap-0.5 text-[10px] font-medium text-rose-500 bg-rose-50 border border-rose-100 px-1 py-0.5 rounded whitespace-nowrap"
                        >
                          <Globe className="w-2.5 h-2.5 flex-shrink-0" />
                          {fmtCompact(crossBorder)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-900 whitespace-nowrap flex-shrink-0">
                      {fmtCompact(total)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: 累计趋势 ── */}
      {tab === 'trend' && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timeSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={52} />
            <Tooltip
              formatter={(v) => [fmt(Number(v)), '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="paid"          name={t('paymentStatuses.paid')} stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="budgeted"      name={t('paymentStatuses.budgeted')} stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="ordered_unpaid" name={t('paymentStatuses.ordered_unpaid')} stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ── Tab 3: 月度汇总 ── */}
      {tab === 'monthly' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {(['table', 'chart'] as MonthlyView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setMonthlyView(v)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      monthlyView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {v === 'table' ? t('tableView') : t('chartView')}
                  </button>
                ))}
              </div>
              {monthlyView === 'chart' && (
                <button
                  onClick={toggleMilestones}
                  disabled={msLoading}
                  title="战略时间轴节点"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    showMilestones
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  <Flag className="w-3 h-3" />
                  {msLoading ? '加载中…' : '战略节点'}
                </button>
              )}
            </div>
            {monthlyView === 'chart' && (
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {(['day', 'month'] as MonthlyGran[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setMonthlyGran(g)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      monthlyGran === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {t(g)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {monthlyView === 'chart' ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 24, bottom: 0, left: 0 }}
                  onMouseMove={(s) => {
                    // Recharts' state shape varies; activeLabel is the X value of the hovered point
                    const label = (s as { activeLabel?: string } | undefined)?.activeLabel
                    setHoveredPeriod(label ?? null)
                  }}
                  onMouseLeave={() => setHoveredPeriod(null)}
                  onClick={(s) => {
                    const label = (s as { activeLabel?: string } | undefined)?.activeLabel
                    if (label && onPeriodSelect) onPeriodSelect(label, monthlyGran)
                  }}
                  style={onPeriodSelect ? { cursor: 'pointer' } : undefined}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={56} />
                  {monthlyGran === 'day'
                    ? <Tooltip content={<DayTooltip fmt={fmt} />} />
                    : <Tooltip formatter={(v) => [fmt(Number(v)), '']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  }
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {monthlyGran === 'day' && (
                    <>
                      <ReferenceLine
                        y={30000}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        ifOverflow="extendDomain"
                        label={{ value: `${t('day')} ${fmtCompact(30000)}`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                      />
                      <ReferenceLine
                        y={100000}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        ifOverflow="extendDomain"
                        label={{ value: `${t('day')} ${fmtCompact(100000)}`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
                      />
                    </>
                  )}

                  {/* ── Milestone vertical markers ── */}
                  {showMilestones && (() => {
                    const periods = chartData.map((d) => d.period)
                    // Group by snapped period so we can show counts when multiple milestones land on same tick
                    const grouped = new Map<string, MilestoneMarker[]>()
                    for (const m of milestones) {
                      const xVal = nearestPeriod(m.target_date, periods)
                      if (!xVal) continue
                      grouped.set(xVal, [...(grouped.get(xVal) ?? []), m])
                    }
                    return Array.from(grouped.entries()).map(([xVal, ms]) => {
                      // Use highest priority color
                      const color = ms.some((m) => m.priority === 'high')   ? PRIORITY_COLOR.high
                                  : ms.some((m) => m.priority === 'medium') ? PRIORITY_COLOR.medium
                                  : PRIORITY_COLOR.low
                      const label = ms.length === 1
                        ? ms[0].title.length > 10 ? ms[0].title.slice(0, 9) + '…' : ms[0].title
                        : `${ms.length}个节点`
                      return (
                        <ReferenceLine
                          key={xVal}
                          x={xVal}
                          stroke={color}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          label={{ value: label, position: 'insideTopLeft', fontSize: 9, fill: color, angle: -60 }}
                        />
                      )
                    })
                  })()}

                  {/* ── Active-period highlight (from external date filter) ── */}
                  {selectedPeriod?.from && selectedPeriod.from === selectedPeriod.to && (() => {
                    // Single-day filter
                    const key = monthlyGran === 'day' ? selectedPeriod.from : selectedPeriod.from.slice(0, 7)
                    if (!chartData.some((d) => d.period === key)) return null
                    return (
                      <ReferenceLine
                        x={key}
                        stroke="#6366f1"
                        strokeWidth={2}
                        ifOverflow="extendDomain"
                        label={{ value: '已筛选', position: 'top', fontSize: 9, fill: '#6366f1' }}
                      />
                    )
                  })()}

                  <Line type="monotone" dataKey="total" name={t('totalExpense')} stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="paid"  name={t('paid')}         stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>

              {/* ── Milestone legend (filtered to hovered period) ── */}
              {showMilestones && milestones.length > 0 && (() => {
                const periods = chartData.map((d) => d.period)
                const visible = hoveredPeriod
                  ? milestones.filter((m) => nearestPeriod(m.target_date, periods) === hoveredPeriod)
                  : []
                return (
                  <div className="mt-3 border-t border-slate-100 pt-3 min-h-[3rem]">
                    <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                      <Flag className="w-3 h-3" />
                      <span>战略时间轴节点</span>
                      {hoveredPeriod && (
                        <span className="text-slate-400 font-normal">— {hoveredPeriod}</span>
                      )}
                    </p>
                    {!hoveredPeriod ? (
                      <p className="text-xs text-slate-400">将鼠标悬停在曲线上查看对应日期的节点</p>
                    ) : visible.length === 0 ? (
                      <p className="text-xs text-slate-400">该日期无战略节点</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {visible.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs"
                            style={{ borderColor: PRIORITY_COLOR[m.priority] + '55', backgroundColor: PRIORITY_COLOR[m.priority] + '0d' }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: PRIORITY_COLOR[m.priority] }}
                            />
                            <span className="font-medium text-slate-800">{m.title}</span>
                            <span
                              className="px-1 py-0.5 rounded text-xs"
                              style={{ color: PRIORITY_COLOR[m.priority] }}
                            >
                              {STATUS_LABEL[m.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 font-medium text-slate-500 whitespace-nowrap">{t('monthColumn')}</th>
                {activeCategories.map((o) => (
                  <th key={o.value} className="text-right py-2 px-3 font-medium whitespace-nowrap" style={{ color: CATEGORY_COLORS[o.value] }}>
                    {t(`categories.${o.value}`)}
                  </th>
                ))}
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">{t('total')}</th>
                <th className="text-right py-2 pl-3 font-medium text-green-600 whitespace-nowrap">{t('paid')}</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.map((row) => (
                <tr key={row.month} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-slate-700 whitespace-nowrap">{row.month}</td>
                  {activeCategories.map((o) => {
                    const amt = row.byCategory[o.value] ?? 0
                    return (
                      <td key={o.value} className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                        {amt > 0 ? fmt(amt) : <span className="text-slate-300">—</span>}
                      </td>
                    )
                  })}
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                    {fmt(row.total)}
                  </td>
                  <td className="py-2.5 pl-3 text-right text-green-700 whitespace-nowrap">
                    {row.paid > 0 ? fmt(row.paid) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Footer: column totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="py-2.5 pr-4 font-semibold text-slate-700">{t('grandTotal')}</td>
                {activeCategories.map((o) => {
                  const total = monthlySummary.reduce((s, r) => s + (r.byCategory[o.value] ?? 0), 0)
                  return (
                    <td key={o.value} className="py-2.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {fmt(total)}
                    </td>
                  )
                })}
                <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                  {fmt(monthlySummary.reduce((s, r) => s + r.total, 0))}
                </td>
                <td className="py-2.5 pl-3 text-right font-semibold text-green-700 whitespace-nowrap">
                  {fmt(monthlySummary.reduce((s, r) => s + r.paid, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
          )}
        </>
      )}
    </div>
  )
}
