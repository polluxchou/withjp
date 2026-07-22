export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import CompetitorMonitoringView from '@/components/competitors/CompetitorMonitoringView'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard } from '@/lib/competitors/service'
import type { CompetitorBoard } from '@/lib/competitors/types'

export default async function CompetitorsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)

  const user = await authGuard()
  if (user instanceof Response) redirect('/login')

  const [t, boardRes] = await Promise.all([
    getTranslations('competitors'),
    getCompetitorBoard((user as { id: string }).id),
  ])

  const board: CompetitorBoard = boardRes.data ?? { competitors: [], canEdit: false }

  return (
    <div className="mx-auto max-w-5xl">
      <Header title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-6">
        <CompetitorMonitoringView initial={board} />
      </div>
    </div>
  )
}
