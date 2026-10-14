# 官网接入 Google Search Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `eacn.agenova.chat` 提供 robots.txt 与 sitemap.xml，并让官网 9 个页面声明 canonical + 日/英/中 hreflang，使 Google Search Console 能正确收录与统计。

**Architecture:** 网址规则集中在 `src/lib/site/domain-routing.ts`（新增 `publicSiteUrl` / `isPublicSiteHost`），其上三个纯函数模块：`seo.ts`（页面 alternates）、`sitemap.ts`（站点地图条目）、`robots.ts`（按域名给抓取规则）。Next 的 `src/app/sitemap.ts`、`src/app/robots.ts` 只做取数/取 host 并调用纯函数；9 个页面在各自 `generateMetadata` 里调用 `siteAlternates`。中间件的官网域名白名单放行这两个文件。

**Tech Stack:** Next.js 14.2 App Router（metadata routes）、next-intl、Supabase（`site_news`）、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-08-site-search-console-design.md`

---

## 执行须知（先读）

- 工作目录：本功能的 git worktree 根目录（下文记作 `$WORKTREE`，分支 `feat/site-search-console`）。**所有命令都在这个目录跑**，不要 `cd` 到主仓（下文记作 `$MAIN_REPO`）——主仓同时被别的会话使用。每次 commit 前先 `git branch --show-current` 确认还在本分支。
- worktree 位于主仓的 `.claude/worktrees/` 下，没有自己的 `node_modules`，Node 会向上解析到主仓的，测试和 `npx next` 都能直接跑。
- `$SCRATCH` 指执行者自己的临时目录（不在仓库里），用来放构建日志、PR 描述等不进仓库的文件。
- 跑单个测试文件：`node --test --experimental-strip-types <file>`。`npm test` 只跑登记在 `package.json` 的 `test` 脚本里的文件——**新测试文件必须登记**，否则 CI 不会跑它。
- strip-types 不做类型检查：纯类型 import 必须写 `import type` 或内联 `type`，否则运行时报错；测试全绿也可能挂 CI 的 `tsc`，所以 Task 7 要单独跑 `npx tsc --noEmit`。
- 代码注释里**不要写 `#` 加数字**（如 PR 编号），`npm run test:style` 会把它误判成裸 hex 色值；要引用 PR 写成 `PR 123`。
- 删除文件用 `mv <file> ~/.Trash/`，不要用 rm。
- 基线：开工前 `npm test` 为 1751 pass / 0 fail（2026-10-14 在 origin/main `1f195337` 上实测）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/lib/site/domain-routing.ts` | 改 | 导出 `PublicLocale`、新增 `isPublicSiteHost`、`publicSiteUrl`；官网域名放行 `/robots.txt`、`/sitemap.xml` |
| `src/lib/site/domain-routing.test.ts` | 改 | 上述新行为的测试 |
| `src/lib/site/seo.ts` | 建 | `siteAlternates(locale, suffix)`：canonical + hreflang |
| `src/lib/site/seo.test.ts` | 建 | 单元测试 + 「每个 page.tsx 都调用且路径指向自己」的源码断言 |
| `src/app/[locale]/site/**/page.tsx`（9 个） | 改 | `generateMetadata` 返回 `alternates` |
| `src/lib/site/sitemap.ts` | 建 | `SITE_STATIC_PATHS`、`buildSiteSitemap(news)` |
| `src/lib/site/sitemap.test.ts` | 建 | 条目数、网址形态、与路由白名单/页面文件的交叉校验 |
| `src/app/sitemap.ts` | 建 | 查 `site_news` 已发布新闻 → `buildSiteSitemap`；每小时重算；查库失败降级 |
| `src/lib/site/robots.ts` | 建 | `buildRobots(host)` |
| `src/lib/site/robots.test.ts` | 建 | 官网域名各写法 allow；其他一律 disallow |
| `src/app/robots.ts` | 建 | 读请求 host → `buildRobots`；`force-dynamic` |
| `package.json` | 改 | `test` 脚本登记 3 个新测试文件 |
| `src/lib/changelog/entries.ts` | 改 | 更新日志条目 |

---

### Task 1: 官网网址与域名判定（domain-routing）

**Files:**
- Modify: `src/lib/site/domain-routing.ts`
- Test: `src/lib/site/domain-routing.test.ts`

- [ ] **Step 1: 写失败的测试**

把 `src/lib/site/domain-routing.test.ts` 第 4 行的 import 改成：

```ts
import {
  PUBLIC_SITE_HOSTS,
  isPublicSiteHost,
  publicSiteUrl,
  resolvePublicSiteRoute,
} from './domain-routing.ts'
```

在文件末尾追加：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/domain-routing.test.ts`
Expected: FAIL —— `isPublicSiteHost` / `publicSiteUrl` 未导出（SyntaxError: does not provide an export named ...）。

- [ ] **Step 3: 实现**

在 `src/lib/site/domain-routing.ts` 中：

(a) 把 `type PublicLocale = (typeof PUBLIC_SITE_LOCALES)[number]` 改为导出：

```ts
export type PublicLocale = (typeof PUBLIC_SITE_LOCALES)[number]
```

(b) 在 `const PUBLIC_PAGE_RE = ...` 那行之后加：

```ts
// 搜索引擎读的两个站点级文件（src/app/robots.ts、src/app/sitemap.ts）。只认站点
// 根上的这两个名字：/en/sitemap.xml、/foo.txt 之类仍走下面的页面白名单、得到 404。
const SEO_FILE_PATHS = new Set(['/robots.txt', '/sitemap.xml'])
```

(c) 在 `function normalizeHostname` 之后加：

```ts
/** host 是否是官网域名。容忍大小写、末尾点、端口、首尾空白（Host 请求头会带端口）。 */
export function isPublicSiteHost(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = normalizeHostname(host.trim().replace(/:\d+$/, ''))
  return (PUBLIC_SITE_HOSTS as readonly string[]).includes(hostname)
}
```

(d) 在 `function cleanPublicPath` 之后加：

```ts
/**
 * 官网某页在规范域名下的绝对网址（canonical、hreflang、sitemap 共用这一处规则）。
 * suffix 是相对站点根的路径：'/'、'/vision'、'/news/<slug>'。
 */
export function publicSiteUrl(locale: PublicLocale, suffix: string): string {
  return `https://${PUBLIC_SITE_HOST}${cleanPublicPath(locale, suffix)}`
}
```

(e) 在 `resolvePublicSiteRoute` 里，把第一行

```ts
  if (!(PUBLIC_SITE_HOSTS as readonly string[]).includes(normalizeHostname(hostname))) return null
```

替换为：

```ts
  if (!isPublicSiteHost(hostname)) return null

  if (SEO_FILE_PATHS.has(pathname)) return { kind: 'passthrough' }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/domain-routing.test.ts`
Expected: 全部 PASS（含原有用例）。

再跑一次 `npm test`，Expected: 0 fail（`locale-menu.test.ts` 等依赖 domain-routing 的测试不受影响）。

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/lib/site/domain-routing.ts src/lib/site/domain-routing.test.ts
git commit -m "feat(site): 官网域名放行 robots.txt/sitemap.xml，新增 publicSiteUrl 与 isPublicSiteHost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: canonical + hreflang 生成函数（seo.ts）

**Files:**
- Create: `src/lib/site/seo.ts`
- Create: `src/lib/site/seo.test.ts`
- Modify: `package.json`（`test` 脚本）

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/site/seo.test.ts`：

```ts
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
```

在 `package.json` 的 `scripts.test` 字符串末尾（结尾双引号之前）追加 ` src/lib/site/seo.test.ts`。当前该字符串以 `src/components/discussions/count-queue-wiring.test.ts"` 结尾，改后应以 `src/components/discussions/count-queue-wiring.test.ts src/lib/site/seo.test.ts"` 结尾。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/seo.test.ts`
Expected: FAIL —— Cannot find module `./seo.ts`。

- [ ] **Step 3: 实现**

新建 `src/lib/site/seo.ts`：

```ts
import { PUBLIC_SITE_LOCALES, publicSiteUrl, type PublicLocale } from './domain-routing.ts'

// 官网每个页面的 canonical + hreflang。
//
// 同一页面线上有好几个网址能打开：eacn.agenova.chat/vision、/ja/vision（同样
// rewrite 到这一页）、内部域名 mcn.agenova.chat/ja/site/vision。canonical 统一指向
// 官网域名上的无 /ja 前缀形态，让搜索引擎把权重归到对外网址；languages 声明
// 日/英/中三版互为翻译，x-default 给默认语言（日文）。
//
// 每个页面在自己的 generateMetadata 里调用，**不要挪到 site/layout.tsx 统一给**：
// Next 的 metadata 逐段浅合并，子页面漏写 alternates 就会继承 layout 的值——
// 等于把漏写的页面声明成首页的重复页、从搜索结果里撤掉。seo.test.ts 用源码断言
// 钉住了「每个 page.tsx 都调用、且路径指向自己」。

export interface SiteAlternates {
  canonical: string
  languages: Record<string, string>
}

function toPublicLocale(locale: string): PublicLocale {
  return (PUBLIC_SITE_LOCALES as readonly string[]).includes(locale)
    ? (locale as PublicLocale)
    : PUBLIC_SITE_LOCALES[0]
}

/** suffix 是相对站点根的路径：'/'、'/vision'、'/news/<slug>'。 */
export function siteAlternates(locale: string, suffix: string): SiteAlternates {
  const languages: Record<string, string> = {}
  for (const l of PUBLIC_SITE_LOCALES) languages[l] = publicSiteUrl(l, suffix)
  languages['x-default'] = publicSiteUrl(PUBLIC_SITE_LOCALES[0], suffix)
  return { canonical: publicSiteUrl(toPublicLocale(locale), suffix), languages }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/seo.test.ts`
Expected: 4 PASS。

Run: `grep -c 'src/lib/site/seo.test.ts' package.json`
Expected: `1`

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/lib/site/seo.ts src/lib/site/seo.test.ts package.json
git commit -m "feat(site): 新增 siteAlternates，生成官网页面的 canonical 与三语 hreflang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 9 个官网页面接入 alternates

**Files:**
- Modify: `src/app/[locale]/site/page.tsx`
- Modify: `src/app/[locale]/site/news/page.tsx`
- Modify: `src/app/[locale]/site/news/[slug]/page.tsx`
- Modify: `src/app/[locale]/site/vision/page.tsx`
- Modify: `src/app/[locale]/site/live/page.tsx`
- Modify: `src/app/[locale]/site/services/page.tsx`
- Modify: `src/app/[locale]/site/contact/page.tsx`
- Modify: `src/app/[locale]/site/recruit/page.tsx`
- Modify: `src/app/[locale]/site/recruit/staff/page.tsx`
- Test: `src/lib/site/seo.test.ts`

- [ ] **Step 1: 写失败的源码断言测试**

在 `src/lib/site/seo.test.ts` 顶部 import 区补两行（放在 `import test from 'node:test'` 之后）：

```ts
import fs from 'node:fs'
import path from 'node:path'
```

文件末尾追加：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/seo.test.ts`
Expected: 新用例 FAIL，报 `contact/page.tsx: generateMetadata 必须返回 ...`（测试对文件列表排序，第一个缺失的是 contact）。

- [ ] **Step 3: 逐个页面接入**

9 个文件都在 `import { setRequestLocale, getTranslations } from 'next-intl/server'` 这一行之后加一行：

```ts
import { siteAlternates } from '@/lib/site/seo'
```

然后逐个改 `generateMetadata`：

**`src/app/[locale]/site/page.tsx`（首页，原来没有 generateMetadata）**：文件第 1 行之前加 `import type { Metadata } from 'next'`；在 `export const revalidate = false` 那一行之后插入：

```ts

// 首页的 title 由 site/layout.tsx 提供，这里只补 canonical/hreflang。别把 alternates
// 挪进 layout 统一给——原因见 src/lib/site/seo.ts 顶部注释。
export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  return { alternates: siteAlternates(params.locale, '/') }
}
```

**`news/page.tsx`**：`return { title: t('title') }` → `return { title: t('title'), alternates: siteAlternates(params.locale, '/news') }`

**`news/[slug]/page.tsx`**：`return { title: article.title, description: article.lead }` →

```ts
  return {
    title: article.title,
    description: article.lead,
    alternates: siteAlternates(params.locale, `/news/${params.slug}`),
  }
```

（前面两条 `return {}` 保持不动：文章不存在时页面本来就 404。）

**`vision/page.tsx`**：`return { title: t('eyebrow') }` → `return { title: t('eyebrow'), alternates: siteAlternates(params.locale, '/vision') }`

**`live/page.tsx`**：`return { title: t('title') }` → `return { title: t('title'), alternates: siteAlternates(params.locale, '/live') }`

**`services/page.tsx`**：`return { title: t('title') }` → `return { title: t('title'), alternates: siteAlternates(params.locale, '/services') }`

**`contact/page.tsx`**：`return { title: t('title') }` → `return { title: t('title'), alternates: siteAlternates(params.locale, '/contact') }`

**`recruit/page.tsx`**：`return { title: t('eyebrow') }` → `return { title: t('eyebrow'), alternates: siteAlternates(params.locale, '/recruit') }`

**`recruit/staff/page.tsx`**：`return { title: t('eyebrow') }` → `return { title: t('eyebrow'), alternates: siteAlternates(params.locale, '/recruit/staff') }`

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/seo.test.ts`
Expected: 5 PASS。

Run: `npx tsc --noEmit`
Expected: 无输出、exit 0（确认 `SiteAlternates` 能赋给 `Metadata['alternates']`、首页的同步 `generateMetadata` 类型正确）。

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add 'src/app/[locale]/site' src/lib/site/seo.test.ts
git commit -m "feat(site): 官网 9 个页面声明 canonical 与日英中 hreflang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: sitemap.xml

**Files:**
- Create: `src/lib/site/sitemap.ts`
- Create: `src/lib/site/sitemap.test.ts`
- Create: `src/app/sitemap.ts`
- Modify: `package.json`（`test` 脚本）

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/site/sitemap.test.ts`：

```ts
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
```

在 `package.json` 的 `scripts.test` 字符串末尾追加 ` src/lib/site/sitemap.test.ts`（此时应以 `src/lib/site/seo.test.ts src/lib/site/sitemap.test.ts"` 结尾）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/sitemap.test.ts`
Expected: FAIL —— Cannot find module `./sitemap.ts`。

- [ ] **Step 3: 实现纯函数**

新建 `src/lib/site/sitemap.ts`：

```ts
import type { MetadataRoute } from 'next'
import { PUBLIC_SITE_LOCALES, publicSiteUrl } from './domain-routing.ts'

/**
 * 官网固定页面（相对站点根）。sitemap.test.ts 会核对它与 src/app/[locale]/site 下的
 * 静态 page.tsx 一一对应、且每条都在官网域名白名单（domain-routing 的 PUBLIC_PAGE_RE）
 * 里——新增页面忘了登记会直接挂测试。
 */
export const SITE_STATIC_PATHS = [
  '/',
  '/news',
  '/vision',
  '/live',
  '/services',
  '/contact',
  '/recruit',
  '/recruit/staff',
] as const

export interface SitemapNewsItem {
  slug: string
  /** site_news.published_on，'YYYY-MM-DD' */
  publishedOn: string
}

// 每个页面的三个语言版本各占一条。hreflang 只在页面 <link> 里声明（seo.ts），
// 这里不重复写，避免两处来源不一致。固定页不写 lastModified：写不准的 lastmod
// 会让搜索引擎整体忽略这个字段。
export function buildSiteSitemap(news: readonly SitemapNewsItem[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []
  for (const locale of PUBLIC_SITE_LOCALES) {
    for (const suffix of SITE_STATIC_PATHS) {
      entries.push({ url: publicSiteUrl(locale, suffix) })
    }
    for (const item of news) {
      entries.push({ url: publicSiteUrl(locale, `/news/${item.slug}`), lastModified: item.publishedOn })
    }
  }
  return entries
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/sitemap.test.ts`
Expected: 6 PASS。

- [ ] **Step 5: 实现 Next 路由**

新建 `src/app/sitemap.ts`：

```ts
import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { buildSiteSitemap, type SitemapNewsItem } from '@/lib/site/sitemap'

// 新闻增删改不主动失效 sitemap：每小时最多重查一次库就够了，搜索引擎本来就隔
// 几天才抓一次 sitemap。
export const revalidate = 3600

// 查库失败（含构建期没有真实库）时只输出固定页：sitemap 整体 500 会让搜索引擎
// 降低抓取频率，少列几篇新闻的代价小得多。真实故障用 console.error 留痕。
async function fetchPublishedNews(): Promise<SitemapNewsItem[]> {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('site_news')
      .select('slug, published_on')
      .eq('is_published', true)
    if (error) throw error
    return (data ?? []).map((row: { slug: string; published_on: string }) => ({
      slug: row.slug,
      publishedOn: row.published_on,
    }))
  } catch (error) {
    console.error('[sitemap] site_news query failed, listing static pages only', { error })
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSiteSitemap(await fetchPublishedNews())
}
```

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/lib/site/sitemap.ts src/lib/site/sitemap.test.ts src/app/sitemap.ts package.json
git commit -m "feat(site): 官网 sitemap.xml，列出固定页与已发布新闻的日英中三版

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: robots.txt

**Files:**
- Create: `src/lib/site/robots.ts`
- Create: `src/lib/site/robots.test.ts`
- Create: `src/app/robots.ts`
- Modify: `package.json`（`test` 脚本）

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/site/robots.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { PUBLIC_SITE_HOSTS } from './domain-routing.ts'
import { buildRobots } from './robots.ts'

const ALLOW = {
  rules: { userAgent: '*', allow: '/' },
  sitemap: 'https://eacn.agenova.chat/sitemap.xml',
}
const DISALLOW = { rules: { userAgent: '*', disallow: '/' } }

// 这条判错的后果是官网整站被撤出 Google，所以把 Host 头可能出现的写法都过一遍。
test('官网域名的各种写法都允许抓取并给出 sitemap', () => {
  for (const host of PUBLIC_SITE_HOSTS) {
    for (const variant of [host, host.toUpperCase(), `${host}.`, `${host}:443`]) {
      assert.deepEqual(buildRobots(variant), ALLOW, variant)
    }
  }
})

test('内部域名、预览部署、本地、缺 host 一律禁止抓取', () => {
  for (const host of [
    'mcn.agenova.chat',
    'withjp-git-feat-x-example.vercel.app',
    'localhost:3001',
    '',
    null,
  ]) {
    assert.deepEqual(buildRobots(host), DISALLOW, String(host))
  }
})
```

在 `package.json` 的 `scripts.test` 字符串末尾追加 ` src/lib/site/robots.test.ts`（此时应以 `src/lib/site/sitemap.test.ts src/lib/site/robots.test.ts"` 结尾）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/site/robots.test.ts`
Expected: FAIL —— Cannot find module `./robots.ts`。

- [ ] **Step 3: 实现纯函数**

新建 `src/lib/site/robots.ts`：

```ts
import type { MetadataRoute } from 'next'
import { isPublicSiteHost, PUBLIC_SITE_HOST } from './domain-routing.ts'

// 同一次部署同时服务官网域名和内部后台域名，robots.txt 必须按请求的 host 分开给：
// 官网允许抓取并指向 sitemap；其余（内部域名、*.vercel.app 预览、本地）一律禁止，
// 内部后台的登录页之类不该出现在搜索结果里。
//
// 把官网误判成禁止 = 整站被撤出 Google，所以判定只走 isPublicSiteHost 这一处，
// robots.test.ts 覆盖了 Host 头的各种写法。
export function buildRobots(host: string | null): MetadataRoute.Robots {
  if (isPublicSiteHost(host)) {
    return {
      rules: { userAgent: '*', allow: '/' },
      sitemap: `https://${PUBLIC_SITE_HOST}/sitemap.xml`,
    }
  }
  return { rules: { userAgent: '*', disallow: '/' } }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/site/robots.test.ts`
Expected: 2 PASS。

- [ ] **Step 5: 实现 Next 路由**

新建 `src/app/robots.ts`：

```ts
import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { buildRobots } from '@/lib/site/robots'

// 必须每次请求现算：结果取决于请求的 host。若被构建成静态文件，所有域名会拿到
// 同一份构建期结果（构建环境没有官网 host → 官网也会拿到 disallow）。
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return buildRobots(headers().get('host'))
}
```

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/lib/site/robots.ts src/lib/site/robots.test.ts src/app/robots.ts package.json
git commit -m "feat(site): robots.txt 按域名区分，官网允许抓取并指向 sitemap，其余域名禁止

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 更新日志

**Files:**
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 加条目**

先 `date +%F` 取今天日期。若 `CHANGELOG` 数组第一个对象的 `date` 等于今天，把下面的条目插到它 `items` 数组的**第一位**；否则在数组最前面新建 `{ date: '<今天>', items: [<条目>] }`。

```ts
      {
        kind: 'infra',
        scope: '对外官网',
        title: '官网可以被 Google 正确收录了：补上 robots.txt 与站点地图，每页标明唯一网址和日英中三语对应关系',
        details:
          '以前 eacn.agenova.chat 上的 robots.txt 和 sitemap.xml 都打不开，而同一页又能从 /vision、/ja/vision、内部域名的 /ja/site/vision 三处打开，Google 会当成重复页面，日英中三个版本还会互相抢排名。现在官网提供站点地图（全部页面加已发布新闻，日英中各一版，每小时更新），每页声明唯一的规范网址并互相标注语言版本；内部域名的 robots.txt 改为禁止抓取，后台登录页等不会被收录。配合 Google Search Console 即可查看搜索词、展示与点击次数、收录状况。',
      },
```

- [ ] **Step 2: 检查**

Run: `npx tsc --noEmit && npm run test:i18n`
Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add src/lib/changelog/entries.ts
git commit -m "docs(changelog): 官网接入搜索引擎收录

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 全量检查 + 生产构建实测

- [ ] **Step 1: 与 CI 相同的检查**

```bash
npx tsc --noEmit
npm test
npm run test:copy
```

Expected：tsc exit 0；`npm test` 为 1751 + 新增用例数 pass、0 fail（domain-routing 新增 3、seo 5、sitemap 6、robots 2，共 1767；若 main 在此期间又合入了别的测试，以「基线 + 16」为准）；`test:copy`（i18n / no-bare-han / style / lint --max-warnings=0）全部通过。

- [ ] **Step 2: 生产构建**

```bash
cp "$MAIN_REPO/.env.local" .env.local
npx next build 2>&1 | tee "$SCRATCH/build.log" | tail -80
ls .next/BUILD_ID
```

（`.env.local` 已被 `.gitignore` 忽略，不会被提交；生产构建缺 `NEXT_PUBLIC_SUPABASE_URL` 会被 `next.config.mjs` 直接拒绝。）

Expected：
- `.next/BUILD_ID` 存在（`next build` 偶尔退出码 0 却没有产物，以 BUILD_ID 和路由表为准，不看退出码）。
- 路由表里 **`/robots.txt` 标 `ƒ`（Dynamic）**。若标 `○`，说明被静态化了，停下排查，不能继续。
- 路由表里有 `/sitemap.xml`（`○` 带 revalidate，或 `ƒ`，两者都可以）。

- [ ] **Step 3: 起生产服务并实测**

后台启动（用 Bash 的 run_in_background）：

```bash
npx next start --port 3002
```

等服务就绪后逐条跑。`--resolve` 参数照抄成字面量，不要放进 shell 变量——worktree 隔离钩子会拒绝执行带运行时变量的命令。

先说明为什么要起两个服务：`--resolve` 只改了 curl 连到哪里、发什么 Host 头。robots 和 sitemap 直接读 Host 头，所以 `--resolve` 就够了；但自托管的 `next start` 交给中间件的 URL 取自服务自己的绑定 hostname（默认 localhost），不取 Host 头，中间件看到的永远是内部域名，官网域名的重写不会生效，页面类检查（第 6、7、9 条和下面的新闻检查）会一律被内部域名的登录鉴权拦下，返回 307 跳 `/en/login`。所以：

- 第 1–5 条和第 8 条在上面这个 `npx next start --port 3002` 上照常跑。
- 第 6、7、9 条和新闻检查，要另起第二个服务，让它的绑定 hostname 就是官网域名：`npx next start --port 3003 --hostname eacn.agenova.chat`（同样放后台）。该域名在本机解析不到本机，需要让 Node 把 `eacn.agenova.chat` 解析成 127.0.0.1，例如在 `$SCRATCH` 放一个很小的预加载文件，覆盖 `dns.lookup`、只对这一个域名返回 127.0.0.1，再用 `NODE_OPTIONS="--require <预加载文件路径>"` 传给这条命令。也可以改在 Vercel 预览部署上跑这几条。

第一个服务（3002）上的检查：

```bash
curl -s --resolve eacn.agenova.chat:3002:127.0.0.1 http://eacn.agenova.chat:3002/robots.txt
curl -s http://localhost:3002/robots.txt
curl -s --resolve eacn.agenova.chat:3002:127.0.0.1 http://eacn.agenova.chat:3002/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -12
curl -s --resolve eacn.agenova.chat:3002:127.0.0.1 http://eacn.agenova.chat:3002/sitemap.xml | grep -c '<url>'
curl -s --resolve eacn.agenova.chat:3002:127.0.0.1 http://eacn.agenova.chat:3002/sitemap.xml | grep -o '<loc>https://eacn.agenova.chat/news/[^<]*</loc>' | wc -l
curl -s http://localhost:3002/ja/site/vision | grep -oE '<link rel="canonical"[^>]*>'
```

第二个服务（3003，绑定官网 hostname）上的检查：

```bash
curl -s --resolve eacn.agenova.chat:3003:127.0.0.1 http://eacn.agenova.chat:3003/en/vision | grep -oE '<link rel="(canonical|alternate)"[^>]*>'
curl -s --resolve eacn.agenova.chat:3003:127.0.0.1 http://eacn.agenova.chat:3003/ja/vision | grep -oE '<link rel="canonical"[^>]*>'
curl -s --resolve eacn.agenova.chat:3003:127.0.0.1 http://eacn.agenova.chat:3003/ | grep -oE '<link rel="canonical"[^>]*>'
```

Expected（编号对应上面两组命令的顺序：3002 组依次是第 1、2、3、4、5、8 条，3003 组依次是第 6、7、9 条）：
1. 官网 robots：含 `User-Agent: *`、`Allow: /`、`Sitemap: https://eacn.agenova.chat/sitemap.xml`
2. localhost robots：含 `Disallow: /`，没有 Sitemap 行
3. 前 12 个 `<loc>` 都是 `https://eacn.agenova.chat/...`，没有 `/site`、没有 `/ja/`
4. `<url>` 总数 = (8 + N) × 3，N 是第 5 条的结果（日文新闻条数 = 已发布新闻数）
5. N ≥ 1（本地 `.env.local` 连的是真实库；若为 0，确认库里是否确实没有已发布新闻）
6. 1 条 `rel="canonical" href="https://eacn.agenova.chat/en/vision"` + 4 条 `rel="alternate"`（hrefLang ja / en / zh / x-default）
7. `href="https://eacn.agenova.chat/vision"`
8. `href="https://eacn.agenova.chat/vision"`（内部域名路径同样指向官网）
9. `href="https://eacn.agenova.chat/"`

再从第 3 条结果里任取一篇新闻 slug，在第二个服务（3003）上跑：

```bash
curl -s --resolve eacn.agenova.chat:3003:127.0.0.1 http://eacn.agenova.chat:3003/zh/news/<slug> | grep -oE '<link rel="canonical"[^>]*>'
```

Expected：`href="https://eacn.agenova.chat/zh/news/<slug>"`

- [ ] **Step 4: 收尾**

```bash
pkill -f "next start --port 3002"
pkill -f "next start --port 3003"
```

确认 `git status --short` 里没有 `.env.local`、`.next`（都应被忽略）。

---

### Task 8: 突变探针（确认测试真的拦得住）

在**已提交**的状态上跑（探针用 `git checkout -- <file>` 还原，未提交的改动会被一并冲掉）。先确认 `git status --short` 为空。

每一条：施加突变 → 跑指定测试 → **必须 FAIL** → 还原 → 记录结果。

- [ ] **探针 1：robots 判定反转**

```bash
sed -i '' 's/if (isPublicSiteHost(host)) {/if (!isPublicSiteHost(host)) {/' src/lib/site/robots.ts
node --test --experimental-strip-types src/lib/site/robots.test.ts; echo "exit=$?"
git checkout -- src/lib/site/robots.ts
```
Expected: exit≠0

- [ ] **探针 2：sitemap 漏一个固定页**

```bash
sed -i '' "/^  '\/live',$/d" src/lib/site/sitemap.ts
node --test --experimental-strip-types src/lib/site/sitemap.test.ts; echo "exit=$?"
git checkout -- src/lib/site/sitemap.ts
```
Expected: exit≠0（「与页面文件一一对应」用例失败）

- [ ] **探针 3：页面路径抄错**

```bash
sed -i '' "s|siteAlternates(params.locale, '/contact')|siteAlternates(params.locale, '/vision')|" 'src/app/[locale]/site/contact/page.tsx'
node --test --experimental-strip-types src/lib/site/seo.test.ts; echo "exit=$?"
git checkout -- 'src/app/[locale]/site/contact/page.tsx'
```
Expected: exit≠0

- [ ] **探针 4：页面漏接**

```bash
sed -i '' "s|, alternates: siteAlternates(params.locale, '/live')||" 'src/app/[locale]/site/live/page.tsx'
node --test --experimental-strip-types src/lib/site/seo.test.ts; echo "exit=$?"
git checkout -- 'src/app/[locale]/site/live/page.tsx'
```
Expected: exit≠0

- [ ] **探针 5：官网域名不放行 robots/sitemap**

```bash
sed -i '' "/if (SEO_FILE_PATHS.has(pathname)) return { kind: 'passthrough' }/d" src/lib/site/domain-routing.ts
node --test --experimental-strip-types src/lib/site/domain-routing.test.ts; echo "exit=$?"
git checkout -- src/lib/site/domain-routing.ts
```
Expected: exit≠0

- [ ] **探针 6：canonical 永远指向日文**

```bash
sed -i '' 's/canonical: publicSiteUrl(toPublicLocale(locale), suffix)/canonical: publicSiteUrl(PUBLIC_SITE_LOCALES[0], suffix)/' src/lib/site/seo.ts
node --test --experimental-strip-types src/lib/site/seo.test.ts; echo "exit=$?"
git checkout -- src/lib/site/seo.ts
```
Expected: exit≠0

- [ ] **收尾**：`git status --short` 为空；把 6 条探针结果整理成表（探针 / 突变 / 拦截它的用例 / 结果），放进 PR 描述。任何一条 exit=0 说明对应测试是假的，回到对应 Task 补测试后重跑。

---

### Task 9: 推送并开 PR（不合并）

- [ ] **Step 1: 推送前核对基点，然后推送**

仓库 2026-10-12 重写过全部历史，旧历史上的提交一旦推上去会把已清理的对象带回 GitHub。推送前必须重新 fetch 并确认本分支建立在当前 origin/main 之上：

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD; echo "is_ancestor=$?"
git log --format='%h %ae' origin/main..HEAD
```

Expected：`is_ancestor=0`（若为 1，先 `git rebase origin/main` 并重跑 Task 7 Step 1）；所有提交的作者邮箱都是 `...@users.noreply.github.com`，不能出现个人邮箱。然后：

```bash
git push -u origin feat/site-search-console
```

- [ ] **Step 2: 开 PR**

仓库是公开的：PR 描述里不写开发机路径、内部人员信息。先把描述写到 `$SCRATCH/pr-body.md`，然后：

```bash
gh pr create --base main --head feat/site-search-console \
  --title "feat(site): 官网接入 Google Search Console — robots/sitemap/canonical/hreflang" \
  --body-file "$SCRATCH/pr-body.md"
```

PR 描述包含：背景（三个缺口 + 线上实测 404）、改动清单、Task 7 的实测结果、Task 8 的探针击杀表、上线后验证步骤、需要 pollux 在 Google/Cloudflare 后台做的三步（见 spec「pollux 侧操作」）。结尾附：

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3:** 用 `mcp__ccd_pr__get_status` 查看，未关联则 `bind_pr`；读 CI 结果。**不合并、不开自动合并**——合并前问 pollux。

---

## 合并上线后（另行执行）

1. 核对部署本身：`vercel ls withjp --scope <team>` 有新的 Production / Ready 部署；`vercel inspect <url> --scope <team>` 显示 `target: production` 且 Aliases 含 `eacn.agenova.chat`。
2. 线上复测 Task 7 Step 3 的检查（把 `--resolve ... :3002` 换成 `https://eacn.agenova.chat`，localhost 换成 `https://mcn.agenova.chat`）。重点：`https://eacn.agenova.chat/robots.txt` 必须是 `Allow: /`。
3. 通知 pollux 做三步：Search Console 添加「网域」资源 `agenova.chat` → Cloudflare 根域加 TXT 验证 → 提交 `https://eacn.agenova.chat/sitemap.xml`。
