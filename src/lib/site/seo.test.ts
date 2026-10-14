import assert from 'node:assert/strict'
import test from 'node:test'

import { PUBLIC_SITE_LOCALES } from './domain-routing.ts'
import { siteAlternates } from './seo.ts'

test('canonical 指向当前语言，languages 列齐三语 + x-default', () => {
  assert.deepEqual(siteAlternates('en', '/vision'), {
    canonical: 'https://eacn.agenova.chat/en/vision',
    languages: {
      ja: 'https://eacn.agenova.chat/vision',
      en: 'https://eacn.agenova.chat/en/vision',
      zh: 'https://eacn.agenova.chat/zh/vision',
      'x-default': 'https://eacn.agenova.chat/vision',
    },
  })
})

test('日文 canonical 不带 /ja 前缀——/ja/vision 与内部域名都归到这个网址', () => {
  assert.equal(siteAlternates('ja', '/vision').canonical, 'https://eacn.agenova.chat/vision')
  assert.equal(siteAlternates('ja', '/').canonical, 'https://eacn.agenova.chat/')
  assert.equal(siteAlternates('zh', '/').canonical, 'https://eacn.agenova.chat/zh')
})

test('languages 顺序取官网语言顺序（日→英→中），不是后台的 zh 优先', () => {
  assert.deepEqual(Object.keys(siteAlternates('zh', '/news').languages), [...PUBLIC_SITE_LOCALES, 'x-default'])
})

test('未知 locale 退回默认语言', () => {
  assert.equal(siteAlternates('fr', '/live').canonical, 'https://eacn.agenova.chat/live')
})
