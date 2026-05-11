import assert from 'node:assert/strict'
import test from 'node:test'
import { INTENT_APPLIED_EVENT, notifyIntentApplied } from './events.ts'

test('notifyIntentApplied dispatches the intent applied event', () => {
  const events: string[] = []
  const target = {
    dispatchEvent(event: Event) {
      events.push(event.type)
      return true
    },
  }

  const dispatched = notifyIntentApplied(target)

  assert.equal(dispatched, true)
  assert.deepEqual(events, [INTENT_APPLIED_EVENT])
})

test('notifyIntentApplied is a no-op without a browser target', () => {
  assert.equal(notifyIntentApplied(undefined), false)
})
