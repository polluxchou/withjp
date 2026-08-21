// src/lib/competitors/ask-validate.ts
// 纯函数：校验 /api/competitors/ask 的请求体，并把历史裁到能喂给模型的窗口。
//
// 抽成纯函数（不依赖 next/server）单独放一个文件，是因为这段是分支重的安全
// 边界——挡 role:'system' 注入、超长/非法内容、超大数组——值得单测；且不
// 依赖 NextRequest，能在 node --test 下直接跑，不用起一个假的 Next 环境。

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
 * 请求体里消息总数的上限。真正送进模型的历史另有更严的 MAX_TURNS 截断
 * （见 route.ts），这里的上限单纯是防御性的：挡住"发 5000 条消息"这类
 * 阵列膨胀攻击，让校验本身不用在超大数组上做无意义的逐条检查。
 */
export const MAX_MESSAGES = 200

const DEFAULT_LOCALE = 'zh'

function isTurnShape(v: unknown): v is AskTurn {
  if (typeof v !== 'object' || v === null) return false
  const t = v as { role?: unknown; content?: unknown }
  // role 只认字面量 'user' | 'assistant'——'system' 一律判非法。这是唯一
  // 挡住客户端伪造 system 消息、借请求体劫持/覆盖 system prompt 的地方；
  // 因为下面只把校验通过后的 { role, content } 重新拼成新对象传给
  // deepseekChat，never 把原始对象透传出去，多余字段（还是非法 role）
  // 都没有机会跟着一起序列化进发给上游的请求体。
  return (t.role === 'user' || t.role === 'assistant')
    && typeof t.content === 'string'
    && t.content.trim().length > 0
    && t.content.length <= MAX_CONTENT
}

/**
 * 校验 /api/competitors/ask 的 JSON 请求体。
 *
 * 只接受 { messages: {role,content}[], locale?: string }。返回的 turns 是
 * 全新对象（只挑 role/content 两个字段），不是原始输入的引用——调用方传入
 * 的对象哪怕带着额外字段（例如 name/function_call 这类 OpenAI 兼容协议
 * 支持的可选字段），也不会被这里放过去，更不会被 JSON.stringify 进发给
 * DeepSeek 的请求体。
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

  // 重新拼一份干净对象，丢弃调用方可能塞进来的任何多余字段（见上面
  // isTurnShape 的注释）。
  const turns: AskTurn[] = shaped.map((t) => ({ role: t.role, content: t.content }))

  return { ok: true, turns, locale: typeof locale === 'string' ? locale : DEFAULT_LOCALE }
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
 * parseAskBody 已经保证入参的最后一条是 user，maxTurns >= 1 时窗口非空，
 * 所以这里必然能找到至少一条 user 消息，firstUserIdx 不会是 -1。
 */
export function trimHistory(turns: AskTurn[], maxTurns: number): AskTurn[] {
  const windowed = turns.slice(-maxTurns)
  const firstUserIdx = windowed.findIndex((t) => t.role === 'user')
  return firstUserIdx <= 0 ? windowed : windowed.slice(firstUserIdx)
}
