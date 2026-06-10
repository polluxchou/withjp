'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountType,
} from '@/lib/finance-forecast/calculations'
import {
  LIFECYCLE_MONTH_COUNT,
  LIFECYCLE_STARTING_STAGES,
  emptyLifecycleSet,
  type LifecycleStartingStage,
  type LifecycleTemplate,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle'

interface Props {
  open:     boolean
  onClose:  () => void
  onSaved?: (set: LifecycleTemplateSet) => void
}

export default function LifecycleTemplateEditor({ open, onClose, onSaved }: Props) {
  const t = useTranslations('financeForecast')
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

  const [set, setSet]       = useState<LifecycleTemplateSet | null>(null)
  const [stage, setStage]   = useState<LifecycleStartingStage>('test')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [dirty, setDirty]       = useState(false)

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
          setError(body.error ?? t('lifecycleLoadFailed'))
          setSet(emptyLifecycleSet())
        } else {
          setSet(body.data)
        }
        setDirty(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : t('lifecycleLoadFailed'))
        setSet(emptyLifecycleSet())
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, t])

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
      if (!res.ok || !body.data) throw new Error(body.error ?? t('lifecycleSaveFailed'))
      setSet(body.data)
      setDirty(false)
      onSaved?.(body.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('lifecycleSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (dirty && !window.confirm(t('lifecycleUnsaved'))) return
    onClose()
  }

  if (!open) return null

  const tpl = set?.[stage] ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100">
          <div>
            <h2 className="text-base font-bold text-zinc-900">{t('lifecycleTitle')}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{t('lifecycleDesc')}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('lifecycleClose')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex gap-1 flex-wrap">
          {LIFECYCLE_STARTING_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                s === stage
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-violet-300 hover:text-primary'
              }`}
            >
              {t('lifecycleStageFrom', { stage: stageLabels[s] })}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {loading || !tpl ? (
            <div className="py-10 text-center text-sm text-zinc-400">{t('lifecycleLoading')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-zinc-100 bg-zinc-50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 w-16">{t('lifecycleColMonth')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">{t('lifecycleColStatus')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">{t('lifecycleColLiveDays')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">{t('lifecycleColAvgHours')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">{t('lifecycleColRevPerMin')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">{t('lifecycleColShareRatio')}</th>
                </tr>
              </thead>
              <tbody>
                {tpl.map((cell, i) => (
                  <tr key={i} className="border-b border-zinc-50">
                    <td className="px-3 py-2 text-xs font-semibold text-zinc-500 tabular-nums">M{i + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={cell.account_type}
                        onChange={(e) => updateCell(stage, i, { account_type: e.target.value as ForecastAccountType })}
                        className={INPUT_CLASS}
                      >
                        {FORECAST_ACCOUNT_TYPES.map((type) => (
                          <option key={type} value={type}>{accountTypeLabels[type]}</option>
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

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-100">
          <span className="text-xs text-zinc-400">
            {t('lifecycleFooter', { stages: LIFECYCLE_STARTING_STAGES.length, months: LIFECYCLE_MONTH_COUNT })}
            {error && <span className="ml-2 text-red-500">{error}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={saving}>
              <X className="w-3.5 h-3.5" /> {t('lifecycleClose')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loading}>
              {saving
                ? <><Save className="w-3.5 h-3.5" /> {t('lifecycleSaving')}</>
                : <><Check className="w-3.5 h-3.5" /> {t('lifecycleSave')}</>}
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

const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500'
