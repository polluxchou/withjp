import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePublicSiteRoute } from './domain-routing.ts'

test('leaves the MCN host on the existing auth and locale flow', () => {
  assert.equal(resolvePublicSiteRoute('mcn.agenova.chat', '/'), null)
  assert.equal(resolvePublicSiteRoute('preview.vercel.app', '/zh/creators'), null)
})

test('rewrites clean EchoAmp paths to the existing site routes', () => {
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/'), {
    kind: 'rewrite',
    pathname: '/ja/site',
    locale: 'ja',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/news/example'), {
    kind: 'rewrite',
    pathname: '/ja/site/news/example',
    locale: 'ja',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/zh/recruit'), {
    kind: 'rewrite',
    pathname: '/zh/site/recruit',
    locale: 'zh',
  })
  assert.deepEqual(resolvePublicSiteRoute('ECHOAMP.AGENOVA.CHAT.', '/en/contact'), {
    kind: 'rewrite',
    pathname: '/en/site/contact',
    locale: 'en',
  })
})

test('redirects internal site paths to clean public URLs', () => {
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/ja/site'), {
    kind: 'redirect',
    pathname: '/',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/ja/site/news'), {
    kind: 'redirect',
    pathname: '/news',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/zh/site/recruit'), {
    kind: 'redirect',
    pathname: '/zh/recruit',
  })
})

test('allows only the public application API on the EchoAmp host', () => {
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/api/site/applications'), {
    kind: 'passthrough',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/api/expenses'), {
    kind: 'not_found',
  })
})

test('allows public site media that is evaluated by middleware', () => {
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/site/hero-key.mp4'), {
    kind: 'passthrough',
  })
})

test('rejects admin pages and unknown public sections on the EchoAmp host', () => {
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/zh/creators'), {
    kind: 'not_found',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/login'), {
    kind: 'not_found',
  })
  assert.deepEqual(resolvePublicSiteRoute('echoamp.agenova.chat', '/unknown'), {
    kind: 'not_found',
  })
})
