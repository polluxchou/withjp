// 受限帐号的访问范围（access scope）。
//
// 后台原本只有两级：登录与 users.is_admin。外部协作者（例如只帮忙录竞品数据的人）
// 要第三种：只能进竞品监测，且只能新增、编辑自己建的内容，不能删除。
//
// 范围存在 Supabase Auth 的 app_metadata.access_scope：只有 service role 能写，
// 用户自己改不了（user_metadata 才是用户可写的），而且会签进 access token 的
// JWT claims，守卫不用额外查库就能判。没有这个字段 = 普通成员，行为不变。
//
// 失败从严：access_scope 是任何非空值都算受限；不认识的值没有放行区域，等于全拒。
//
// 本文件不 import next/*，node --test 直接跑。

export const COMPETITORS_SCOPE = 'competitors'
export type AccessArea = typeof COMPETITORS_SCOPE

export function accessScopeOf(appMetadata: unknown): string | null {
  if (!appMetadata || typeof appMetadata !== 'object') return null
  const raw = (appMetadata as { access_scope?: unknown }).access_scope
  if (raw === undefined || raw === null || raw === '') return null
  return typeof raw === 'string' ? raw : String(raw)
}

// scope 为 null（普通成员）处处放行；受限帐号只在 allow 恰好是它的范围时放行。
export function scopeAllows(scope: string | null, allow: AccessArea | undefined): boolean {
  if (scope === null) return true
  return allow !== undefined && scope === allow
}

// 后台页面路径（已去掉语言前缀）是否在受限帐号的范围内。
export function pageAllowedForScope(scope: string | null, pathnameWithoutLocale: string): boolean {
  if (scope === null) return true
  if (scope !== COMPETITORS_SCOPE) return false
  return pathnameWithoutLocale === '/competitors' || pathnameWithoutLocale.startsWith('/competitors/')
}

export function scopedHomePath(locale: string): string {
  return `/${locale}/competitors`
}

// 受限帐号对已有记录的写操作：不能删；只能改 owner 是自己的。owner 为空（历史行、
// 自动巡检写的）也不能改。普通成员不受这里约束（沿用原有规则）。
export function scopedWriteAllowed(
  actor: { id: string; access_scope: string | null },
  op: 'update' | 'delete',
  ownerId: string | null,
): boolean {
  if (actor.access_scope === null) return true
  if (op === 'delete') return false
  return ownerId !== null && ownerId === actor.id
}
