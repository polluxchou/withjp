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

export type DeviceCostGranularity = 'month' | 'quarter' | 'year'

export interface DeviceCostTimePoint {
  period:         string
  budgeted:       number
  ordered_unpaid: number
  paid:           number
}

type DeviceForTimeSeries = {
  purchase_date:  string | null
  total_price:    number | string
  payment_status: DevicePaymentStatus
}

function periodKey(date: Date, granularity: DeviceCostGranularity): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  if (granularity === 'year')    return String(y)
  if (granularity === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  return `${y}-${String(m).padStart(2, '0')}`
}

function advancePeriod(date: Date, granularity: DeviceCostGranularity): Date {
  const d = new Date(date)
  if (granularity === 'year')    d.setUTCFullYear(d.getUTCFullYear() + 1)
  else if (granularity === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3)
  else                           d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

function periodStart(date: Date, granularity: DeviceCostGranularity): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  if (granularity === 'year')    return new Date(Date.UTC(y, 0, 1))
  if (granularity === 'quarter') return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))
  return new Date(Date.UTC(y, m, 1))
}

export function getDeviceCostTimeSeries(
  devices:     DeviceForTimeSeries[],
  granularity: DeviceCostGranularity = 'month',
): DeviceCostTimePoint[] {
  const dated = devices.filter((d) => d.purchase_date)
  if (dated.length === 0) return []

  const buckets = new Map<string, { budgeted: number; ordered_unpaid: number; paid: number }>()
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const d of dated) {
    const date = new Date(d.purchase_date as string)
    if (isNaN(date.getTime())) continue
    const key = periodKey(date, granularity)
    const bucket = buckets.get(key) ?? { budgeted: 0, ordered_unpaid: 0, paid: 0 }
    const amt = Number(d.total_price)
    if (d.payment_status === 'budgeted')       bucket.budgeted       += amt
    else if (d.payment_status === 'ordered_unpaid') bucket.ordered_unpaid += amt
    else if (d.payment_status === 'paid')      bucket.paid           += amt
    buckets.set(key, bucket)
    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date
  }

  if (!minDate || !maxDate) return []

  const result: DeviceCostTimePoint[] = []
  let cumBudgeted = 0
  let cumOrdered  = 0
  let cumPaid     = 0
  let cursor      = periodStart(minDate, granularity)
  const end       = periodStart(maxDate, granularity)

  while (cursor <= end) {
    const key = periodKey(cursor, granularity)
    const bucket = buckets.get(key) ?? { budgeted: 0, ordered_unpaid: 0, paid: 0 }
    cumBudgeted += bucket.budgeted
    cumOrdered  += bucket.ordered_unpaid
    cumPaid     += bucket.paid
    result.push({
      period:         key,
      budgeted:       cumBudgeted,
      ordered_unpaid: cumOrdered,
      paid:           cumPaid,
    })
    cursor = advancePeriod(cursor, granularity)
  }

  return result
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
