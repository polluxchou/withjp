import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { PUBLIC_SITE_HOST, PUBLIC_SITE_LOCALES, resolvePublicSiteRoute } from './domain-routing.ts'
import { buildSiteSitemap, SITE_STATIC_PATHS } from './sitemap.ts'

const NEWS = [
  { slug: 'spring-audition', publishedOn: '2026-09-01' },
  { slug: 'moondollz-debut', publishedOn: '2026-08-15' },
]

test('条目 = (固定页 + 新闻) × 三语，且网址不重复', () => {
  const entries = buildSiteSitemap(NEWS)
  assert.equal(entries.length, (SITE_STATIC_PATHS.length + NEWS.length) * PUBLIC_SITE_LOCALES.length)
  assert.equal(new Set(entries.map((e) => e.url)).size, entries.length)
})

test('网址形态：规范域名、日文无前缀、不带 /site', () => {
  const urls = buildSiteSitemap(NEWS).map((e) => e.url)
  for (const expected of [
    'https://eacn.agenova.chat/',
    'https://eacn.agenova.chat/en',
    'https://eacn.agenova.chat/vision',
    'https://eacn.agenova.chat/zh/recruit/staff',
    'https://eacn.agenova.chat/en/news/spring-audition',
  ]) {
    assert.ok(urls.includes(expected), `缺少 ${expected}`)
  }
  for (const url of urls) {
    assert.ok(url.startsWith(`https://${PUBLIC_SITE_HOST}/`), url)
    assert.doesNotMatch(url, /\/site(\/|$)/, url)
    assert.doesNotMatch(url, /\/ja(\/|$)/, url)
  }
})

test('新闻带 lastModified（发布日期），固定页不带', () => {
  const entries = buildSiteSitemap(NEWS)
  const article = entries.find((e) => e.url === 'https://eacn.agenova.chat/news/spring-audition')
  assert.equal(article?.lastModified, '2026-09-01')
  const vision = entries.find((e) => e.url === 'https://eacn.agenova.chat/vision')
  assert.ok(vision)
  assert.equal(vision.lastModified, undefined)
})

test('没有新闻时只列固定页（查库失败的降级形态）', () => {
  assert.equal(buildSiteSitemap([]).length, SITE_STATIC_PATHS.length * PUBLIC_SITE_LOCALES.length)
})

test('交叉校验：每个网址在官网域名下都直接可达（rewrite，不是 404 或跳转）', () => {
  for (const { url } of buildSiteSitemap(NEWS)) {
    const { pathname } = new URL(url)
    assert.equal(resolvePublicSiteRoute(PUBLIC_SITE_HOST, pathname)?.kind, 'rewrite', url)
  }
})

test('交叉校验：固定页清单与 src/app/[locale]/site 下的静态页面文件一一对应', () => {
  const SITE_DIR = 'src/app/[locale]/site'
  const fromFiles = (fs.readdirSync(SITE_DIR, { recursive: true }) as string[])
    .filter((rel) => path.basename(rel) === 'page.tsx' && !rel.includes('['))
    .map((rel) => {
      const dir = path.dirname(rel)
      return dir === '.' ? '/' : `/${dir.split(path.sep).join('/')}`
    })
    .sort()
  assert.deepEqual([...SITE_STATIC_PATHS].sort(), fromFiles)
})
