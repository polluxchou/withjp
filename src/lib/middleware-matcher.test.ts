import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MIDDLEWARE_MATCHER,
  matchesAppMiddlewarePath,
} from './middleware-matcher.ts'

test('matcher excludes API routes at the edge entrypoint', () => {
  assert.equal(
    MIDDLEWARE_MATCHER,
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  )
  assert.equal(matchesAppMiddlewarePath('/api'), false)
  assert.equal(matchesAppMiddlewarePath('/api/creators'), false)
  assert.equal(matchesAppMiddlewarePath('/api/profile'), false)
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
  assert.equal(matchesAppMiddlewarePath('/images/logo.png'), false)
})
