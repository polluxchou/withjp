import { z } from 'zod'
// import 用相对路径带 .ts 后缀而不是 @/ 别名:node --test 不解析别名,
// 这是本文件能被单测覆盖的前提(与 intent/parser.ts 同一个约定)。
import { llmJson } from '../llm/json.ts'
import { fastModel, modelLadder, strongModel } from '../llm/models.ts'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  VENUE_ITEM_STATUS_OPTIONS,
  type VenueAction,
  type VenueItemType,
} from '../../venue/layoutData.ts'

// ── Schema (matches VenueAction in layoutData) ────────────────

const TYPE_VALUES = VENUE_ITEM_TYPE_OPTIONS.map((o) => o.value) as [VenueItemType, ...VenueItemType[]]
const STATUS_VALUES = VENUE_ITEM_STATUS_OPTIONS.map((o) => o.value) as [string, ...string[]]

const VenueActionSchema: z.ZodType<VenueAction> = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    itemType: z.enum(TYPE_VALUES),
    name: z.string().max(40).optional(),
    widthM: z.number().positive().max(200).optional(),
    heightM: z.number().positive().max(200).optional(),
    summary: z.string(),
  }),
  z.object({
    op: z.literal('update'),
    targetId: z.string().min(1),
    name: z.string().max(40).optional(),
    itemType: z.enum(TYPE_VALUES).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    widthM: z.number().positive().max(200).optional(),
    heightM: z.number().positive().max(200).optional(),
    rotationDeg: z.number().min(-360).max(360).optional(),
    note: z.string().max(200).optional(),
    summary: z.string(),
  }),
  z.object({
    op: z.literal('move'),
    targetId: z.string().min(1),
    xM: z.number().optional(),
    yM: z.number().optional(),
    dxM: z.number().optional(),
    dyM: z.number().optional(),
    summary: z.string(),
  }),
  z.object({ op: z.literal('delete'), targetId: z.string().min(1), summary: z.string() }),
  z.object({
    op: z.literal('floor'),
    widthM: z.number().positive().max(500).optional(),
    heightM: z.number().positive().max(500).optional(),
    storeyHeightM: z.number().positive().max(20).optional(),
    backgroundImage: z.string().max(2000).optional(),
    name: z.string().max(40).optional(),
    summary: z.string(),
  }),
]) as z.ZodType<VenueAction>

// 测试注入口:node --test 下没有网络,把 llmJson 换成假实现才能测到
// 「单家供应商整体 429 → 沿梯子换供应商」这条容灾路径。生产调用方不传。
export interface VenueParserDeps {
  llm?: typeof llmJson
}

export type VenueParseItem = { id: string; name: string; type: VenueItemType }
export type VenueParseResult = { ok: true; action: VenueAction } | { ok: false; reason: string }

const TYPE_LABELS = VENUE_ITEM_TYPE_OPTIONS.map((o) => `${o.value}=${o.label}`).join('、')
const STATUS_LABELS = VENUE_ITEM_STATUS_OPTIONS.map((o) => `${o.value}=${o.label}`).join('、')

// Parse a natural-language instruction into a single venue action scoped to the
// current floor. Returns ok:false when the text isn't a venue operation (so the
// command never spills into other domains).
export async function parseVenueIntent(text: string, items: VenueParseItem[], deps?: VenueParserDeps): Promise<VenueParseResult> {
  const itemList = items.map((i) => `{"id":"${i.id}","name":${JSON.stringify(i.name)},"type":"${i.type}"}`).join(',\n')
  const prompt = `你是"场地布置"画布的指令解析器。只处理与**当前楼层**画布相关的操作，输出**一个**合法 JSON，符合下面的判别联合（按 op 区分）。不要输出多余文字。

类型 itemType 取值：${TYPE_LABELS}
状态 status 取值：${STATUS_LABELS}
长度单位一律为**米**（widthM/heightM/storeyHeightM/xM/yM/dxM/dyM）。

操作：
- 新增对象：{"op":"add","itemType":<type>,"name"?:string,"widthM"?:number,"heightM"?:number,"summary":string}
- 修改对象：{"op":"update","targetId":<现有对象id>,"name"?,"itemType"?,"status"?,"widthM"?,"heightM"?,"rotationDeg"?,"note"?,"summary"}
- 移动对象：{"op":"move","targetId":<id>, 绝对坐标用 "xM"/"yM"，相对位移用 "dxM"/"dyM","summary"}
- 删除对象：{"op":"delete","targetId":<id>,"summary"}
- 画布/楼层设置：{"op":"floor","widthM"?,"heightM"?,"storeyHeightM"?,"name"?,"backgroundImage"?,"summary"}

targetId 必须从下面的"当前楼层对象清单"里按名称/类型匹配出来的真实 id；匹配不到唯一对象时，输出 {"op":"none","reason":"歧义或找不到目标"}。
如果这句话不是场地操作（例如支出、任务等），输出 {"op":"none","reason":"非场地操作"}。
summary 用一句中文概括将要执行的变更。

当前楼层对象清单：
[
${itemList}
]

指令：${JSON.stringify(text)}`

  const llm = deps?.llm ?? llmJson

  // 沿模型梯子走(首选 → 强档 → 跨供应商逃生档,默认坍缩成 deepseek-chat →
  // gemini-2.5-pro)。曾经这里焊死 gemini-2.5-flash 并注释"刻意不换 DeepSeek",
  // 那个质量顾虑在 2026-08 Gemini 月度消费上限耗尽后失去意义:单供应商没有
  // 容灾,配额一爆整个功能归零。质量防线依然在:schema 校验挡结构错误,
  // venue_preview 确认步挡语义错误(用户点"应用到画布"才生效)。
  //
  // 只有**故障**才换档:抛异常(429/宕机/缺 key)、坏 JSON、schema 不过。
  // op:"none"(模型判断这不是场地操作)是语义回答不是故障,原地返回——
  // 否则每句合法的非场地指令都会把整条梯子烧一遍。
  const failures: string[] = []
  for (const model of modelLadder(fastModel(), strongModel())) {
    let raw: string
    try {
      raw = await llm(model, prompt)
    } catch (error) {
      // llmJson 的错误信息自带 provider:model 前缀,不重复加。
      failures.push(error instanceof Error ? error.message : String(error))
      continue
    }
    let obj: { op?: string; reason?: string }
    try {
      obj = JSON.parse(raw) as { op?: string; reason?: string }
    } catch {
      failures.push(`非法 JSON 输出(${model.provider}:${model.model})`)
      continue
    }
    if (obj.op === 'none' || !obj.op) {
      return { ok: false, reason: obj.reason || '无法识别为场地操作' }
    }
    const parsed = VenueActionSchema.safeParse(obj)
    if (!parsed.success) {
      failures.push(`输出不符合场地操作 schema(${model.provider}:${model.model})`)
      continue
    }
    return { ok: true, action: parsed.data }
  }
  return { ok: false, reason: failures.join(' → ') || '解析失败' }
}
