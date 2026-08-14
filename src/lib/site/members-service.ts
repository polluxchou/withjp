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

// ── 与真实 Supabase 客户端的最小契约（同 news-service.ts 的理由：类型上收窄,
// 运行时仍是真实 supabase 客户端）──────────────────────────────────────────
export interface MemberQueryResult {
  data: unknown
  error: { message?: string } | null
}

export interface MemberQueryBuilder extends PromiseLike<MemberQueryResult> {
  select(columns?: string): MemberQueryBuilder
  update(row: Record<string, unknown>): MemberQueryBuilder
  eq(column: string, value: unknown): MemberQueryBuilder
  single(): MemberQueryBuilder
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

export type AuthResult = { ok: true; user: { id: string } } | { ok: false; status: 401 }

export interface MemberRouteDeps {
  authGuard: () => Promise<AuthResult>
  getActorProfile: (userId: string) => Promise<SiteContentActor | null>
  db: MemberDb
  revalidatePath: (path: string) => void
}

export interface HandlerResult {
  status: number
  body: unknown
}

// ── 字段白名单（zod）——模式与 news-service.ts 一致 ──────────────────────
const MAX = { name: 40, specialty: 60 } as const

const DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidCalendarDate(value: string): boolean {
  if (!DATE_SHAPE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// photo_url 只接受站内绝对路径或 http(s) URL——同 news-service.ts 的 image_url，
// 它最终会被当成 <img> 的 src 使用，拒绝 javascript: 等其他 scheme。
const PHOTO_URL_RE = /^(\/|https?:\/\/)/

// 选填文本：trim 后为空一律转 null。`.optional()` 必须放在整条链的最尾——
// 这是 Task 9 news-service.ts 里 optionalText() 踩过并修好的坑，这里的字段
// 全是可选字段，坑对这里影响更大（news 至少还有必填字段兜底部分场景，成员的
// PATCH 一个字段没提到的其它字段全靠这个位置才不会被静默清空）。
function optionalText(max: number) {
  return z.string().nullable()
    .transform((v) => {
      if (v == null) return null
      const trimmed = v.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || v.length <= max, { message: 'too_long' })
    .optional()
}

function photoUrlField() {
  return z.string().nullable()
    .transform((v) => {
      if (v == null) return null
      const trimmed = v.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || v.length <= 2048, { message: 'too_long' })
    .refine((v) => v === null || PHOTO_URL_RE.test(v), { message: 'invalid_image_url' })
    .optional()
}

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
  photo_url: photoUrlField(),
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

function rejectForbiddenFields(body: Record<string, unknown>): HandlerResult | null {
  const hit = Object.keys(body).find((k) => FORBIDDEN_FIELDS.has(k))
  if (!hit) return null
  return { status: 400, body: { data: null, error: 'forbidden_field' } }
}

// zod 的默认错误文案跟随版本变化，只有我们自己用 .refine() 显式传入的
// message（code: 'custom'）当作字段级稳定错误码回传，其余折叠成 'invalid'。
function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root'
    if (key in out) continue
    out[key] = issue.code === 'custom' ? issue.message : 'invalid'
  }
  return out
}

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

async function parseJsonBody(req: Request): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; result: HandlerResult }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, result: { status: 400, body: { data: null, error: 'invalid_json' } } }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, result: { status: 400, body: { data: null, error: 'invalid_json' } } }
  }
  return { ok: true, value: raw as Record<string, unknown> }
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

    const forbidden = rejectForbiddenFields(parsedBody.value)
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
    // 保留原值——这依赖 optionalText()/photoUrlField() 等的 `.optional()`
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
