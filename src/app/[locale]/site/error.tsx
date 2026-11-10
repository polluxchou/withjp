'use client'
import { useTranslations } from 'next-intl'
import { SITE_BASE } from '@/lib/site/nav'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import SiteButton from '@/components/site/SiteButton'
import { useReportBoundaryError } from '@/lib/observability/useReportBoundaryError'

// 官网页面渲染出错时的兜底：顶栏与页脚还在，内容区换成这一段。
// 对访客只给通用说明，不出报错原文，也不出 digest（那是给内部对日志用的）。
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations('site.errorPage')
  useReportBoundaryError('site', error)

  return (
    <SiteSection divider={false} className="min-h-[52vh]">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} titleFont="serif" />
      <p role="alert" className="mt-6 max-w-[560px] text-site-fg/70">{t('body')}</p>
      <div className="mt-10 flex flex-wrap gap-4">
        <SiteButton variant="hot" size="md" onClick={retry}>
          {t('retry')}
        </SiteButton>
        <SiteButton href={SITE_BASE} variant="ghost" size="md">
          {t('home')}
        </SiteButton>
      </div>
    </SiteSection>
  )
}
