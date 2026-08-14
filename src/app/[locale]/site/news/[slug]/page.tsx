import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { locales } from '@/i18n/routing'
import { createServerClient } from '@/lib/supabase/server'
import { RECRUIT_HREF, SITE_BASE } from '@/lib/site/nav'
import { buildArticle, isNewsSlug, shouldShowNewsApply, type SiteArticle, type SiteNewsRow } from '@/lib/site/news'
import SiteSection from '@/components/site/SiteSection'
import SiteImage from '@/components/site/SiteImage'
import SiteButton from '@/components/site/SiteButton'

const NEWS_COLUMNS =
  'slug, tag, category, published_on, is_pinned, is_published, image_url, title_ja, title_zh, title_en, lead_ja, lead_zh, lead_en, body_ja, body_zh, body_en'

// 内容来自 site_news 表（Task 10 起）：无限期缓存，只经由后台写接口的
// revalidatePath 按需失效（news-service.ts 的 revalidateNewsPages），这里不
// 重复实现失效逻辑。
export const revalidate = false

// 下架文章的详情页必须 404，而不是旧链接还能打开——所以「已发布」是查询本身的
// 一部分（`is_published = true`），不是在拿到行之后再用应用层逻辑挑一次。
async function fetchPublishedArticle(locale: Locale, slug: string): Promise<SiteArticle | undefined> {
  const db = createServerClient()
  const { data, error } = await db
    .from('site_news')
    .select(NEWS_COLUMNS)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (error || !data) return undefined
  return buildArticle(locale, data as SiteNewsRow)
}

export async function generateStaticParams() {
  try {
    const db = createServerClient()
    const { data, error } = await db.from('site_news').select('slug').eq('is_published', true)
    if (error) throw error
    const slugs = (data ?? []).map((row: { slug: string }) => row.slug)
    return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })))
  } catch (error) {
    // 构建期查不到库不应该拖垮整站构建——退化成「不预生成任何一篇」，请求时
    // 仍会走下面的动态渲染路径（dynamicParams 默认 true），只是失去了预渲染的
    // 首字节速度。真正的失败信号是这条 warn，不是让 next build 直接崩掉。
    console.warn('[site/news/[slug]] generateStaticParams failed to reach site_news, falling back to dynamic rendering', error)
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  if (!isNewsSlug(params.slug)) return {}
  const article = await fetchPublishedArticle(params.locale as Locale, params.slug)
  if (!article) return {}
  return { title: article.title, description: article.lead }
}

export default async function SiteArticlePage({ params }: { params: { locale: string; slug: string } }) {
  setRequestLocale(params.locale)

  // 路由参数来自 URL，先过形状白名单再查库：形状不对的直接 404，不用拿它去查库
  if (!isNewsSlug(params.slug)) notFound()
  const article = await fetchPublishedArticle(params.locale as Locale, params.slug)
  if (!article) notFound()

  const t = await getTranslations('site.news')

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <Link
        href={`${SITE_BASE}/news`}
        className="font-condensed text-[14px] tracking-[0.16em] text-site-accent transition-colors hover:text-site-fg"
      >
        {t('back')}
      </Link>

      <div className="mt-7 flex items-center gap-3">
        <span className="font-condensed text-[15px] tracking-[0.1em] text-site-fg/60">{article.date}</span>
        <span className="border border-site-accent px-2 py-0.5 font-condensed text-[11px] tracking-[0.14em] text-site-accent">
          {article.tag}
        </span>
      </div>

      <h1 className="mt-3 max-w-[900px] font-serif-jp text-[clamp(24px,3vw,40px)] leading-[1.4]">
        {article.title}
      </h1>

      <div className="relative mt-9 h-[220px] sm:h-[320px] lg:h-[420px]">
        <SiteImage
          src={article.image}
          alt={article.title}
          placeholder={t('imagePlaceholder')}
          priority
          sizes="(min-width: 1024px) 1300px, 100vw"
          className="h-full w-full"
        />
      </div>

      <div className="mt-9 max-w-[760px]">
        <p className="font-serif-jp text-[18px] leading-[1.9] text-site-fg/78">{article.lead}</p>
        {article.body.map((paragraph, i) => (
          <p key={i} className="mt-6 text-[15px] leading-[2] text-site-fg/72">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-3.5">
        {shouldShowNewsApply(article.category) && (
          <SiteButton href={RECRUIT_HREF} variant="hot" size="md">
            {t('applyCta')}
          </SiteButton>
        )}
        <SiteButton href={`${SITE_BASE}/news`} variant="ghost" size="md">
          {t('backCta')}
        </SiteButton>
      </div>
    </SiteSection>
  )
}
