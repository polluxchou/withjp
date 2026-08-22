import { ExpenseIntentSchema, WorkTaskCreateIntentSchema, type ExpenseIntent, type WorkTaskCreateIntent } from './schema.ts'
import { MAX_PRIOR_OUTCOME_CHARS, type PriorContext } from './conversation.ts'
import { describeModel, llmJson } from '../llm/json.ts'
import { fastModel, modelLadder, strongModel } from '../llm/models.ts'

// ── Model selection ───────────────────────────────────────────
// 传输层与档位选择都在 src/lib/llm/ 下（本文件原有的 Gemini shim 已并入
// llmJson —— venue-intent.ts 里那份功能相同的拷贝也一起消掉了）。
// import 用相对路径带 .ts 后缀而不是 @/ 别名：node --test 不解析别名，
// 这是本文件能被单测覆盖的前提。
//
// 快档默认 deepseek-chat（INTENT_FAST_PROVIDER=gemini 退回 flash）；强档
// 默认也是 deepseek-chat（INTENT_STRONG_PROVIDER=gemini 退回 pro）——
// 2026-08 Gemini 项目月度消费上限耗尽后，凡升到 pro 的解析在生产全部 429。
//
// 每次解析都沿 modelLadder 走：首选 → 强档 → 跨供应商逃生档。抛异常
// （429/宕机/缺 key）与输出过不了 schema 都前进到下一档，全梯失败才把
// parser_failed 报给用户。

// ── Public types ──────────────────────────────────────────────

export interface ParserContext {
  todayISO: string                  // YYYY-MM-DD
  userTimezoneOffset?: string       // e.g. '+08:00'; for prompt context only
  // 上一轮对话（只带一轮）。用于消解「改成 350」「那再加一笔」这类指代。
  // 来源是客户端，属不可信输入：它只进 prompt，不影响任何授权判断，也不
  // 绕过 executor 的字段校验与 per-op 闸门——写操作照旧走 pending_actions
  // 暂存 + 显式确认。这是可以接受客户端传上下文的唯一理由。
  priorTurn?: PriorContext
}

// 测试注入口：node --test 下没有网络，把 llmJson 换成假实现才能测到
// 「单家供应商整体 429 → 沿梯子换供应商」这条路径。生产调用方不传。
export interface ParserDeps {
  llm?: typeof llmJson
}

export type ClassifiedKind = 'write' | 'query' | 'unknown'
export type EntityKind     = 'expense' | 'work_task' | 'unknown'

export type ParserResult =
  | { ok: true;  intent: ExpenseIntent; classifiedAs: ClassifiedKind; modelUsed: string;  durationMs: number }
  | { ok: false; reason: string;                                                          durationMs: number }

export type WorkTaskParserResult =
  | { ok: true;  intent: WorkTaskCreateIntent; modelUsed: string; durationMs: number }
  | { ok: false; reason: string;                                  durationMs: number }

// ── Classification stage ──────────────────────────────────────

type IntentKind = ClassifiedKind

async function classify(text: string, llm: typeof llmJson): Promise<IntentKind> {
  const prompt = `判断下面这句话是"写操作"还是"查询"。
- 写操作：创建、修改、删除一条或多条支出记录。
- 查询：询问支出数据、汇总、占比、列表。

只返回 JSON：{"kind":"write"} 或 {"kind":"query"}。
如果完全无法判断，返回 {"kind":"unknown"}。

输入：${JSON.stringify(text)}`
  // 分类是增强项：抛异常（供应商级故障）或输出连 JSON 都不是时沿梯子换档，
  // 全梯失败退回 unknown（抽取阶段会自选 op），错误不往上抛。合法 JSON 但
  // kind 答非所问不换档 —— 那是模型的判断，不是故障。
  for (const model of modelLadder(fastModel(), strongModel())) {
    try {
      const raw = await llm(model, prompt)
      const obj = JSON.parse(raw) as { kind?: string }
      if (obj.kind === 'write' || obj.kind === 'query') return obj.kind
      return 'unknown'
    } catch {
      continue
    }
  }
  return 'unknown'
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

// 上一轮的 prompt 片段。没有上一轮时返回空串，prompt 与改造前逐字一致——
// 单轮场景的行为不因本次改动漂移。
function priorHint(prior: PriorContext | undefined): string {
  if (!prior) return ''
  return [
    '',
    '【上一轮对话】仅用于消解本句里的指代（「改成 350」「那再加一笔」「上一条」）。',
    `上一轮用户说：${JSON.stringify(prior.text)}`,
    `系统回了：${JSON.stringify(prior.outcome.slice(0, MAX_PRIOR_OUTCOME_CHARS))}`,
    '如果本句自身信息完整，忽略上一轮。',
    '',
  ].join('\n')
}

function buildExtractPrompt(text: string, ctx: ParserContext, kind: IntentKind): string {
  const hint = kind === 'write'
    ? '本句话已被分类为"写操作"（create / update / delete）。'
    : kind === 'query'
    ? '本句话已被分类为"查询"。op 必须等于 "query"。'
    : '请你自己判断 op 是 create / update / delete / query 中的哪一种。'
  return `今天是 ${ctx.todayISO}。

${hint}
${priorHint(ctx.priorTurn)}
${SCHEMA_DOC}
${RULES}

用户输入：${JSON.stringify(text)}`
}

// ── Public entry ──────────────────────────────────────────────

export async function parseExpenseIntent(
  text: string,
  ctx:  ParserContext,
  deps?: ParserDeps,
): Promise<ParserResult> {
  const t0  = Date.now()
  const llm = deps?.llm ?? llmJson
  try {
    const kind = await classify(text, llm)

    // 快档只用于查询；写操作直接上强档（写错了要落库，不省这一次调用的钱）。
    //
    // 之后沿梯子逐档尝试：llm 抛异常（429/宕机/缺 key）或输出过不了 schema
    // 都前进到下一档 —— 梯子保证后面总有另一家供应商。改造前抛异常直接落到
    // 外层 catch 变成 parser_failed，降级只覆盖 schema 失败；2026-08 Gemini
    // 月度消费上限耗尽时，凡走强档的解析因此全军覆没。
    const firstModel = kind === 'query' ? fastModel() : strongModel()
    const failures: string[] = []
    for (const model of modelLadder(firstModel, strongModel())) {
      let raw: string
      try {
        raw = await llm(model, buildExtractPrompt(text, ctx, kind))
      } catch (e) {
        // llmJson 的错误信息自带 provider:model 前缀，不重复加。
        failures.push(e instanceof Error ? e.message : String(e))
        continue
      }
      const parsed = tryParse(raw)
      if (parsed.success) {
        return {
          ok:           true,
          intent:       parsed.data,
          classifiedAs: kind,
          modelUsed:    describeModel(model),
          durationMs:   Date.now() - t0,
        }
      }
      failures.push(`${describeModel(model)} schema validation failed: ${parsed.error}`)
    }
    return { ok: false, reason: failures.join(' | '), durationMs: Date.now() - t0 }
  } catch (e) {
    // 梯子内部的失败都已折叠成 failures；这里只兜 prompt 拼装等意料外的抛错，
    // 维持 parseExpenseIntent 对外不抛的承诺。
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

// ── Entity classification ──────────────────────────────────────
// Determines whether input is about expenses or work tasks before
// routing to the appropriate parser.

export async function classifyEntity(text: string, prior?: PriorContext, deps?: ParserDeps): Promise<EntityKind> {
  const prompt = `判断下面这句话的意图类型。

判断核心原则：
- expense（支出记录）：用户在【记录】一笔已发生或即将发生的财务流水，重点是"钱从哪来/到哪去、花了多少"。典型特征：出现金额数字、"新增支出/费用"、"记一笔"、"报销"等记账动作。
- work_task（工作任务）：用户在【描述一件需要完成的工作】，重点是"做什么事、谁来做"。即使这件事涉及钱（如"去付款"、"完成转账"、"处理费用"），只要核心是一项待办工作而非记账，就应该分类为 work_task。典型特征：以动词开头描述动作（完成/安排/处理/跟进/确认等），或提到负责人/截止日期。
- unknown：无法判断。

判断顺序：先问"这是在记一笔账吗？"——如果是，expense；如果是在描述要做某件事，work_task。

只返回 JSON：{"entity":"expense"} 或 {"entity":"work_task"} 或 {"entity":"unknown"}。
${priorHint(prior)}
输入：${JSON.stringify(text)}`
  // 与 classify 同一套梯子语义：供应商级故障换档，全梯失败退 unknown
  // （路由层会把 unknown 兜底到支出解析），合法但答非所问不换档。
  const llm = deps?.llm ?? llmJson
  for (const model of modelLadder(fastModel(), strongModel())) {
    try {
      const raw = await llm(model, prompt)
      const obj = JSON.parse(raw) as { entity?: string }
      if (obj.entity === 'expense' || obj.entity === 'work_task') return obj.entity
      return 'unknown'
    } catch {
      continue
    }
  }
  return 'unknown'
}

// ── Work task parser ──────────────────────────────────────────

const WORK_TASK_SCHEMA_DOC = `
你必须输出一个合法的 JSON，描述一个创建工作任务的意图：

{
  "op": "create",
  "entity": "work_task",
  "payload": {
    "title":               string,            // 必填，任务标题
    "task_type":           "fixed"|"adhoc",   // fixed=固定/周期任务, adhoc=临时任务, 默认 adhoc
    "department":          "bd"|"ops"|"finance"|"content"|"growth"|"legal",  // 所属部门
    "owner_name":          string,            // 主负责人姓名（用户说的名字，不是 ID）
    "reviewer_name":       string|null,       // 审核人姓名
    "executor_names":      string[],          // 执行人姓名列表
    "task_date":           "YYYY-MM-DD",      // 开始日期，默认今天
    "due_date":            "YYYY-MM-DD"|null, // 截止日期
    "effort_hours":        2|4|8,             // 工时，默认 2
    "repeat_interval":     "daily"|"weekly"|"biweekly"|"monthly"|null,  // 重复周期，仅 fixed 任务填
    "completion_criteria": string|null,       // 如何判断完成
    "notes":               string|null
  },
  "summary": "一句话摘要",
  "ambiguities": ["..."]?                    // 不确定的点
}
`

const WORK_TASK_RULES = `
关键规则：
1. title 是必填项。如果用户描述的是"去完成某件事"，把这件事本身作为 title（如"完成新公司主体注册费用转账"）。
2. 任务描述里提到的银行账号、注意事项、操作细节等放到 notes 里，不要丢弃。
3. 相对时间转绝对日期，"明天" "下周五" 等都换成 YYYY-MM-DD。
4. 人名只提取原文，不要猜 ID，交由后端解析。
5. 不确定的字段放进 ambiguities，不要凭空填值。
6. 只输出 JSON，不要 markdown 围栏，不要解释文字。
`

export async function parseWorkTaskIntent(
  text: string,
  ctx:  ParserContext,
  deps?: ParserDeps,
): Promise<WorkTaskParserResult> {
  const t0  = Date.now()
  const llm = deps?.llm ?? llmJson
  try {
    const prompt = `今天是 ${ctx.todayISO}。\n\n${WORK_TASK_SCHEMA_DOC}\n${WORK_TASK_RULES}\n${priorHint(ctx.priorTurn)}\n用户输入：${JSON.stringify(text)}`
    // 与支出抽取同一套梯子语义：抛异常或 schema 不过都往下走一档。改造前
    // 这里单发强档、schema 失败不重试，供应商 429 直接变 parser_failed。
    const failures: string[] = []
    for (const model of modelLadder(strongModel(), strongModel())) {
      let raw: string
      try {
        raw = await llm(model, prompt)
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e))
        continue
      }
      const parsed = tryParseWorkTask(raw)
      if (parsed.success) {
        return { ok: true, intent: parsed.data, modelUsed: describeModel(model), durationMs: Date.now() - t0 }
      }
      failures.push(`${describeModel(model)} ${parsed.error}`)
    }
    return { ok: false, reason: failures.join(' | '), durationMs: Date.now() - t0 }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 }
  }
}

type WorkTaskParseAttempt =
  | { success: true;  data: WorkTaskCreateIntent }
  | { success: false; error: string }

function tryParseWorkTask(raw: string): WorkTaskParseAttempt {
  let json: unknown
  try {
    json = JSON.parse(stripFences(raw))
  } catch (e) {
    return { success: false, error: `invalid JSON: ${(e as Error).message}` }
  }
  const result = WorkTaskCreateIntentSchema.safeParse(json)
  if (!result.success) {
    return { success: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  return { success: true, data: result.data }
}
