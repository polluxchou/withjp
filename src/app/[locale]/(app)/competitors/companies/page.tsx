export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Header from '@/components/layout/Header'
import CompetitorTabs from '@/components/competitors/CompetitorTabs'
import CompetitorCompaniesView from '@/components/competitors/CompetitorCompaniesView'
import ErrorState from '@/components/ui/ErrorState'
import { authGuard } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import { getCompanyBoard } from '@/lib/competitors/service'

export default async function CompetitorCompaniesPage(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params
  setRequestLocale(params.locale)

  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
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
