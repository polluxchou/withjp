'use client'

// 当前无任何调用方：/devices 页已 redirect 到 /expenses（设备管理功能已被
// 支出管理取代），src 全树搜不到 import DeviceForm 的地方。保留并迁到
// 共享 Modal + Field 系（对齐 ItemForm）是有意为之，不是遗留死代码——
// 如果设备管理将来重新独立成一个页面，可以直接接线复用，不必从头重写。

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { DEVICE_PAYMENT_STATUS_OPTIONS } from '@/lib/devices/costs'
import type { Device, DevicePaymentStatus } from '@/lib/types'

export interface DeviceFormValue {
  device_name:       string
  unit_price:        string
  quantity:          string
  purchase_date:     string
  purchase_location: string
  purchase_purpose:  string
  user_name:         string
  buyer_name:        string
  payment_method:    string
  payment_status:    DevicePaymentStatus | ''
}

function toFormValue(device: Device | null): DeviceFormValue {
  return {
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
  }
}

export default function DeviceForm({
  open, device, onClose, onSaved,
}: {
  open: boolean
  device: Device | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('devices')
  const tExpenses = useTranslations('expenses')
  const tCommon = useTranslations('common')
  const [value, setValue] = useState<DeviceFormValue>(() => toFormValue(device))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = !!device

  // Reset form fields whenever the dialog opens or the target device changes
  // (same reset pattern as ItemForm).
  useEffect(() => {
    if (!open) return
    setValue(toFormValue(device))
    setError(null)
  }, [open, device])

  if (!open) return null

  async function submit() {
    if (!value.device_name)    { setError(t('errDeviceName'));   return }
    if (!value.purchase_date)  { setError(t('errPurchaseDate')); return }
    if (!value.payment_status) { setError(t('errPaymentStatus')); return }

    setSaving(true)
    setError(null)

    const payload = {
      device_name:       value.device_name,
      unit_price:        parseFloat(value.unit_price) || 0,
      quantity:          parseInt(value.quantity, 10)  || 1,
      purchase_date:     value.purchase_date,
      purchase_location: value.purchase_location,
      purchase_purpose:  value.purchase_purpose,
      user_name:         value.user_name,
      buyer_name:        value.buyer_name,
      payment_method:    value.payment_method,
      payment_status:    value.payment_status,
    }

    try {
      const res = await fetch(isEditing ? `/api/devices/${device.id}` : '/api/devices', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json?.error ?? `HTTP ${res.status}`)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t('editDevice') : t('addDevice')}
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tCommon('cancel')}</Button>
          <Button loading={saving} onClick={submit}>
            {isEditing ? tCommon('saveChanges') : t('addDevice')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('deviceName')} required>
          <Input
            value={value.device_name}
            onChange={(e) => setValue({ ...value, device_name: e.target.value })}
            placeholder={t('deviceNamePlaceholder')}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label={t('unitPrice')}>
            <Input
              type="number" min={0} step={0.01}
              value={value.unit_price}
              onChange={(e) => setValue({ ...value, unit_price: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label={t('quantity')}>
            <Input
              type="number" min={1} step={1}
              value={value.quantity}
              onChange={(e) => setValue({ ...value, quantity: e.target.value })}
              placeholder="1"
            />
          </Field>
          <Field label={t('purchaseDate')} required>
            <Input
              type="date"
              value={value.purchase_date}
              onChange={(e) => setValue({ ...value, purchase_date: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('purchaseLocation')}>
            <Input
              value={value.purchase_location}
              onChange={(e) => setValue({ ...value, purchase_location: e.target.value })}
              placeholder={t('purchaseLocationPlaceholder')}
            />
          </Field>
          <Field label={t('purchasePurpose')}>
            <Input
              value={value.purchase_purpose}
              onChange={(e) => setValue({ ...value, purchase_purpose: e.target.value })}
              placeholder={t('purchasePurposePlaceholder')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('userField')}>
            <Input
              value={value.user_name}
              onChange={(e) => setValue({ ...value, user_name: e.target.value })}
              placeholder={t('userFieldPlaceholder')}
            />
          </Field>
          <Field label={t('buyerField')}>
            <Input
              value={value.buyer_name}
              onChange={(e) => setValue({ ...value, buyer_name: e.target.value })}
              placeholder={t('buyerFieldPlaceholder')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('paymentMethod')}>
            <Input
              value={value.payment_method}
              onChange={(e) => setValue({ ...value, payment_method: e.target.value })}
              placeholder={t('paymentMethodPlaceholder')}
            />
          </Field>
          <Field label={t('paymentStatus')} required>
            <Select
              value={value.payment_status}
              onChange={(e) => setValue({ ...value, payment_status: e.target.value as DevicePaymentStatus })}
            >
              <option value="">{t('selectStatus')}</option>
              {DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{tExpenses(`paymentStatuses.${o.value}`)}</option>
              ))}
            </Select>
          </Field>
        </div>

        {error && (
          <div className="text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
