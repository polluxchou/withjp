import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { RECRUIT_HREF, SITE_BASE } from '@/lib/site/nav'
import { findArticle, isNewsSlug, NEWS_SLUGS, shouldShowNewsApply, type SiteArticleCopy } from '@/lib/site/news'
import { locales } from '@/i18n/routing'
import SiteSection from '@/components/site/SiteSection'
import SiteImage from '@/components/site/SiteImage'
import SiteButton from '@/components/site/SiteButton'

export function generateStaticParams() {
  return locales.flatMap((locale) => NEWS_SLUGS.map((slug) => ({ locale, slug })))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.news' })
  const article = findArticle(t.raw('articles') as SiteArticleCopy[], params.slug)
  if (!article) return {}
  return { title: article.title, description: article.lead }
}

export default function SiteArticlePage({ params }: { params: { locale: string; slug: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.news')

  // 路由参数来自 URL，先过白名单再查文案：未知 slug 直接 404，不去渲染半空的文章
  if (!isNewsSlug(params.slug)) notFound()
  const article = findArticle(t.raw('articles') as SiteArticleCopy[], params.slug)
  if (!article) notFound()

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
