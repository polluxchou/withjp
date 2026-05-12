import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXPENSE_CATEGORY_OPTIONS,
  categoryHasPeriod,
} from './costs.ts'

test('only salary, rent, and cloud_services show the period field', () => {
  assert.equal(categoryHasPeriod('salary'), true, 'salary')
  assert.equal(categoryHasPeriod('rent'), true, 'rent')
  assert.equal(categoryHasPeriod('cloud_services'), true, 'cloud_services')
  assert.equal(categoryHasPeriod('tangible_asset'), false, 'tangible_asset')
  assert.equal(categoryHasPeriod('travel'), false, 'travel')
  assert.equal(categoryHasPeriod('office_supplies'), false, 'office_supplies')
})
