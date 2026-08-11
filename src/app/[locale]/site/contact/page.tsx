import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RECRUIT_HREF } from '@/lib/site/nav'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import BlueprintFrame from '@/components/site/BlueprintFrame'
import SiteButton from '@/components/site/SiteButton'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.contact' })
  return { title: t('title') }
}

export default function SiteContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.contact')

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-10" />

      <div className="grid gap-7 lg:grid-cols-2">
        <BlueprintFrame className="px-8 py-10 lg:px-[38px] lg:py-11">
          <div className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
            {t('creator.eyebrow')}
          </div>
          <div className="mb-3 mt-3.5 font-serif-jp text-[28px] lg:text-[32px]">{t('creator.title')}</div>
          <p className="mb-7 text-[15px] leading-[2] text-site-fg/72">{t('creator.body')}</p>
          <SiteButton href={RECRUIT_HREF} variant="hot" size="md">
            {t('creator.cta')}
          </SiteButton>
        </BlueprintFrame>

        <BlueprintFrame className="px-8 py-10 lg:px-[38px] lg:py-11">
          <div className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
            {t('client.eyebrow')}
          </div>
          <div className="mb-3 mt-3.5 font-serif-jp text-[28px] lg:text-[32px]">{t('client.title')}</div>
          <p className="mb-7 text-[15px] leading-[2] text-site-fg/72">{t('client.body')}</p>
          <SiteButton href={`mailto:${t('client.cta')}`} variant="ghost" size="md">
            {t('client.cta')}
          </SiteButton>
        </BlueprintFrame>
      </div>
    </SiteSection>
  )
}
