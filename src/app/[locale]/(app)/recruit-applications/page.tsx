export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import { Stat, StatBand } from '@/components/ui/Stat'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'

// 对外官网 RECRUIT 表单的投递。只读：本轮不做状态流转（那是后续需求），
// 这一页存在的意义是让投递不至于躺在库里没人看见。
type ApplicationRow = {
  id: string
  name: string
  age: number
  residence: string
  contact: string
  experience: string | null
  locale: string
  status: string
  created_at: string
}

async function getApplications(): Promise<ApplicationRow[]> {
  const db = createServerClient()
  const { data } = await db
    .from('site_applications')
    .select('id, name, age, residence, contact, experience, locale, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as ApplicationRow[]
}

export default async function RecruitApplicationsPage() {
  const [applications, t] = await Promise.all([
    getApplications(),
    getTranslations('recruitApplications'),
  ])

  const newCount = applications.filter((a) => a.status === 'new').length
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = applications.filter((a) => a.created_at.slice(0, 10) === today).length

  return (
    <div>
      <Header title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-6">
        <StatBand>
          <Stat label={t('totalLabel')} value={applications.length} />
          <Stat label={t('newLabel')} value={newCount} />
          <Stat label={t('todayLabel')} value={todayCount} />
        </StatBand>
      </div>

      {applications.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <SectionCard title={t('listTitle')}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-500">
                  <th className="py-2 pr-4 font-medium">{t('columns.date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.name')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.age')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.residence')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.contact')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.locale')}</th>
                  <th className="py-2 pr-4 font-medium">{t('columns.experience')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id} className="border-b border-line-soft align-top">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-ink-500">
                      {application.created_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 pr-4 font-medium text-ink-900">{application.name}</td>
                    <td className="py-3 pr-4 font-mono text-ink-700">{application.age}</td>
                    <td className="py-3 pr-4 text-ink-700">{application.residence}</td>
                    <td className="py-3 pr-4 text-ink-700">{application.contact}</td>
                    <td className="py-3 pr-4">
                      <Tag label={application.locale.toUpperCase()} tone="neutral" size="sm" />
                    </td>
                    <td className="max-w-[26rem] py-3 pr-4 text-ink-500">
                      {application.experience ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
