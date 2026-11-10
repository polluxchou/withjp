import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXPENSE_CATEGORY_OPTIONS,
  categoryHasPeriod,
  distinctExpenseMonths,
} from './costs.ts'

test('only salary, rent, and cloud_services show the period field', () => {
  assert.equal(categoryHasPeriod('salary'), true, 'salary')
  assert.equal(categoryHasPeriod('rent'), true, 'rent')
  assert.equal(categoryHasPeriod('cloud_services'), true, 'cloud_services')
  assert.equal(categoryHasPeriod('tangible_asset'), false, 'tangible_asset')
  assert.equal(categoryHasPeriod('travel'), false, 'travel')
  assert.equal(categoryHasPeriod('office_supplies'), false, 'office_supplies')
})

test('distinctExpenseMonths：按 YYYY-MM 去重、新的在前，空日期跳过', () => {
  assert.deepEqual(
    distinctExpenseMonths(['2026-05-03', '2026-08-20', null, '2026-05-30', '', '2025-12-01', undefined]),
    ['2026-08', '2026-05', '2025-12'],
  )
  assert.deepEqual(distinctExpenseMonths([]), [])
})
