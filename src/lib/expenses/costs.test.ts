import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXPENSE_CATEGORY_OPTIONS,
  categoryHasPeriod,
} from './costs.ts'

test('all expense categories show the period field', () => {
  for (const option of EXPENSE_CATEGORY_OPTIONS) {
    assert.equal(categoryHasPeriod(option.value), true, option.value)
  }
})
