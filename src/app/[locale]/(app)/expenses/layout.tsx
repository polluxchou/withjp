export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Lock } from 'lucide-react'
import Header from '@/components/layout/Header'
import EmptyState from '@/components/ui/EmptyState'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { getActorProfile } from '@/lib/auth/actor'
import { canAccessExpenses } from '@/lib/expenses/access'

/**
 * 支出管理仅管理员可访问（判据见 src/lib/expenses/access.ts）。page.tsx 是
 * 客户端组件，没法在服务端拦，所以拦截放在这一层 layout：非管理员拿到的是
 * 一张说明卡，page.tsx 根本不渲染，也就不会去打 /api/expenses。
 */
export default async function ExpensesLayout(props: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const params = await props.params
  const { children } = props
  setRequestLocale(params.locale)

  const auth = await createAuthServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  if (!canAccessExpenses(await getActorProfile(user.id))) {
    const t = await getTranslations('expenses')
    return (
      <div>
        <Header title={t('title')} />
        <EmptyState icon={<Lock strokeWidth={1.5} />} title={t('adminOnlyTitle')} hint={t('adminOnlyHint')} />
      </div>
    )
  }

  return <>{children}</>
}
