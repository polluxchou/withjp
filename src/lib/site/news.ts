/**
 * NEWS 的文章模型。设计稿 v3 把 NEWS 从写死的三张卡换成数据驱动（列表 + 详情），
 * 这里定义「有哪几篇、各自配图是什么」；标题/导语/正文在
 * messages/{zh,en,ja}.json 的 site.news.articles[] 里，按下标一一对应。
 *
 * slug 是稳定的路由标识，不用日期也不用下标：日期会改、下标会因插入新文章而
 * 整体位移，两者都会让已经发出去的链接失效。
 */
// 真实新闻（2026-07-21 起），按发生时间倒序——首页 LATEST 取数组前 3 个，
// NEWS 列表页不做二次排序，顺序完全由这个数组决定。
export const NEWS_SLUGS = [
  'mc-character-tech-partnership',
  'operations-partner-announced',
  'first-recruitment-round',
  'echoamp-launch',
  'moondollz-launch',
] as const

export type NewsSlug = (typeof NEWS_SLUGS)[number]

/**
 * 每篇文章的主图，与 NEWS_SLUGS 同序。Partial 而不是 Record：还有条目没配图，
 * 留空即可——SiteImage 对缺图有专门的占位框，不用拿别的页面的图来顶替。
 *
 * mc-character-tech-partnership 用的是一张 3×3 表情参考图（喜怒哀楽…），
 * 竖版九宫格。文章详情页的图位是横版通栏盒子，SiteImage 默认居中裁切
 * （object-position: center）——九宫格总高恰好三等分，居中裁切后视口稳定落在
 * 中间一行（楽しさ／むくれる／驚き），首尾两行（含最下一格的敏感向词条）
 * 都在裁切区外，任何断点下都不会露出来，不用手工再抠一张单独的图。
 */
const NEWS_IMAGES: Partial<Record<NewsSlug, string>> = {
  'mc-character-tech-partnership': '/site/mc-character-expressions.webp',
  'operations-partner-announced': '/site/operations-partner-lockup.webp',
  'first-recruitment-round': '/site/shin-osaka-station.webp',
  'echoamp-launch': '/site/moondollz-silhouettes.webp',
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
  image?: string
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
