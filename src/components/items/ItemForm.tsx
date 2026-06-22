'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ITEM_KINDS, ITEM_STATUSES, type Item, type ItemKind, type ItemStatus, type ItemStatusLog } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import type { VenueLayout } from '@/venue/layoutData'

export interface ItemFormValue {
  name: string
  kind: ItemKind
  expense_id: string | null
  placement_venue_item_id: string | null
  quantity: number
  status: ItemStatus
  responsible_person: string
  serial_number: string
  notes: string
  status_note: string
}

function toFormValue(item: Item | null): ItemFormValue {
  return {
    name: item?.name ?? '',
    kind: item?.kind ?? 'physical',
    expense_id: item?.expense_id ?? null,
    placement_venue_item_id: item?.placement_venue_item_id ?? null,
    quantity: item?.quantity ?? 1,
    status: item?.status ?? 'in_use',
    responsible_person: item?.responsible_person ?? '',
    serial_number: item?.serial_number ?? '',
    notes: item?.notes ?? '',
    status_note: '',
  }
}

// 由 placement_venue_item_id 反推所属楼层
function floorIdOfZone(layout: VenueLayout | null, zoneId: string | null): string {
  if (!layout || !zoneId) return ''
  for (const floor of layout.floors) {
    if (floor.items.some((it) => it.id === zoneId)) return floor.id
  }
  return ''
}

export default function ItemForm({
  open, item, statusLogs, expenses, layout, onClose, onSaved,
}: {
  open: boolean
  item: Item | null
  statusLogs: ItemStatusLog[]
  expenses: Expense[]
  layout: VenueLayout | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('items')
  const tCommon = useTranslations('common')
  const [value, setValue] = useState<ItemFormValue>(() => toFormValue(item))
  const [floorId, setFloorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(toFormValue(item))
      setFloorId(floorIdOfZone(layout, item?.placement_venue_item_id ?? null))
      setError(null)
    }
  }, [open, item, layout])

  if (!open) return null

  const isPhysical = value.kind === 'physical'
  const floors = layout?.floors ?? []
  const zones = floors.find((f) => f.id === floorId)?.items ?? []

  async function submit() {
    setSaving(true)
    setError(null)
    const payload = {
      name: value.name,
      kind: value.kind,
      expense_id: value.expense_id || null,
      placement_venue_item_id: isPhysical ? (value.placement_venue_item_id || null) : null,
      quantity: value.quantity,
      status: value.status,
      responsible_person: value.responsible_person || null,
      serial_number: value.serial_number || null,
      notes: value.notes || null,
      status_note: value.status_note || null,
    }
    try {
      const res = await fetch(item ? `/api/items/${item.id}` : '/api/items', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'save failed')
      onSaved()
      onClose()
    } catch (e) {
      setError(t('saveFailed', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900 mb-4">{item ? t('edit') : t('add')}</h2>

        <div className="space-y-3">
          <Field label={t('fieldName')}>
            <input className={inputCls} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
          </Field>

          <Field label={t('fieldKind')}>
            <select className={inputCls} value={value.kind} onChange={(e) => setValue({ ...value, kind: e.target.value as ItemKind })}>
              {ITEM_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </select>
          </Field>

          <Field label={isPhysical ? t('fieldExpenseRequired') : t('fieldExpense')}>
            <select className={inputCls} value={value.expense_id ?? ''} onChange={(e) => setValue({ ...value, expense_id: e.target.value || null })}>
              <option value="">{t('selectExpense')}</option>
              {expenses.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.item_name} · ¥{ex.total_price} · {ex.expense_date}</option>
              ))}
            </select>
          </Field>

          {isPhysical ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fieldPlacementFloor')}>
                <select className={inputCls} value={floorId} onChange={(e) => { setFloorId(e.target.value); setValue({ ...value, placement_venue_item_id: null }) }}>
                  <option value="">{t('selectFloor')}</option>
                  {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label={t('fieldPlacementZone')}>
                <select className={inputCls} value={value.placement_venue_item_id ?? ''} onChange={(e) => setValue({ ...value, placement_venue_item_id: e.target.value || null })} disabled={!floorId}>
                  <option value="">{t('selectZone')}</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t('noVirtualPlacement')}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fieldQuantity')}>
              <input type="number" min={1} className={inputCls} value={value.quantity} onChange={(e) => setValue({ ...value, quantity: Number(e.target.value) || 1 })} />
            </Field>
            <Field label={t('fieldStatus')}>
              <select className={inputCls} value={value.status} onChange={(e) => setValue({ ...value, status: e.target.value as ItemStatus })}>
                {ITEM_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fieldResponsible')}>
              <input className={inputCls} value={value.responsible_person} onChange={(e) => setValue({ ...value, responsible_person: e.target.value })} />
            </Field>
            <Field label={t('fieldSerial')}>
              <input className={inputCls} value={value.serial_number} onChange={(e) => setValue({ ...value, serial_number: e.target.value })} />
            </Field>
          </div>

          <Field label={t('fieldNotes')}>
            <textarea className={inputCls} rows={2} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} />
          </Field>

          {item && (
            <Field label={t('fieldStatusNote')}>
              <input className={inputCls} value={value.status_note} onChange={(e) => setValue({ ...value, status_note: e.target.value })} />
            </Field>
          )}

          {item && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">{t('timelineTitle')}</div>
              {statusLogs.length === 0 ? (
                <div className="text-xs text-slate-400">{t('timelineEmpty')}</div>
              ) : (
                <ul className="space-y-1.5">
                  {statusLogs.map((log) => (
                    <li key={log.id} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-slate-400 shrink-0">{new Date(log.changed_at).toLocaleString('zh-CN')}</span>
                      <span>
                        {log.from_status ? `${t(`status.${log.from_status}`)} → ` : `${t('timelineInitial')} → `}
                        {t(`status.${log.to_status}`)}
                        {log.note ? ` · ${log.note}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose} disabled={saving}>{tCommon('cancel')}</button>
          <button className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" onClick={submit} disabled={saving}>{tCommon('save')}</button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  )
}
