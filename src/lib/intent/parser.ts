import { ExpenseIntentSchema, type ExpenseIntent } from './schema'

// ── Gemini transport ──────────────────────────────────────────
// Minimal local shim — keeps src/lib/agents/providers.ts unchanged.

function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return key
}

function geminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}

async function geminiJson(model: string, prompt: string): Promise<string> {
  const url = `${geminiBaseUrl()}/v1beta/models/${model}:generateContent?key=${geminiApiKey()}`
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? ''
}

// ── Model selection ───────────────────────────────────────────

const MODEL_FLASH = 'gemini-2.5-flash'
const MODEL_PRO   = 'gemini-2.5-pro'

// ── Public types ──────────────────────────────────────────────

export interface ParserContext {
  todayISO: string                  // YYYY-MM-DD
  userTimezoneOffset?: string       // e.g. '+08:00'; for prompt context only
}

export type ParserResult =
  | { ok: true;  intent: ExpenseIntent;  modelUsed: string;  durationMs: number }
  | { ok: false; reason: string;          durationMs: number }

// ── Classification stage ──────────────────────────────────────

type IntentKind = 'write' | 'query' | 'unknown'

async function classify(text: string): Promise<IntentKind> {
  const prompt = `判断下面这句话是"写操作"还是"查询"。
- 写操作：创建、修改、删除一条或多条支出记录。
- 查询：询问支出数据、汇总、占比、列表。

只返回 JSON：{"kind":"write"} 或 {"kind":"query"}。
如果完全无法判断，返回 {"kind":"unknown"}。

输入：${JSON.stringify(text)}`
  try {
    const raw = await geminiJson(MODEL_FLASH, prompt)
    const obj = JSON.parse(raw) as { kind?: string }
    if (obj.kind === 'write' || obj.kind === 'query') return obj.kind
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Extraction stage ──────────────────────────────────────────

const SCHEMA_DOC = `
你必须输出一个合法的 JSON，遵循以下 schema（discriminated union on op）：

CREATE:
{ "op":"create", "entity":"expense",
  "payload": { ...expense fields..., "expense_date":"YYYY-MM-DD" required, "payment_status": one_of_status required },
  "summary": "一句话摘要",
  "ambiguities": ["..."]? }

UPDATE:
{ "op":"update", "entity":"expense",
  "targetMatch": { "id"?: "uuid", "filters"?: ExpenseFilters }, // 必须二选一
  "patch": { 仅需修改的字段 },
  "summary":"...", "ambiguities":["..."]? }

DELETE:
{ "op":"delete", "entity":"expense",
  "targetMatch": { "id"?: "uuid", "filters"?: ExpenseFilters },
  "summary":"...", "ambiguities":["..."]? }

QUERY:
{ "op":"query", "entity":"expense",
  "filters": ExpenseFilters,
  "aggregate": "sum_total"|"count"|"avg_total"|"list",
  "groupBy"?: "expense_category"|"period"|"user_name"|"buyer_name"|"payment_method",
  "ratioOf"?: { "filters": ExpenseFilters },   // 占比：分母条件
  "limit"?: number,
  "breadcrumbs": "用一句话回显你理解的筛选条件" }

ExpenseFilters:
{
  "expense_category"?: ["tangible_asset"|"salary"|"rent"|"travel"|"office_supplies"|"cloud_services", ...],
  "period_in"?: ["YYYY-QN", ...],                   // 季度格式，如 "2026-Q3"。多季度就给多个
  "date_range"?: { "from"?: "YYYY-MM-DD", "to"?: "YYYY-MM-DD" },
  "payment_status"?: ["budgeted"|"ordered_unpaid"|"paid"|"refunded"|"partially_refunded", ...],
  "payment_method"?: ["company_account"|"wechat_pay"|"alipay"|"bank_card", ...],
  "user_name_contains"?: string,
  "buyer_name_contains"?: string,
  "item_name_contains"?: string,
  "purpose_contains"?: string
}

Expense 字段（用于 payload / patch）:
  expense_category, item_name, unit_price (number), quantity (int>0),
  expense_date (YYYY-MM-DD), period (YYYY-QN, 可空；所有类别都使用),
  location, purpose, user_name, buyer_name,
  payment_method (4选1或null), payment_status (5选1), notes
`

const RULES = `
关键规则：
1. 相对时间一律转绝对日期/period。"Q3" 按今年；"上个月" / "最近 30 天" 也要转成绝对值。
2. 季度 → period_in 用季度字符串（如 2026 Q3 → ["2026-Q3"]），不要展开成月份。多季度就给多个，例如 上半年 → ["2026-Q1","2026-Q2"]。
3. 月份 → 用 date_range 表达，不要写进 period_in，因为 period 字段只存季度。
4. 模糊词放进 *_contains，不要瞎猜成精确 id / enum。
5. 不确定的字段放进 ambiguities，不要凭空填。
6. 占比类问题（"X 在 Y 中占多少"）：filters=X 条件，ratioOf.filters=Y 条件。
7. 只输出 JSON，不要 markdown 围栏，不要解释文字。
`

function buildExtractPrompt(text: string, ctx: ParserContext, kind: IntentKind): string {
  const hint = kind === 'write'
    ? '本句话已被分类为"写操作"（create / update / delete）。'
    : kind === 'query'
    ? '本句话已被分类为"查询"。op 必须等于 "query"。'
    : '请你自己判断 op 是 create / update / delete / query 中的哪一种。'
  return `今天是 ${ctx.todayISO}。

${hint}

${SCHEMA_DOC}
${RULES}

用户输入：${JSON.stringify(text)}`
}

async function extract(
  text: string,
  ctx: ParserContext,
  kind: IntentKind,
): Promise<{ raw: string; modelUsed: string }> {
  const model = kind === 'query' ? MODEL_FLASH : MODEL_PRO
  const raw = await geminiJson(model, buildExtractPrompt(text, ctx, kind))
  return { raw, modelUsed: model }
}

// ── Public entry ──────────────────────────────────────────────

export async function parseExpenseIntent(
  text: string,
  ctx: ParserContext,
): Promise<ParserResult> {
  const t0 = Date.now()
  try {
    const kind = await classify(text)

    // First attempt: cost-tier picked by classification.
    const first = await extract(text, ctx, kind)
    const firstParsed = tryParse(first.raw)
    if (firstParsed.success) {
      return {
        ok:        true,
        intent:    firstParsed.data,
        modelUsed: first.modelUsed,
        durationMs: Date.now() - t0,
      }
    }

    // Fallback: re-run on pro if we used flash.
    if (first.modelUsed !== MODEL_PRO) {
      const second = await extract(text, ctx, kind)
      // ^ same prompt; pro will re-extract.
      const secondParsed = tryParse(second.raw)
      if (secondParsed.success) {
        return {
          ok:        true,
          intent:    secondParsed.data,
          modelUsed: MODEL_PRO,
          durationMs: Date.now() - t0,
        }
      }
      return {
        ok:        false,
        reason:    `Schema validation failed twice. Last error: ${secondParsed.error}`,
        durationMs: Date.now() - t0,
      }
    }

    return {
      ok:         false,
      reason:     `Schema validation failed: ${firstParsed.error}`,
      durationMs: Date.now() - t0,
    }
  } catch (e) {
    return {
      ok:         false,
      reason:     e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    }
  }
}

type ParseAttempt =
  | { success: true;  data: ExpenseIntent }
  | { success: false; error: string }

function tryParse(raw: string): ParseAttempt {
  let json: unknown
  try {
    json = JSON.parse(stripFences(raw))
  } catch (e) {
    return { success: false, error: `invalid JSON: ${(e as Error).message}` }
  }
  const result = ExpenseIntentSchema.safeParse(json)
  if (!result.success) {
    return { success: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  return { success: true, data: result.data }
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}
