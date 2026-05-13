import assert from 'node:assert/strict'
import test from 'node:test'

import { createLatestSaveQueue } from './save-queue.ts'

test('createLatestSaveQueue waits for the active save and then persists only the newest queued snapshot', async () => {
  const calls: string[] = []
  const pending: { resolve: () => void }[] = []
  const queue = createLatestSaveQueue<string>(async (snapshot) => {
    calls.push(snapshot)
    await new Promise<void>((resolve) => {
      pending.push({ resolve })
    })
  })

  queue.enqueue('before-delete')
  assert.deepEqual(calls, ['before-delete'])
  assert.equal(queue.isSaving(), true)

  queue.enqueue('intermediate-edit')
  queue.enqueue('after-delete')
  await flushMicrotasks()

  assert.deepEqual(calls, ['before-delete'])

  pending[0].resolve()
  await flushMicrotasks()

  assert.deepEqual(calls, ['before-delete', 'after-delete'])

  pending[1].resolve()
  await flushMicrotasks()

  assert.equal(queue.isSaving(), false)
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}
