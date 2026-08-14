/**
 * NEWS 的文章模型。设计稿 v3 把 NEWS 从写死的三张卡换成数据驱动（列表 + 详情）；
 * 内容本身（2026-08-14 起）已经从 messages/{zh,en,ja}.json 搬进 site_news 表
 * （`supabase/migrations/20260814112723_site_content.sql`），本文件只负责把
 * 一行 site_news 按 locale 转成页面组件要用的 SiteArticle —— 纯函数、无 IO，
 * 查库（`is_published` 过滤、排序、按 slug 单条查询）是页面组件自己的事
 * （`src/app/[locale]/site/news/page.tsx` 等），不放在这里。
 *
 * slug 是稳定的路由标识，不用日期也不用下标：日期会改、下标会因插入新文章而
 * 整体位移，两者都会让已经发出去的链接失效。这条规则现在由 site_news.slug 的
 * check 约束保证（见 news-sort.ts 的 isValidNewsSlug，两边必须同步）。
 */
import type { Locale } from '../../i18n/routing.ts'
import { pickLocaleText } from './i18n-content.ts'
import { isValidNewsSlug } from './news-sort.ts'

export type NewsTag = 'RECRUIT' | 'PROJECT' | 'LIVE'
export type NewsCategory = 'project' | 'recruit'

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

/**
 * 文末「去应募」CTA 只在 recruit 类文章出现（上游 PR 197）。category 是不随语言
 * 变化的行为开关，现在来自 site_news.category 列，不能凭 tag 或展示文案猜。
 */
export function shouldShowNewsApply(category: NewsCategory): boolean {
  return category === 'recruit'
}
