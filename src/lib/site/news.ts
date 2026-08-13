/**
 * NEWS 的文章模型。设计稿 v3 把 NEWS 从写死的三张卡换成数据驱动（列表 + 详情），
 * 这里定义「有哪几篇、各自配图是什么」；标题/导语/正文在
 * messages/{zh,en,ja}.json 的 site.news.articles[] 里，按下标一一对应。
 *
 * slug 是稳定的路由标识，不用日期也不用下标：日期会改、下标会因插入新文章而
 * 整体位移，两者都会让已经发出去的链接失效。
 */
export const NEWS_SLUGS = [
  'nightly-live-start',
  'moondollz-launch',
  'first-gen-audition',
  'osaka-studio-open',
] as const

export type NewsSlug = (typeof NEWS_SLUGS)[number]

export type NewsCategory = 'live' | 'project' | 'recruit'

/** 每篇文章不随语言变化的元数据。 */
const NEWS_METADATA: Record<NewsSlug, { image: string; category: NewsCategory }> = {
  'nightly-live-start': { image: '/site/moondollz-group.webp', category: 'live' },
  'moondollz-launch': { image: '/site/moondollz-key.webp', category: 'project' },
  'first-gen-audition': { image: '/site/card-kano.webp', category: 'recruit' },
  'osaka-studio-open': { image: '/site/card-shino.webp', category: 'project' },
}

/** i18n 里一篇文章的形状（site.news.articles[i]）。 */
export interface SiteArticleCopy {
  date: string
  tag: string
  title: string
  lead: string
  body: string[]
}

export interface SiteArticle extends SiteArticleCopy {
  slug: NewsSlug
  image: string
  category: NewsCategory
  href: string
}

export function isNewsSlug(value: string): value is NewsSlug {
  return (NEWS_SLUGS as readonly string[]).includes(value)
}

/** 把 i18n 文案与图片、路由拼成完整文章列表（按 NEWS_SLUGS 的顺序）。 */
export function buildArticles(copy: SiteArticleCopy[]): SiteArticle[] {
  return NEWS_SLUGS.map((slug, i) => ({
    ...copy[i],
    slug,
    ...NEWS_METADATA[slug],
    href: `/site/news/${slug}`,
  })).filter((article) => Boolean(article.title))
}

export function findArticle(copy: SiteArticleCopy[], slug: string): SiteArticle | undefined {
  return buildArticles(copy).find((article) => article.slug === slug)
}

export function shouldShowNewsApply(category: NewsCategory): boolean {
  return category === 'recruit'
}
