import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POLL_INTERVAL_MS,
  POLL_BACKOFF_MAX_MS,
  nextPollDelay,
} from './poll.ts'

test('nextPollDelay returns base interval when there are no failures', () => {
  assert.equal(nextPollDelay(0), POLL_INTERVAL_MS)
})

test('nextPollDelay doubles per consecutive failure', () => {
  assert.equal(nextPollDelay(1), 60_000)
  assert.equal(nextPollDelay(2), 120_000)
  assert.equal(nextPollDelay(3), 240_000)
})

test('nextPollDelay caps at POLL_BACKOFF_MAX_MS', () => {
  assert.equal(nextPollDelay(4), POLL_BACKOFF_MAX_MS)
  assert.equal(nextPollDelay(10), POLL_BACKOFF_MAX_MS)
  assert.equal(nextPollDelay(1000), POLL_BACKOFF_MAX_MS)
})

test('nextPollDelay treats negative counts as zero', () => {
  assert.equal(nextPollDelay(-1), POLL_INTERVAL_MS)
})
