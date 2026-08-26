import test from 'node:test'
import assert from 'node:assert/strict'

import { validateNewPassword, MIN_PASSWORD_LENGTH } from './password-validation.ts'

test('validateNewPassword rejects passwords shorter than the minimum length', () => {
  assert.equal(validateNewPassword('abc12', 'abc12'), 'tooShort')
  assert.equal(MIN_PASSWORD_LENGTH, 6)
})

test('validateNewPassword rejects mismatched confirmation even when both are long enough', () => {
  assert.equal(validateNewPassword('abc123', 'abc124'), 'mismatch')
})

test('validateNewPassword accepts a long enough, matching password', () => {
  assert.equal(validateNewPassword('abc123', 'abc123'), null)
})

test('validateNewPassword checks length before checking match', () => {
  // Both too short AND mismatched — length error should win so the user
  // fixes one problem at a time instead of seeing a confusing double error.
  assert.equal(validateNewPassword('a', 'b'), 'tooShort')
})
