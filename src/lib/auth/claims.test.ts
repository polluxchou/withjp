import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { authedUserFromClaims } from './claims.ts'

const CLAIMS = {
  iss: 'https://example.supabase.co/auth/v1',
  sub: '7c1f0a52-0000-4000-8000-000000000001',
  aud: 'authenticated',
  exp: 1_700_003_600,
  iat: 1_700_000_000,
  role: 'authenticated',
  aal: 'aal1' as const,
  session_id: 'b6e0c9d4-0000-4000-8000-000000000002',
  email: 'member@example.com',
  user_metadata: { name: 'Member' },
  app_metadata: { provider: 'email' },
  is_anonymous: false,
}

test('maps sub/email/user_metadata to the fields authGuard callers read', () => {
  assert.deepEqual(authedUserFromClaims(CLAIMS), {
    id: CLAIMS.sub,
    email: 'member@example.com',
    user_metadata: { name: 'Member' },
  })
})

test('a token without email/user_metadata still authenticates by sub alone', () => {
  const { email: _e, user_metadata: _m, ...bare } = CLAIMS
  assert.deepEqual(authedUserFromClaims(bare), { id: CLAIMS.sub, email: undefined, user_metadata: undefined })
})

test('no claims (no session / verification failed) is unauthenticated', () => {
  assert.equal(authedUserFromClaims(null), null)
  assert.equal(authedUserFromClaims(undefined), null)
})

test('claims without a subject are unauthenticated', () => {
  assert.equal(authedUserFromClaims({ ...CLAIMS, sub: '' }), null)
})

// 性能收益只来自「热路径不再调 getUser()」，单测测不到延迟，用接线断言兜住回退。
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('authGuard verifies via getClaims(), not a per-request getUser() round-trip', () => {
  const src = read('./guard.ts')
  assert.match(src, /auth\.getClaims\(\)/)
  assert.doesNotMatch(src, /auth\.getUser\(/)
  assert.match(src, /authedUserFromClaims\(/)
})

test('middleware session check verifies via getClaims(), not getUser()', () => {
  const src = read('../supabase/middleware.ts')
  assert.match(src, /auth\.getClaims\(\)/)
  assert.doesNotMatch(src, /auth\.getUser\(/)
})
