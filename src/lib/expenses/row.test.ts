import test from 'node:test'
import assert from 'node:assert/strict'
import { toExpense } from './row.ts'

const row = {
  id: 'e1',
  expense_category: 'travel' as const,
  item_name: 'Taxi',
  unit_price: 1200,
  quantity: 2,
  total_price: 2400,
  expense_date: '2026-11-01',
  location: 'Tokyo',
  purpose: '',
  period: '2026-Q4',
  user_name: 'a',
  buyer_name: 'b',
  payment_method: null,
  payment_method_legacy: null,
  payment_status: 'paid',
  notes: null,
  created_by_user_id: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

test('passes every column through unchanged', () => {
  assert.deepEqual(toExpense(row), row)
})

test('total_price falls back to unit_price * quantity when the generated column is null', () => {
  assert.equal(toExpense({ ...row, total_price: null }).total_price, 2400)
})

test('throws on a payment_status outside the check constraint', () => {
  assert.throws(() => toExpense({ ...row, payment_status: 'PAID' }), /payment_status/)
})
