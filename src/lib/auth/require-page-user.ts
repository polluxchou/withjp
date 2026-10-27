import { cache } from 'react'
import { redirect } from 'next/navigation'
import { authGuard } from '@/lib/auth/guard'
import { createPageSessionGuard } from '@/lib/auth/page-session'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'

// 同一次请求里 layout 和 page 都会调，cache 让 getClaims 只跑一次。
// 这里只取会话、不判范围：受限帐号要原样交给 requirePageUser 去判（放行或送回
// 竞品首页）。不带 allowScope 的话 authGuard 会先回 403，受限帐号就被当成没登录、
// 在竞品页也被弹去登录页。
const sessionUser = cache(async () => {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  return user instanceof Response ? null : user
})

// 后台服务端组件用：没登录就跳 /<locale>/login，登录了返回当前用户。
// 为什么 layout 与 page 都要调，见 page-session.ts。
export const requirePageUser = createPageSessionGuard({ getUser: sessionUser, redirect })
