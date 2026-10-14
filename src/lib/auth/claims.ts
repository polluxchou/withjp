import type { JwtPayload, UserMetadata } from '@supabase/supabase-js'

// authGuard() 调用方实际读到的用户字段（全仓盘点：id 之外只有 /api/profile
// 读 email 与 user_metadata.name）。这三项都直接来自 access token 的 JWT
// claims，是签发/刷新那一刻的快照，不是 getUser() 那样从 Auth 服务器现取。
export type AuthedUser = {
  id: string
  email?: string
  user_metadata?: UserMetadata
}

export function authedUserFromClaims(claims: JwtPayload | null | undefined): AuthedUser | null {
  if (!claims?.sub) return null
  return { id: claims.sub, email: claims.email, user_metadata: claims.user_metadata }
}
