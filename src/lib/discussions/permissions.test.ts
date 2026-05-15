import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canReadThread,
  canResolveThread,
  evaluateReadThread,
  type Actor,
  type SavedViewLike,
} from './permissions.ts'
import type { Thread } from './types.ts'

const ADMIN: Actor = { id: 'admin-1', is_admin: true }
const ALICE: Actor = { id: 'alice', is_admin: false }
const BOB:   Actor = { id: 'bob',   is_admin: false }

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't1',
    topicCode: 'EXP-2026-000001',
    serviceKey: 'expenses',
    assignedAgentId: 'agent-1',
    subjectType: 'record',
    entityType: 'expense',
    entityId: 'expense-1',
    subjectHash: null,
    subjectPayload: { label: 'x', route: '/x' },
    title: 't',
    status: 'open',
    createdByUserId: ALICE.id,
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
    ...overrides,
  }
}

// ── canReadThread ────────────────────────────────────────────

test('admin always passes regardless of subject type', () => {
  assert.equal(canReadThread(ADMIN, thread({ subjectType: 'record' })), true)
  assert.equal(canReadThread(ADMIN, thread({ subjectType: 'filter', entityId: null, subjectHash: 'h' })), true)
  assert.equal(canReadThread(ADMIN, thread({ subjectType: 'saved_view', entityType: 'expense_saved_view' })), true)
})

test('non-admin passes record subjects (follows business-table visibility)', () => {
  assert.equal(canReadThread(BOB, thread({ subjectType: 'record', createdByUserId: ALICE.id })), true)
})

test('non-admin passes filter subjects (criteria carry no sensitive info)', () => {
  assert.equal(
    canReadThread(BOB, thread({ subjectType: 'filter', entityId: null, subjectHash: 'h' })),
    true,
  )
})

test('saved_view: expense_saved_view requires the actor to be the owner', () => {
  const owner: SavedViewLike  = { ownerId: ALICE.id, isPublic: false }
  const others: SavedViewLike = { ownerId: BOB.id,   isPublic: false }
  const t = thread({ subjectType: 'saved_view', entityType: 'expense_saved_view' })

  assert.equal(canReadThread(ALICE, t, { savedView: owner }),  true)
  assert.equal(canReadThread(ALICE, t, { savedView: others }), false)
})

test('saved_view: expense_saved_view is_public flag is ignored (no public concept)', () => {
  // Even if a caller spuriously passes isPublic=true, the expense branch
  // does not honor it — those views are strictly private.
  const t = thread({ subjectType: 'saved_view', entityType: 'expense_saved_view' })
  assert.equal(
    canReadThread(ALICE, t, { savedView: { ownerId: BOB.id, isPublic: true } }),
    false,
  )
})

test('saved_view: finance_forecast_view allows owner OR public', () => {
  const t = thread({ subjectType: 'saved_view', entityType: 'finance_forecast_view' })

  // Owner sees own private view.
  assert.equal(canReadThread(ALICE, t, { savedView: { ownerId: ALICE.id, isPublic: false } }), true)
  // Anyone sees public view.
  assert.equal(canReadThread(BOB,   t, { savedView: { ownerId: ALICE.id, isPublic: true  } }), true)
  // Non-owner cannot see a private view.
  assert.equal(canReadThread(BOB,   t, { savedView: { ownerId: ALICE.id, isPublic: false } }), false)
})

test('saved_view: missing savedView opts means access denied (fail closed)', () => {
  const t = thread({ subjectType: 'saved_view', entityType: 'expense_saved_view' })
  const decision = evaluateReadThread(ALICE, t)
  assert.equal(decision.allowed, false)
  assert.equal(decision.reason, 'saved_view_not_loaded')
})

test('saved_view: unknown entity_type denies access (fail closed)', () => {
  const t = thread({ subjectType: 'saved_view', entityType: 'unknown_view_type' })
  const decision = evaluateReadThread(ALICE, t, {
    savedView: { ownerId: ALICE.id, isPublic: true },
  })
  assert.equal(decision.allowed, false)
  assert.equal(decision.reason, 'not_admin_and_unknown_saved_view_entity')
})

test('admin bypasses saved_view checks even without savedView opts', () => {
  const t = thread({ subjectType: 'saved_view', entityType: 'expense_saved_view' })
  assert.equal(canReadThread(ADMIN, t), true)
})

// ── canResolveThread ─────────────────────────────────────────

test('canResolveThread: admin always passes', () => {
  assert.equal(canResolveThread(ADMIN, thread({ createdByUserId: ALICE.id })), true)
})

test('canResolveThread: thread creator passes', () => {
  assert.equal(canResolveThread(ALICE, thread({ createdByUserId: ALICE.id })), true)
})

test('canResolveThread: non-creator non-admin denied', () => {
  assert.equal(canResolveThread(BOB, thread({ createdByUserId: ALICE.id })), false)
})
