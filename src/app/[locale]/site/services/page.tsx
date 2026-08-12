import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { SiteServiceItem, SiteSubItem } from '@/lib/site/content'
import { buildServiceMedia } from '@/lib/site/services'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import SiteImage from '@/components/site/SiteImage'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.services' })
  return { title: t('title') }
}

export default function SiteServicesPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.services')
  const items = t.raw('items') as SiteServiceItem[]
  const subItems = t.raw('subItems') as SiteSubItem[]
  const placeholders = t.raw('placeholders') as string[]
  const mediaItems = buildServiceMedia(placeholders)

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-10" />

      {/* 四条事业：编号 / 名称 / 说明 三栏，窄屏折成单栏 */}
      <div className="grid gap-px border border-site-line bg-site-line">
        {items.map((item) => (
          <div
            key={item.code}
            className="grid gap-6 bg-site-canvas px-7 py-10 lg:grid-cols-[100px_1fr_1.1fr] lg:gap-10 lg:px-9 lg:py-11"
          >
            <div
              className={`font-condensed text-[44px] leading-none ${
                item.code === 'S-04' ? 'text-site-hot' : 'text-site-accent'
              }`}
            >
              {item.no}
            </div>
            <div>
              <div className="mb-1.5 font-serif-jp text-[26px] lg:text-[30px]">{item.title}</div>
              <div className="font-condensed text-[14px] tracking-[0.2em] text-site-fg/50">{item.en}</div>
            </div>
            <p className="text-[15px] leading-[2] text-site-fg/72">{item.body}</p>
          </div>
        ))}
      </div>

      {/* 04 的三个子能力，紧贴上表（共用一条边） */}
      <div className="grid gap-px border border-site-line border-t-transparent bg-site-line sm:grid-cols-2 lg:grid-cols-3">
        {subItems.map((sub) => (
          <div key={sub.no} className="bg-site-panel px-7 py-8">
            <div className="font-condensed text-[13px] tracking-[0.2em] text-site-hot">{sub.no}</div>
            <div className="mb-2.5 mt-3 font-serif-jp text-[23px]">{sub.title}</div>
            <p className="text-[14px] leading-[1.9] text-site-fg/68">{sub.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {mediaItems.map((media) => (
          <div key={media.src} className="relative h-[240px] lg:h-[340px]">
            <SiteImage
              src={media.src}
              alt={media.alt}
              placeholder={media.alt}
              sizes="(min-width: 640px) 50vw, 100vw"
              className="h-full w-full"
            />
          </div>
        ))}
      </div>
    </SiteSection>
  )
}
