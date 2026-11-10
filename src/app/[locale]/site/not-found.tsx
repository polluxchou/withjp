import { useTranslations } from 'next-intl'
import { SITE_BASE } from '@/lib/site/nav'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import SiteButton from '@/components/site/SiteButton'

export default function SiteNotFound() {
  const t = useTranslations('site.notFound')
  return (
    <SiteSection divider={false} className="min-h-[52vh]">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} titleFont="serif" />
      <p className="mt-6 max-w-[560px] text-site-fg/70">{t('body')}</p>
      <div className="mt-10">
        <SiteButton href={SITE_BASE} variant="ghost" size="md">
          {t('home')}
        </SiteButton>
      </div>
    </SiteSection>
  )
}
