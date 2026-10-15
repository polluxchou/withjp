import { NextResponse } from 'next/server'
import { getActorProfile } from '@/lib/auth/actor'
import { createAdminGate } from '@/lib/auth/admin-gate'

// 用法（紧跟在鉴权的 401 早退之后，读库之前）：
//   const denied = await forbidUnlessAdmin(user.id)
//   if (denied) return denied
export const forbidUnlessAdmin = createAdminGate({
  getActorProfile,
  respond: (body, init) => NextResponse.json(body, init),
})
