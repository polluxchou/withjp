import test from 'node:test'
import assert from 'node:assert/strict'

import { formatSupabaseError } from './errors.ts'

test('formatSupabaseError turns missing-table schema cache errors into setup guidance', () => {
  const formatted = formatSupabaseError(
    "Could not find the table 'public.creators' in the schema cache"
  )

  assert.match(formatted, /public\.creators/)
  assert.match(formatted, /001/)
  assert.match(formatted, /seed/)
  assert.match(formatted, /migrations/)
})

test('formatSupabaseError leaves unrelated errors unchanged', () => {
  const message = 'duplicate key value violates unique constraint "config_key_key"'

  assert.equal(formatSupabaseError(message), message)
})
