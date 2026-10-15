// 管理员专属接口的判定：薪资、全局规则配置（config）、Agent 定义的写操作。
//
// 后台权限只有两级：登录（authGuard）与 users.is_admin。这里只认 is_admin、
// 不认 role——role 是部门标签，用户能在 /api/profile 自选，新建档默认 ops
// （同 site-content.ts 的理由）。服务端用 service role key 绕过 RLS，API 层
// 是唯一防线。
//
// 本文件不 import 'next/server'，node --test 直接跑它；绑定真实依赖只有
// require-admin.ts 里的一处。

export interface AdminActor {
  is_admin: boolean
}

export const FORBIDDEN_BODY = { data: null, error: 'Forbidden' } as const

export function isAdmin(actor: AdminActor | null | undefined): boolean {
  return actor?.is_admin === true
}

export interface AdminGateDeps<R> {
  getActorProfile: (userId: string) => Promise<AdminActor | null>
  respond: (body: typeof FORBIDDEN_BODY, init: { status: 403 }) => R
}

// 紧跟在 authGuard() 的 401 早退之后调用：管理员返回 null（放行），其余返回
// 403 响应。查不到 profile 行也按拒绝处理，不放行。
export function createAdminGate<R>(deps: AdminGateDeps<R>) {
  return async function forbidUnlessAdmin(userId: string): Promise<R | null> {
    const actor = await deps.getActorProfile(userId)
    return isAdmin(actor) ? null : deps.respond(FORBIDDEN_BODY, { status: 403 })
  }
}

// GET /api/user-salary 的读取范围：管理员看全部，可按 user_id 筛；其他人只能读
// 自己的记录——不带 user_id 时收窄到本人，指名要别人的返回 403。
export type SalaryReadScope = { ok: true; userId: string | null } | { ok: false }

export function salaryReadScope(
  actor: AdminActor | null,
  requesterId: string,
  requestedUserId: string | null,
): SalaryReadScope {
  const requested = requestedUserId || null
  if (isAdmin(actor)) return { ok: true, userId: requested }
  if (requested && requested !== requesterId) return { ok: false }
  return { ok: true, userId: requesterId }
}

// 前端写请求失败时给用户看的文案：403 换成「仅管理员可以执行此操作」，
// 不把服务端的 'Forbidden' 原样露出来；其余优先用服务端返回的错误信息。
export function writeFailureMessage(
  status: number,
  serverError: unknown,
  msgs: { forbidden: string; fallback: string },
): string {
  if (status === 403) return msgs.forbidden
  return typeof serverError === 'string' && serverError.trim() ? serverError : msgs.fallback
}
