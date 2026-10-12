import test from 'node:test'
import assert from 'node:assert/strict'

import { createServerClient } from './server.ts'

// Outside a browser, auth-js starts a 30s refresh setInterval when the client
// initializes unless autoRefreshToken is false. Nothing ever clears it, and
// its closure pins the whole client, so every createServerClient() call would
// leak one timer + one client for the life of the process.
test('createServerClient does not start the auth auto-refresh ticker', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

  const intervals: ReturnType<typeof setInterval>[] = []
  const originalSetInterval = globalThis.setInterval
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const handle = originalSetInterval(...args)
    intervals.push(handle)
    return handle
  }) as typeof setInterval

  const client = createServerClient()
  try {
    await client.auth.initialize()
    // The ticker is armed a few microtasks after initialize() settles.
    await new Promise((resolve) => setTimeout(resolve, 10))
  } finally {
    globalThis.setInterval = originalSetInterval
    await client.auth.stopAutoRefresh()
  }

  assert.equal(intervals.length, 0)
})
