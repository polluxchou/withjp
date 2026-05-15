'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { DEVICE_PAYMENT_STATUS_OPTIONS } from '@/lib/devices/costs'
import type { Device } from '@/lib/types'

interface FormData {
  device_name:       string
  unit_price:        string
  quantity:          string
  purchase_date:     string
  purchase_location: string
  purchase_purpose:  string
  user_name:         string
  buyer_name:        string
  payment_method:    string
  payment_status:    string
}

interface Props {
  device?:   Device
  onSuccess: () => void
  onCancel:  () => void
}

const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function DeviceForm({ device, onSuccess, onCancel }: Props) {
  const t = useTranslations('devices')
  const tCommon = useTranslations('common')
  const [form, setForm] = useState<FormData>({
    device_name:       device?.device_name       ?? '',
    unit_price:        device?.unit_price?.toString() ?? '0',
    quantity:          device?.quantity?.toString()   ?? '1',
    purchase_date:     device?.purchase_date     ?? '',
    purchase_location: device?.purchase_location ?? '',
    purchase_purpose:  device?.purchase_purpose  ?? '',
    user_name:         device?.user_name         ?? '',
    buyer_name:        device?.buyer_name        ?? '',
    payment_method:    device?.payment_method    ?? '',
    payment_status:    device?.payment_status    ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const isEditing = !!device

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.device_name)   { setError(t('errDeviceName')); return }
    if (!form.purchase_date) { setError(t('errPurchaseDate')); return }
    if (!form.payment_status) { setError(t('errPaymentStatus')); return }

    setLoading(true)
    setError(null)

    const payload = {
      device_name:       form.device_name,
      unit_price:        parseFloat(form.unit_price)  || 0,
      quantity:          parseInt(form.quantity, 10)  || 1,
      purchase_date:     form.purchase_date,
      purchase_location: form.purchase_location,
      purchase_purpose:  form.purchase_purpose,
      user_name:         form.user_name,
      buyer_name:        form.buyer_name,
      payment_method:    form.payment_method,
      payment_status:    form.payment_status,
    }

    const url    = isEditing ? `/api/devices/${device.id}` : '/api/devices'
    const method = isEditing ? 'PATCH' : 'POST'

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json()
    setLoading(false)
    if (json.error) { setError(json.error); return }
    onSuccess()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Row 1 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('deviceName')}</label>
          <input value={form.device_name} onChange={set('device_name')} placeholder={t('deviceNamePlaceholder')}
            className={INPUT} />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('unitPrice')}</label>
          <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('quantity')}</label>
          <input type="number" min="1" step="1" value={form.quantity} onChange={set('quantity')}
            placeholder="1" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('purchaseDate')}</label>
          <input type="date" value={form.purchase_date} onChange={set('purchase_date')}
            className={INPUT} />
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('purchaseLocation')}</label>
          <input value={form.purchase_location} onChange={set('purchase_location')} placeholder={t('purchaseLocationPlaceholder')}
            className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('purchasePurpose')}</label>
          <input value={form.purchase_purpose} onChange={set('purchase_purpose')} placeholder={t('purchasePurposePlaceholder')}
            className={INPUT} />
        </div>
      </div>

      {/* Row 4 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('userField')}</label>
          <input value={form.user_name} onChange={set('user_name')} placeholder={t('userFieldPlaceholder')}
            className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('buyerField')}</label>
          <input value={form.buyer_name} onChange={set('buyer_name')} placeholder={t('buyerFieldPlaceholder')}
            className={INPUT} />
        </div>
      </div>

      {/* Row 5 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('paymentMethod')}</label>
          <input value={form.payment_method} onChange={set('payment_method')} placeholder={t('paymentMethodPlaceholder')}
            className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">{t('paymentStatus')}</label>
          <select value={form.payment_status} onChange={set('payment_status')} className={INPUT}>
            <option value="">{t('selectStatus')}</option>
            {DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>{tCommon('cancel')}</Button>
        <Button type="submit" loading={loading}>
          {isEditing ? tCommon('saveChanges') : t('addDevice')}
        </Button>
      </div>
    </form>
  )
}
