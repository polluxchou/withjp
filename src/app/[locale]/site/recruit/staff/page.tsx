import { use } from 'react'
import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { siteAlternates } from '@/lib/site/seo'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import StaffApplicationForm from '@/components/site/StaffApplicationForm'
import { createAutoLinker } from '@/lib/site/autoLink'

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const params = await props.params
  const t = await getTranslations({ locale: params.locale, namespace: 'site.recruitStaff' })
  return { title: t('eyebrow'), alternates: siteAlternates(params.locale, '/recruit/staff') }
}

export default function SiteRecruitStaffPage(props: { params: Promise<{ locale: string }> }) {
  const params = use(props.params)
  setRequestLocale(params.locale)
  const t = useTranslations('site.recruitStaff')
  const autoLink = createAutoLinker()

  return (
    <>
      <SiteSection divider={false} className="pb-0 lg:pb-0">
        <SectionHead
          eyebrow={t('eyebrow')}
          title={t('title')}
          titleFont="serif"
          size="page"
          sub={autoLink(t('lead'))}
        />
      </SiteSection>

      <SiteSection divider={false} className="pb-20 lg:pb-24">
        <div className="mx-auto max-w-[560px]">
          <StaffApplicationForm />
        </div>
      </SiteSection>
    </>
  )
}
