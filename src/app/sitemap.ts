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
