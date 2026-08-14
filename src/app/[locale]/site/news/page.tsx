import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { createServerClient } from '@/lib/supabase/server'
import { articlesFromListQuery, NEWS_COLUMNS, type SiteArticle } from '@/lib/site/news'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import NewsFilter from '@/components/site/NewsFilter'

// 内容来自 site_news 表（Task 10 起），不再是构建时写死的静态文案，所以这个页面
// 靠 ISR 缓存：`revalidate = false` 表示无限期缓存、只经由后台写接口的
// revalidatePath 按需失效（src/lib/site/news-service.ts 的 revalidateNewsPages），
// 这里不重复实现失效逻辑。
export const revalidate = false

// 查询失败时不抛错——之前的实现会让整个 NEWS 列表页 500，这与「数据库故障不影响
// 官网可读」的口径（docs/public-site.md §2.4）相悖。降级为空列表（NewsFilter 的
// emptyLabel 会顶上），真实故障通过 console.error 留痕，避免和"目前确实没有已
// 发布文章"混为一谈。
async function fetchPublishedArticles(locale: Locale): Promise<SiteArticle[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('site_news')
    .select(NEWS_COLUMNS)
    .eq('is_published', true)

  const articles = articlesFromListQuery(locale, { data, error }, (queryError) => {
    console.error('[site/news] site_news query failed, degrading to empty list', queryError)
  })

  // 查询本身成功（error 是 null）但一行已发布新闻都没查到——onQueryError 不会
  // 触发。这个状态本身很可疑：迁移建好表之后，scripts/seed-site-content.mjs
  // 是唯一的写入口，漏跑这一步会让 NEWS 列表页无声退化成"暂无内容"，且不会
  // 让 CI 或构建日志留下任何信号。
  if (!error && articles.length === 0) {
    console.warn(
      '[site/news] BUILD-TIME/RUNTIME DEGRADATION: site_news query succeeded but returned 0 published rows — ' +
        'this usually means the one-time content migration (scripts/seed-site-content.mjs) has not been run ' +
        'against this database yet, not that there is genuinely no news. See docs/public-site.md §5 before ' +
        'assuming this is expected.',
    )
  }

  return articles
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.news' })
  return { title: t('title') }
}

export default async function SiteNewsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const articles = await fetchPublishedArticles(params.locale as Locale)

  const t = await getTranslations('site.news')
  const filters = t.raw('filters') as string[]

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-9" />
      <NewsFilter filters={filters} articles={articles} emptyLabel={t('empty')} />
    </SiteSection>
  )
}
