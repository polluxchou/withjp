// 新闻后台 CRUD 的业务逻辑（Task 9）。
//
// 刻意不 import 'next/server' / 'next/cache'：这个文件被
// src/app/api/site/site-content-api.integration.test.ts 用 `node --test
// --experimental-strip-types` 直接跑，node 的裸 ESM 解析认不出 'next/server'
// 这种没有文件扩展名的深子路径导出（会报 ERR_MODULE_NOT_FOUND），只有走 Next
// 自己的打包器才能解析。所以本文件的鉴权/失效结果都用平铺对象表达
// （AuthResult / HandlerResult），不依赖 NextResponse/NextRequest 的运行时值；
// 两个 route.ts（只被 Next 加载，从不被 node --test 直接加载）负责在边界处
// 转换成真正的 NextResponse，并绑定真实的 authGuard/getActorProfile/db/
// revalidatePath。测试文件绑定的是 fake 版本，验证的是 HTTP 状态、白名单
// 解析、数据库写入和失效调用的组合（而不是单独测 canEditSiteContent）。
import { z } from 'zod'
import { canEditSiteContent, type SiteContentActor } from '../auth/site-content.ts'
import { PUBLIC_SITE_LOCALES } from './domain-routing.ts'
import { isValidNewsSlug, sortNews } from './news-sort.ts'

// ── 与真实 Supabase 客户端的最小契约 ──────────────────────────────────
//
// 生产绑定处（route.ts）用 `createServerClient() as unknown as NewsDb`：真实
// supabase-js 的查询构造器是分阶段的复杂泛型类型（.from() 之后能不能调
// .eq()/.single() 取决于上一步调用的是 select/update 还是别的），如果照抄
// 那套类型，这里的最小接口反而会因为泛型形状对不上而编译失败。这个接口只
// 声明本文件实际调用到的方法形状，运行时仍然是真实的 supabase 客户端——
// 类型上收窄，行为上不收窄。测试文件里的 fake db 直接实现这个接口，不需要
// 强制类型转换。
export interface NewsQueryResult {
  data: unknown
  error: { message?: string } | null
}

export interface NewsQueryBuilder extends PromiseLike<NewsQueryResult> {
  select(columns?: string): NewsQueryBuilder
  insert(row: Record<string, unknown>): NewsQueryBuilder
  update(row: Record<string, unknown>): NewsQueryBuilder
  delete(): NewsQueryBuilder
  eq(column: string, value: unknown): NewsQueryBuilder
  single(): NewsQueryBuilder
}

export interface NewsDb {
  from(table: 'site_news'): NewsQueryBuilder
}

export interface NewsRow {
  id: string
  slug: string
  tag: 'RECRUIT' | 'PROJECT' | 'LIVE'
  category: 'project' | 'recruit'
  published_on: string
  is_pinned: boolean
  is_published: boolean
  image_url: string | null
  title_ja: string
  title_zh: string | null
  title_en: string | null
  lead_ja: string
  lead_zh: string | null
  lead_en: string | null
  body_ja: string
  body_zh: string | null
  body_en: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

// ── 鉴权结果：平铺对象，不携带 NextResponse ────────────────────────────
export type AuthResult = { ok: true; user: { id: string } } | { ok: false; status: 401 }

export interface NewsRouteDeps {
  authGuard: () => Promise<AuthResult>
  getActorProfile: (userId: string) => Promise<SiteContentActor | null>
  db: NewsDb
  revalidatePath: (path: string) => void
}

export interface HandlerResult {
  status: number
  body: unknown
}

// ── 字段白名单（zod）───────────────────────────────────────────────────
//
// 仓库里 zod 已在依赖里但此前 API 层零使用；从这个任务起改用它做显式白名单，
// 而不是把 body 直接 spread 给 Supabase——旧写法下客户端能在请求体里塞
// is_published / created_by_user_id 之类的字段直接写库。这是刻意引入的新
// 惯例，后续 API 路由应参照本文件的模式，而不是继续用旧的隐式写法。

const NEWS_TAGS = ['RECRUIT', 'PROJECT', 'LIVE'] as const
const NEWS_CATEGORIES = ['project', 'recruit'] as const
const MAX = { title: 120, lead: 300, body: 8000 } as const

const DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidCalendarDate(value: string): boolean {
  if (!DATE_SHAPE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// image_url 只接受站内绝对路径或 http(s) URL——它最终会被当成 <img>/next/image
// 的 src 使用，拒绝 javascript: 等其他 scheme。
const IMAGE_URL_RE = /^(\/|https?:\/\/)/

function requiredText(max: number) {
  return z.string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'required' })
    .refine((s) => s.length <= max, { message: 'too_long' })
}

// 选填文本：trim 后为空一律转 null（不是空字符串），呼应 pickLocaleText 把
// 空串等同 null 处理的契约（src/lib/site/i18n-content.ts）。
//
// `.optional()` 必须放在整条链的最后（transform/refine 之后），不能放在
// z.string() 后面就完事——如果放在前面，zod 对象解析器就不认得「这个键是
// 可选的」，即使请求体完全没带这个键，也会把 undefined 喂给 transform 得到
// null，再把 `key: null` 写回解析结果里。PATCH 场景下这会把「没提到这个
// 字段」和「显式把它清空」混为一谈：管理员只想切换 is_published，结果连
// title_zh/lead_en/image_url 这些没碰过的字段全被解析成 null，一次 PATCH
// 就把已有的中英文内容和主图全部抹掉。加过 z.optional().transform() 的写法
// 曾经在这里，写完立刻用一个独立脚本验证过会复现这个问题，才改成现在这样。
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

// image_url 的空白统一写为 null，表示缺图，由官网占位框显示；不做「从别的
// 新闻借一张图」的兜底。`.optional()` 位置的理由同 optionalText()。
function imageUrlField() {
  return z.string().nullable()
    .transform((v) => {
      if (v == null) return null
      const trimmed = v.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || v.length <= 2048, { message: 'too_long' })
    .refine((v) => v === null || IMAGE_URL_RE.test(v), { message: 'invalid_image_url' })
    .optional()
}

const slugField = z.string().refine((s) => isValidNewsSlug(s), { message: 'invalid_slug' })
const tagField = z.enum(NEWS_TAGS)
const categoryField = z.enum(NEWS_CATEGORIES)
const publishedOnField = z.string().refine((s) => isValidCalendarDate(s), { message: 'invalid_date' })

export const NewsCreateSchema = z.object({
  slug: slugField,
  tag: tagField,
  category: categoryField,
  published_on: publishedOnField,
  is_pinned: z.boolean().optional().default(false),
  is_published: z.boolean().optional().default(true),
  image_url: imageUrlField(),
  title_ja: requiredText(MAX.title),
  title_zh: optionalText(MAX.title),
  title_en: optionalText(MAX.title),
  lead_ja: requiredText(MAX.lead),
  lead_zh: optionalText(MAX.lead),
  lead_en: optionalText(MAX.lead),
  body_ja: requiredText(MAX.body),
  body_zh: optionalText(MAX.body),
  body_en: optionalText(MAX.body),
}).strict()

// PATCH：slug 不在白名单里——新建后不可修改，试图传入 slug 在 .strict() 下
// 会落进「未知字段」分支，返回 400，不需要单独判断。
export const NewsPatchSchema = z.object({
  tag: tagField.optional(),
  category: categoryField.optional(),
  published_on: publishedOnField.optional(),
  is_pinned: z.boolean().optional(),
  is_published: z.boolean().optional(),
  image_url: imageUrlField(),
  title_ja: requiredText(MAX.title).optional(),
  title_zh: optionalText(MAX.title),
  title_en: optionalText(MAX.title),
  lead_ja: requiredText(MAX.lead).optional(),
  lead_zh: optionalText(MAX.lead),
  lead_en: optionalText(MAX.lead),
  body_ja: requiredText(MAX.body).optional(),
  body_zh: optionalText(MAX.body),
  body_en: optionalText(MAX.body),
}).strict()

// 审计字段一律由服务端从 actor.id 赋值，永不接受客户端提供；id/created_at/
// updated_at 同理不可由客户端指定。命中时返回稳定错误码 forbidden_field，
// 而不是静默丢弃后继续处理——丢弃了却不告知，客户端会以为自己传的值生效了。
const FORBIDDEN_FIELDS = new Set([
  'id', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at',
])

function rejectForbiddenFields(body: Record<string, unknown>): HandlerResult | null {
  const hit = Object.keys(body).find((k) => FORBIDDEN_FIELDS.has(k))
  if (!hit) return null
  return { status: 400, body: { data: null, error: 'forbidden_field' } }
}

// zod 的默认错误文案跟随版本变化，不是稳定契约；只有我们自己用 .refine()
// 显式传入的 message（code: 'custom'）才当作字段级稳定错误码回传，其余 zod
// 内建错误（未知字段、类型不对、枚举值非法……）一律折叠成 'invalid'。
function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root'
    if (key in out) continue
    out[key] = issue.code === 'custom' ? issue.message : 'invalid'
  }
  return out
}

// ── 失效：逐 locale 枚举内部源路径,不用动态路由模式 ──────────────────────
//
// revalidatePath 只是把已有产物标记为 stale，重建发生在下一次访问；这里不
// 捕获、也不可能捕获后续重建是否成功——响应只表示「保存成功、失效标记已
// 提交」。记录 actor/slug/locale/path 供生产日志/监控核对下一次访问时的
// 重建结果。
export function revalidateNewsPages(
  doRevalidate: (path: string) => void,
  ctx: { actorId: string; slug: string },
): void {
  for (const locale of PUBLIC_SITE_LOCALES) {
    for (const path of [`/${locale}/site`, `/${locale}/site/news`, `/${locale}/site/news/${ctx.slug}`]) {
      doRevalidate(path)
      console.info('[site-news] revalidate', { actorId: ctx.actorId, slug: ctx.slug, locale, path })
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

// ── GET /api/site/news —— 读不分权限，登录即可 ─────────────────────────
export function createNewsListHandler(deps: NewsRouteDeps) {
  return async function handleList(): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const { data, error } = await deps.db.from('site_news').select('*')
    if (error) return { status: 500, body: { data: null, error: 'db_error' } }

    return { status: 200, body: { data: sortNews((data ?? []) as NewsRow[]), error: null } }
  }
}

// ── POST /api/site/news —— 仅 canEditSiteContent 通过者可创建 ──────────
export function createNewsCreateHandler(deps: NewsRouteDeps) {
  return async function handleCreate(req: Request): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) return parsedBody.result

    const forbidden = rejectForbiddenFields(parsedBody.value)
    if (forbidden) return forbidden

    const parsed = NewsCreateSchema.safeParse(parsedBody.value)
    if (!parsed.success) {
      return { status: 400, body: { data: null, error: 'validation', fields: zodFieldErrors(parsed.error) } }
    }

    const insertRow: Record<string, unknown> = {
      ...parsed.data,
      created_by_user_id: actor.id,
      updated_by_user_id: actor.id,
    }

    const { data, error } = await deps.db.from('site_news').insert(insertRow).select().single()
    if (error || !data) return { status: 500, body: { data: null, error: 'db_error' } }

    const row = data as NewsRow
    revalidateNewsPages(deps.revalidatePath, { actorId: actor.id, slug: row.slug })
    return { status: 201, body: { data: row, error: null } }
  }
}

// ── PATCH /api/site/news/:id ───────────────────────────────────────────
export function createNewsPatchHandler(deps: NewsRouteDeps) {
  return async function handlePatch(req: Request, id: string): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) return parsedBody.result

    const forbidden = rejectForbiddenFields(parsedBody.value)
    if (forbidden) return forbidden

    const parsed = NewsPatchSchema.safeParse(parsedBody.value)
    if (!parsed.success) {
      return { status: 400, body: { data: null, error: 'validation', fields: zodFieldErrors(parsed.error) } }
    }
    if (Object.keys(parsed.data).length === 0) {
      return { status: 400, body: { data: null, error: 'validation', fields: { _root: 'empty_patch' } } }
    }

    const patchRow: Record<string, unknown> = { ...parsed.data, updated_by_user_id: actor.id }

    const { data, error } = await deps.db.from('site_news').update(patchRow).eq('id', id).select().single()
    if (error || !data) return { status: 404, body: { data: null, error: 'not_found' } }

    const row = data as NewsRow
    revalidateNewsPages(deps.revalidatePath, { actorId: actor.id, slug: row.slug })
    return { status: 200, body: { data: row, error: null } }
  }
}

// ── DELETE /api/site/news/:id —— 删除前先读取 slug,避免删除后无法构造详情路径 ──
export function createNewsDeleteHandler(deps: NewsRouteDeps) {
  return async function handleDelete(id: string): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!actor || !canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    const { data: existing, error: fetchError } = await deps.db.from('site_news').select('slug').eq('id', id).single()
    if (fetchError || !existing) return { status: 404, body: { data: null, error: 'not_found' } }

    const slug = (existing as { slug: string }).slug

    const { error: deleteError } = await deps.db.from('site_news').delete().eq('id', id)
    if (deleteError) return { status: 500, body: { data: null, error: 'db_error' } }

    revalidateNewsPages(deps.revalidatePath, { actorId: actor.id, slug })
    return { status: 200, body: { data: { id }, error: null } }
  }
}
