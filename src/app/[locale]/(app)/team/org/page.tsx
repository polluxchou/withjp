export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { authGuard } from '@/lib/auth/guard'
import { redirect } from 'next/navigation'
import { getOrgSnapshot } from '@/lib/org/service'
import Header from '@/components/layout/Header'
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
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-400">
          {t('org.empty')}
        </div>
      ) : (
        <OrgView initial={snapshot} />
      )}
    </div>
  )
}
