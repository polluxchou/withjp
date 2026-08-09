'use client'

import { BringToFront, MoveDown, MoveUp, PanelRightClose, PanelRightOpen, SendToBack, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import SegmentedControl from '@/components/ui/SegmentedControl'
import {
  VENUE_ITEM_STATUS_OPTIONS,
  VENUE_ITEM_TYPE_OPTIONS,
  centimetersToMeters,
  commitNumericInput,
  isLiveNumericDraft,
  isVenueMarkerType,
  isLightType,
  metersToCentimeters,
  type VenueLayerMove,
  type VenueItem,
  type VenueItemPlacement,
  type VenueItemStatus,
  type VenueItemType,
} from './layoutData'

export type PlacedItemSummary = {
  id: string
  item_code: string
  name: string
  quantity: number
  cost: number
}

type Props = {
  item: VenueItem | null
  layerIndex: number
  layerCount: number
  collapsed: boolean
  // Items placed in the selected zone + their summed cost. Optional so existing
  // callers (and the 3D code path) keep working without supplying them.
  placedItems?: PlacedItemSummary[]
  placedItemsTotalCost?: number
  onOpenItems?: () => void
  // Net storey height of the active floor, in cm. Surfaced as an info line
  // under the 3D fields so the user has a reference when picking a height3d.
  storeyHeightCm?: number
  // Canvas-level controls (filter / export) shown in the no-selection state,
  // where the panel would otherwise be empty.
  emptyStateActions?: ReactNode
  onToggleCollapsed: () => void
  onChange: (patch: Partial<VenueItem>) => void
  onMoveLayer: (move: VenueLayerMove) => void
  onDelete: () => void
}

// 面板内所有图标按钮共用的方形按钮外观（design-system §3 形状 / §4 focus）。
const ICON_BUTTON_CLASS =
  'w-9 h-9 inline-flex items-center justify-center rounded-field transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1'

export default function VenueInspector({ item, layerIndex, layerCount, collapsed, storeyHeightCm, emptyStateActions, placedItems = [], placedItemsTotalCost = 0, onOpenItems, onToggleCollapsed, onChange, onMoveLayer, onDelete }: Props) {
  const t = useTranslations('venue')

  if (collapsed) {
    return (
      <aside className="bg-surface border-l border-line min-h-0 flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={t('expandInspector')}
          aria-label={t('expandInspector')}
          className={`${ICON_BUTTON_CLASS} text-ink-500 hover:bg-line-soft hover:text-primary-hover`}
        >
          <PanelRightOpen className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <span className="text-xs font-medium text-ink-500 uppercase tracking-wide [writing-mode:vertical-rl]">
          {t('inspectorTitle')}
        </span>
      </aside>
    )
  }

  const collapseButton = (
    <button
      type="button"
      onClick={onToggleCollapsed}
      title={t('collapseInspector')}
      aria-label={t('collapseInspector')}
      className={`${ICON_BUTTON_CLASS} text-ink-400 hover:bg-line-soft hover:text-primary-hover`}
    >
      <PanelRightClose className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )

  if (!item) {
    return (
      <aside className="bg-surface border-l border-line min-h-0 overflow-auto">
        <div className="p-5 border-b border-line-soft flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
            <h2 className="text-lg font-semibold text-ink-900 tracking-section mt-1">{t('noSelectionTitle')}</h2>
          </div>
          {collapseButton}
        </div>
        <div className="p-5 text-sm text-ink-500 leading-6">
          {t('noSelectionBody')}
        </div>
        {emptyStateActions && (
          <div className="px-5 pb-5">
            {emptyStateActions}
          </div>
        )}
      </aside>
    )
  }

  const metricChange = (key: keyof Pick<VenueItem, 'x' | 'y' | 'width' | 'height' | 'height3d' | 'elevation'>) =>
    (meters: number) => {
      onChange({ [key]: metersToCentimeters(meters) } as Partial<VenueItem>)
    }

  const rotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ rotation: Number(event.target.value) || 0 })
  }
  const isBack = layerIndex <= 0
  const isFront = layerIndex >= layerCount - 1

  return (
    <aside className="bg-surface border-l border-line min-h-0 overflow-auto">
      <div className="p-5 border-b border-line-soft flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
          <h2 className="text-lg font-semibold text-ink-900 tracking-section mt-1 truncate">{item.name}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            className={`${ICON_BUTTON_CLASS} text-ink-400 hover:text-danger-text hover:bg-danger-soft`}
            title={t('deleteItem')}
            aria-label={t('deleteItem')}
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
          {collapseButton}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <Field label={t('fieldName')}>
          <Input
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fieldType')}>
            <Select
              value={item.type}
              onChange={(event) => onChange({ type: event.target.value as VenueItemType })}
            >
              {VENUE_ITEM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(`types.${option.value}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('fieldStatus')}>
            <Select
              value={item.status}
              onChange={(event) => onChange({ status: event.target.value as VenueItemStatus })}
            >
              {VENUE_ITEM_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(`statuses.${option.value}`)}</option>
              ))}
            </Select>
          </Field>
        </div>

        {!isVenueMarkerType(item.type) && item.type !== 'area' && item.type !== 'window' && item.type !== 'truss' && !isLightType(item.type) && (
          // 地面/空中是两选一的小范围互斥切换（§6.1）→ SegmentedControl。
          // 不套 Field：Field 会 cloneElement 往子节点注入 id 与 htmlFor 配对，
          // 而 SegmentedControl 的根是 role="group" 的 div，接不住 id。
          <div>
            <p className="text-xs font-medium text-ink-700 mb-1.5">{t('fieldPlacement')}</p>
            <SegmentedControl
              label={t('fieldPlacement')}
              value={item.placement}
              onChange={(next) => onChange({ placement: next as VenueItemPlacement })}
              items={(['ground', 'aerial'] as VenueItemPlacement[]).map((p) => ({
                value: p,
                label: t(`placements.${p}`),
              }))}
            />
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-ink-700 mb-2">{t('layerOrder')}</p>
          <div className="grid grid-cols-4 gap-2">
            <LayerButton
              icon={SendToBack}
              label={t('layerBack')}
              onClick={() => onMoveLayer('back')}
              disabled={isBack}
            />
            <LayerButton
              icon={MoveDown}
              label={t('layerBackward')}
              onClick={() => onMoveLayer('backward')}
              disabled={isBack}
            />
            <LayerButton
              icon={MoveUp}
              label={t('layerForward')}
              onClick={() => onMoveLayer('forward')}
              disabled={isFront}
            />
            <LayerButton
              icon={BringToFront}
              label={t('layerFront')}
              onClick={() => onMoveLayer('front')}
              disabled={isFront}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-ink-700">{t('geometry')}</p>
            <p className="text-micro text-ink-400">{t('geometryUnit')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X (m)" value={centimetersToMeters(item.x)} onChange={metricChange('x')} step={0.001} />
            <NumberField label="Y (m)" value={centimetersToMeters(item.y)} onChange={metricChange('y')} step={0.001} />
            <NumberField label="W (m)" value={centimetersToMeters(item.width)} onChange={metricChange('width')} min={0.08} step={0.001} />
            <NumberField label="H (m)" value={centimetersToMeters(item.height)} onChange={metricChange('height')} min={0.08} step={0.001} />
          </div>
        </div>

        <Field label={`${t('fieldRotation')} (deg)`}>
          <Input
            type="number"
            value={item.rotation}
            step={1}
            onChange={rotationChange}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-ink-700">{t('elevation3d')}</p>
            <p className="text-micro text-ink-400">{t('elevation3dUnit')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={`${t('fieldHeight3d')} (m)`}
              value={centimetersToMeters(item.height3d)}
              onChange={metricChange('height3d')}
              min={0}
            />
            <NumberField
              label={`${t('fieldElevation')} (m)`}
              value={centimetersToMeters(item.elevation)}
              onChange={metricChange('elevation')}
              min={0}
            />
            {item.type === 'window' && (
              <NumberField
                label={`${t('fieldThickness')} (cm)`}
                value={item.thickness}
                onChange={(cm) => onChange({ thickness: Math.max(0, Math.round(cm)) })}
                min={0}
              />
            )}
          </div>
          {typeof storeyHeightCm === 'number' && storeyHeightCm > 0 && (
            <p className="mt-2 text-micro text-ink-400 tabular-nums">
              {t('fieldStoreyHeight', { value: centimetersToMeters(storeyHeightCm) })}
            </p>
          )}
        </div>

        <Field label={t('fieldNote')}>
          <Textarea
            value={item.note}
            onChange={(event) => onChange({ note: event.target.value })}
            size="lg"
          />
        </Field>

        {/* 对象 ID 保持 readOnly 而非 disabled：用户仍需要能选中复制它。
            但 readOnly 不触发 Input 自带的 disabled: 样式，只读感会丢，
            所以在调用侧用 read-only: 变体补上灰底 + 弱化文字（这两条覆盖的是
            伪类态，不与基础类冲突）。font-mono 是 §2 的编号规则。 */}
        <Field label={t('fieldId')}>
          <Input value={item.id} readOnly className="font-mono read-only:bg-canvas read-only:text-ink-500" />
        </Field>

        {item && (
          <div className="mt-4 rounded-card border border-line p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-ink-700">{t('placedItemsTitle')}</span>
              {onOpenItems && (
                <button
                  type="button"
                  onClick={onOpenItems}
                  className="text-xs text-primary hover:text-primary-hover hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 rounded-field"
                >
                  {t('manageItems')}
                </button>
              )}
            </div>
            {placedItems.length === 0 ? (
              <div className="text-xs text-ink-400">{t('placedItemsEmpty')}</div>
            ) : (
              <>
                <ul className="space-y-1">
                  {placedItems.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs text-ink-700">
                      <span className="truncate">{p.name} <span className="text-ink-400 tabular-nums">×{p.quantity}</span></span>
                      <span className="shrink-0 font-mono tabular-nums">¥{p.cost.toLocaleString('zh-CN')}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-line-strong pt-2 text-xs font-semibold text-ink-900">
                  <span>{t('placedItemsTotal')}</span>
                  <span className="font-mono tabular-nums">¥{placedItemsTotalCost.toLocaleString('zh-CN')}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function LayerButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Trash2
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-8 rounded-field border border-line-strong bg-surface text-ink-500 inline-flex items-center justify-center hover:border-primary-border hover:text-primary-hover disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:text-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )
}

function NumberField({
  label,
  value,
  min,
  step = 0.01,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: number
  onChange: (value: number) => void
}) {
  // While the field is focused, the raw typed text is authoritative so that
  // clearing it to retype (empty / leading "0" / partial like "0.") never gets
  // coerced to 0 and clamped to the minimum mid-edit. When not focused the
  // input mirrors the committed value from the store.
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => String(value))
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setDraft(next)
    // Live-propagate only a finite, in-range value; empty/partial/below-min
    // drafts stay local, so the field can't snap to the clamped minimum while
    // the user is still typing.
    if (isLiveNumericDraft(next, min)) {
      onChange(Number(next))
    }
  }

  const commit = () => {
    setFocused(false)
    onChange(commitNumericInput(draft, value))
  }

  return (
    <Field label={label}>
      <Input
        type="number"
        value={focused ? draft : String(value)}
        min={min}
        step={step}
        onFocus={() => setFocused(true)}
        onChange={handleInput}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="tabular-nums"
      />
    </Field>
  )
}
