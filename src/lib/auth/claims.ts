import type { JwtPayload, User, UserMetadata } from '@supabase/supabase-js'
import { accessScopeOf } from './access-scope.ts'

// authGuard() 调用方实际读到的用户字段（全仓盘点：id 之外只有 /api/profile
// 读 email 与 user_metadata.name）。这三项都直接来自 access token 的 JWT
// claims，是签发/刷新那一刻的快照，不是 getUser() 那样从 Auth 服务器现取。
// access_scope 取自 app_metadata（只有 service role 能写），null = 普通成员，
// 见 access-scope.ts。
export type AuthedUser = {
  id: string
  email?: string
  user_metadata?: UserMetadata
  access_scope: string | null
}

export function authedUserFromClaims(claims: JwtPayload | null | undefined): AuthedUser | null {
  if (!claims?.sub) return null
  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata,
    access_scope: accessScopeOf(claims.app_metadata),
  }
}

// authGuardStrict() 用：getUser() 现取的用户收窄成同一形状，调用方不用区分
// 自己走的是哪个守卫。
export function authedUserFromUser(
  user: (Pick<User, 'id' | 'email' | 'user_metadata'> & { app_metadata?: unknown }) | null | undefined
): AuthedUser | null {
  if (!user?.id) return null
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
    access_scope: accessScopeOf(user.app_metadata),
  }
}
