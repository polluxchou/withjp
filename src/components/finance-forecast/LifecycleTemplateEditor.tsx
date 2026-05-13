'use client'

import { useEffect, useState } from 'react'
import { Check, X, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  FORECAST_ACCOUNT_TYPE_LABELS,
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountType,
} from '@/lib/finance-forecast/calculations'
import {
  LIFECYCLE_MONTH_COUNT,
  LIFECYCLE_STARTING_STAGES,
  LIFECYCLE_STARTING_STAGE_LABELS,
  emptyLifecycleSet,
  type LifecycleStartingStage,
  type LifecycleTemplate,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle'

interface Props {
  open:     boolean
  onClose:  () => void
  // Notifies the parent of a fresh templates snapshot so the "add from
  // template" flow always uses the latest values.
  onSaved?: (set: LifecycleTemplateSet) => void
}

// Modal-style editor with one tab per starting stage and a 12-row table
// inside each tab. Loads + saves through /api/finance-forecast/lifecycle.
export default function LifecycleTemplateEditor({ open, onClose, onSaved }: Props) {
  const [set, setSet]       = useState<LifecycleTemplateSet | null>(null)
  const [stage, setStage]   = useState<LifecycleStartingStage>('test')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [dirty, setDirty]       = useState(false)

  // Fetch on open. We deliberately re-fetch every time the modal opens
  // so concurrent edits from another tab don't surface stale data.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/finance-forecast/lifecycle')
      .then((r) => r.json())
      .then((body: { data: LifecycleTemplateSet | null; error: string | null }) => {
        if (cancelled) return
        if (body.error || !body.data) {
          setError(body.error ?? '加载失败')
          setSet(emptyLifecycleSet())
        } else {
          setSet(body.data)
        }
        setDirty(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '加载失败')
        setSet(emptyLifecycleSet())
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  function updateCell(stage: LifecycleStartingStage, monthOffset: number, patch: Partial<LifecycleTemplate[number]>) {
    setSet((prev) => {
      if (!prev) return prev
      const tpl = prev[stage].map((cell, i) => i === monthOffset ? { ...cell, ...patch } : cell)
      return { ...prev, [stage]: tpl }
    })
    setDirty(true)
  }

  async function handleSave() {
    if (!set) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/finance-forecast/lifecycle', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ templates: set }),
      })
      const body = await res.json() as { data: LifecycleTemplateSet | null; error: string | null }
      if (!res.ok || !body.data) throw new Error(body.error ?? '保存失败')
      setSet(body.data)
      setDirty(false)
      onSaved?.(body.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (dirty && !window.confirm('有未保存的改动，确定关闭吗？')) return
    onClose()
  }

  if (!open) return null

  const tpl = set?.[stage] ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">账号生命周期模板</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              5 个起始阶段 × 12 个月。新增账号时按"起始阶段"一键应用 12 个月的预设参数；
              个人配置，跨视角共享。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage tabs */}
        <div className="px-5 pt-4 flex gap-1 flex-wrap">
          {LIFECYCLE_STARTING_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                s === stage
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              从 {LIFECYCLE_STARTING_STAGE_LABELS[s]} 起步
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading || !tpl ? (
            <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 w-16">月份</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">本月状态</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">开播天数</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">日均时长</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">分钟收益 (USD)</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">分润比例 (%)</th>
                </tr>
              </thead>
              <tbody>
                {tpl.map((cell, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500 tabular-nums">M{i + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={cell.account_type}
                        onChange={(e) => updateCell(stage, i, { account_type: e.target.value as ForecastAccountType })}
                        className={INPUT_CLASS}
                      >
                        {FORECAST_ACCOUNT_TYPES.map((t) => (
                          <option key={t} value={t}>{FORECAST_ACCOUNT_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={cell.live_days}
                        onChange={(live_days) => updateCell(stage, i, { live_days })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={cell.avg_daily_hours}
                        step={0.5}
                        onChange={(avg_daily_hours) => updateCell(stage, i, { avg_daily_hours })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={cell.revenue_per_minute_usd}
                        step={0.01}
                        onChange={(revenue_per_minute_usd) => updateCell(stage, i, { revenue_per_minute_usd })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={cell.share_ratio_pct}
                        max={100}
                        onChange={(share_ratio_pct) => updateCell(stage, i, { share_ratio_pct })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            共 {LIFECYCLE_STARTING_STAGES.length} 个模板 × {LIFECYCLE_MONTH_COUNT} 个月。
            {error && <span className="ml-2 text-red-500">{error}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={saving}>
              <X className="w-3.5 h-3.5" /> 关闭
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loading}>
              {saving
                ? <><Save className="w-3.5 h-3.5" /> 保存中…</>
                : <><Check className="w-3.5 h-3.5" /> 保存</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NumberCell({
  value,
  onChange,
  step = 1,
  max,
}: {
  value:    number
  onChange: (value: number) => void
  step?:    number
  max?:     number
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className={INPUT_CLASS}
    />
  )
}

const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500'
