import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MIDDLEWARE_MATCHER,
  matchesAppMiddlewarePath,
  PUBLIC_PATHS,
  isAuthCallbackPath,
} from './middleware-matcher.ts'

test('matcher includes API routes so host routing can isolate the public domain', () => {
  assert.equal(
    MIDDLEWARE_MATCHER,
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  )
  assert.equal(matchesAppMiddlewarePath('/api'), true)
  assert.equal(matchesAppMiddlewarePath('/api/creators'), true)
  assert.equal(matchesAppMiddlewarePath('/api/site/applications'), true)
})

test('matcher still includes localized app pages', () => {
  assert.equal(matchesAppMiddlewarePath('/zh/creators'), true)
  assert.equal(matchesAppMiddlewarePath('/en/expenses'), true)
  assert.equal(matchesAppMiddlewarePath('/'), true)
})

test('matcher excludes Next internals and static assets', () => {
  assert.equal(matchesAppMiddlewarePath('/_next/static/chunks/main.js'), false)
  assert.equal(matchesAppMiddlewarePath('/_next/image'), false)
  assert.equal(matchesAppMiddlewarePath('/favicon.ico'), false)
  assert.equal(matchesAppMiddlewarePath('/icon.svg'), false)
  assert.equal(matchesAppMiddlewarePath('/images/logo.png'), false)
})

test('PUBLIC_PATHS includes the auth self-service pages', () => {
  assert.deepEqual(PUBLIC_PATHS, ['/login', '/reset-password', '/_next', '/api'])
})

test('isAuthCallbackPath matches the auth callback route and its subpaths', () => {
  assert.equal(isAuthCallbackPath('/auth/callback'), true)
  assert.equal(isAuthCallbackPath('/auth'), true)
  assert.equal(isAuthCallbackPath('/authors'), false)
  assert.equal(isAuthCallbackPath('/zh/login'), false)
})
