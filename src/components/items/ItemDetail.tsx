'use client'

import { useTranslations } from 'next-intl'
import type { Item, ItemStatusLog } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import type { VenueLayout } from '@/venue/layoutData'

function zoneLabel(layout: VenueLayout | null, zoneId: string | null): string | null {
  if (!layout || !zoneId) return null
  for (const f of layout.floors) {
    const z = f.items.find((i) => i.id === zoneId)
    if (z) return `${f.name} · ${z.name}`
  }
  return null
}

// Read-only detail view for an item — opened by clicking its code/name in the list.
export default function ItemDetail({
  open, item, statusLogs, expenses, layout, onClose, onEdit,
}: {
  open: boolean
  item: Item | null
  statusLogs: ItemStatusLog[]
  expenses: Expense[]
  layout: VenueLayout | null
  onClose: () => void
  onEdit: () => void
}) {
  const t = useTranslations('items')
  const tCommon = useTranslations('common')
  if (!open || !item) return null

  const ex = item.expense_id ? expenses.find((e) => e.id === item.expense_id) : null
  const place = zoneLabel(layout, item.placement_venue_item_id)

  const rows: [string, string][] = [
    [t('colCode'), item.item_code],
    [t('colName'), item.name],
    [t('colKind'), t(`kind.${item.kind}`)],
    [t('colCost'), ex
      ? item.item_value != null && item.item_value < Number(ex.total_price)
        ? `¥${item.item_value.toLocaleString('zh-CN')} （开支 ¥${Number(ex.total_price).toLocaleString('zh-CN')} · ${ex.item_name}）`
        : `${ex.item_name} · ¥${Number(ex.total_price).toLocaleString('zh-CN')}`
      : '—'],
    [t('colPlacement'), place ?? '—'],
    [t('colQuantity'), String(item.quantity)],
    [t('colStatus'), t(`status.${item.status}`)],
    [t('colResponsible'), item.responsible_person || '—'],
    [t('colSerial'), item.serial_number || '—'],
    [t('fieldNotes'), item.notes || '—'],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">{t('detailTitle')}</h2>
          <span className="font-mono text-xs text-slate-400">{item.item_code}</span>
        </div>

        <dl className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3 text-sm">
              <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
              <dd className="flex-1 text-slate-900 break-words">{value}</dd>
            </div>
          ))}
        </dl>

        {item.photo_url && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">{t('fieldPhoto')}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photo_url} alt="" className="max-h-48 rounded-lg border border-slate-200" />
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
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

        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>{tCommon('close')}</button>
          <button className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700" onClick={onEdit}>{tCommon('edit')}</button>
        </div>
      </div>
    </div>
  )
}
