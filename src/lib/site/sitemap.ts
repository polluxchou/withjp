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
