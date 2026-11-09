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

// 匿名登录（signInAnonymously）签出来的会话：令牌一样是 role=authenticated、
// 带 sub，只多一个 is_anonymous: true。后台只给公司成员用，匿名会话一律当没登录。
// 这个字段由 Auth 服务器签进令牌、用户改不了，本地验签后直接读，不多打网络。
// 失败从严：只有「没这个字段」（早期签发的令牌）或字面 false 才算真实帐号。
export function isAnonymousSession(flag: unknown): boolean {
  return flag !== undefined && flag !== null && flag !== false
}

export function authedUserFromClaims(claims: JwtPayload | null | undefined): AuthedUser | null {
  if (!claims?.sub || isAnonymousSession(claims.is_anonymous)) return null
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
  user:
    | (Pick<User, 'id' | 'email' | 'user_metadata'> & { app_metadata?: unknown; is_anonymous?: unknown })
    | null
    | undefined
): AuthedUser | null {
  if (!user?.id || isAnonymousSession(user.is_anonymous)) return null
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
    access_scope: accessScopeOf(user.app_metadata),
  }
}
