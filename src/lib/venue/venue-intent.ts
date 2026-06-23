import { z } from 'zod'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  VENUE_ITEM_STATUS_OPTIONS,
  type VenueAction,
  type VenueItemType,
} from '@/venue/layoutData'

// ── Minimal Gemini transport (mirrors src/lib/intent/parser.ts) ─

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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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

export type VenueParseItem = { id: string; name: string; type: VenueItemType }
export type VenueParseResult = { ok: true; action: VenueAction } | { ok: false; reason: string }

const TYPE_LABELS = VENUE_ITEM_TYPE_OPTIONS.map((o) => `${o.value}=${o.label}`).join('、')
const STATUS_LABELS = VENUE_ITEM_STATUS_OPTIONS.map((o) => `${o.value}=${o.label}`).join('、')

// Parse a natural-language instruction into a single venue action scoped to the
// current floor. Returns ok:false when the text isn't a venue operation (so the
// command never spills into other domains).
export async function parseVenueIntent(text: string, items: VenueParseItem[]): Promise<VenueParseResult> {
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

  try {
    const raw = await geminiJson('gemini-2.5-flash', prompt)
    const obj = JSON.parse(raw) as { op?: string; reason?: string }
    if (obj.op === 'none' || !obj.op) {
      return { ok: false, reason: obj.reason || '无法识别为场地操作' }
    }
    const parsed = VenueActionSchema.safeParse(obj)
    if (!parsed.success) return { ok: false, reason: '无法识别为有效的场地操作' }
    return { ok: true, action: parsed.data }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '解析失败' }
  }
}
