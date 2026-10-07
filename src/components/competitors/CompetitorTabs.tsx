// src/components/competitors/CompetitorTabs.tsx
'use client'

import { useTranslations } from 'next-intl'
import Tabs from '@/components/ui/Tabs'
// next-intl 的 useRouter 会自动带上 locale 前缀（同 tasks/page.tsx）。
import { useRouter } from '@/i18n/navigation'

export type CompetitorTab = 'accounts' | 'companies'

const HREF: Record<CompetitorTab, string> = {
  accounts: '/competitors',
  companies: '/competitors/companies',
}

/** 竞品监测的两个视图：团播账号（原看板）/ 竞品公司。两者是独立路由，tab 只负责跳转。 */
export default function CompetitorTabs({ active }: { active: CompetitorTab }) {
  const t = useTranslations('competitors')
  const router = useRouter()
  return (
    <Tabs
      label={t('tabsLabel')}
      value={active}
      items={[
        { value: 'accounts', label: t('tabAccounts') },
        { value: 'companies', label: t('tabCompanies') },
      ]}
      onChange={(v) => {
        if (v !== active) router.push(HREF[v as CompetitorTab])
      }}
    />
  )
}
