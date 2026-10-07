export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import CompetitorTabs from '@/components/competitors/CompetitorTabs'
import CompetitorCompaniesView from '@/components/competitors/CompetitorCompaniesView'
import ErrorState from '@/components/ui/ErrorState'
import { authGuard } from '@/lib/auth/guard'
import { getCompanyBoard } from '@/lib/competitors/service'

export default async function CompetitorCompaniesPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)

  const user = await authGuard()
  if (user instanceof Response) redirect('/login')

  const [t, boardRes] = await Promise.all([
    getTranslations('competitorCompanies'),
    getCompanyBoard(),
  ])

  return (
    <div className="mx-auto max-w-5xl">
      <Header title={t('title')} subtitle={t('subtitle')} tabs={<CompetitorTabs active="companies" />} />
      <div className="mt-6">
        {boardRes.data ? <CompetitorCompaniesView board={boardRes.data} /> : <ErrorState />}
      </div>
    </div>
  )
}
