// 官网内容后台（news-service.ts / members-service.ts）共享的鉴权结果形状、
// 字段解析辅助函数与图片 URL 白名单（评审 Important：抽共享模块）。
//
// 同 news-service.ts / members-service.ts 的理由：本文件被
// src/app/api/site/site-content-api.integration.test.ts 用
// `node --test --experimental-strip-types` 直接跑，刻意不 import
// 'next/server' / 'next/cache' —— node 的裸 ESM 解析认不出这类没有文件扩展名
// 的深子路径导出。
//
// 抽取范围只覆盖两个 service 逐字节相同的部分（鉴权/失效结果形状、日期/文本/
// 图片 URL 校验、白名单拒绝、zod 错误折叠、JSON body 解析）；news 与
// members 各自的业务差异（news 有增删、members 只有 PATCH、失效路径 3 条 vs
// 2 条、members 有跨字段有效值校验）保留在各自文件里，不勉强合并。
import { z } from 'zod'

// ── 与真实 Supabase 客户端的最小契约：两个 service 的查询构造器方法集不同
// （news 有 insert/delete，members 只有 update），只有 data/error 的结果形状
// 与 select/eq/single 三个方法是逐字节相同的，抽出来给两边的 QueryBuilder
// 接口 extends，不强行合并成一个万能接口。────────────────────────────────
export interface SiteContentQueryResult {
  data: unknown
  error: { message?: string } | null
}

export interface SiteContentQueryBuilder<Self> extends PromiseLike<SiteContentQueryResult> {
  select(columns?: string): Self
  eq(column: string, value: unknown): Self
  single(): Self
}

// ── 鉴权结果：平铺对象，不携带 NextResponse（两个 service 逐字节相同）───────
export type AuthResult = { ok: true; user: { id: string } } | { ok: false; status: 401 }

export interface HandlerResult {
  status: number
  body: unknown
}

// ── 日期形状校验：两个 service 逐字节相同 ──────────────────────────────────
const DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_SHAPE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// 选填文本：trim 后为空一律转 null（不是空字符串），呼应 pickLocaleText 把
// 空串等同 null 处理的契约（src/lib/site/i18n-content.ts）。
//
// `.optional()` 必须放在整条链的最后（transform/refine 之后），不能放在
// z.string() 后面就完事——如果放在前面，zod 对象解析器就不认得「这个键是
// 可选的」，即使请求体完全没带这个键，也会把 undefined 喂给 transform 得到
// null，再把 `key: null` 写回解析结果里。PATCH 场景下这会把「没提到这个
// 字段」和「显式把它清空」混为一谈：管理员只想切换某个布尔标志，结果连没碰过
// 的文本字段全被解析成 null，一次 PATCH 就把已有内容全部抹掉。加过
// z.optional().transform() 的写法曾经在 news-service.ts 里，写完立刻用一个
// 独立脚本验证过会复现这个问题，才改成现在这样——members-service.ts 的 PATCH
// 全是可选字段，这个坑对它影响更大。
export function optionalText(max: number) {
  return z.string().nullable()
    .transform((v) => {
      if (v == null) return null
      const trimmed = v.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || v.length <= max, { message: 'too_long' })
    .optional()
}

// image_url / photo_url 只接受站内绝对路径，或本环境 Supabase storage 的公开
// 前缀——不能像之前那样放行任意 https 主机（`/^(\/|https?:\/\/)/`）：
// next.config.mjs 的 remotePatterns 只登记了同一个 Supabase host +
// /storage/v1/object/public/site-media/**，next/image 在渲染期遇到不匹配的
// URL 会直接 throw。一篇新闻或一个成员卡位的图片字段填了外部域名，官网三语
// 页面就会全部 500——后台是纯上传所以概率不高，但这是 API 契约允许的公开可见
// 故障。
//
// 这段校验此前在 news-service.ts（image_url）与 members-service.ts
// （photo_url）各存一份，是两个出错的地方而不是一个——它是安全控制，不是普通
// 业务逻辑，合并成一份单一实现是这一轮重构里最有价值的部分：现在只有这一处
// 需要与 next.config.mjs 的 remotePatterns 保持对齐。前缀从
// NEXT_PUBLIC_SUPABASE_URL 推导，与 remotePatterns 同源，不复述一遍 host。
const SUPABASE_IMAGE_PREFIX = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return `${new URL(url).origin}/storage/v1/object/public/site-media/`
  } catch {
    return null
  }
})()

export function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  return SUPABASE_IMAGE_PREFIX !== null && value.startsWith(SUPABASE_IMAGE_PREFIX)
}

// image_url / photo_url 字段：`.optional()` 位置的理由同 optionalText()。
// 空白统一写为 null，表示缺图，由官网占位框显示；不做「从别的记录借一张图」
// 的兜底。
export function imageUrlField() {
  return z.string().nullable()
    .transform((v) => {
      if (v == null) return null
      const trimmed = v.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || v.length <= 2048, { message: 'too_long' })
    .refine((v) => v === null || isAllowedImageUrl(v), { message: 'invalid_image_url' })
    .optional()
}

// 审计字段（及 members 的 no）一律由服务端赋值/从路由参数取，永不接受客户端
// 提供；命中时返回稳定错误码 forbidden_field，而不是静默丢弃后继续处理——
// 丢弃了却不告知，客户端会以为自己传的值生效了。禁区集合两个 service 各不
// 相同（members 多一个 `no`），由调用方传入。
export function rejectForbiddenFields(
  body: Record<string, unknown>,
  forbiddenFields: ReadonlySet<string>,
): HandlerResult | null {
  const hit = Object.keys(body).find((k) => forbiddenFields.has(k))
  if (!hit) return null
  return { status: 400, body: { data: null, error: 'forbidden_field' } }
}

// zod 的默认错误文案跟随版本变化，不是稳定契约；只有我们自己用 .refine()
// 显式传入的 message（code: 'custom'）才当作字段级稳定错误码回传，其余 zod
// 内建错误（未知字段、类型不对、枚举值非法……）一律折叠成 'invalid'。
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root'
    if (key in out) continue
    out[key] = issue.code === 'custom' ? issue.message : 'invalid'
  }
  return out
}

export async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; result: HandlerResult }> {
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
