'use client'

import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import { toneOf } from '@/lib/ui/status-tone'
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

  // 与 ExpenseDetailModal 同款只读记录行（design-system §6.3 详情页模式）。
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-line-soft last:border-b-0">
      <div className="text-xs text-ink-500 font-medium pt-0.5">{label}</div>
      <div className="col-span-2 text-sm text-ink-900 break-words">{children}</div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('detailTitle')}
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tCommon('close')}</Button>
          <Button onClick={onEdit}>{tCommon('edit')}</Button>
        </>
      }
    >
      <div className="space-y-0">
        <Row label={t('colCode')}>{item.item_code}</Row>
        <Row label={t('colName')}>{item.name}</Row>
        <Row label={t('colKind')}>{t(`kind.${item.kind}`)}</Row>
        <Row label={t('colCost')}>
          {ex ? (
            item.item_value != null && item.item_value < Number(ex.total_price) ? (
              <span>
                ¥{item.item_value.toLocaleString('zh-CN')}
                <span className="ml-1 text-xs text-ink-400">
                  （{t('costOriginalNote', { price: `¥${Number(ex.total_price).toLocaleString('zh-CN')}`, name: ex.item_name })}）
                </span>
              </span>
            ) : (
              <span>{ex.item_name} · ¥{Number(ex.total_price).toLocaleString('zh-CN')}</span>
            )
          ) : <span className="text-ink-400">—</span>}
        </Row>
        <Row label={t('colPlacement')}>{place ?? <span className="text-ink-400">—</span>}</Row>
        <Row label={t('colQuantity')}>{item.quantity}</Row>
        <Row label={t('colStatus')}>
          <Tag tone={toneOf('item', item.status)} label={t(`status.${item.status}`)} />
        </Row>
        <Row label={t('colResponsible')}>{item.responsible_person || <span className="text-ink-400">—</span>}</Row>
        <Row label={t('colSerial')}>{item.serial_number || <span className="text-ink-400">—</span>}</Row>
        <Row label={t('fieldNotes')}>{item.notes || <span className="text-ink-400">—</span>}</Row>
      </div>

      {item.photo_url && (
        <div className="mt-3">
          <div className="text-xs text-ink-500 mb-1">{t('fieldPhoto')}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photo_url} alt="" className="max-h-48 rounded-field border border-line" />
        </div>
      )}

      <div className="mt-4 rounded-field border border-line p-3">
        <div className="text-xs font-semibold text-ink-700 mb-2">{t('timelineTitle')}</div>
        {statusLogs.length === 0 ? (
          <div className="text-xs text-ink-400">{t('timelineEmpty')}</div>
        ) : (
          <ul className="space-y-1.5">
            {statusLogs.map((log) => (
              <li key={log.id} className="text-xs text-ink-700 flex gap-2">
                <span className="text-ink-400 shrink-0">{new Date(log.changed_at).toLocaleString('zh-CN')}</span>
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
    </Modal>
  )
}
