export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import CompetitorTabs from '@/components/competitors/CompetitorTabs'
import CompetitorLiveView from '@/components/competitors/live/CompetitorLiveView'
import ErrorState from '@/components/ui/ErrorState'
import { authGuard } from '@/lib/auth/guard'
import { getCompanyOfCompetitor, getCompetitorBoard } from '@/lib/competitors/service'
import { zonedYmd } from '@/lib/time/zonedTime'

/** 页面级「今天」按日区业务日算（站内 shot_on 等日期列同一口径）。 */
const PAGE_ZONE = 'Asia/Tokyo'

export default async function CompetitorLivePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)

  const user = await authGuard()
  if (user instanceof Response) redirect('/login')

  const [t, boardRes, companyRes] = await Promise.all([
    getTranslations('competitors'),
    getCompetitorBoard((user as { id: string }).id),
    getCompanyOfCompetitor(),
  ])

  // 「今天」在服务端按请求时刻取好传下去：客户端组件若在渲染期读时钟，服务端（UTC）与浏览器
  // 可能算出不同的日期，默认月份一变整张月历水合不上。页面是 force-dynamic，每次请求都会重取。
  // zonedYmd 只在时刻非法时返回 null，Date.now() 不会。
  const today = zonedYmd(Date.now(), PAGE_ZONE) as string

  return (
    // max-w-7xl：月历一行 31 天、番组表一个号一列，都要横向空间（另两个 tab 是 max-w-5xl）。
    <div className="mx-auto max-w-7xl">
      <Header title={t('title')} subtitle={t('livePageSubtitle')} tabs={<CompetitorTabs active="live" />} />
      <div className="mt-6">
        {/* 公司归属拿不到时整页报错，不把所有号悄悄归进「未归属公会」冒充完整数据。 */}
        {boardRes.data && companyRes.data ? (
          <CompetitorLiveView board={boardRes.data} companyOf={companyRes.data} today={today} />
        ) : (
          <ErrorState />
        )}
      </div>
    </div>
  )
}
