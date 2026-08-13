import assert from 'node:assert/strict'
import test from 'node:test'

import { PUBLIC_SITE_HOSTS, resolvePublicSiteRoute } from './domain-routing.ts'

test('leaves the MCN host on the existing auth and locale flow', () => {
  assert.equal(resolvePublicSiteRoute('mcn.agenova.chat', '/'), null)
  assert.equal(resolvePublicSiteRoute('preview.vercel.app', '/zh/creators'), null)
})

test('only登记过的 host 走官网分支', () => {
  // 回归：曾把常量写死成一个没有 DNS 记录的域名（echoamp.agenova.chat），
  // 真实域名 eacn 对不上 → 静静落回后台鉴权 → 访客看到内部登录页。
  assert.equal(resolvePublicSiteRoute('echoamp.agenova.chat', '/'), null)
  for (const host of PUBLIC_SITE_HOSTS) {
    assert.notEqual(resolvePublicSiteRoute(host, '/'), null)
  }
})

test('rewrites clean EchoAmp paths to the existing site routes', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/'), {
    kind: 'rewrite',
    pathname: '/ja/site',
    locale: 'ja',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/news/example'), {
    kind: 'rewrite',
    pathname: '/ja/site/news/example',
    locale: 'ja',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/zh/recruit'), {
    kind: 'rewrite',
    pathname: '/zh/site/recruit',
    locale: 'zh',
  })
  assert.deepEqual(resolvePublicSiteRoute('EACN.AGENOVA.CHAT.', '/en/contact'), {
    kind: 'rewrite',
    pathname: '/en/site/contact',
    locale: 'en',
  })
})

test('redirects internal site paths to clean public URLs', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/ja/site'), {
    kind: 'redirect',
    pathname: '/',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/ja/site/news'), {
    kind: 'redirect',
    pathname: '/news',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/zh/site/recruit'), {
    kind: 'redirect',
    pathname: '/zh/recruit',
  })
})

test('allows only the public application API on the EchoAmp host', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/api/site/applications'), {
    kind: 'passthrough',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/api/expenses'), {
    kind: 'not_found',
  })
})

test('allows public site media that is evaluated by middleware', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/site/hero-key.mp4'), {
    kind: 'passthrough',
  })
})

test('rejects admin pages and unknown public sections on the EchoAmp host', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/zh/creators'), {
    kind: 'not_found',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/login'), {
    kind: 'not_found',
  })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/unknown'), {
    kind: 'not_found',
  })
})
