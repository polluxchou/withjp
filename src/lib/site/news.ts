/**
 * NEWS 的文章模型。设计稿 v3 把 NEWS 从写死的三张卡换成数据驱动（列表 + 详情）；
 * 内容本身（2026-08-14 起）已经从 messages/{zh,en,ja}.json 搬进 site_news 表
 * （`supabase/migrations/20260814112723_site_content.sql`），本文件负责把
 * 一行/多行 site_news 按 locale 转成页面组件要用的 SiteArticle，以及"查询结果
 * （含 error）→ 该渲染什么"这层决策。真正发起网络请求（`db.from('site_news')
 * .select(...)`）仍然是页面组件自己的事（`src/app/[locale]/site/news/page.tsx`
 * 等）——本文件不做 IO，这样"查询失败时该降级成什么"才能脱离 next dev server
 * 单独用 node:test 验证，不用为了测一个 if/else 起一个真的 HTTP 服务器。
 *
 * slug 是稳定的路由标识，不用日期也不用下标：日期会改、下标会因插入新文章而
 * 整体位移，两者都会让已经发出去的链接失效。这条规则现在由 site_news.slug 的
 * check 约束保证（见 news-sort.ts 的 isValidNewsSlug，两边必须同步）。
 */
import type { Locale } from '../../i18n/routing.ts'
import { pickLocaleText } from './i18n-content.ts'
import { isValidNewsSlug, publishedOnly, sortNews } from './news-sort.ts'

export type NewsTag = 'RECRUIT' | 'PROJECT' | 'LIVE'
export type NewsCategory = 'project' | 'recruit'

/**
 * 渲染官网所需的 site_news 列清单，供三处查询（首页 LATEST、NEWS 列表页、
 * NEWS 详情页）共用同一份字符串（评审风险：加一列漏改一处 → PostgREST 报错
 * → 走优雅降级 → 空页面，无告警）。vision/page.tsx 的 MEMBER_COLUMNS 只在
 * 一处使用，不需要抽；这里三处都要用同一份列清单，必须只有一个事实源。
 */
export const NEWS_COLUMNS =
  'slug, tag, category, published_on, is_pinned, is_published, image_url, title_ja, title_zh, title_en, lead_ja, lead_zh, lead_en, body_ja, body_zh, body_en'

/**
 * 渲染官网所需的 site_news 列集合（渲染视角，不含 id/created_at 等审计列——
 * 那些是后台 CRUD 的关注点，见 `src/lib/site/news-service.ts` 的 NewsRow）。
 */
export interface SiteNewsRow {
  slug: string
  tag: NewsTag
  category: NewsCategory
  published_on: string
  is_pinned: boolean
  is_published: boolean
  image_url: string | null
  title_ja: string
  title_zh: string | null
  title_en: string | null
  lead_ja: string
  lead_zh: string | null
  lead_en: string | null
  body_ja: string
  body_zh: string | null
  body_en: string | null
}

export interface SiteArticle {
  slug: string
  date: string
  tag: NewsTag
  title: string
  lead: string
  body: string[]
  /** 缺图时留空，SiteImage 渲染占位框——不用别的文章的图顶替。 */
  image?: string
  category: NewsCategory
  href: string
}

/** 路由参数的形状校验，与 site_news.slug 的 check 约束同一条规则（news-sort.ts）。 */
export function isNewsSlug(value: string): boolean {
  return isValidNewsSlug(value)
}

/** published_on（'YYYY-MM-DD'）→ 展示用日期（'YYYY.MM.DD'）。数字格式，三语通用。 */
function formatNewsDate(publishedOn: string): string {
  return publishedOn.replaceAll('-', '.')
}

/** 把一行 site_news 按 locale 转成页面用的 SiteArticle。 */
export function buildArticle(locale: Locale, row: SiteNewsRow): SiteArticle {
  return {
    slug: row.slug,
    date: formatNewsDate(row.published_on),
    tag: row.tag,
    title: pickLocaleText(locale, { ja: row.title_ja, zh: row.title_zh, en: row.title_en }),
    lead: pickLocaleText(locale, { ja: row.lead_ja, zh: row.lead_zh, en: row.lead_en }),
    // 正文纯文本，空行分段（写库时用 "\n\n" 连接，见 scripts/seed-site-content.mjs）
    body: pickLocaleText(locale, { ja: row.body_ja, zh: row.body_zh, en: row.body_en }).split('\n\n'),
    image: row.image_url ?? undefined,
    category: row.category,
    href: `/site/news/${row.slug}`,
  }
}

/** 把多行 site_news 按 locale 转成 SiteArticle 列表，顺序照搬传入的 rows。 */
export function buildArticles(locale: Locale, rows: SiteNewsRow[]): SiteArticle[] {
  return rows.map((row) => buildArticle(locale, row))
}

/** 从 rows 里按 slug 找一条并转成 SiteArticle；找不到返回 undefined。 */
export function findArticle(locale: Locale, rows: SiteNewsRow[], slug: string): SiteArticle | undefined {
  const row = rows.find((r) => r.slug === slug)
  return row ? buildArticle(locale, row) : undefined
}

/** 与 supabase-js 查询返回值兼容的最小形状，不引入真实客户端的复杂泛型。 */
export interface SiteNewsQueryResult {
  data: unknown
  error: { code?: string; message?: string } | null
}

/**
 * 列表/首页查询结果 → 已发布文章列表（置顶优先 + 发布日倒序）。
 *
 * 数据库故障不该让 NEWS 列表页或首页整页 500——这里查询失败时降级为空数组
 * （列表页显示"暂无内容"，首页跳过 LATEST 区块），而不是抛错。但降级不等于
 * 沉默：真实故障必须通过 onQueryError 上报，否则"数据库打嗝"在监控里会长得
 * 和"目前确实没有已发布文章"一模一样，没人能分辨。
 *
 * onQueryError 是回调而不是这里直接 console.error：页面组件负责实际打印
 * （可以加前缀、加 locale 等上下文），这里只做"出错了该返回什么"的决策，
 * 测试断言回调被正确调用即可，不用 mock 全局 console。
 *
 * 内部再调一次 publishedOnly 作为第二道保险：三个页面组件目前都在 SQL 侧
 * `.eq('is_published', true)` 过滤过一次，但这层纯函数正是"查询结果 → 该
 * 渲染什么"的决策点，不应该假设调用方的查询一定带对了过滤条件——少了这层，
 * 谁不小心删掉某处的 `.eq('is_published', true)`，433 个测试照样全绿，
 * 草稿/已下架文章会直接出现在公开页面上。
 */
export function articlesFromListQuery(
  locale: Locale,
  result: SiteNewsQueryResult,
  onQueryError: (error: { code?: string; message?: string }) => void,
): SiteArticle[] {
  if (result.error) {
    onQueryError(result.error)
    return []
  }
  return buildArticles(locale, sortNews(publishedOnly((result.data ?? []) as SiteNewsRow[])))
}

/**
 * 详情查询结果 → 单篇文章。`.single()` 查不到行时 PostgREST 返回错误码
 * `PGRST116`（"no rows"/"多于一行"）——这是「查不到 / 已下架」的正常情况，
 * 不当故障上报，否则每次访问一篇下架文章都会污染错误日志。
 *
 * 其他错误码（网络、鉴权、语法……）是真实故障：仍然返回 undefined（详情页
 * 依然 404——"出错也走 404"是可以接受的降级），但必须先经 onQueryError 上报，
 * 不能让真实故障和正常下架在日志里长得一样。
 */
export function articleFromSingleQuery(
  locale: Locale,
  result: SiteNewsQueryResult,
  onQueryError: (error: { code?: string; message?: string }) => void,
): SiteArticle | undefined {
  if (result.error) {
    if (result.error.code !== 'PGRST116') onQueryError(result.error)
    return undefined
  }
  if (!result.data) return undefined
  return buildArticle(locale, result.data as SiteNewsRow)
}

/**
 * 文末「去应募」CTA 只在 recruit 类文章出现（上游 PR 197）。category 是不随语言
 * 变化的行为开关，现在来自 site_news.category 列，不能凭 tag 或展示文案猜。
 */
export function shouldShowNewsApply(category: NewsCategory): boolean {
  return category === 'recruit'
}
