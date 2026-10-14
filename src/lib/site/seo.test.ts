import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
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

// 页面组件没有 DOM/Next 运行时测试环境，只能钉源码：每个官网 page.tsx 都必须在
// generateMetadata 里调用 siteAlternates，且传的路径就是这一页自己的路径。
// 漏接 → 这一页没有 canonical/hreflang；路径抄错 → 这一页被声明成别的页的重复页。
const SITE_DIR = 'src/app/[locale]/site'

function sitePageFiles(): string[] {
  return (fs.readdirSync(SITE_DIR, { recursive: true }) as string[])
    .filter((rel) => path.basename(rel) === 'page.tsx')
    .sort()
}

/** 'page.tsx' → '/'；'vision/page.tsx' → '/vision'；'news/[slug]/page.tsx' → '/news/${params.slug}' */
function expectedSuffix(rel: string): string {
  const dir = path.dirname(rel)
  if (dir === '.') return '/'
  return '/' + dir.split(path.sep).map((seg) => seg.replace(/^\[(\w+)\]$/, '${params.$1}')).join('/')
}

test('官网每个页面都声明了指向自己的 canonical/hreflang', () => {
  const files = sitePageFiles()
  assert.ok(files.length >= 9, `只找到 ${files.length} 个页面，SITE_DIR 是不是错了`)
  for (const rel of files) {
    const src = fs.readFileSync(path.join(SITE_DIR, rel), 'utf8')
    const m = src.match(/siteAlternates\(\s*params\.locale,\s*(['`])(.+?)\1\s*\)/)
    assert.ok(m, `${rel}: generateMetadata 必须返回 alternates: siteAlternates(params.locale, '<本页路径>')`)
    assert.equal(m[2], expectedSuffix(rel), `${rel}: siteAlternates 的路径必须是本页自己的路径`)
  }
})
