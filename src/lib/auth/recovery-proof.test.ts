import test from 'node:test'
import assert from 'node:assert/strict'

import { createRecoveryProof, verifyRecoveryProof } from './recovery-proof.ts'

const SECRET = 'test-secret'
const NOW = 1_700_000_000_000

test('a freshly created proof verifies as valid immediately', () => {
  const proof = createRecoveryProof(SECRET, NOW)
  assert.equal(verifyRecoveryProof(SECRET, proof, NOW), true)
})

test('a proof still verifies just before it expires', () => {
  const proof = createRecoveryProof(SECRET, NOW)
  assert.equal(verifyRecoveryProof(SECRET, proof, NOW + 2 * 60 * 1000 - 1), true)
})

test('a proof is rejected once its TTL has passed', () => {
  const proof = createRecoveryProof(SECRET, NOW)
  assert.equal(verifyRecoveryProof(SECRET, proof, NOW + 2 * 60 * 1000 + 1), false)
})

test('a proof signed with a different secret is rejected', () => {
  const proof = createRecoveryProof(SECRET, NOW)
  assert.equal(verifyRecoveryProof('wrong-secret', proof, NOW), false)
})

test('a tampered expiry timestamp is rejected', () => {
  const proof = createRecoveryProof(SECRET, NOW)
  const [, signature] = proof.split('.')
  const tampered = `${NOW + 999999999}.${signature}`
  assert.equal(verifyRecoveryProof(SECRET, tampered, NOW), false)
})

test('malformed tokens are rejected without throwing', () => {
  assert.equal(verifyRecoveryProof(SECRET, null, NOW), false)
  assert.equal(verifyRecoveryProof(SECRET, '', NOW), false)
  assert.equal(verifyRecoveryProof(SECRET, 'not-a-valid-token', NOW), false)
  assert.equal(verifyRecoveryProof(SECRET, 'abc.def.ghi', NOW), false)
})
