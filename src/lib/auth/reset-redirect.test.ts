import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveCallbackRedirect, isResetPasswordPath } from './reset-redirect.ts'

test('resolveCallbackRedirect accepts a same-site relative path', () => {
  assert.equal(resolveCallbackRedirect('/en/reset-password'), '/en/reset-password')
})

test('resolveCallbackRedirect falls back to the default locale reset page when next is missing', () => {
  assert.equal(resolveCallbackRedirect(null), '/zh/reset-password')
})

test('resolveCallbackRedirect rejects protocol-relative URLs to prevent open redirects', () => {
  assert.equal(resolveCallbackRedirect('//evil.example.com/phish'), '/zh/reset-password')
})

test('resolveCallbackRedirect rejects absolute URLs to prevent open redirects', () => {
  assert.equal(resolveCallbackRedirect('https://evil.example.com'), '/zh/reset-password')
})

test('resolveCallbackRedirect rejects values that URL parsing would normalize to a different host', () => {
  assert.equal(resolveCallbackRedirect('/\\/evil.com'), '/zh/reset-password')
  assert.equal(resolveCallbackRedirect('/\t/evil.com'), '/zh/reset-password')
  assert.equal(resolveCallbackRedirect('/\n/evil.com'), '/zh/reset-password')
  assert.equal(resolveCallbackRedirect('/\r/evil.com'), '/zh/reset-password')
})

test('isResetPasswordPath only matches the reset-password page for a known locale', () => {
  assert.equal(isResetPasswordPath('/zh/reset-password'), true)
  assert.equal(isResetPasswordPath('/en/reset-password'), true)
  assert.equal(isResetPasswordPath('/ja/reset-password'), true)
  assert.equal(isResetPasswordPath('/zh/login'), false)
  assert.equal(isResetPasswordPath('/xx/reset-password'), false)
  assert.equal(isResetPasswordPath('/reset-password'), false)
})
