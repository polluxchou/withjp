'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Plus, RotateCcw, Copy, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
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
  { key: 'stacked', label: 'Stacked' },
  { key: 'lines',   label: 'Lines' },
  { key: 'indexed', label: 'Indexed' },
] as const

type ChartMode = typeof CHART_TABS[number]['key']
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  initialMonths: ForecastMonthInput[]
  initialSelectedMonth?: number
}

const STORAGE_KEY_PREFIX = 'finance-forecast:draft'

export default function FinanceForecastDashboard({ initialMonths, initialSelectedMonth = 0 }: Props) {
  const [months, setMonths] = useState<ForecastMonthInput[]>(initialMonths)
  const [selectedMonth, setSelectedMonth] = useState(initialSelectedMonth)
  const [chartMode, setChartMode] = useState<ChartMode>('stacked')
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const storageKey = useMemo(() => buildStorageKey(initialMonths), [initialMonths])
  const didLoadDraft = useRef(false)

  const summary = useMemo(() => summarizeForecast(months), [months])
  const selected = summary.months[selectedMonth]
  const selectedRaw = months[selectedMonth]

  const chartData = useMemo(() => buildChartData(summary.months, chartMode), [summary.months, chartMode])
  const calculatedRows = useMemo(() => calculateForecastRows(selectedRaw.rows), [selectedRaw.rows])

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
    const id = `${selectedRaw.month}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    updateSelectedMonth({
      rows: [
        ...selectedRaw.rows,
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
    })
  }

  function deleteRow(rowIndex: number) {
    updateSelectedMonth({
      rows: selectedRaw.rows.filter((_, index) => index !== rowIndex),
    })
  }

  function clearMonth() {
    updateSelectedMonth({ rows: [], note: '' })
  }

  function copyPreviousMonth() {
    if (selectedMonth === 0) return
    const previous = months[selectedMonth - 1]
    updateSelectedMonth({
      rows: previous.rows.map((row) => ({ ...row, id: `${selectedRaw.month}-${row.id}` })),
    })
  }

  function applyForward() {
    setMonths((prev) => prev.map((month, index) => {
      if (index <= selectedMonth) return month
      return {
        ...month,
        rows: selectedRaw.rows.map((row) => ({ ...row, id: `${month.month}-${row.id}` })),
      }
    }))
  }

  const yearlyProfitColor = summary.yearly_profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'
  const selectedProfitColor = selected.profit_usd >= 0 ? 'text-emerald-700' : 'text-red-600'

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
    setSaveStatus('idle')
    writeDraft(storageKey, months)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const res = await fetch('/api/finance-forecast', {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            year: Number(months[0]?.month.slice(0, 4)) || new Date().getUTCFullYear(),
            months,
          }),
          signal: controller.signal,
        })
        setSaveStatus(res.ok ? 'saved' : 'error')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setSaveStatus('error')
      }
    }, 700)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [hydratedDraft, months, storageKey])

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="全年预测开播收益"
          value={formatUsd(summary.yearly_forecast_usd)}
          sub="根据账号月度输入实时计算"
          accent="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          label="全年成本预算"
          value={formatUsd(summary.yearly_budget_usd)}
          sub="当前预算 CNY 按 1 USD = 7 CNY 换算"
          accent="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="全年毛利润结余"
          value={formatUsd(summary.yearly_profit_usd)}
          sub={summary.yearly_profit_usd >= 0 ? '预计结余' : '预计亏损'}
          accent="bg-emerald-50 text-emerald-600"
          valueClassName={yearlyProfitColor}
        />
        <KpiCard
          label="当前月毛利率"
          value={selected.margin_pct === null ? 'N/A' : `${Math.round(selected.margin_pct)}%`}
          sub={`${selected.month} 正在编辑`}
          accent="bg-blue-50 text-blue-600"
          valueClassName={selectedProfitColor}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">预测曲线</h2>
              <p className="text-xs text-slate-500 mt-0.5">按账户类型展示开播收益、实际收益和同步预算成本</p>
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

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-end justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {selected.month.slice(0, 4)}
              </span>
              <span className="text-2xl font-bold text-slate-300">·</span>
              <span className="text-2xl font-bold text-indigo-600 tabular-nums tracking-tight">
                {selected.month.slice(5)}
              </span>
              <span className="text-sm font-medium text-slate-500 ml-2">账号预测输入</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">每个月单独设置账号参数；输入会自动保存到 Supabase，本机草稿作为兜底。</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`text-xs font-medium ${saveStatusClass(saveStatus)}`}>
              {saveStatusLabel(saveStatus)}
            </span>
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
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-3 flex-wrap mb-4">
            {(() => {
              // Group months by year so each year gets its own label + pill cluster
              const groups: { year: string; entries: { index: number; mm: string; key: string }[] }[] = []
              months.forEach((month, index) => {
                const year = month.month.slice(0, 4)
                const mm   = month.month.slice(5)
                const last = groups[groups.length - 1]
                if (last && last.year === year) {
                  last.entries.push({ index, mm, key: month.month })
                } else {
                  groups.push({ year, entries: [{ index, mm, key: month.month }] })
                }
              })
              return groups.map(({ year, entries }) => (
                <div key={year} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider tabular-nums">
                    {year}
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {entries.map(({ index, mm, key }) => {
                      const active = index === selectedMonth
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedMonth(index)}
                          className={`min-w-[2.25rem] px-2.5 py-1.5 rounded-lg border text-xs font-semibold tabular-nums transition-colors ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          {mm}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>

          <div className="grid gap-3 md:grid-cols-3 mb-4">
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
          </div>
        </div>

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
                      onClick={() => deleteRow(index)}
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

        <div className="m-5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
          计算公式：月开播收益 = 开播天数 × 平均每日开播时长 × 60 × 分钟收益 × 可分润比例。账号预测输入会保存到 Supabase；成本预算从当前预算同步，支出金额按 CNY 存储，并按 1 USD = 7 CNY 换算为美金后参与毛利润计算。
        </div>
      </section>
    </>
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

function saveStatusLabel(status: SaveStatus): string {
  if (status === 'saving') return '正在保存到 Supabase...'
  if (status === 'saved') return '已保存到 Supabase'
  if (status === 'error') return 'Supabase 保存失败，已保留本机草稿'
  return ''
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
  accent,
  valueClassName = 'text-slate-900',
}: {
  label: string
  value: string
  sub: string
  accent: string
  valueClassName?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${valueClassName}`}>{value}</p>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${accent}`}>$</div>
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
