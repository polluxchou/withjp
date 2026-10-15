import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { authedUserFromClaims, authedUserFromUser } from './claims.ts'

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

// guard.ts 里两个守卫各自的函数体（authGuard 在前，authGuardStrict 在后）。
const guardBodies = () => {
  const src = read('./guard.ts')
  const fastAt = src.indexOf('export async function authGuard(')
  const strictAt = src.indexOf('export async function authGuardStrict(')
  assert.ok(fastAt >= 0 && strictAt > fastAt, 'guard.ts 应先定义 authGuard 再定义 authGuardStrict')
  return { fast: src.slice(fastAt, strictAt), strict: src.slice(strictAt) }
}

test('authGuard verifies via getClaims(), not a per-request getUser() round-trip', () => {
  const { fast } = guardBodies()
  assert.match(fast, /auth\.getClaims\(\)/)
  assert.doesNotMatch(fast, /auth\.getUser\(/)
  assert.match(fast, /authedUserFromClaims\(/)
})

test('authGuardStrict keeps the per-request getUser() revocation check', () => {
  const { strict } = guardBodies()
  assert.match(strict, /auth\.getUser\(\)/)
  assert.doesNotMatch(strict, /auth\.getClaims\(/)
  assert.match(strict, /authedUserFromUser\(/)
})

test('authedUserFromUser maps a getUser() user to the same narrowed shape', () => {
  const user = {
    id: CLAIMS.sub,
    email: 'member@example.com',
    user_metadata: { name: 'Member' },
    app_metadata: { provider: 'email' },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  }
  assert.deepEqual(authedUserFromUser(user), {
    id: CLAIMS.sub,
    email: 'member@example.com',
    user_metadata: { name: 'Member' },
  })
})

test('authedUserFromUser treats a missing user as unauthenticated', () => {
  assert.equal(authedUserFromUser(null), null)
  assert.equal(authedUserFromUser(undefined), null)
  assert.equal(authedUserFromUser({ id: '', user_metadata: {} }), null)
})

test('middleware session check verifies via getClaims(), not getUser()', () => {
  const src = read('../supabase/middleware.ts')
  assert.match(src, /auth\.getClaims\(\)/)
  assert.doesNotMatch(src, /auth\.getUser\(/)
})
