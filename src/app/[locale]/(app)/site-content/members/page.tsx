export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { getActorProfile } from '@/lib/auth/actor'
import MembersAdminView from '@/components/site-content/MembersAdminView'

/**
 * 官网内容 · 成员管理。GET 列表对所有登录用户可见（authGuard 已经在 API 层
 * 保证），这里只用 getActorProfile 拿 is_admin 来决定要不要渲染写操作控件——
 * 与 API 侧 canEditSiteContent 用的是同一份 actor 数据，避免两处判据漂移。
 * 结构照抄 Task 9 的 site-content/news/page.tsx。
 */
export default async function SiteContentMembersPage({
  params,
}: {
  params: { locale: string }
}) {
  setRequestLocale(params.locale)

  const auth = await createAuthServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const actor = await getActorProfile(user.id)
  if (!actor) redirect('/login')

  return <MembersAdminView isAdmin={actor.is_admin} />
}
