import assert from 'node:assert/strict'
import test from 'node:test'
import { nextExpenseCategoryFilter } from './category-filter.ts'

test('selects a category from the chart when no category filter is active', () => {
  assert.equal(nextExpenseCategoryFilter('', 'salary'), 'salary')
})

test('switches the active category when a different pie slice is selected', () => {
  assert.equal(nextExpenseCategoryFilter('salary', 'rent'), 'rent')
})

test('clears the active category when the selected pie slice is clicked again', () => {
  assert.equal(nextExpenseCategoryFilter('rent', 'rent'), '')
})
