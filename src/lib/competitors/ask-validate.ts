// src/lib/competitors/ask-validate.ts
// 纯函数：校验 /api/competitors/ask 的请求体，并把历史裁到能喂给模型的窗口。
//
// 抽成纯函数（不依赖 next/server）单独放一个文件，是因为这段是分支重的安全
// 边界——挡 role:'system' 注入、超长/非法内容、超大数组、locale 原型链探测——
// 值得单测；且不依赖 NextRequest，能在 node --test 下直接跑，不用起一个假的
// Next 环境。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名（同 ask-context.ts
// / localeZone.ts 的做法）。
import { defaultLocale, isLocale } from '../../i18n/routing.ts'

export interface AskTurn {
  role: 'user' | 'assistant'
  content: string
}

export type ParsedAskBody =
  | { ok: true; turns: AskTurn[]; locale: string }
  | { ok: false; message: string }

/** 单条消息内容的长度上限（字符数）。 */
export const MAX_CONTENT = 2000

/**
 * 真正送进模型的历史窗口大小，route.ts 的 trimHistory 调用直接复用这个
 * 常量（不在那边另写一份），MAX_MESSAGES 与它的倍数关系才不会因为两处
 * 各改一次而跑偏。
 */
export const MAX_TURNS = 20

/**
 * 请求体里消息总数的上限，取 MAX_TURNS 的 3 倍。
 *
 * 评审量过账：旧上限 200 条 × MAX_CONTENT(2000 字符) 能撑出约 1.2MB 的
 * 请求体；裁到最近 MAX_TURNS(20) 条之后，窗口仍可能塞满 4 万字符
 * （约 2.7-4 万 token）——是 15k token 数据包的 2-3 倍，而且这部分历史
 * 每轮都在变、完全吃不到 DeepSeek 的前缀缓存。收紧到 3 倍 MAX_TURNS：
 * 既给"一段长对话里夹了几条超长消息、最终只有最近 20 条真正生效"这种
 * 正常场景留出余量，又不再放开到能一次吃满一份超大请求体。
 */
export const MAX_MESSAGES = MAX_TURNS * 3

const DEFAULT_LOCALE = defaultLocale

function isTurnShape(v: unknown): v is AskTurn {
  if (typeof v !== 'object' || v === null) return false
  const t = v as { role?: unknown; content?: unknown }
  // role 只认字面量 'user' | 'assistant'——大小写、前后空白一律不做归一化，
  // 'System'/'USER'/' user' 这类变体和 'system' 本身一样判非法。这是唯一
  // 挡住客户端伪造 system 消息、借请求体劫持/覆盖 system prompt 的地方；
  // 因为下面只把校验通过后的 { role, content } 重新拼成新对象传给
  // deepseekChat，原始对象（包括它上面任何多余字段）永远不会被透传出去。
  return (t.role === 'user' || t.role === 'assistant')
    && typeof t.content === 'string'
    && t.content.trim().length > 0
    && t.content.length <= MAX_CONTENT
}

/**
 * 校验 /api/competitors/ask 的 JSON 请求体。
 *
 * 只接受 { messages: {role,content}[], locale?: string }。返回的 turns 是
 * 全新对象（只挑 role/content 两个字段的值，逐条 map 出来，不是原始输入的
 * 引用或浅拷贝）——调用方传入的对象哪怕带着额外字段（例如 name/function_call
 * 这类 OpenAI 兼容协议支持的可选字段，或 __proto__ 这种拼原型链的字段），
 * 也不会被这里放过去，更不会被 JSON.stringify 进发给 DeepSeek 的请求体；
 * 校验之后调用方再怎么改动原始 messages 数组/对象，也不会影响已经返回的
 * turns。
 *
 * locale 经 isLocale 白名单校验（只认 zh/en/ja 三个字面量），非法值一律
 * 回落 defaultLocale——不能把裸字符串直接透传给 buildSystemPrompt 的
 * ANSWER_LANGUAGE[locale] 查表，那是一个普通对象字面量，'??' 挡不住
 * 'constructor'/'toString' 这类能在原型链上查到东西的键。
 */
export function parseAskBody(body: unknown): ParsedAskBody {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'body must be an object' }
  }
  const { messages, locale } = body as { messages?: unknown; locale?: unknown }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, message: 'messages must be a non-empty array' }
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, message: `messages must not exceed ${MAX_MESSAGES} entries` }
  }
  if (!messages.every(isTurnShape)) {
    return {
      ok: false,
      message: "each message must be { role: 'user' | 'assistant', content: string } with non-empty content up to "
        + `${MAX_CONTENT} characters`,
    }
  }
  const shaped = messages as AskTurn[]
  if (shaped[shaped.length - 1].role !== 'user') {
    return { ok: false, message: 'the last message must be from the user' }
  }

  // 重新拼一份干净对象，丢弃调用方可能塞进来的任何多余字段（见上面函数
  // 注释）。
  const turns: AskTurn[] = shaped.map((t) => ({ role: t.role, content: t.content }))

  const localeStr = typeof locale === 'string' ? locale : undefined
  return { ok: true, turns, locale: isLocale(localeStr) ? localeStr : DEFAULT_LOCALE }
}

/**
 * 把已校验的历史裁到最近 maxTurns 条。
 *
 * 单纯 slice(-maxTurns) 可能会把窗口开头恰好切在一条 assistant 消息上——
 * 比如对话总共 21 轮、裁掉最早一条 user 消息后，窗口第一条就变成了对方
 * 那一轮的 assistant 回答，前面没有对应的 user 提问。DeepSeek 走的是
 * OpenAI 兼容协议，不像 Anthropic Messages API 那样强制校验消息必须严格
 * user/assistant 交替、以 user 开头（那边给这种输入直接报 400），这里不会
 * 报错，但让模型看到一条没头没脑的"自问自答"开场依然是脏输入、白占
 * token。所以窗口内再从头丢掉悬空的 assistant 消息，直到以 user 开头。
 *
 * parseAskBody 已经保证入参的最后一条是 user，所以只要窗口非空就必然能
 * 找到至少一条 user 消息，firstUserIdx 不会是 -1——这也是下面要把 maxTurns
 * 钳到至少 1 的原因：maxTurns<=0 时 slice(-0)/slice(0) 会返回整个数组而
 * 不是空数组，等于让这个上限形同虚设。这个函数本身没有拒绝非法输入的
 * 路径（不像 parseAskBody 会返回 { ok: false }），调用方传 0 或负数不会
 * 报错、只会静默失效，所以在这里钳住而不是指望调用方永远传对。
 */
export function trimHistory(turns: AskTurn[], maxTurns: number): AskTurn[] {
  const windowed = turns.slice(-Math.max(1, maxTurns))
  const firstUserIdx = windowed.findIndex((t) => t.role === 'user')
  return firstUserIdx <= 0 ? windowed : windowed.slice(firstUserIdx)
}
