export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { authGuard } from '@/lib/auth/guard'
import { redirect } from 'next/navigation'
import { getOrgSnapshot } from '@/lib/org/service'
import Header from '@/components/layout/Header'
import EmptyState from '@/components/ui/EmptyState'
import OrgView from '@/components/org/OrgView'

export default async function OrgPage() {
  const user = await authGuard()
  if (user instanceof Response) redirect('/login')

  const [snapshotRes, t] = await Promise.all([
    getOrgSnapshot((user as { id: string }).id),
    getTranslations('team'),
  ])
  const snapshot = snapshotRes.data

  return (
    <div>
      <Header title={t('org.title')} subtitle={t('org.subtitle')} />
      {!snapshot ? (
        <EmptyState title={t('org.empty')} />
      ) : (
        <OrgView initial={snapshot} />
      )}
    </div>
  )
}
