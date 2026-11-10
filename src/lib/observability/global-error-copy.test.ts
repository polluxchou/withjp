import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { ADMIN_DEFAULT_LOCALE, GLOBAL_ERROR_COPY, resolveBoundaryLocale } from './global-error-copy.ts'

const messages = (locale: string) =>
  JSON.parse(fs.readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'))

test('global-error 的文案镜像与 messages 的 errorPages.global 逐字一致', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    assert.deepEqual(GLOBAL_ERROR_COPY[locale], messages(locale).errorPages.global, locale)
  }
})

test('后台默认语言与 i18n/routing 一致', () => {
  const routing = fs.readFileSync(new URL('../../i18n/routing.ts', import.meta.url), 'utf8')
  assert.match(routing, new RegExp(`export const defaultLocale: Locale = '${ADMIN_DEFAULT_LOCALE}'`))
})

test('语言：路径前缀优先；无前缀时官网域名日文、其余后台默认', () => {
  assert.equal(resolveBoundaryLocale('admin.example.com', '/en/creators'), 'en')
  assert.equal(resolveBoundaryLocale('eacn.agenova.chat', '/zh/news'), 'zh')
  assert.equal(resolveBoundaryLocale('eacn.agenova.chat', '/news'), 'ja')
  assert.equal(resolveBoundaryLocale('eacn.agenova.chat', '/'), 'ja')
  assert.equal(resolveBoundaryLocale('admin.example.com', '/'), 'zh')
  assert.equal(resolveBoundaryLocale('admin.example.com', '/english/x'), 'zh')
})
