import assert from 'node:assert/strict'
import test from 'node:test'

import { createCountQueue, subjectKey, type SubjectCount } from './count-queue.ts'
import type { SubjectInput } from './types.ts'

function record(entityId: string): SubjectInput {
  return {
    subjectType: 'record',
    serviceKey:  'expenses',
    entityType:  'expense',
    entityId,
    label:       entityId,
    route:       '/expenses',
  }
}

interface Settled {
  keys:   string[]
  counts: Array<[string, SubjectCount]>
}

/**
 * Drives the queue with an injected fetcher and records everything the
 * React layer would have turned into state updates.
 */
function harness(options: {
  fetcher?: (keys: string[]) => Promise<Array<{ key: string; openCount: number; resolvedCount: number }>>
  maxBatchSize?: number
} = {}) {
  const batches: string[][] = []
  const loading: string[] = []
  const settled: Settled[] = []

  const queue = createCountQueue({
    debounceMs:   0,
    maxBatchSize: options.maxBatchSize,
    fetcher: async (subjects) => {
      const keys = subjects.map(s => s.key)
      batches.push(keys)
      if (options.fetcher) return options.fetcher(keys)
      return keys.map(key => ({ key, openCount: 2, resolvedCount: 0 }))
    },
    onLoading: key => { loading.push(key) },
    onSettled: (keys, counts) => { settled.push({ keys, counts: Array.from(counts.entries()) }) },
  })

  return { queue, batches, loading, settled }
}

// The fetch chain is debounce timer → await fetcher → await per-chunk state
// updates, so a single microtask flush is not enough.
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

test('subjects enqueued in the same tick go out as one batch', async () => {
  const h = harness()

  h.queue.enqueue(record('e1'))
  h.queue.enqueue(record('e2'))
  await settle()

  assert.deepEqual(h.batches, [[
    'record:expenses:expense:e1',
    'record:expenses:expense:e2',
  ]])
  assert.deepEqual(h.settled, [{
    keys: ['record:expenses:expense:e1', 'record:expenses:expense:e2'],
    counts: [
      ['record:expenses:expense:e1', { openCount: 2, resolvedCount: 0 }],
      ['record:expenses:expense:e2', { openCount: 2, resolvedCount: 0 }],
    ],
  }])
})

test('the same subject enqueued twice is fetched once', async () => {
  const h = harness()

  h.queue.enqueue(record('e1'))
  h.queue.enqueue(record('e1'))
  await settle()

  assert.deepEqual(h.batches, [['record:expenses:expense:e1']])
  assert.deepEqual(h.loading, ['record:expenses:expense:e1'])
})

// REGRESSION: React StrictMode (i.e. `next dev`) mounts, unmounts, then
// remounts. The first mount enqueues and schedules the flush; the unmount
// cleanup cancels the timer; the second mount re-enqueues the very same
// subject. If a re-enqueue of an already-queued key does not reschedule,
// the flush never runs and every badge stays in its loading state forever.
test('a re-enqueued subject reschedules a cancelled flush (StrictMode double-mount)', async () => {
  const h = harness()

  h.queue.enqueue(record('e1'))
  h.queue.cancel()
  h.queue.enqueue(record('e1'))
  await settle()

  assert.deepEqual(h.batches, [['record:expenses:expense:e1']])
  assert.deepEqual(h.settled, [{
    keys: ['record:expenses:expense:e1'],
    counts: [['record:expenses:expense:e1', { openCount: 2, resolvedCount: 0 }]],
  }])
})

test('cancel with no re-enqueue fetches nothing', async () => {
  const h = harness()

  h.queue.enqueue(record('e1'))
  h.queue.cancel()
  await settle()

  assert.deepEqual(h.batches, [])
  assert.deepEqual(h.settled, [])
})

test('invalidate re-queues a subject and reschedules', async () => {
  const h = harness()

  h.queue.enqueue(record('e1'))
  await settle()
  assert.equal(h.batches.length, 1)

  h.queue.invalidate(record('e1'))
  await settle()

  assert.deepEqual(h.batches, [
    ['record:expenses:expense:e1'],
    ['record:expenses:expense:e1'],
  ])
})

test('a queue longer than maxBatchSize is chunked', async () => {
  const h = harness({ maxBatchSize: 2 })

  for (const id of ['e1', 'e2', 'e3']) h.queue.enqueue(record(id))
  await settle()

  assert.deepEqual(h.batches, [
    ['record:expenses:expense:e1', 'record:expenses:expense:e2'],
    ['record:expenses:expense:e3'],
  ])
  assert.deepEqual(h.settled.map(s => s.keys), [
    ['record:expenses:expense:e1', 'record:expenses:expense:e2'],
    ['record:expenses:expense:e3'],
  ])
})

test('a failed fetch still settles its keys so the badge leaves loading', async () => {
  const h = harness({ fetcher: async () => { throw new Error('resolve-counts failed: 500') } })

  h.queue.enqueue(record('e1'))
  await settle()

  assert.deepEqual(h.settled, [{ keys: ['record:expenses:expense:e1'], counts: [] }])
})

test('keys the server omits are settled without a count', async () => {
  const h = harness({
    fetcher: async keys => keys
      .filter(key => key.endsWith('e1'))
      .map(key => ({ key, openCount: 1, resolvedCount: 3 })),
  })

  h.queue.enqueue(record('e1'))
  h.queue.enqueue(record('e2'))
  await settle()

  assert.deepEqual(h.settled, [{
    keys: ['record:expenses:expense:e1', 'record:expenses:expense:e2'],
    counts: [['record:expenses:expense:e1', { openCount: 1, resolvedCount: 3 }]],
  }])
})

test('subjectKey is stable across filter key order', () => {
  const base = { subjectType: 'filter', serviceKey: 'expenses', entityType: 'expense', label: 'x', route: '/expenses' } as const

  assert.equal(
    subjectKey({ ...base, filters: { category: 'travel', period: '2026-09' } }),
    subjectKey({ ...base, filters: { period: '2026-09', category: 'travel' } }),
  )
  assert.notEqual(
    subjectKey(record('e1')),
    subjectKey(record('e2')),
  )
})
