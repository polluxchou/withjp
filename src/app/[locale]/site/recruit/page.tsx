import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { SiteRecruitRow } from '@/lib/site/content'
import SiteSection from '@/components/site/SiteSection'
import BlueprintFrame from '@/components/site/BlueprintFrame'
import ApplicationForm from '@/components/site/ApplicationForm'
import StudioMap, { type StudioMapLabels } from '@/components/site/StudioMap'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.recruit' })
  return { title: t('eyebrow') }
}

export default function SiteRecruitPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.recruit')
  const rows = t.raw('rows') as SiteRecruitRow[]
  const payCols = t.raw('payCols') as string[]
  const officeRows = t.raw('office.rows') as { label: string; value: string }[]

  return (
    <>
      <SiteSection divider={false} className="pb-0 lg:pb-0">
        <div className="font-condensed text-[12px] tracking-[0.3em] text-site-accent">{t('eyebrow')}</div>
        <h1 className="mt-3 font-serif-jp text-[clamp(24px,3.2vw,48px)] leading-[1.32]">
          {t('title1')}
          <br />
          {t('title2')}
        </h1>
      </SiteSection>

      <SiteSection divider={false} className="grid gap-10 pb-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-14 lg:pb-24">
        <div>
          <div className="border-t border-site-line-strong">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-2 border-b border-site-line py-5 lg:grid-cols-[180px_1fr] lg:gap-6"
              >
                <div className="font-condensed text-[15px] tracking-[0.16em] text-site-accent">
                  {row.label}
                </div>
                <p className="text-[15px] leading-[1.9]">{row.body}</p>
              </div>
            ))}
          </div>

          <BlueprintFrame className="mt-10 px-7 py-8">
            <div className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
              {t('payEyebrow')}
            </div>
            <div className="mb-3.5 mt-3 font-serif-jp text-[26px]">{t('payTitle')}</div>
            <div className="grid gap-7 sm:grid-cols-3">
              {payCols.map((col, i) => (
                <p key={i} className="text-[14px] leading-[1.95] text-site-fg/72">
                  {col}
                </p>
              ))}
            </div>
          </BlueprintFrame>
        </div>

        <ApplicationForm />
      </SiteSection>

      {/* ══ OFFICE ══ 左边规格表、右边示意图，共用一个蓝图框 */}
      <SiteSection divider={false} className="pt-0 lg:pt-0">
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
      </SiteSection>
    </>
  )
}
