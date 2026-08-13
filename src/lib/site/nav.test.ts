import test from 'node:test'
import assert from 'node:assert/strict'
import { isNavActive, stripLocale, SITE_BASE } from './nav.ts'

test('TOP only lights up on the site root', () => {
  assert.equal(isNavActive('/site', SITE_BASE), true)
  assert.equal(isNavActive('/site/', SITE_BASE), true)
  // 子页路径都以 /site 开头 —— 前缀匹配会让 TOP 在每一页都亮
  assert.equal(isNavActive('/site/news', SITE_BASE), false)
})

test('a section lights up on its own page and its children', () => {
  assert.equal(isNavActive('/site/news', '/site/news'), true)
  assert.equal(isNavActive('/site/news/2026', '/site/news'), true)
  assert.equal(isNavActive('/site/vision', '/site/news'), false)
})

test('sibling paths sharing a prefix do not bleed into each other', () => {
  assert.equal(isNavActive('/site/newsletter', '/site/news'), false)
})

test('works whether or not the pathname carries a locale prefix', () => {
  for (const prefix of ['', '/zh', '/en', '/ja']) {
    assert.equal(isNavActive(`${prefix}/site/news`, '/site/news'), true)
    assert.equal(isNavActive(`${prefix}/site`, SITE_BASE), true)
  }
})

test('clean public-domain paths activate the existing site navigation entries', () => {
  assert.equal(isNavActive('/', SITE_BASE), true)
  assert.equal(isNavActive('/ja', SITE_BASE), true)
  assert.equal(isNavActive('/news', '/site/news'), true)
  assert.equal(isNavActive('/zh/news/launch', '/site/news'), true)
  assert.equal(isNavActive('/en/recruit', '/site/recruit'), true)
  assert.equal(isNavActive('/unknown', '/site/news'), false)
})

test('stripLocale leaves non-locale paths untouched', () => {
  assert.equal(stripLocale('/site/news'), '/site/news')
  assert.equal(stripLocale('/jazz/site'), '/jazz/site')
  assert.equal(stripLocale('/ja'), '/')
  assert.equal(stripLocale('/ja/site'), '/site')
})
