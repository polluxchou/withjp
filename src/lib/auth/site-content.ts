export interface SiteContentActor {
  id: string
  is_admin: boolean
  role: string | null
}

/**
 * 官网内容一改就对公网可见，误操作代价高于内部数据，因此写操作只认 is_admin。
 *
 * 为什么不认 role === 'ops'：/api/profile 的 GET 在用户没有 profile 行时会自动
 * 建档并写死 role: 'ops'（src/app/api/profile/route.ts:29）——ops 是每个新用户的
 * 默认角色，不是被授予的权限。把它写进判定等于对所有登录用户开放。PATCH 允许
 * 用户自选 role 只是第二条绕过路径，堵上它也不改变默认建档这条。
 *
 * 放开 ops 的前提有两条，缺一不可：① 建档默认角色改成最小权限；② role 改为
 * 仅管理员可分配。参数里保留 role 字段是为那一天留位，现在不参与判定。
 */
export function canEditSiteContent(actor: SiteContentActor | null): boolean {
  if (!actor) return false
  return actor.is_admin
}
