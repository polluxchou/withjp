import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canDeleteView,
  canEditView,
  canTogglePublic,
  canViewView,
  httpStatusForViewError,
} from './views-permissions.ts'

const admin    = { id: 'admin-1',  is_admin: true  }
const alice    = { id: 'alice-1',  is_admin: false }
const bob      = { id: 'bob-1',    is_admin: false }

const alicePrivate = { owner_id: alice.id, is_public: false }
const alicePublic  = { owner_id: alice.id, is_public: true  }
const legacyPublic = { owner_id: null,     is_public: true  }
const orphanedHidden = { owner_id: null,   is_public: false }

test('canViewView: owner sees own private view', () => {
  assert.equal(canViewView(alice, alicePrivate), true)
  assert.equal(canViewView(bob,   alicePrivate), false)
})

test('canViewView: everyone sees public views', () => {
  assert.equal(canViewView(bob,   alicePublic),  true)
  assert.equal(canViewView(bob,   legacyPublic), true)
})

test('canViewView: admin sees everything including non-public non-owned', () => {
  assert.equal(canViewView(admin, alicePrivate),    true)
  assert.equal(canViewView(admin, orphanedHidden),  true)
  // Non-admin cannot see another user's private view, even if no other owner.
  assert.equal(canViewView(bob, orphanedHidden), false)
})

test('canEditView: only owner and admin', () => {
  assert.equal(canEditView(alice, alicePrivate), true)
  assert.equal(canEditView(bob,   alicePrivate), false)
  assert.equal(canEditView(admin, alicePrivate), true)
  // Legacy view (null owner) editable only by admin.
  assert.equal(canEditView(alice, legacyPublic), false)
  assert.equal(canEditView(admin, legacyPublic), true)
})

test('canTogglePublic: admin only', () => {
  assert.equal(canTogglePublic(admin), true)
  assert.equal(canTogglePublic(alice), false)
})

test('canDeleteView: owner and admin', () => {
  assert.equal(canDeleteView(alice, alicePrivate), true)
  assert.equal(canDeleteView(bob,   alicePrivate), false)
  assert.equal(canDeleteView(admin, alicePrivate), true)
})

test('httpStatusForViewError maps codes correctly', () => {
  assert.equal(httpStatusForViewError('invalid_input'),  400)
  assert.equal(httpStatusForViewError('quota_exceeded'), 400)
  assert.equal(httpStatusForViewError('forbidden'),      403)
  assert.equal(httpStatusForViewError('not_found'),      404)
  assert.equal(httpStatusForViewError('db_error'),       500)
})
