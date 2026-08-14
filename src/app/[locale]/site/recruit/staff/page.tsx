import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import StaffApplicationForm from '@/components/site/StaffApplicationForm'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.recruitStaff' })
  return { title: t('eyebrow') }
}

export default function SiteRecruitStaffPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.recruitStaff')

  return (
    <>
      <SiteSection divider={false} className="pb-0 lg:pb-0">
        <SectionHead
          eyebrow={t('eyebrow')}
          title={t('title')}
          titleFont="serif"
          size="page"
          sub={t('lead')}
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
