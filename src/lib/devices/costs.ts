export type DevicePaymentStatus =
  | 'budgeted'
  | 'ordered_unpaid'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'

export const DEVICE_PAYMENT_STATUS_OPTIONS: { value: DevicePaymentStatus; label: string }[] = [
  { value: 'budgeted',           label: 'Budgeted' },
  { value: 'ordered_unpaid',     label: 'Ordered, Unpaid' },
  { value: 'paid',               label: 'Paid' },
  { value: 'refunded',           label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
]

export const PAYMENT_STATUS_LABEL: Record<DevicePaymentStatus, string> = Object.fromEntries(
  DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => [o.value, o.label])
) as Record<DevicePaymentStatus, string>

export function getDeviceTotalPrice(unitPrice: number, quantity: number): number {
  return unitPrice * quantity
}

export interface DeviceCostSummary {
  totalCost:          number
  paidCost:           number
  budgetedUnpaidCost: number
  deviceCount:        number
}

type DeviceForSummary = {
  unit_price:     number
  quantity:       number
  total_price:    number
  payment_status: DevicePaymentStatus
}

export function getDeviceCostSummary(devices: DeviceForSummary[]): DeviceCostSummary {
  let totalCost          = 0
  let paidCost           = 0
  let budgetedUnpaidCost = 0
  let deviceCount        = 0

  for (const d of devices) {
    const total = Number(d.total_price)
    totalCost   += total
    deviceCount += d.quantity
    if (d.payment_status === 'paid') {
      paidCost += total
    }
    if (d.payment_status === 'budgeted' || d.payment_status === 'ordered_unpaid') {
      budgetedUnpaidCost += total
    }
  }

  return { totalCost, paidCost, budgetedUnpaidCost, deviceCount }
}
