// 成员卡位后台配置的业务逻辑（Task 11，结构照抄 news-service.ts，Task 9）。
//
// 与 news-service.ts 同样的理由：刻意不 import 'next/server' / 'next/cache'，
// 这个文件被 src/app/api/site/site-content-api.integration.test.ts 用
// `node --test --experimental-strip-types` 直接跑，node 的裸 ESM 解析认不出
// 'next/server' 这种没有文件扩展名的深子路径导出。鉴权/失效结果都用平铺对象
// 表达（AuthResult / HandlerResult），两个 route.ts 负责在边界处转换成真正的
// NextResponse，并绑定真实的 authGuard/getActorProfile/db/revalidatePath。
//
// 与新闻的关键差异（见 task-11-brief.md）：
//   - 12 个卡位由 seed 建好，是固定的——只有 GET 与 PATCH /[no]，没有增删。
//   - `no` 只从路由参数取，不从 body 接受，命中时和审计字段一样返回
//     'forbidden_field'（而不是让 .strict() 把它当成普通未知字段折叠成
//     'invalid'）——no 是主键级别的路由标识,应该有和审计字段同等的显式拒绝。
//   - PATCH 全是可选字段（没有必填字段一说），但有两条**跨字段**的业务约束
//     （已公开卡位要求 name/photo_url/specialty_ja 非空；未公开卡位要求
//     expected_reveal_on 非空），且约束依赖的是"数据库现有行 + 本次 patch"
//     合并后的**有效值**，不是单看 patch 里出现的字段——所以必须先查现有行、
//     和白名单解析后的 patch 做浅合并（只有 patch 里出现的 key 覆盖现有值,
//     没提到的 key 保留原值,这正是 `{ ...existing, ...parsed.data }` 的语义,
//     前提是 optionalText() 的 `.optional()` 位置正确,未提及的键根本不出现在
//     parsed.data 里,不会被合并进来覆盖成 null）,再对合并结果跑业务校验。
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
// 方法与 news-service.ts 逐字节相同，收在 SiteContentQueryBuilder 里
// extends；update 是这里唯一需要的写方法（没有 insert/delete——12 个卡位由
// seed 建好,只有 PATCH）。──────────────────────────────────────────────────
export type MemberQueryResult = SiteContentQueryResult

export interface MemberQueryBuilder extends SiteContentQueryBuilder<MemberQueryBuilder> {
  update(row: Record<string, unknown>): MemberQueryBuilder
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

// no 不在白名单里——12 个卡位由 seed 建好，编号是路由参数，不是可 patch 的
// 字段；试图在 body 里传 no 走 rejectForbiddenFields()，而不是落进 .strict()
// 的"未知字段"分支（那样只会得到笼统的 'invalid'，不是 'forbidden_field'）。
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

// 审计字段一律由服务端从 actor.id 赋值，永不接受客户端提供；no/id/created_at/
// updated_at 同理不可由客户端指定——no 视同审计字段级别的禁区，见上面注释。
const FORBIDDEN_FIELDS = new Set([
  'id', 'no', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at',
])

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

// ── GET /api/site/members —— 读不分权限，登录即可，按 no 升序返回 12 个卡位 ──
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
    if (!Number.isInteger(no) || no < 1 || no > 12) {
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
