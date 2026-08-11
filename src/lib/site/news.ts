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

/** 每篇文章的主图。与 NEWS_SLUGS 同序。 */
const NEWS_IMAGES: Record<NewsSlug, string> = {
  'nightly-live-start': '/site/moondollz-group.webp',
  'moondollz-launch': '/site/moondollz-key.webp',
  'first-gen-audition': '/site/card-kano.webp',
  'osaka-studio-open': '/site/card-shino.webp',
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
    image: NEWS_IMAGES[slug],
    href: `/site/news/${slug}`,
  })).filter((article) => Boolean(article.title))
}

export function findArticle(copy: SiteArticleCopy[], slug: string): SiteArticle | undefined {
  return buildArticles(copy).find((article) => article.slug === slug)
}
