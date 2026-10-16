import { cache } from 'react'
import { redirect } from 'next/navigation'
import { authGuard } from '@/lib/auth/guard'
import { createPageSessionGuard } from '@/lib/auth/page-session'

// 同一次请求里 layout 和 page 都会调，cache 让 getClaims 只跑一次。
const sessionUser = cache(async () => {
  const user = await authGuard()
  return user instanceof Response ? null : user
})

// 后台服务端组件用：没登录就跳 /<locale>/login，登录了返回当前用户。
// 为什么 layout 与 page 都要调，见 page-session.ts。
export const requirePageUser = createPageSessionGuard({ getUser: sessionUser, redirect })
