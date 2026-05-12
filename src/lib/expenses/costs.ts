import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
  ExpensePaymentMethod as EPM,
} from '@/lib/types'

// ── Team members (使用人枚举) ─────────────────────────────────

export const EXPENSE_USER_OPTIONS = [
  'pollux',
  'keco',
  'huang',
  'chenhao',
  'xiaoshou',
  'huqian',
  'reiko',
  'lintao',
  'sogray',
  'shen',
  'seam',
] as const

export type ExpenseUser = typeof EXPENSE_USER_OPTIONS[number]

// ── Labels ────────────────────────────────────────────────────

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  tangible_asset:  '有形资产',
  salary:          '薪资成本',
  rent:            '租金',
  travel:          '差旅费',
  office_supplies: '办公耗材',
  cloud_services:  '云服务/网络',
}

export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'tangible_asset',  label: '有形资产' },
  { value: 'salary',          label: '薪资成本' },
  { value: 'rent',            label: '租金' },
  { value: 'travel',          label: '差旅费' },
  { value: 'office_supplies', label: '办公耗材' },
  { value: 'cloud_services',  label: '云服务/网络' },
]

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  company_account: '公司公共账户',
  wechat_pay:      '微信支付',
  alipay:          '支付宝',
  bank_card:       '银行卡',
}

export const EXPENSE_PAYMENT_METHOD_OPTIONS: { value: EPM; label: string }[] = [
  { value: 'company_account', label: '公司公共账户' },
  { value: 'wechat_pay',      label: '微信支付' },
  { value: 'alipay',          label: '支付宝' },
  { value: 'bank_card',       label: '银行卡' },
]

export const EXPENSE_PAYMENT_STATUS_OPTIONS: { value: ExpensePaymentStatus; label: string }[] = [
  { value: 'budgeted',           label: 'Budgeted' },
  { value: 'ordered_unpaid',     label: 'Ordered, Unpaid' },
  { value: 'paid',               label: 'Paid' },
  { value: 'refunded',           label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
]

export const EXPENSE_PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> =
  Object.fromEntries(
    EXPENSE_PAYMENT_STATUS_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<ExpensePaymentStatus, string>

// ── 归属周期 (quarterly, 2026-Q1 → 2028-Q4) ───────────────────

export const EXPENSE_PERIOD_OPTIONS: string[] = (() => {
  const quarters: string[] = []
  for (let y = 2026; y <= 2028; y++) {
    for (let q = 1; q <= 4; q++) quarters.push(`${y}-Q${q}`)
  }
  return quarters
})()

// ── Cross-border transfer fee ─────────────────────────────────
//
// All expenses paid to a buyer other than `with-new`, except for rent,
// incur an additional cross-border transfer cost on top of total_price.

export const CROSS_BORDER_FEE_RATE = 0.04

type ExpenseForFee = {
  buyer_name:       string
  expense_category: ExpenseCategory
  total_price:      number | string
}

/** Cross-border transfer fee for a single expense (0 if not applicable). */
export function crossBorderFee(e: ExpenseForFee): number {
  if (e.expense_category === 'rent') return 0
  if (e.buyer_name === 'with-new')   return 0
  return Number(e.total_price) * CROSS_BORDER_FEE_RATE
}

/** total_price + cross-border fee — the true cost the company bears. */
export function effectiveCost(e: ExpenseForFee): number {
  return Number(e.total_price) + crossBorderFee(e)
}

/** Derive `YYYY-QN` quarter string from a `YYYY-MM-DD` date. Empty string if invalid. */
export function dateToQuarter(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const [yStr, mStr] = dateStr.split('-')
  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10)
  if (!y || !m || m < 1 || m > 12) return ''
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
}

// ── Category display config ───────────────────────────────────

/** Whether a category shows unit_price × quantity (vs a single total amount) */
export function categoryHasQuantity(cat: ExpenseCategory): boolean {
  return cat === 'tangible_asset' || cat === 'office_supplies'
}

/** Whether a category shows the period field */
export function categoryHasPeriod(cat: ExpenseCategory): boolean {
  return EXPENSE_CATEGORY_OPTIONS.some((option) => option.value === cat)
}

/** Whether a category shows the location field */
export function categoryHasLocation(cat: ExpenseCategory): boolean {
  return cat === 'tangible_asset' || cat === 'travel' || cat === 'rent'
}

// ── Summary ───────────────────────────────────────────────────

export interface ExpenseSummary {
  totalCost:          number
  paidCost:           number
  budgetedUnpaidCost: number
  currentMonthCost:   number
  crossBorderCost:    number
  itemCount:          number
}

type ExpenseForSummary = {
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  expense_date:     string
  buyer_name:       string
  expense_category: ExpenseCategory
}

export function getExpenseSummary(expenses: ExpenseForSummary[]): ExpenseSummary {
  const now      = new Date()
  const thisYear = now.getUTCFullYear()
  const thisMon  = now.getUTCMonth() + 1

  let totalCost          = 0
  let paidCost           = 0
  let budgetedUnpaidCost = 0
  let currentMonthCost   = 0
  let crossBorderCost    = 0

  for (const e of expenses) {
    const total = effectiveCost(e)
    totalCost += total
    crossBorderCost += crossBorderFee(e)

    if (e.payment_status === 'paid') {
      paidCost += total
      // current-month paid
      if (e.expense_date) {
        const d = new Date(e.expense_date)
        if (d.getUTCFullYear() === thisYear && d.getUTCMonth() + 1 === thisMon) {
          currentMonthCost += total
        }
      }
    }
    if (e.payment_status === 'budgeted' || e.payment_status === 'ordered_unpaid') {
      budgetedUnpaidCost += total
    }
  }

  return {
    totalCost,
    paidCost,
    budgetedUnpaidCost,
    currentMonthCost,
    crossBorderCost,
    itemCount: expenses.length,
  }
}

// ── Category breakdown ────────────────────────────────────────

export interface ExpenseCategoryTotal {
  category: ExpenseCategory
  label:    string
  total:    number
  paid:     number
  pct:      number   // percentage of grand total (0-100)
}

type ExpenseForCategory = {
  expense_category: ExpenseCategory
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  buyer_name:       string
}

export function getExpenseCategoryBreakdown(
  expenses: ExpenseForCategory[]
): ExpenseCategoryTotal[] {
  const map = new Map<ExpenseCategory, { total: number; paid: number }>()

  for (const e of expenses) {
    const total = effectiveCost(e)
    const prev  = map.get(e.expense_category) ?? { total: 0, paid: 0 }
    map.set(e.expense_category, {
      total: prev.total + total,
      paid:  prev.paid + (e.payment_status === 'paid' ? total : 0),
    })
  }

  const grandTotal = Array.from(map.values()).reduce((s, v) => s + v.total, 0)

  return EXPENSE_CATEGORY_OPTIONS.map(({ value, label }) => {
    const d = map.get(value) ?? { total: 0, paid: 0 }
    return {
      category: value,
      label,
      total: d.total,
      paid:  d.paid,
      pct:   grandTotal > 0 ? (d.total / grandTotal) * 100 : 0,
    }
  }).filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

// ── Time series ───────────────────────────────────────────────

export type CostGranularity = 'month' | 'quarter' | 'year'

export interface CostTimePoint {
  period:         string
  budgeted:       number
  ordered_unpaid: number
  paid:           number
}

type ExpenseForTimeSeries = {
  expense_date:     string | null
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  buyer_name:       string
  expense_category: ExpenseCategory
}

function periodKey(date: Date, g: CostGranularity): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  if (g === 'year')    return String(y)
  if (g === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  return `${y}-${String(m).padStart(2, '0')}`
}

function advancePeriod(d: Date, g: CostGranularity): Date {
  const n = new Date(d)
  if (g === 'year')         n.setUTCFullYear(n.getUTCFullYear() + 1)
  else if (g === 'quarter') n.setUTCMonth(n.getUTCMonth() + 3)
  else                      n.setUTCMonth(n.getUTCMonth() + 1)
  return n
}

function periodStart(d: Date, g: CostGranularity): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (g === 'year')    return new Date(Date.UTC(y, 0, 1))
  if (g === 'quarter') return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))
  return new Date(Date.UTC(y, m, 1))
}

// ── Monthly summary (pivot: month × category) ─────────────────

export interface MonthlyExpenseSummaryRow {
  month:          string                          // e.g. '2025-05'
  byCategory:     Partial<Record<ExpenseCategory, number>>
  total:          number
  paid:           number
}

type ExpenseForMonthly = {
  expense_category: ExpenseCategory
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  expense_date:     string | null
  buyer_name:       string
}

// ── Daily summary (one row per day with spend) ───────────────

export interface DailyExpenseSummaryRow {
  date:  string   // 'YYYY-MM-DD'
  total: number
  paid:  number
  count: number   // number of individual expense records on this day
}

type ExpenseForDaily = {
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  expense_date:     string | null
  buyer_name:       string
  expense_category: ExpenseCategory
}

export function getDailyExpenseSummary(
  expenses: ExpenseForDaily[]
): DailyExpenseSummaryRow[] {
  const map = new Map<string, DailyExpenseSummaryRow>()

  for (const e of expenses) {
    if (!e.expense_date) continue
    const date = e.expense_date
    const amt  = effectiveCost(e)
    const row  = map.get(date) ?? { date, total: 0, paid: 0, count: 0 }
    row.total += amt
    row.count += 1
    if (e.payment_status === 'paid') row.paid += amt
    map.set(date, row)
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function getMonthlyExpenseSummary(
  expenses: ExpenseForMonthly[]
): MonthlyExpenseSummaryRow[] {
  const map = new Map<string, MonthlyExpenseSummaryRow>()

  for (const e of expenses) {
    if (!e.expense_date) continue
    const d = new Date(e.expense_date)
    if (isNaN(d.getTime())) continue
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const eff   = effectiveCost(e)

    const row = map.get(month) ?? {
      month,
      byCategory: {},
      total:      0,
      paid:       0,
    }

    row.byCategory[e.expense_category] = (row.byCategory[e.expense_category] ?? 0) + eff
    row.total += eff
    if (e.payment_status === 'paid') row.paid += eff

    map.set(month, row)
  }

  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month))
}

export function getExpenseCostTimeSeries(
  expenses:    ExpenseForTimeSeries[],
  granularity: CostGranularity = 'month',
): CostTimePoint[] {
  const dated = expenses.filter((e) => e.expense_date)
  if (dated.length === 0) return []

  const buckets = new Map<string, { budgeted: number; ordered_unpaid: number; paid: number }>()
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const e of dated) {
    const date = new Date(e.expense_date as string)
    if (isNaN(date.getTime())) continue
    const key    = periodKey(date, granularity)
    const bucket = buckets.get(key) ?? { budgeted: 0, ordered_unpaid: 0, paid: 0 }
    const amt    = effectiveCost(e)
    if      (e.payment_status === 'budgeted')       bucket.budgeted       += amt
    else if (e.payment_status === 'ordered_unpaid') bucket.ordered_unpaid += amt
    else if (e.payment_status === 'paid')           bucket.paid           += amt
    buckets.set(key, bucket)
    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date
  }

  if (!minDate || !maxDate) return []

  const result: CostTimePoint[] = []
  let cumB = 0, cumO = 0, cumP = 0
  let cursor = periodStart(minDate, granularity)
  const end  = periodStart(maxDate, granularity)

  while (cursor <= end) {
    const key    = periodKey(cursor, granularity)
    const bucket = buckets.get(key) ?? { budgeted: 0, ordered_unpaid: 0, paid: 0 }
    cumB += bucket.budgeted
    cumO += bucket.ordered_unpaid
    cumP += bucket.paid
    result.push({ period: key, budgeted: cumB, ordered_unpaid: cumO, paid: cumP })
    cursor = advancePeriod(cursor, granularity)
  }

  return result
}
