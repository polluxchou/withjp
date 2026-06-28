'use client'

import { BringToFront, MoveDown, MoveUp, PanelRightClose, PanelRightOpen, SendToBack, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChangeEvent, ReactNode } from 'react'
import {
  VENUE_ITEM_STATUS_OPTIONS,
  VENUE_ITEM_TYPE_OPTIONS,
  centimetersToMeters,
  isVenueMarkerType,
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

const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500'
const DISABLED_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400'

export default function VenueInspector({ item, layerIndex, layerCount, collapsed, storeyHeightCm, emptyStateActions, placedItems = [], placedItemsTotalCost = 0, onOpenItems, onToggleCollapsed, onChange, onMoveLayer, onDelete }: Props) {
  const t = useTranslations('venue')

  if (collapsed) {
    return (
      <aside className="bg-white border-l border-slate-200 min-h-0 flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={t('expandInspector')}
          aria-label={t('expandInspector')}
          className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-indigo-700 transition-colors"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide [writing-mode:vertical-rl]">
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
      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-700 transition-colors"
    >
      <PanelRightClose className="w-4 h-4" />
    </button>
  )

  if (!item) {
    return (
      <aside className="bg-white border-l border-slate-200 min-h-0 overflow-auto">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
            <h2 className="text-lg font-semibold text-slate-900 mt-1">{t('noSelectionTitle')}</h2>
          </div>
          {collapseButton}
        </div>
        <div className="p-5 text-sm text-slate-500 leading-6">
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
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ [key]: metersToCentimeters(Number(event.target.value) || 0) } as Partial<VenueItem>)
    }

  const rotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ rotation: Number(event.target.value) || 0 })
  }
  const isBack = layerIndex <= 0
  const isFront = layerIndex >= layerCount - 1

  return (
    <aside className="bg-white border-l border-slate-200 min-h-0 overflow-auto">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
          <h2 className="text-lg font-semibold text-slate-900 mt-1 truncate">{item.name}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title={t('deleteItem')}
            aria-label={t('deleteItem')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {collapseButton}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <Field label={t('fieldName')}>
          <input
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fieldType')}>
            <select
              value={item.type}
              onChange={(event) => onChange({ type: event.target.value as VenueItemType })}
              className={INPUT_CLASS}
            >
              {VENUE_ITEM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(`types.${option.value}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fieldStatus')}>
            <select
              value={item.status}
              onChange={(event) => onChange({ status: event.target.value as VenueItemStatus })}
              className={INPUT_CLASS}
            >
              {VENUE_ITEM_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(`statuses.${option.value}`)}</option>
              ))}
            </select>
          </Field>
        </div>

        {!isVenueMarkerType(item.type) && item.type !== 'area' && (
          <Field label={t('fieldPlacement')}>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              {(['ground', 'aerial'] as VenueItemPlacement[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange({ placement: p })}
                  className={`flex-1 py-2 text-center transition-colors ${
                    item.placement === p
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t(`placements.${p}`)}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">{t('layerOrder')}</p>
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
            <p className="text-xs font-medium text-slate-500">{t('geometry')}</p>
            <p className="text-[11px] text-slate-400">{t('geometryUnit')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X (m)" value={centimetersToMeters(item.x)} onChange={metricChange('x')} />
            <NumberField label="Y (m)" value={centimetersToMeters(item.y)} onChange={metricChange('y')} />
            <NumberField label="W (m)" value={centimetersToMeters(item.width)} onChange={metricChange('width')} min={0.08} />
            <NumberField label="H (m)" value={centimetersToMeters(item.height)} onChange={metricChange('height')} min={0.08} />
          </div>
        </div>

        <Field label={`${t('fieldRotation')} (deg)`}>
          <input
            type="number"
            value={item.rotation}
            step={1}
            onChange={rotationChange}
            className={INPUT_CLASS}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-slate-500">{t('elevation3d')}</p>
            <p className="text-[11px] text-slate-400">{t('elevation3dUnit')}</p>
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
          </div>
          {typeof storeyHeightCm === 'number' && storeyHeightCm > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">
              {t('fieldStoreyHeight', { value: centimetersToMeters(storeyHeightCm) })}
            </p>
          )}
        </div>

        <Field label={t('fieldNote')}>
          <textarea
            value={item.note}
            onChange={(event) => onChange({ note: event.target.value })}
            rows={5}
            className={`${INPUT_CLASS} resize-none`}
          />
        </Field>

        <Field label={t('fieldId')}>
          <input value={item.id} readOnly className={DISABLED_CLASS} />
        </Field>

        {item && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('placedItemsTitle')}</span>
              {onOpenItems && (
                <button type="button" onClick={onOpenItems} className="text-xs text-indigo-600 hover:underline">
                  {t('manageItems')}
                </button>
              )}
            </div>
            {placedItems.length === 0 ? (
              <div className="text-xs text-slate-400">{t('placedItemsEmpty')}</div>
            ) : (
              <>
                <ul className="space-y-1">
                  {placedItems.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs text-slate-600">
                      <span className="truncate">{p.name} <span className="text-slate-400">×{p.quantity}</span></span>
                      <span className="shrink-0 tabular-nums">¥{p.cost.toLocaleString('zh-CN')}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-xs font-semibold text-slate-800">
                  <span>{t('placedItemsTotal')}</span>
                  <span className="tabular-nums">¥{placedItemsTotalCost.toLocaleString('zh-CN')}</span>
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
      className="h-9 rounded-lg border border-slate-200 bg-white text-slate-500 inline-flex items-center justify-center hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500 transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min?: number
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1.5">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={0.01}
        onChange={onChange}
        className={INPUT_CLASS}
      />
    </label>
  )
}
