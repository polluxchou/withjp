'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'
import {
  LIFECYCLE_STARTING_STAGES,
  type LifecycleStartingStage,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle-template'

export default function AddFromTemplateModal({
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
