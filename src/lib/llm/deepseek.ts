// src/lib/llm/deepseek.ts
// DeepSeek 的最小 chat transport（OpenAI 兼容协议）。
//
// 为什么不走 src/lib/agents/providers.ts：那里的 provider 联合类型绑着数据库的
// model_provider 枚举，为一个内部只读功能去改 DB 枚举不划算。
// src/lib/intent/parser.ts 当初接 Gemini 就是同样的取舍，此处沿用。
//
// 上下文缓存：DeepSeek 对重复的 prompt 前缀自动命中硬盘缓存，所以调用方必须
// 把体积最大、每轮都一样的那部分（数据包）放在 system 消息里、位置固定不变。

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type DeepseekResult =
  | { ok: true; answer: string }
  | { ok: false; code: 'not_configured' | 'upstream'; message: string }

const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 60_000

// 形如 https://user:pass@host/... 的 URL：undici 会在构造 Request 时直接拒绝，
// 并把带明文凭据的完整 URL 塞进 err.message。
const URL_WITH_CREDENTIALS_RE = /\/\/[^/@\s]+@/

// 这个错误字符串是用户可见的：端点把它原样透传，面板用一个「复制报错」按钮
// 展示给人看，可能进聊天记录或工单。任何可能带着用户名密码的 URL 片段都要
// 先脱敏——这不是过度防御，undici 在 baseUrl 带凭据时就是把完整 URL 明文
// 写进 TypeError.message，见下面 deepseekChat 里的 guard。
export function redactCredentials(message: string): string {
  return message.replace(/\/\/[^/@\s]+@/g, '//***@')
}

export async function deepseekChat(systemPrompt: string, turns: ChatTurn[]): Promise<DeepseekResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'not_configured', message: 'DEEPSEEK_API_KEY is not configured' }
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  if (URL_WITH_CREDENTIALS_RE.test(baseUrl)) {
    return { ok: false, code: 'not_configured', message: 'DEEPSEEK_BASE_URL must not contain credentials' }
  }
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: 'system', content: systemPrompt }, ...turns],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return { ok: false, code: 'upstream', message: redactCredentials(`DeepSeek ${res.status}: ${text.slice(0, 500)}`) }
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const answer = data.choices?.[0]?.message?.content?.trim()
    if (!answer) return { ok: false, code: 'upstream', message: 'DeepSeek returned an empty answer' }
    return { ok: true, answer }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, code: 'upstream', message: `DeepSeek request timed out after ${TIMEOUT_MS / 1000}s` }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, code: 'upstream', message: redactCredentials(message) }
  } finally {
    clearTimeout(timer)
  }
}
