import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DAILY_ALERT_THRESHOLD,
  expenseDayLabel,
  groupByBuyer,
  groupByDay,
  sortExpenses,
} from './grouping.ts'
import type { GroupableExpense } from './grouping.ts'

function e(
  id: string,
  expense_date: string,
  total_price: number,
  buyer_name?: string | null,
): GroupableExpense {
  return { id, expense_date, total_price, buyer_name, created_at: `${expense_date}T00:00:00Z` }
}

// ---- sortExpenses -----------------------------------------------------------

test('date sort orders by day, then by amount descending inside the same day', () => {
  const rows = [e('a', '2027-02-28', 6000), e('b', '2027-03-28', 16000), e('c', '2027-02-28', 75000)]

  assert.deepEqual(sortExpenses(rows, 'date', 'desc').map((r) => r.id), ['b', 'c', 'a'])
  assert.deepEqual(sortExpenses(rows, 'date', 'asc').map((r) => r.id), ['c', 'a', 'b'])
})

test('amount sort is global across days and flips with direction', () => {
  const rows = [e('a', '2027-02-28', 6000), e('b', '2027-03-28', 16000), e('c', '2027-01-30', 75000)]

  assert.deepEqual(sortExpenses(rows, 'amount', 'desc').map((r) => r.id), ['c', 'b', 'a'])
  assert.deepEqual(sortExpenses(rows, 'amount', 'asc').map((r) => r.id), ['a', 'b', 'c'])
})

test('equal amounts fall back to the more recent day first', () => {
  const rows = [e('old', '2027-01-30', 45000), e('new', '2027-03-28', 45000)]

  assert.deepEqual(sortExpenses(rows, 'amount', 'desc').map((r) => r.id), ['new', 'old'])
  assert.deepEqual(sortExpenses(rows, 'amount', 'asc').map((r) => r.id), ['new', 'old'])
})

test('sortExpenses does not mutate its input', () => {
  const rows = [e('a', '2027-01-30', 100), e('b', '2027-03-28', 200)]
  sortExpenses(rows, 'amount', 'desc')

  assert.deepEqual(rows.map((r) => r.id), ['a', 'b'])
})

// ---- expenseDayLabel --------------------------------------------------------

test('a row-level day label carries the year only when it is not the current one', () => {
  assert.equal(expenseDayLabel('2027-03-28', 2027), '03/28')
  assert.equal(expenseDayLabel('2026-12-30', 2027), '2026/12/30')
})

// ---- groupByDay -------------------------------------------------------------

test('day groups follow the sort direction and carry count plus total', () => {
  const rows = [
    e('a', '2027-03-28', 75000), e('b', '2027-03-28', 45000),
    e('c', '2027-02-14', 8400),
  ]

  const desc = groupByDay(rows, 'desc', 2027)
  assert.deepEqual(desc.map((g) => g.key), ['2027-03-28', '2027-02-14'])
  assert.equal(desc[0].count, 2)
  assert.equal(desc[0].total, 120000)

  assert.deepEqual(groupByDay(rows, 'asc', 2027).map((g) => g.key), ['2027-02-14', '2027-03-28'])
})

test('rows inside a day always read biggest amount first, whatever the direction', () => {
  const rows = [e('small', '2027-03-28', 6000), e('big', '2027-03-28', 75000)]

  assert.deepEqual(groupByDay(rows, 'desc', 2027)[0].rows.map((r) => r.id), ['big', 'small'])
  assert.deepEqual(groupByDay(rows, 'asc', 2027)[0].rows.map((r) => r.id), ['big', 'small'])
})

test('a subtotal is withheld from single-row days and shown from two rows up', () => {
  const rows = [
    e('a', '2027-03-28', 75000), e('b', '2027-03-28', 45000),
    e('lonely', '2027-02-14', 8400),
  ]

  const [busy, lonely] = groupByDay(rows, 'desc', 2027)
  assert.equal(busy.showTotal, true)
  assert.equal(lonely.showTotal, false)
})

test('the year is omitted while it repeats and comes back when it changes', () => {
  const rows = [
    e('a', '2027-03-28', 100), e('b', '2027-02-14', 100), e('c', '2026-12-30', 100),
  ]

  assert.deepEqual(groupByDay(rows, 'desc', 2027).map((g) => g.label), ['03/28', '02/14', '2026/12/30'])
})

test('the first group states its year when it is not the current one', () => {
  const rows = [e('a', '2026-12-30', 100), e('b', '2026-11-02', 100)]

  assert.deepEqual(groupByDay(rows, 'desc', 2027).map((g) => g.label), ['2026/12/30', '11/02'])
})

test('a day at or over the alert threshold is flagged, below it is not', () => {
  const rows = [
    e('a', '2027-03-28', 75000), e('b', '2027-03-28', 25000),
    e('c', '2027-02-14', 99999.99),
  ]

  const [over, under] = groupByDay(rows, 'desc', 2027)
  assert.equal(over.total, DAILY_ALERT_THRESHOLD)
  assert.equal(over.overThreshold, true)
  assert.equal(under.overThreshold, false)
})

test('a single row that alone clears the threshold still flags its day', () => {
  const rows = [e('whale', '2026-12-30', 120000)]

  const [group] = groupByDay(rows, 'desc', 2026)
  assert.equal(group.showTotal, false, 'subtotal stays hidden for a lone row')
  assert.equal(group.overThreshold, true, 'but the day is still over the line')
})

test('string amounts from the database are summed as numbers, not concatenated', () => {
  const rows = [
    { id: 'a', expense_date: '2027-03-28', total_price: '75000.00', created_at: null },
    { id: 'b', expense_date: '2027-03-28', total_price: '45000.00', created_at: null },
  ]

  assert.equal(groupByDay(rows, 'desc', 2027)[0].total, 120000)
})

// ---- groupByBuyer -----------------------------------------------------------

test('buyer groups rank by subtotal when sorting by amount', () => {
  const rows = [
    e('a', '2027-03-28', 75000, 'with-new'), e('b', '2027-02-28', 45000, 'with-new'),
    e('c', '2027-03-15', 32000, 'Ayaka'),
  ]

  assert.deepEqual(groupByBuyer(rows, 'amount', 'desc', 2027).map((g) => g.label), ['with-new', 'Ayaka'])
  assert.deepEqual(groupByBuyer(rows, 'amount', 'asc', 2027).map((g) => g.label), ['Ayaka', 'with-new'])
})

test('buyer groups rank by their most recent expense when sorting by date', () => {
  const rows = [
    e('a', '2027-01-30', 75000, 'with-new'),
    e('b', '2027-03-15', 8400, 'Ayaka'),
  ]

  assert.deepEqual(groupByBuyer(rows, 'date', 'desc', 2027).map((g) => g.label), ['Ayaka', 'with-new'])
  assert.deepEqual(groupByBuyer(rows, 'date', 'asc', 2027).map((g) => g.label), ['with-new', 'Ayaka'])
})

test('rows with no buyer land in one trailing group instead of disappearing', () => {
  const rows = [
    e('a', '2027-03-28', 75000, 'with-new'),
    e('orphan', '2027-01-30', 12000, null),
    e('blank', '2027-01-30', 500, '   '),
  ]

  const groups = groupByBuyer(rows, 'amount', 'desc', 2027)
  assert.equal(groups.length, 2)
  const last = groups[groups.length - 1]
  assert.equal(last.unassigned, true)
  assert.deepEqual(last.rows.map((r) => r.id), ['orphan', 'blank'])
  assert.equal(
    groups.flatMap((g) => g.rows).length, rows.length,
    'every row survives grouping',
  )
})

test('the unassigned group stays last in both directions', () => {
  const rows = [e('a', '2027-03-28', 1, 'with-new'), e('orphan', '2027-01-30', 999999, null)]

  for (const dir of ['asc', 'desc'] as const) {
    const groups = groupByBuyer(rows, 'amount', dir, 2027)
    assert.equal(groups[groups.length - 1].unassigned, true, `dir=${dir}`)
  }
})

test('buyers with no rows cannot appear, because groups are built from the rows', () => {
  const groups = groupByBuyer([e('a', '2027-03-28', 100, 'with-new')], 'amount', 'desc', 2027)

  assert.deepEqual(groups.map((g) => g.label), ['with-new'])
})

test('rows inside a buyer group follow the active sort', () => {
  const rows = [
    e('small', '2027-01-30', 6000, 'with-new'),
    e('big', '2027-03-28', 75000, 'with-new'),
  ]

  assert.deepEqual(
    groupByBuyer(rows, 'amount', 'asc', 2027)[0].rows.map((r) => r.id), ['small', 'big'])
  assert.deepEqual(
    groupByBuyer(rows, 'date', 'desc', 2027)[0].rows.map((r) => r.id), ['big', 'small'])
})

test('buyer groups label each row with its own day, year-qualified when needed', () => {
  const rows = [
    e('a', '2027-03-28', 100, 'with-new'),
    e('b', '2026-12-30', 100, 'with-new'),
  ]

  assert.deepEqual(groupByBuyer(rows, 'date', 'desc', 2027)[0].rows.map((r) => r.dayLabel),
    ['03/28', '2026/12/30'])
})

test('buyer groups never claim a subtotal is over the daily line', () => {
  const rows = [
    e('a', '2027-03-28', 75000, 'with-new'), e('b', '2027-02-28', 75000, 'with-new'),
  ]

  const [group] = groupByBuyer(rows, 'amount', 'desc', 2027)
  assert.equal(group.total, 150000)
  assert.equal(group.overThreshold, false, 'the threshold is a per-day measure, not a per-person one')
})
