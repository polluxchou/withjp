import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import ContactSection from '@/components/site/ContactSection'
import BlueprintFrame from '@/components/site/BlueprintFrame'
import StudioMap, { type StudioMapLabels } from '@/components/site/StudioMap'
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
  const officeRows = t.raw('office.rows') as { label: string; value: string }[]

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-10 lg:mb-14" />
      <div className="space-y-8 lg:space-y-10">
        {sections.map((section) => (
          <ContactSection key={section.id} section={section} />
        ))}

        {/* ══ OFFICE ══ 左边规格表、右边示意图，共用一个蓝图框。
            设计稿把它排在三块 CONTACT 之后、页尾之前 —— 它是「怎么找到我们」
            的收束，不属于 RECRUIT。 */}
        <BlueprintFrame className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="px-7 py-8 lg:px-9 lg:py-10">
            <div className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
              {t('office.eyebrow')}
            </div>
            <h2 className="mb-3 mt-3.5 font-serif-jp text-[26px] lg:text-[30px]">{t('office.title')}</h2>
            <p className="mb-6 text-[15px] leading-[2] text-site-fg/72">{t('office.body')}</p>
            <div className="grid gap-px border border-site-line bg-site-line">
              {officeRows.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-3.5 bg-site-panel px-5 py-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-baseline"
                >
                  <span className="font-condensed text-[13px] tracking-[0.16em] text-site-accent">
                    {row.label}
                  </span>
                  <span className="text-[14px]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <StudioMap labels={t.raw('office.map') as StudioMapLabels} />
        </BlueprintFrame>
      </div>
    </SiteSection>
  )
}
