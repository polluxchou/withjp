// 成员卡位后台配置的业务逻辑（Task 11，结构照抄 news-service.ts，Task 9）。
//
// 与 news-service.ts 同样的理由：刻意不 import 'next/server' / 'next/cache'，
// 这个文件被 src/app/api/site/site-content-api.integration.test.ts 用
// `node --test --experimental-strip-types` 直接跑，node 的裸 ESM 解析认不出
// 'next/server' 这种没有文件扩展名的深子路径导出。鉴权/失效结果都用平铺对象
// 表达（AuthResult / HandlerResult），两个 route.ts 负责在边界处转换成真正的
// NextResponse，并绑定真实的 authGuard/getActorProfile/db/revalidatePath。
//
// 与新闻的关键差异：
//   - 卡位数原本由 seed 建好、固定 12 个，只有 GET 与 PATCH /[no]。这在生产
//     暴露了两个问题：企划人数变化就要发迁移改常量+手工补行；`site_members`
//     若因故是空表，后台渲染 0 张卡且没有 POST，UI 完全无法恢复。自
//     20260815132734_member_slots_flexible.sql（去掉 no 的 1–12 上界，只留
//     unique + no > 0）起卡位数改由表的实际行数决定，本文件补上 POST（新增
//     一个卡位）与 DELETE /[no]（删除一个卡位），两者鉴权与 PATCH 一致。
//   - `no` 只从路由参数取（PATCH/DELETE）或由服务端计算（POST：当前最大
//     no + 1），永远不从 body 接受，命中时和审计字段一样返回
//     'forbidden_field'（而不是让 .strict() 把它当成普通未知字段折叠成
//     'invalid'）——no 是主键级别的标识,应该有和审计字段同等的显式拒绝。
//   - PATCH 全是可选字段（没有必填字段一说），但有两条**跨字段**的业务约束
//     （已公开卡位要求 name/photo_url/specialty_ja 非空；未公开卡位要求
//     expected_reveal_on 非空），且约束依赖的是"数据库现有行 + 本次 patch"
//     合并后的**有效值**，不是单看 patch 里出现的字段——所以必须先查现有行、
//     和白名单解析后的 patch 做浅合并（只有 patch 里出现的 key 覆盖现有值,
//     没提到的 key 保留原值,这正是 `{ ...existing, ...parsed.data }` 的语义,
//     前提是 optionalText() 的 `.optional()` 位置正确,未提及的键根本不出现在
//     parsed.data 里,不会被合并进来覆盖成 null）,再对合并结果跑业务校验。
//   - POST 不需要这层浅合并——新建的卡位没有"现有行"，服务端直接把
//     is_revealed 定死成 false（新卡位默认未公开），只接受客户端提供
//     expected_reveal_on（site_members_unrevealed_schedule 约束要求未公开
//     卡位必须有这一列），其余展示字段留给后续 PATCH 去补。
import { z } from 'zod'
import { canEditSiteContent, type SiteContentActor } from '../auth/site-content.ts'
import { PUBLIC_SITE_LOCALES } from './domain-routing.ts'
import {
  imageUrlField,
  isValidCalendarDate,
  optionalText,
  parseJsonBody,
  rejectForbiddenFields,
  zodFieldErrors,
  type AuthResult,
  type HandlerResult,
  type SiteContentQueryBuilder,
  type SiteContentQueryResult,
} from './site-content-shared.ts'

// ── 与真实 Supabase 客户端的最小契约（同 news-service.ts 的理由：类型上收窄,
// 运行时仍是真实 supabase 客户端）。data/error 形状与 select/eq/single 三个
// 方法与 news-service.ts 逐字节相同，收在 SiteContentQueryBuilder 里 extends。
// insert/delete 现在也是 members 的一部分（卡位数据驱动 + 后台增删，见
// 20260815132734_member_slots_flexible.sql 去掉 no 的 1–12 上界）——卡位数
// 不再是 seed 建好之后就固定不变的常量，POST 新增一个卡位、DELETE 删除一个
// 卡位，两者都要用到。────────────────────────────────────────────────────
export type MemberQueryResult = SiteContentQueryResult

export interface MemberQueryBuilder extends SiteContentQueryBuilder<MemberQueryBuilder> {
  insert(row: Record<string, unknown>): MemberQueryBuilder
  update(row: Record<string, unknown>): MemberQueryBuilder
  delete(): MemberQueryBuilder
}

export interface MemberDb {
  from(table: 'site_members'): MemberQueryBuilder
}

export interface MemberRow {
  id: string
  no: number
  is_revealed: boolean
  photo_url: string | null
  name: string | null
  name_ja: string | null
  name_zh: string | null
  name_en: string | null
  specialty_ja: string | null
  specialty_zh: string | null
  specialty_en: string | null
  expected_reveal_on: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type { AuthResult, HandlerResult }

export interface MemberRouteDeps {
  authGuard: () => Promise<AuthResult>
  getActorProfile: (userId: string) => Promise<SiteContentActor | null>
  db: MemberDb
  revalidatePath: (path: string) => void
}

// ── 字段白名单（zod）——模式与 news-service.ts 一致 ──────────────────────
const MAX = { name: 40, specialty: 60 } as const

// isValidCalendarDate/optionalText/imageUrlField（photo_url 白名单，与
// next.config.mjs 的 remotePatterns 对齐）现在收在 site-content-shared.ts，
// 与 news-service.ts 共用同一份实现（评审 Important：抽共享模块），不再各自
// 持有一份拷贝——photo_url 用的就是共享的 imageUrlField()，字段名本身由下面
// MemberPatchSchema 的 key 决定，函数内部不关心叫 image_url 还是 photo_url。

function expectedRevealOnField() {
  return z.string().nullable()
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .refine((v) => v === null || isValidCalendarDate(v), { message: 'invalid_date' })
    .optional()
}

// no 不在白名单里——编号由路由参数（PATCH/DELETE）或服务端计算（POST）决定，
// 不是可 patch 的字段；试图在 body 里传 no 走 rejectForbiddenFields()，而不是
// 落进 .strict() 的"未知字段"分支（那样只会得到笼统的 'invalid'，不是
// 'forbidden_field'）。
export const MemberPatchSchema = z.object({
  is_revealed: z.boolean().optional(),
  photo_url: imageUrlField(),
  name: optionalText(MAX.name),
  name_ja: optionalText(MAX.name),
  name_zh: optionalText(MAX.name),
  name_en: optionalText(MAX.name),
  specialty_ja: optionalText(MAX.specialty),
  specialty_zh: optionalText(MAX.specialty),
  specialty_en: optionalText(MAX.specialty),
  expected_reveal_on: expectedRevealOnField(),
}).strict()

// POST 的白名单只有 expected_reveal_on——新卡位没有"现有行"可合并，
// is_revealed 由服务端定死成 false（见文件顶部注释），其余展示字段
// （name/photo_url/specialty_*）留给创建后的 PATCH 去补，不在创建这一步
// 一次性塞完。expected_reveal_on 必填（不像 PATCH 里是 optional）——
// site_members_unrevealed_schedule 约束要求未公开卡位必须有这一列，新卡位
// 一律未公开，所以这里没有"可以不填"的分支。
export const MemberCreateSchema = z.object({
  expected_reveal_on: z.string()
    .transform((v) => v.trim())
    .refine((v) => isValidCalendarDate(v), { message: 'invalid_date' }),
}).strict()

// 审计字段一律由服务端从 actor.id 赋值，永不接受客户端提供；no/id/created_at/
// updated_at 同理不可由客户端指定——no 视同审计字段级别的禁区，见上面注释。
// PATCH/DELETE 共用这份（DELETE 不解析 body，这份集合对它没有实际意义，但
// 保留同名导出避免两份平行定义漂移）。
const FORBIDDEN_FIELDS = new Set([
  'id', 'no', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at',
])

// POST 比 PATCH 多禁一个 is_revealed——新卡位的 is_revealed 由服务端定死成
// false（不像 PATCH 那样是正常可写字段），客户端传它会被当成禁区字段拒绝，
// 而不是静默忽略：静默忽略会让管理员以为自己传的 is_revealed:true 生效了，
// 实际却因为没有 name/photo_url/specialty_ja 而在数据库层被
// site_members_revealed_fields 约束拒绝，得到一个不知所云的 db_error。
const CREATE_FORBIDDEN_FIELDS = new Set(Array.from(FORBIDDEN_FIELDS).concat('is_revealed'))

// rejectForbiddenFields()/zodFieldErrors() 现在收在 site-content-shared.ts，
// 与 news-service.ts 共用同一份实现；这里只保留 FORBIDDEN_FIELDS 集合
// 本身——members 比 news 多一个 `no`。

// ── 跨字段业务校验：依赖"现有行 + 本次 patch"合并后的有效值,不是单看 patch
// 本身——不能因为请求只改照片就误报已有日期缺失（brief 原文）。────────────
interface EffectiveMemberFields {
  is_revealed: boolean
  name: string | null
  photo_url: string | null
  specialty_ja: string | null
  expected_reveal_on: string | null
}

function validateEffectiveMember(effective: EffectiveMemberFields): Record<string, string> | null {
  const errors: Record<string, string> = {}
  if (effective.is_revealed) {
    if (!effective.name) errors.name = 'required_when_revealed'
    if (!effective.photo_url) errors.photo_url = 'required_when_revealed'
    if (!effective.specialty_ja) errors.specialty_ja = 'required_when_revealed'
  } else {
    if (!effective.expected_reveal_on) errors.expected_reveal_on = 'required_when_unrevealed'
  }
  return Object.keys(errors).length > 0 ? errors : null
}

// ── 失效：逐 locale 枚举内部源路径，不用动态路由模式（brief 指定的两条路径,
// 与新闻的 list/首页/详情三条不同——成员没有独立列表页,只出现在首页与
// vision 页）。revalidatePath 只是把已有产物标记为 stale,重建发生在下一次
// 访问；这里不捕获、也不可能捕获后续重建是否成功——响应只表示"保存成功、
// 失效标记已提交"。 ──────────────────────────────────────────────────────
export function revalidateMemberPages(
  doRevalidate: (path: string) => void,
  ctx: { actorId: string; no: number },
): void {
  for (const locale of PUBLIC_SITE_LOCALES) {
    for (const path of [`/${locale}/site`, `/${locale}/site/vision`]) {
      doRevalidate(path)
      console.info('[site-members] revalidate', { actorId: ctx.actorId, no: ctx.no, locale, path })
    }
  }
}

// ── GET /api/site/members —— 读不分权限，登录即可，按 no 升序返回全部卡位 ──
export function createMemberListHandler(deps: MemberRouteDeps) {
  return async function handleList(): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const { data, error } = await deps.db.from('site_members').select('*')
    if (error) return { status: 500, body: { data: null, error: 'db_error' } }

    const rows = [...((data ?? []) as MemberRow[])].sort((a, b) => a.no - b.no)
    return { status: 200, body: { data: rows, error: null } }
  }
}

// ── PATCH /api/site/members/:no —— 仅 canEditSiteContent 通过者可改 ────────
export function createMemberPatchHandler(deps: MemberRouteDeps) {
  return async function handlePatch(req: Request, noParam: string): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const no = Number(noParam)
    if (!Number.isInteger(no) || no < 1) {
      return { status: 400, body: { data: null, error: 'invalid_no' } }
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) return parsedBody.result

    const forbidden = rejectForbiddenFields(parsedBody.value, FORBIDDEN_FIELDS)
    if (forbidden) return forbidden

    const parsed = MemberPatchSchema.safeParse(parsedBody.value)
    if (!parsed.success) {
      return { status: 400, body: { data: null, error: 'validation', fields: zodFieldErrors(parsed.error) } }
    }
    if (Object.keys(parsed.data).length === 0) {
      return { status: 400, body: { data: null, error: 'validation', fields: { _root: 'empty_patch' } } }
    }

    const { data: existing, error: fetchError } = await deps.db.from('site_members').select('*').eq('no', no).single()
    if (fetchError || !existing) return { status: 404, body: { data: null, error: 'not_found' } }
    const existingRow = existing as MemberRow

    // 浅合并：只有 parsed.data 里实际出现的 key 覆盖现有值，没提到的 key
    // 保留原值——这依赖 optionalText()/imageUrlField() 等的 `.optional()`
    // 位于链尾，未提及字段根本不会作为 key 出现在 parsed.data 里。
    const effective: EffectiveMemberFields = {
      is_revealed: existingRow.is_revealed,
      name: existingRow.name,
      photo_url: existingRow.photo_url,
      specialty_ja: existingRow.specialty_ja,
      expected_reveal_on: existingRow.expected_reveal_on,
      ...parsed.data,
    }
    const businessErrors = validateEffectiveMember(effective)
    if (businessErrors) {
      return { status: 400, body: { data: null, error: 'validation', fields: businessErrors } }
    }

    const patchRow: Record<string, unknown> = { ...parsed.data, updated_by_user_id: actor.id }

    const { data, error } = await deps.db.from('site_members').update(patchRow).eq('no', no).select().single()
    if (error || !data) return { status: 404, body: { data: null, error: 'not_found' } }

    const row = data as MemberRow
    revalidateMemberPages(deps.revalidatePath, { actorId: actor.id, no })
    return { status: 200, body: { data: row, error: null } }
  }
}

// ── POST /api/site/members —— 新增一个卡位，仅 canEditSiteContent 通过者可用 ──
//
// 这是这次任务要修的死锁本身：`site_members` 若因故是空表，之前后台没有 POST，
// 只能读到 0 行、渲染 0 张卡，UI 上没有任何入口能把数据补回去。有了这个
// handler，即使表被清空，管理员也能从后台一步步把卡位加回来。
export function createMemberCreateHandler(deps: MemberRouteDeps) {
  return async function handleCreate(req: Request): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) return parsedBody.result

    const forbidden = rejectForbiddenFields(parsedBody.value, CREATE_FORBIDDEN_FIELDS)
    if (forbidden) return forbidden

    const parsed = MemberCreateSchema.safeParse(parsedBody.value)
    if (!parsed.success) {
      return { status: 400, body: { data: null, error: 'validation', fields: zodFieldErrors(parsed.error) } }
    }

    // no 由服务端取"当前最大 no + 1"——site_members.no 没有 serial/identity
    // 列（历史上一直由 seed 脚本显式赋值，见 20260814112723_site_content.sql），
    // 所以这里手动算。只选 no 这一列，不用整表——卡位数据驱动之后行数不再
    // 假设恰好是 12，没必要多传其余列。
    const { data: existingRows, error: listError } = await deps.db.from('site_members').select('no')
    if (listError) return { status: 500, body: { data: null, error: 'db_error' } }
    const nextNo = ((existingRows ?? []) as { no: number }[]).reduce((max, row) => Math.max(max, row.no), 0) + 1

    const insertRow: Record<string, unknown> = {
      ...parsed.data,
      no: nextNo,
      is_revealed: false,
      created_by_user_id: actor.id,
      updated_by_user_id: actor.id,
    }

    const { data, error } = await deps.db.from('site_members').insert(insertRow).select().single()
    // 23505 = Postgres 唯一约束冲突（site_members.no 的 unique）。理论上只有
    // 两个管理员在同一瞬间各自读到相同的"当前最大 no"、又几乎同时插入才会
    // 撞上——概率很低但不是不可能，给一个能重试的 409 而不是笼统的 500，
    // 管理员刷新一次列表重新点"新增"即可，no 会重新计算。
    if (error?.code === '23505') {
      return { status: 409, body: { data: null, error: 'conflict' } }
    }
    if (error || !data) return { status: 500, body: { data: null, error: 'db_error' } }

    const row = data as MemberRow
    revalidateMemberPages(deps.revalidatePath, { actorId: actor.id, no: row.no })
    return { status: 201, body: { data: row, error: null } }
  }
}

// ── DELETE /api/site/members/:no —— 删除一个卡位，仅 canEditSiteContent 通过者可用 ──
export function createMemberDeleteHandler(deps: MemberRouteDeps) {
  return async function handleDelete(noParam: string): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const no = Number(noParam)
    if (!Number.isInteger(no) || no < 1) {
      return { status: 400, body: { data: null, error: 'invalid_no' } }
    }

    const { data: existing, error: fetchError } = await deps.db.from('site_members').select('no').eq('no', no).single()
    if (fetchError || !existing) return { status: 404, body: { data: null, error: 'not_found' } }

    const { error: deleteError } = await deps.db.from('site_members').delete().eq('no', no)
    if (deleteError) return { status: 500, body: { data: null, error: 'db_error' } }

    revalidateMemberPages(deps.revalidatePath, { actorId: actor.id, no })
    return { status: 200, body: { data: { no }, error: null } }
  }
}
