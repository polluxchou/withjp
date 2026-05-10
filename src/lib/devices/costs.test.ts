import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEVICE_PAYMENT_STATUS_OPTIONS,
  getDeviceTotalPrice,
  getDeviceCostSummary,
} from './costs.ts'

// ── getDeviceTotalPrice ───────────────────────────────────────

test('getDeviceTotalPrice multiplies unit price by quantity', () => {
  assert.equal(getDeviceTotalPrice(100, 5), 500)
})

test('getDeviceTotalPrice handles decimal unit price', () => {
  assert.equal(getDeviceTotalPrice(199.99, 3), 599.97)
})

test('getDeviceTotalPrice with quantity 1 returns unit price', () => {
  assert.equal(getDeviceTotalPrice(888.5, 1), 888.5)
})

// ── getDeviceCostSummary ──────────────────────────────────────

const SAMPLE_DEVICES = [
  { unit_price: 1000, quantity: 2, total_price: 2000, payment_status: 'paid'             as const },
  { unit_price:  500, quantity: 1, total_price:  500, payment_status: 'budgeted'         as const },
  { unit_price:  300, quantity: 3, total_price:  900, payment_status: 'ordered_unpaid'   as const },
  { unit_price:  200, quantity: 1, total_price:  200, payment_status: 'refunded'         as const },
  { unit_price:  100, quantity: 2, total_price:  200, payment_status: 'partially_refunded' as const },
]

test('getDeviceCostSummary totalCost sums all total_price values', () => {
  const { totalCost } = getDeviceCostSummary(SAMPLE_DEVICES)
  assert.equal(totalCost, 2000 + 500 + 900 + 200 + 200)
})

test('getDeviceCostSummary paidCost sums only paid devices', () => {
  const { paidCost } = getDeviceCostSummary(SAMPLE_DEVICES)
  assert.equal(paidCost, 2000)
})

test('getDeviceCostSummary budgetedUnpaidCost sums budgeted and ordered_unpaid', () => {
  const { budgetedUnpaidCost } = getDeviceCostSummary(SAMPLE_DEVICES)
  assert.equal(budgetedUnpaidCost, 500 + 900)
})

test('getDeviceCostSummary deviceCount sums all quantities', () => {
  const { deviceCount } = getDeviceCostSummary(SAMPLE_DEVICES)
  assert.equal(deviceCount, 2 + 1 + 3 + 1 + 2)
})

test('getDeviceCostSummary returns zeros for empty array', () => {
  const summary = getDeviceCostSummary([])
  assert.equal(summary.totalCost, 0)
  assert.equal(summary.paidCost, 0)
  assert.equal(summary.budgetedUnpaidCost, 0)
  assert.equal(summary.deviceCount, 0)
})

// ── DEVICE_PAYMENT_STATUS_OPTIONS ────────────────────────────

test('DEVICE_PAYMENT_STATUS_OPTIONS contains all five statuses', () => {
  const values = DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => o.value)
  assert.ok(values.includes('budgeted'))
  assert.ok(values.includes('ordered_unpaid'))
  assert.ok(values.includes('paid'))
  assert.ok(values.includes('refunded'))
  assert.ok(values.includes('partially_refunded'))
})

test('payment status labels are correct English strings', () => {
  const map = Object.fromEntries(DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => [o.value, o.label]))
  assert.equal(map['budgeted'],            'Budgeted')
  assert.equal(map['ordered_unpaid'],      'Ordered, Unpaid')
  assert.equal(map['paid'],                'Paid')
  assert.equal(map['refunded'],            'Refunded')
  assert.equal(map['partially_refunded'],  'Partially Refunded')
})
