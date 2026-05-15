import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSubject } from './subject.ts'

test('record subjects produce entityId and no hash', () => {
  const out = normalizeSubject({
    subjectType: 'record',
    serviceKey: 'expenses',
    entityType: 'expense',
    entityId: 'a1b2',
    label: 'Expense 2026-05-01',
    route: '/expenses/a1b2',
  })
  assert.equal(out.entityId, 'a1b2')
  assert.equal(out.subjectHash, null)
  assert.equal(out.subjectPayload.label, 'Expense 2026-05-01')
  assert.equal(out.subjectPayload.route, '/expenses/a1b2')
  assert.equal(out.subjectPayload.filters, undefined)
})

test('saved_view behaves like record', () => {
  const out = normalizeSubject({
    subjectType: 'saved_view',
    serviceKey: 'expenses',
    entityType: 'expense_saved_view',
    entityId: 'view-1',
    label: 'My View',
    route: '/expenses?view=view-1',
  })
  assert.equal(out.entityId, 'view-1')
  assert.equal(out.subjectHash, null)
  assert.equal(out.subjectPayload.filters, undefined)
})

test('filter subjects produce stable hash regardless of key order', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid', date_from: '2026-05-01', category: 'travel' },
    label: '已付差旅',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { category: 'travel', payment_status: 'paid', date_from: '2026-05-01' },
    label: '已付差旅',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
  assert.equal(a.entityId, null)
  assert.ok(a.subjectHash && a.subjectHash.length === 64)
})

test('filter normalization drops nulls, undefined, empty strings, empty arrays', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: {
      payment_status: 'paid',
      category: null,
      payment_method: undefined,
      user_name: '',
      buyer_name: '',
    },
    label: '已付',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid' },
    label: '已付',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
})

test('filter normalization drops non-whitelist keys (q / random)', () => {
  // q (search text) is intentionally excluded so different search terms
  // do not fragment the discussion subject.
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid', q: 'lunch', __injected: 'evil' },
    label: '已付',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid' },
    label: '已付',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
  assert.deepEqual(a.subjectPayload.filters, { payment_status: 'paid' })
})

test('filter string values are trimmed before hashing', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: '  paid  ' },
    label: '已付',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid' },
    label: '已付',
    route: '/expenses',
  })
  assert.equal(a.subjectHash, b.subjectHash)
})

test('different filter values produce different hashes', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid' },
    label: '已付',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'ordered_unpaid' },
    label: '未付',
    route: '/expenses',
  })
  assert.notEqual(a.subjectHash, b.subjectHash)
})

test('empty filter object still produces a (stable) hash', () => {
  const a = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: {},
    label: '全部',
    route: '/expenses',
  })
  const b = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { __discarded: 'x' },
    label: '全部',
    route: '/expenses',
  })
  assert.ok(a.subjectHash)
  assert.equal(a.subjectHash, b.subjectHash)
})

test('unknown entityType yields no allowed keys (everything stripped)', () => {
  const out = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'mystery',
    filters: { payment_status: 'paid', anything: 1 },
    label: '?',
    route: '/?',
  })
  assert.deepEqual(out.subjectPayload.filters, {})
})

test('subject_payload carries filters back so server can echo them', () => {
  const out = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { payment_status: 'paid', date_from: '2026-05-01' },
    label: '已付',
    route: '/expenses',
  })
  assert.deepEqual(out.subjectPayload.filters, {
    payment_status: 'paid',
    date_from: '2026-05-01',
  })
})

test('yes-flag fields (unpaid_only / cross_border_only) survive normalization', () => {
  const out = normalizeSubject({
    subjectType: 'filter',
    serviceKey: 'expenses',
    entityType: 'expense',
    filters: { unpaid_only: 'yes', cross_border_only: 'yes' },
    label: '未付 跨境',
    route: '/expenses',
  })
  assert.deepEqual(out.subjectPayload.filters, {
    unpaid_only: 'yes',
    cross_border_only: 'yes',
  })
})
