import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { buildArticles, type SiteArticleCopy } from '@/lib/site/news'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import NewsFilter from '@/components/site/NewsFilter'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.news' })
  return { title: t('title') }
}

export default function SiteNewsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.news')
  const articles = buildArticles(t.raw('articles') as SiteArticleCopy[])
  const filters = t.raw('filters') as string[]

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-9" />
      <NewsFilter filters={filters} articles={articles} emptyLabel={t('empty')} />
    </SiteSection>
  )
}
