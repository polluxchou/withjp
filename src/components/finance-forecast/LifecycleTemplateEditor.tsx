'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Input, Select } from '@/components/ui/Field'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
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
    // 阻断式编辑器 → 共享 Modal（design-system §6.1）：Escape/焦点圈定/portal/
    // 移动端底部弹出全部由 Modal 兜底。原来的说明文案从卡头挪进正文首行
    // （Modal 的 title 只收字符串，没有副标题位）。
    // footer 的状态文案用 mr-auto 顶到左侧——Modal footer 本身是 justify-end。
    <Modal
      open={open}
      onClose={handleClose}
      title={t('lifecycleTitle')}
      width="max-w-5xl"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-400">
            {t('lifecycleFooter', { stages: LIFECYCLE_STARTING_STAGES.length, months: LIFECYCLE_MONTH_COUNT })}
            {error && <span className="ml-2 text-danger-text">{error}</span>}
          </span>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            <X className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('lifecycleClose')}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving || loading} loading={saving}>
            {saving
              ? <><Save className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('lifecycleSaving')}</>
              : <><Check className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('lifecycleSave')}</>}
          </Button>
        </>
      }
    >
      <p className="text-xs text-ink-500 mb-3">{t('lifecycleDesc')}</p>

      {/* 5 个起始阶段互斥切换 = §6.1 的 SegmentedControl 场景 */}
      <div className="mb-3">
        <SegmentedControl
          items={LIFECYCLE_STARTING_STAGES.map((s) => ({
            value: s,
            label: t('lifecycleStageFrom', { stage: stageLabels[s] }),
          }))}
          value={stage}
          onChange={(v) => setStage(v as LifecycleStartingStage)}
          label={t('lifecycleColStatus')}
        />
      </div>

      {loading || !tpl ? (
        <div className="py-10 text-center text-sm text-ink-400">{t('lifecycleLoading')}</div>
      ) : (
        <Table label={t('lifecycleTitle')} minWidth={760}>
          <THead>
            <Th style={{ width: 64 }}>{t('lifecycleColMonth')}</Th>
            <Th>{t('lifecycleColStatus')}</Th>
            <Th>{t('lifecycleColLiveDays')}</Th>
            <Th>{t('lifecycleColAvgHours')}</Th>
            <Th>{t('lifecycleColRevPerMin')}</Th>
            <Th>{t('lifecycleColShareRatio')}</Th>
          </THead>
          <TBody>
            {tpl.map((cell, i) => (
              <Tr key={i}>
                <Td className="text-xs font-semibold text-ink-500 tabular-nums">M{i + 1}</Td>
                <Td>
                  <Select
                    aria-label={t('lifecycleColStatus')}
                    value={cell.account_type}
                    onChange={(e) => updateCell(stage, i, { account_type: e.target.value as ForecastAccountType })}
                  >
                    {FORECAST_ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>{accountTypeLabels[type]}</option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <NumberCell
                    label={t('lifecycleColLiveDays')}
                    value={cell.live_days}
                    onChange={(live_days) => updateCell(stage, i, { live_days })}
                  />
                </Td>
                <Td>
                  <NumberCell
                    label={t('lifecycleColAvgHours')}
                    value={cell.avg_daily_hours}
                    step={0.5}
                    onChange={(avg_daily_hours) => updateCell(stage, i, { avg_daily_hours })}
                  />
                </Td>
                <Td>
                  <NumberCell
                    label={t('lifecycleColRevPerMin')}
                    value={cell.revenue_per_minute_usd}
                    step={0.01}
                    onChange={(revenue_per_minute_usd) => updateCell(stage, i, { revenue_per_minute_usd })}
                  />
                </Td>
                <Td>
                  <NumberCell
                    label={t('lifecycleColShareRatio')}
                    value={cell.share_ratio_pct}
                    max={100}
                    onChange={(share_ratio_pct) => updateCell(stage, i, { share_ratio_pct })}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Modal>
  )
}

// 表内数字格：取值行为不动，只把裸 input 换成共享 Input。列头不在同一
// 单元格里，aria-label 由调用方传入的列名承担（表内控件没有可见 label）。
function NumberCell({
  label,
  value,
  onChange,
  step = 1,
  max,
}: {
  label:    string
  value:    number
  onChange: (value: number) => void
  step?:    number
  max?:     number
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular-nums"
    />
  )
}
