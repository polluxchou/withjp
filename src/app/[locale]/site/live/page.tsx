import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { SiteScheduleRow } from '@/lib/site/content'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import ScheduleTable from '@/components/site/ScheduleTable'
import BlueprintFrame from '@/components/site/BlueprintFrame'
import SiteImage from '@/components/site/SiteImage'
import PulseDot from '@/components/site/PulseDot'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.live' })
  return { title: t('title') }
}

export default function SiteLivePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.live')
  const schedule = t.raw('schedule') as SiteScheduleRow[]
  const headers = t.raw('headers') as { day: string; program: string; focus: string; time: string }

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" />
      <p className="mb-10 mt-2 max-w-[660px] text-[16px] leading-[1.95] text-site-fg/75">{t('lead')}</p>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <ScheduleTable rows={schedule} headers={headers} />

        <BlueprintFrame className="px-7 py-8">
          <div className="mb-[18px] flex items-center gap-2.5">
            <PulseDot size={8} />
            <span className="font-condensed text-[13px] tracking-[0.22em] text-site-accent">
              {t('onAirLabel')}
            </span>
          </div>
          {/* 图位按图本身的竖构图给比例，不再是占位期的 h-[300px] 横盒子 ——
              竖屏合照塞进横盒子会被 object-cover 裁成中间一条，脸全在框外。
              max-w 是必要的：撑满卡片宽度时这张 9:16 会算出 778px 高，ON AIR 卡
              比左边排期表高出近 400px；截到 288px 后两列落在 567 / 658，同时更像
              一块竖屏直播画面。duotone 一并摘掉，同首页 05 TECHNOLOGY 那次(PR 198)：
              真实照片压青色会吃掉妆造和服装的颜色。 */}
          <div className="relative mx-auto mb-5 aspect-[1080/1768] w-full max-w-[288px] border border-site-line-strong">
            <SiteImage
              src="/site/live-onair-group.webp"
              alt={t('onAirAlt')}
              placeholder={t('onAirPlaceholder')}
              sizes="288px"
              className="h-full w-full"
            />
          </div>
          <div className="font-serif-jp text-[20px]">{t('onAirProgram')}</div>
          <div className="mt-1.5 text-[14px] text-site-fg/60">{t('onAirTime')}</div>
        </BlueprintFrame>
      </div>
    </SiteSection>
  )
}
