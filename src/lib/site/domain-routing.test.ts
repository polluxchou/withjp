import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_SITE_HOSTS,
  isPublicSiteHost,
  publicSiteUrl,
  resolvePublicSiteRoute,
} from './domain-routing.ts'

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

test('官网域名放行员工招募子路径', () => {
  const r = resolvePublicSiteRoute('eacn.agenova.chat', '/recruit/staff')
  assert.equal(r?.kind, 'rewrite')
  if (r?.kind === 'rewrite') assert.equal(r.pathname, '/ja/site/recruit/staff')
})

test('recruit 下的未知子路径仍然 404', () => {
  assert.equal(resolvePublicSiteRoute('eacn.agenova.chat', '/recruit/nope')?.kind, 'not_found')
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

test('官网域名放行 robots.txt 与 sitemap.xml，其余 txt/xml 仍 404', () => {
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/robots.txt'), { kind: 'passthrough' })
  assert.deepEqual(resolvePublicSiteRoute('eacn.agenova.chat', '/sitemap.xml'), { kind: 'passthrough' })
  assert.equal(resolvePublicSiteRoute('eacn.agenova.chat', '/foo.txt')?.kind, 'not_found')
  assert.equal(resolvePublicSiteRoute('eacn.agenova.chat', '/feed.xml')?.kind, 'not_found')
  // 只认站点根上的这两个名字，带语言前缀的不算
  assert.equal(resolvePublicSiteRoute('eacn.agenova.chat', '/en/sitemap.xml')?.kind, 'not_found')
})

test('publicSiteUrl：日文无前缀，英中带前缀', () => {
  assert.equal(publicSiteUrl('ja', '/'), 'https://eacn.agenova.chat/')
  assert.equal(publicSiteUrl('ja', '/vision'), 'https://eacn.agenova.chat/vision')
  assert.equal(publicSiteUrl('en', '/'), 'https://eacn.agenova.chat/en')
  assert.equal(publicSiteUrl('zh', '/news/a'), 'https://eacn.agenova.chat/zh/news/a')
})

test('isPublicSiteHost 归一化大小写、末尾点、端口、首尾空白', () => {
  for (const host of PUBLIC_SITE_HOSTS) {
    assert.equal(isPublicSiteHost(host), true)
    assert.equal(isPublicSiteHost(host.toUpperCase()), true)
    assert.equal(isPublicSiteHost(`${host}.`), true)
    assert.equal(isPublicSiteHost(`${host}:443`), true)
    assert.equal(isPublicSiteHost(` ${host} `), true)
  }
  assert.equal(isPublicSiteHost('mcn.agenova.chat'), false)
  assert.equal(isPublicSiteHost('withjp-git-feat-x-example.vercel.app'), false)
  assert.equal(isPublicSiteHost('localhost:3001'), false)
  assert.equal(isPublicSiteHost('eacn.agenova.chat.evil.com'), false)
  assert.equal(isPublicSiteHost(''), false)
  assert.equal(isPublicSiteHost(null), false)
})
