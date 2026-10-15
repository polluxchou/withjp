'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Tag from '@/components/ui/Tag'
import { lockViewportScroll } from '@/lib/ui/scrollLock'
import { URGENT_WITHIN_DAYS, daysUntil, dueInputToPatch, isUrgent } from '@/lib/org/quadrant'
import type { ItemPatch, QuadrantRow } from '@/lib/org/quadrant'
import type { TaskItemStatus } from '@/lib/types'

type Importance = 'yes' | 'no' | 'unrated'
const toImportance = (v: boolean | null): Importance => (v === null ? 'unrated' : v ? 'yes' : 'no')
const fromImportance = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
const STATUSES: TaskItemStatus[] = ['todo', 'doing', 'blocked', 'done']

interface Props {
  row: QuadrantRow
  today: string
  canEdit: boolean
  positionName: (id: string) => string
  onClose: () => void
  onUpdate: (fields: ItemPatch) => void
  onPickOwner: () => void
}

// 侧向上下文面板：≥768px 贴右的抽屉，<768px 贴底的面板。层级 z-50 与
// DiscussionPanel / SalaryManager 抽屉同类（选人弹窗 Modal 是 z-60，会盖在上面）。
// 无 aria-modal：没有 Modal.tsx 那套焦点圈定，role="dialog" + aria-label + Escape
// 是不夸大能力的诚实子集（同 DiscussionPanel 的说明）。
export default function ItemDetailPanel({ row, today, canEdit, positionName, onClose, onUpdate, onPickOwner }: Props) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')

  useEffect(() => lockViewportScroll(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 选人弹窗（aria-modal，z-60）开着时 Esc 只归它：同一次 keydown 里它的 DOM 还在，面板据此放行，避免两层一起被关。
      // 本监听挂在捕获阶段，先于 Modal 的冒泡监听触发（与注册先后无关），所以此处检查仍能看到未关闭的选人弹窗。
      if (document.querySelector('[aria-modal="true"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const statusLabel = (s: TaskItemStatus) =>
    s === 'todo' ? t('org.statusTodo') : s === 'doing' ? t('org.statusDoing') : s === 'blocked' ? t('org.statusBlocked') : t('org.statusDone')
  const importanceLabel = (v: Importance) =>
    v === 'yes' ? t('org.importantYes') : v === 'no' ? t('org.importantNo') : t('org.unratedTitle')
  const dueHint = (() => {
    if (!row.due_date) return t('org.dueNone')
    const d = daysUntil(row.due_date, today)
    return d < 0 ? t('org.dueOverdueLong', { days: -d }) : t('org.dueLeft', { days: d })
  })()
  const urgent = row.status !== 'done' && isUrgent(row, today)

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={tCommon('close')}
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-ink-900/30 cursor-default"
      />
      <div
        role="dialog"
        aria-label={t('org.detailTitle')}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-card bg-surface shadow-pop px-5 pt-3 md:inset-y-0 md:left-auto md:right-0 md:w-[400px] md:max-h-none md:rounded-none md:pt-5"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <span aria-hidden className="block mx-auto mb-3 h-1 w-9 rounded-btn bg-line-strong md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</p>
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={onClose}
            className="flex-none -mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-btn text-ink-500 hover:bg-line-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-ink-900">{row.name}</h2>
        {!canEdit && <p className="mt-1 text-xs text-ink-400">{t('org.readonlyHint')}</p>}

        <dl className="mt-5 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-4 text-sm">
          <dt className="text-ink-500">{t('org.important')}</dt>
          <dd>
            {canEdit ? (
              <SegmentedControl
                label={t('org.important')}
                touch
                value={toImportance(row.is_important)}
                onChange={(v) => onUpdate({ is_important: fromImportance(v) })}
                items={(['yes', 'no', 'unrated'] as Importance[]).map((v) => ({ value: v, label: importanceLabel(v) }))}
              />
            ) : (
              <span className="text-ink-700">{importanceLabel(toImportance(row.is_important))}</span>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.dueDate')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                {/* 失焦才提交：改年份时浏览器会逐键给出 0002-10-20 这类值，边打边存会写坏数据。
                    key 随 due_date 变，外部清除后输入框跟着重置。 */}
                <input
                  key={row.due_date ?? 'none'}
                  type="date"
                  aria-label={t('org.dueDate')}
                  defaultValue={row.due_date ?? ''}
                  onBlur={(e) => {
                    const patch = dueInputToPatch(e.target.value)
                    if (patch && patch.due_date !== row.due_date) onUpdate(patch)
                  }}
                  className="h-11 md:h-9 px-2.5 rounded-field border border-line bg-surface text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                />
                {row.due_date && (
                  <button type="button" onClick={() => onUpdate({ due_date: null })} className="inline-flex items-center min-h-11 px-2 md:min-h-0 text-xs text-primary hover:text-primary-hover">
                    {t('org.clear')}
                  </button>
                )}
              </>
            ) : (
              <span className="tabular-nums text-ink-700">{row.due_date ?? '—'}</span>
            )}
            <span className={`w-full text-xs ${urgent ? 'font-semibold text-danger-text' : 'text-ink-500'}`}>{dueHint}</span>
          </dd>

          <dt className="text-ink-500">{t('org.axisUrgent')}</dt>
          <dd className="text-xs text-ink-500">{t('org.urgencyRule', { days: URGENT_WITHIN_DAYS })}</dd>

          <dt className="text-ink-500">{t('org.status')}</dt>
          <dd>
            {canEdit ? (
              <SegmentedControl
                label={t('org.status')}
                touch
                value={row.status}
                onChange={(v) => onUpdate({ status: v as TaskItemStatus })}
                items={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
              />
            ) : (
              <span className="text-ink-700">{statusLabel(row.status)}</span>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.owner')}</dt>
          <dd className="flex items-center gap-2 min-w-0">
            <span className={`truncate ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-900'}`}>
              {row.ownerName ?? t('org.statUnassigned')}
            </span>
            {canEdit && (
              <button type="button" onClick={onPickOwner} className="ml-auto flex-none inline-flex items-center min-h-11 px-2 md:min-h-0 text-xs text-primary hover:text-primary-hover">
                {t('org.change')}
              </button>
            )}
          </dd>

          <dt className="text-ink-500">{t('org.positions')}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {row.positionIds.length === 0
              ? <span className="text-xs text-ink-400">{t('org.empty')}</span>
              : row.positionIds.map((id) => <Tag key={id} size="sm" tone="neutral" label={positionName(id)} />)}
          </dd>
        </dl>
      </div>
    </div>,
    document.body,
  )
}
