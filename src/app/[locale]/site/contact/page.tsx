import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import ContactSection from '@/components/site/ContactSection'
import { buildContactSections, type SiteContactSectionCopy } from '@/lib/site/contact'

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
  const sections = buildContactSections(t.raw('sections') as SiteContactSectionCopy[])

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-10 lg:mb-14" />
      <div className="space-y-8 lg:space-y-10">
        {sections.map((section) => (
          <ContactSection key={section.id} section={section} />
        ))}
      </div>
    </SiteSection>
  )
}
