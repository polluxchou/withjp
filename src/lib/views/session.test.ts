import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SESSION_GAP_MS,
  applyPing,
  shouldStartNewSession,
  startSession,
  extendSession,
} from './session.ts'

const USER = '00000000-0000-0000-0000-000000000001'
const CREATOR_A = 'creator-a'
const CREATOR_B = 'creator-b'

function ping(overrides: Partial<Parameters<typeof applyPing>[1]> = {}) {
  return {
    user_id:     USER,
    entity_type: 'creator' as const,
    entity_id:   CREATOR_A,
    route:       '/creators/' + CREATOR_A,
    at:          new Date('2026-05-01T10:00:00Z'),
    ...overrides,
  }
}

// ── shouldStartNewSession ─────────────────────────────────────

test('shouldStartNewSession returns true when no open session', () => {
  assert.equal(shouldStartNewSession(null, new Date()), true)
})

test('shouldStartNewSession returns false within 30-minute window', () => {
  const open = startSession(ping())
  const next = new Date(new Date(open.ended_at).getTime() + SESSION_GAP_MS - 1)
  assert.equal(shouldStartNewSession(open, next), false)
})

test('shouldStartNewSession returns true past 30-minute gap', () => {
  const open = startSession(ping())
  const next = new Date(new Date(open.ended_at).getTime() + SESSION_GAP_MS + 1)
  assert.equal(shouldStartNewSession(open, next), true)
})

// ── startSession ───────────────────────────────────────────────

test('startSession initializes views with single entity counted once', () => {
  const s = startSession(ping())
  assert.deepEqual(s.views, { creator: { [CREATOR_A]: 1 } })
  assert.deepEqual(s.routes, ['/creators/' + CREATOR_A])
  assert.equal(s.started_at, s.ended_at)
})

test('startSession handles ping without entity (route-only view)', () => {
  const s = startSession(ping({ entity_type: null, entity_id: null }))
  assert.deepEqual(s.views, {})
  assert.equal(s.routes.length, 1)
})

// ── extendSession ──────────────────────────────────────────────

test('extendSession increments counter for repeated entity view', () => {
  const s1 = startSession(ping())
  const s2 = extendSession(s1, ping({ at: new Date('2026-05-01T10:05:00Z') }))
  assert.equal(s2.views.creator![CREATOR_A], 2)
})

test('extendSession adds new entity bucket without disturbing existing', () => {
  const s1 = startSession(ping())
  const s2 = extendSession(s1, ping({
    entity_id: CREATOR_B,
    route: '/creators/' + CREATOR_B,
    at: new Date('2026-05-01T10:05:00Z'),
  }))
  assert.equal(s2.views.creator![CREATOR_A], 1)
  assert.equal(s2.views.creator![CREATOR_B], 1)
})

test('extendSession deduplicates routes', () => {
  const s1 = startSession(ping())
  const s2 = extendSession(s1, ping({ at: new Date('2026-05-01T10:05:00Z') }))
  assert.equal(s2.routes.length, 1)
})

test('extendSession appends new route', () => {
  const s1 = startSession(ping())
  const s2 = extendSession(s1, ping({
    route: '/timeline',
    at: new Date('2026-05-01T10:05:00Z'),
  }))
  assert.deepEqual(s2.routes, ['/creators/' + CREATOR_A, '/timeline'])
})

test('extendSession bumps ended_at to ping time', () => {
  const s1 = startSession(ping())
  const later = new Date('2026-05-01T10:15:00Z')
  const s2 = extendSession(s1, ping({ at: later }))
  assert.equal(s2.ended_at, later.toISOString())
  assert.equal(s2.started_at, s1.started_at)
})

test('extendSession does not mutate original views object', () => {
  const s1 = startSession(ping())
  const s1ViewsRef = s1.views
  const s1CreatorRef = s1.views.creator
  extendSession(s1, ping({ at: new Date('2026-05-01T10:05:00Z') }))
  assert.equal(s1ViewsRef, s1.views)
  assert.equal(s1CreatorRef, s1.views.creator)
  assert.equal(s1.views.creator![CREATOR_A], 1)
})

// ── applyPing (high-level) ─────────────────────────────────────

test('applyPing returns isNew=true when no open session', () => {
  const r = applyPing(null, ping())
  assert.equal(r.isNew, true)
  assert.equal(r.session.views.creator![CREATOR_A], 1)
})

test('applyPing returns isNew=false when extending', () => {
  const open = startSession(ping())
  const r = applyPing(open, ping({ at: new Date('2026-05-01T10:10:00Z') }))
  assert.equal(r.isNew, false)
  assert.equal(r.session.views.creator![CREATOR_A], 2)
})

test('applyPing starts new session past 30-minute gap', () => {
  const open = startSession(ping())
  const past = new Date(new Date(open.ended_at).getTime() + SESSION_GAP_MS + 1000)
  const r = applyPing(open, ping({ at: past }))
  assert.equal(r.isNew, true)
  assert.equal(r.session.views.creator![CREATOR_A], 1)
})
