import test from 'node:test'
import assert from 'node:assert/strict'

import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from './service.ts'

type Call = { method: string; args: unknown[] }

class FakeQuery {
  calls: Call[] = []
  private result: unknown

  constructor(result: unknown) {
    this.result = result
  }

  select(...args: unknown[]) {
    this.calls.push({ method: 'select', args })
    return this
  }

  eq(...args: unknown[]) {
    this.calls.push({ method: 'eq', args })
    return this
  }

  is(...args: unknown[]) {
    this.calls.push({ method: 'is', args })
    return this
  }

  order(...args: unknown[]) {
    this.calls.push({ method: 'order', args })
    return this
  }

  limit(...args: unknown[]) {
    this.calls.push({ method: 'limit', args })
    return this
  }

  update(...args: unknown[]) {
    this.calls.push({ method: 'update', args })
    return this
  }

  single() {
    this.calls.push({ method: 'single', args: [] })
    return this
  }

  maybeSingle() {
    this.calls.push({ method: 'maybeSingle', args: [] })
    return this
  }

  then(resolve: (value: unknown) => void) {
    resolve(this.result)
  }
}

class FakeDb {
  queries: Array<{ table: string; query: FakeQuery }> = []
  private results: unknown[]

  constructor(results: unknown[]) {
    this.results = results
  }

  from(table: string) {
    const query = new FakeQuery(this.results.shift())
    this.queries.push({ table, query })
    return query
  }
}

test('listNotificationsForUser filters list and unread count by user id', async () => {
  const db = new FakeDb([
    { data: [{ id: 'notification-1' }], error: null },
    { count: 7, error: null },
  ])

  const result = await listNotificationsForUser('user-1', db)

  assert.deepEqual(result, {
    data: { notifications: [{ id: 'notification-1' }], unread_count: 7 },
    error: null,
  })
  assert.equal(db.queries.length, 2)
  assert.equal(db.queries[0].table, 'notifications')
  assert.deepEqual(
    db.queries[0].query.calls.filter((call) => call.method === 'eq'),
    [{ method: 'eq', args: ['user_id', 'user-1'] }],
  )
  assert.deepEqual(
    db.queries[1].query.calls.filter((call) => call.method === 'eq'),
    [{ method: 'eq', args: ['user_id', 'user-1'] }],
  )
  assert.deepEqual(
    db.queries[1].query.calls.filter((call) => call.method === 'is'),
    [{ method: 'is', args: ['read_at', null] }],
  )
})

test('markNotificationRead scopes both lookup and update to the current user', async () => {
  const db = new FakeDb([
    { data: { id: 'notification-1', read_at: null }, error: null },
    { data: { id: 'notification-1', read_at: '2026-05-20T12:00:00.000Z' }, error: null },
  ])

  const result = await markNotificationRead(
    'notification-1',
    'user-1',
    db,
    () => '2026-05-20T12:00:00.000Z',
  )

  assert.deepEqual(result, {
    data: { id: 'notification-1', read_at: '2026-05-20T12:00:00.000Z' },
    error: null,
  })
  assert.deepEqual(
    db.queries[0].query.calls.filter((call) => call.method === 'eq'),
    [
      { method: 'eq', args: ['id', 'notification-1'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
    ],
  )
  assert.deepEqual(
    db.queries[1].query.calls.filter((call) => call.method === 'eq'),
    [
      { method: 'eq', args: ['id', 'notification-1'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
    ],
  )
})

test('markNotificationRead returns already-read notifications without updating', async () => {
  const db = new FakeDb([
    { data: { id: 'notification-1', read_at: '2026-05-20T11:00:00.000Z' }, error: null },
  ])

  const result = await markNotificationRead('notification-1', 'user-1', db)

  assert.deepEqual(result, {
    data: { id: 'notification-1', read_at: '2026-05-20T11:00:00.000Z' },
    error: null,
  })
  assert.equal(db.queries.length, 1)
})

test('markAllNotificationsRead updates only unread notifications for the current user', async () => {
  const db = new FakeDb([
    { data: [{ id: 'notification-1' }, { id: 'notification-2' }], error: null },
  ])

  const result = await markAllNotificationsRead(
    'user-1',
    db,
    () => '2026-05-20T12:00:00.000Z',
  )

  assert.deepEqual(result, {
    data: { updated_count: 2 },
    error: null,
  })
  assert.deepEqual(
    db.queries[0].query.calls.filter((call) => call.method === 'update'),
    [{ method: 'update', args: [{ read_at: '2026-05-20T12:00:00.000Z' }] }],
  )
  assert.deepEqual(
    db.queries[0].query.calls.filter((call) => call.method === 'eq'),
    [{ method: 'eq', args: ['user_id', 'user-1'] }],
  )
  assert.deepEqual(
    db.queries[0].query.calls.filter((call) => call.method === 'is'),
    [{ method: 'is', args: ['read_at', null] }],
  )
})
