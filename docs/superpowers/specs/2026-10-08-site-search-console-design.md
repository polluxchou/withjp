# 官网接入 Google Search Console — 设计说明（spec）

## 目标

让 EchoAmp 对外官网（`eacn.agenova.chat`）能在 Google Search Console 里看到搜索侧数据：搜索词、展示/点击/点击率/平均排名（可按页面、国家、设备、语言路径拆）、收录状况、外链。

Search Console 本身零代码接入（DNS 验证），但官网目前缺三样东西，会让收录慢、三语版本互相打架、报表失真。本 spec 只补这三样，外加接入步骤：

1. `robots.txt` 与 `sitemap.xml` —— 在官网域名下都是 404
2. 规范网址（canonical）—— 同一页面有多个网址可达
3. 语言版本互标（hreflang）—— 日/英/中三版没有互相声明

## 已确认的取舍（与 pollux 的讨论结论）

- 需求是「整体流量概况」。评估过 Vercel Web Analytics（约 $0.3/月，能看全部访客）、自建 Supabase 统计、GA4 之后，**pollux 选择只用 Search Console**。
- 已知代价（已向 pollux 说明并接受）：看不到非搜索来源的访客（TikTok 主页链接、LINE 分享、直接输入）、看不到总 PV/UV 与站内路径；Yahoo! JAPAN 的搜索结果来自 Google（收录/排名同步），但从 Yahoo! JAPAN 点进来的点击不计入报表；冷门搜索词会被 Google 匿名化隐藏。
- **不做**：Vercel Analytics、`_vercel` 路径的中间件放行、隐私政策页、自定义事件、UTM。将来要看总流量时再加 Vercel Analytics，与本次改动互不影响。

## 现状（investigation 摘要）

- 线上实测：`https://eacn.agenova.chat/robots.txt`、`/sitemap.xml` 均返回 `404 text/plain`——是我们自己中间件的 not_found 分支，来源是 `src/lib/site/domain-routing.ts` 的白名单（`PUBLIC_PAGE_RE` 只认页面路径，`/api/*` 只放行应募接口）。仓库里也没有 `src/app/robots.ts` / `sitemap.ts`。
- 重复网址：日文 vision 页可经 `eacn.agenova.chat/vision`、`eacn.agenova.chat/ja/vision`（同样走 rewrite）、`mcn.agenova.chat/ja/site/vision`（内部域名，`/site` 免登录）三处打开，内容相同。页面上没有 canonical，也没有 hreflang。
- 官网 9 个页面文件（`src/app/[locale]/site/` 下）：`page.tsx`（首页）、`news/page.tsx`、`news/[slug]/page.tsx`、`vision`、`live`、`services`、`contact`、`recruit`、`recruit/staff`。除首页外都已有 `generateMetadata`（只返回 title/description）；首页的 title 来自 `site/layout.tsx` 的 `generateMetadata`。
- 新闻来自 Supabase `site_news` 表：`slug` 跨语言共用，`is_published` 控制上下架，`published_on` 是发布日期；zh/en 文案缺失时回退 ja。读取用 `src/lib/supabase/server.ts` 的 `createServerClient()`（service role）。
- 官网网址规则已在 `domain-routing.ts` 的 `cleanPublicPath(locale, suffix)` 里：默认语言（`PUBLIC_SITE_LOCALES[0]` = ja）无前缀，en/zh 带 `/en`、`/zh` 前缀。规范域名常量 `PUBLIC_SITE_HOST`。
- DNS 在 Cloudflare（`eva/pranab.ns.cloudflare.com`）；`eacn` 是指向 Vercel 的 CNAME（未开 Cloudflare 代理）。

## 设计

### 单元 1：官网绝对网址 —— `domain-routing.ts` 新增导出

```ts
/** 官网某页在规范域名下的绝对网址。suffix 是相对站点根的路径（'/'、'/vision'、'/news/<slug>'）。 */
export function publicSiteUrl(locale: PublicLocale, suffix: string): string
// publicSiteUrl('ja', '/')        → 'https://eacn.agenova.chat/'
// publicSiteUrl('ja', '/vision')  → 'https://eacn.agenova.chat/vision'
// publicSiteUrl('en', '/')        → 'https://eacn.agenova.chat/en'
// publicSiteUrl('zh', '/news/a')  → 'https://eacn.agenova.chat/zh/news/a'

/** host 是否是官网域名（大小写、末尾点、端口都归一化）。 */
export function isPublicSiteHost(host: string): boolean
```

`publicSiteUrl` 内部复用 `cleanPublicPath`，不另写一套拼接规则；`isPublicSiteHost` 复用现有 `normalizeHostname` 并额外剥掉 `:port`。`PublicLocale` 类型一并导出。

### 单元 2：canonical + hreflang —— 新文件 `src/lib/site/seo.ts`

```ts
export function siteAlternates(locale: string, suffix: string): Metadata['alternates']
// siteAlternates('en', '/vision') →
// {
//   canonical: 'https://eacn.agenova.chat/en/vision',
//   languages: {
//     ja: 'https://eacn.agenova.chat/vision',
//     en: 'https://eacn.agenova.chat/en/vision',
//     zh: 'https://eacn.agenova.chat/zh/vision',
//     'x-default': 'https://eacn.agenova.chat/vision',
//   },
// }
```

- 语言列表取 `PUBLIC_SITE_LOCALES`（不是 `i18n/routing` 的 `locales`——那是后台的 zh 优先顺序，见 `domain-routing.ts` 里 `PUBLIC_SITE_LOCALES` 的注释）；`x-default` 指向默认语言（ja）。
- `locale` 不在 `PUBLIC_SITE_LOCALES` 里时退回默认语言（防御，正常路由到不了）。
- **9 个页面各自在 `generateMetadata` 里返回 `alternates: siteAlternates(params.locale, '<本页路径>')`**。首页新增一个只返回 `alternates` 的 `generateMetadata`（title 仍由 layout 提供，Next 会合并）。新闻详情页只在查到已发布文章时才带 alternates（查不到本来就 404）。
- **刻意不写在 `site/layout.tsx` 里**：Next 的 metadata 是逐段浅合并，子页面一旦漏写 `alternates` 就会继承 layout 的值——若 layout 写的是首页 canonical，漏写的页面会被声明成「首页的重复页」，等于自己把它从索引里撤掉。
- 防漏写守卫：源码断言测试遍历 `src/app/[locale]/site/**/page.tsx`，断言每个文件都调用了 `siteAlternates(`。以后新增官网页面忘了接，CI 直接红。

canonical 一律指向 `eacn.agenova.chat` 的无 `/ja` 前缀形态，因此 `/ja/vision`、内部域名 `/ja/site/vision` 都会被声明为 `eacn.agenova.chat/vision` 的重复，权重归到对外网址上。

### 单元 3：sitemap —— 新文件 `src/app/sitemap.ts` + 纯函数

纯函数放 `src/lib/site/sitemap.ts`（本仓没有 DOM/Next 运行时测试环境，逻辑下沉到 lib 才测得到）：

```ts
/** 固定页面（相对站点根），与 PUBLIC_PAGE_RE 白名单一致。 */
export const SITE_STATIC_PATHS = ['/', '/news', '/vision', '/live', '/services', '/contact', '/recruit', '/recruit/staff'] as const

export function buildSiteSitemap(news: { slug: string; publishedOn: string }[]): MetadataRoute.Sitemap
```

- 输出 = (8 个固定页 + N 篇已发布新闻) × 3 语言，网址由 `publicSiteUrl` 生成；新闻条目带 `lastModified: publishedOn`，固定页不写 `lastModified`（写不准的 lastmod 会被 Google 降权忽略）。
- hreflang 只走页面 `<link>`（单元 2），sitemap 不重复声明，避免两处来源不一致。
- `src/app/sitemap.ts`：`export const revalidate = 3600`（每小时最多查一次库，不需要改 `news-service.ts` 的失效逻辑）；查询 `site_news` 的 `slug, published_on`，条件 `is_published = true`。**查库失败时**：`console.error` 上报后只输出固定页，不让 sitemap 整体 500（Google 对 sitemap 抓取失败会降低抓取频率）。

### 单元 4：robots —— 新文件 `src/app/robots.ts` + 纯函数

纯函数放 `src/lib/site/robots.ts`：

```ts
export function buildRobots(host: string | null): MetadataRoute.Robots
```

- `isPublicSiteHost(host)` 为真：`{ rules: { userAgent: '*', allow: '/' }, sitemap: 'https://eacn.agenova.chat/sitemap.xml' }`
- 其余（`mcn.agenova.chat`、`*.vercel.app` 预览、`localhost`、host 缺失）：`{ rules: { userAgent: '*', disallow: '/' } }`——顺带让内部后台（登录页等）不被收录。
- `src/app/robots.ts` 从 `headers()` 取 `host` 传入。robots 是特殊的 Route Handler，默认缓存，用了动态函数即转为动态——所以它每次请求执行一次（量级是爬虫访问次数，可忽略），也不会把某个域名的结果缓存给另一个域名。实现后用 `next build` 的路由表确认 `/robots.txt` 标为动态（ƒ）而非静态（○）；若是静态，说明所有域名会拿到同一份构建期结果，必须修正后才能合并。

**这是本次唯一的高危点**：若在 eacn 上误判成 disallow，官网会被整站撤出 Google。测试必须覆盖 `PUBLIC_SITE_HOSTS` 里每个域名及其大写、末尾点、带端口写法都判为 allow；上线后必须实测（见「上线与验证」）。

### 单元 5：官网域名放行 —— `domain-routing.ts`

`resolvePublicSiteRoute` 在 `/api` 判断之前，对 `/robots.txt`、`/sitemap.xml` 返回 `{ kind: 'passthrough' }`。其他 `.txt`/`.xml` 路径在官网域名下仍是 404（加反例测试）。内部域名不经过这个函数的官网分支，已有的 `pathname.includes('.')` 放行逻辑本来就让这两个路径直达 app。

## 测试

全部是 `node --test --experimental-strip-types` 纯函数/源码断言测试，新测试文件登记进 `package.json` 的 `test` 脚本；纯类型 import 要写 `import type`（strip-types 不做类型检查，测试全绿仍可能挂 CI 的 tsc）。

| 文件 | 覆盖 |
|---|---|
| `domain-routing.test.ts`（扩充） | `/robots.txt`、`/sitemap.xml` 在 eacn 上 passthrough；`/foo.txt`、`/feed.xml` 仍 not_found；`publicSiteUrl` 四种形态；`isPublicSiteHost` 的大写/末尾点/端口/非官网域名 |
| `seo.test.ts`（新） | canonical 与 languages 的完整结构；语言顺序取 `PUBLIC_SITE_LOCALES`；`x-default` = ja；非法 locale 回退；**源码断言**：9 个 `page.tsx` 都调用 `siteAlternates(` |
| `sitemap.test.ts`（新） | 条目数 = (8 + N) × 3；没有 `/site` 前缀、ja 无语言前缀；新闻带 lastModified、固定页不带；**交叉校验**：每个条目的 pathname 喂给 `resolvePublicSiteRoute(PUBLIC_SITE_HOST, …)` 都得到 `rewrite`（不是 404/redirect），防止 sitemap 列出白名单外的网址 |
| `robots.test.ts`（新） | 官网域名各写法 → allow + sitemap 地址；mcn / vercel.app / localhost / null → disallow |

实现完成后对关键断言做突变探针（例如把 robots 判定反过来、sitemap 漏一个固定页），确认测试会红。

## 上线与验证

1. PR 合并后核对部署本身（GitHub 上的 Vercel 绿灯不区分 preview/production）：`vercel ls` / `vercel inspect` 确认是 production 部署且 Aliases 含 `eacn.agenova.chat`。
2. `curl https://eacn.agenova.chat/robots.txt` → 200，含 `Allow: /` 与 `Sitemap:` 行；`curl https://mcn.agenova.chat/robots.txt` → `Disallow: /`。
3. `curl https://eacn.agenova.chat/sitemap.xml` → 200 XML，条目数 = (8 + 已发布新闻数) × 3，抽查无下架文章。
4. 抽查页面 HTML：`/vision` 与 `/ja/vision` 的 canonical 都是 `https://eacn.agenova.chat/vision`；`/en/vision` 的 canonical 是 `/en/vision`；三条 hreflang + x-default 齐全；新闻详情页同样检查一篇。

## pollux 侧操作（Google / Cloudflare 后台，需本人账号）

1. Search Console → 添加资源 → 选「网域」→ 填 `agenova.chat`。（不能填 `eacn.agenova.chat`：它是 CNAME，同名下不能再挂验证用的 TXT 记录。网域资源覆盖所有子域，看报表时按网址筛 `eacn.agenova.chat`。）
2. 按提示在 Cloudflare 的 `agenova.chat` 根上加 TXT 记录（Cloudflare 一般支持一键自动添加），完成验证。
3. 本 PR 上线后，在 Search Console「站点地图」提交 `https://eacn.agenova.chat/sitemap.xml`。
4. 数据在几天到几周内陆续出现；新站初期数据稀疏属正常。

## 成本

Search Console 免费；sitemap 每小时最多一次 Supabase 查询、robots 每次爬虫访问一次函数执行，均在现有 Vercel Pro / Supabase 套餐内可忽略。
