'use client'

import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChangeEvent, ReactNode } from 'react'
import {
  VENUE_ITEM_STATUS_OPTIONS,
  VENUE_ITEM_TYPE_OPTIONS,
  centimetersToMeters,
  metersToCentimeters,
  type VenueItem,
  type VenueItemStatus,
  type VenueItemType,
} from './layoutData'

type Props = {
  item: VenueItem | null
  onChange: (patch: Partial<VenueItem>) => void
  onDelete: () => void
}

const INPUT_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500'
const DISABLED_CLASS = 'w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400'

export default function VenueInspector({ item, onChange, onDelete }: Props) {
  const t = useTranslations('venue')

  if (!item) {
    return (
      <aside className="bg-white border-l border-slate-200 min-h-0 overflow-auto">
        <div className="p-5 border-b border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
          <h2 className="text-lg font-semibold text-slate-900 mt-1">{t('noSelectionTitle')}</h2>
        </div>
        <div className="p-5 text-sm text-slate-500 leading-6">
          {t('noSelectionBody')}
        </div>
      </aside>
    )
  }

  const metricChange = (key: keyof Pick<VenueItem, 'x' | 'y' | 'width' | 'height'>) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ [key]: metersToCentimeters(Number(event.target.value) || 0) } as Partial<VenueItem>)
    }

  const rotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ rotation: Number(event.target.value) || 0 })
  }

  return (
    <aside className="bg-white border-l border-slate-200 min-h-0 overflow-auto">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('inspectorTitle')}</p>
          <h2 className="text-lg font-semibold text-slate-900 mt-1 truncate">{item.name}</h2>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title={t('deleteItem')}
          aria-label={t('deleteItem')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
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
      </div>
    </aside>
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
