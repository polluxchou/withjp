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

export async function deepseekChat(systemPrompt: string, turns: ChatTurn[]): Promise<DeepseekResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'not_configured', message: 'DEEPSEEK_API_KEY is not configured' }
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
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
      return { ok: false, code: 'upstream', message: `DeepSeek ${res.status}: ${text.slice(0, 500)}` }
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const answer = data.choices?.[0]?.message?.content?.trim()
    if (!answer) return { ok: false, code: 'upstream', message: 'DeepSeek returned an empty answer' }
    return { ok: true, answer }
  } catch (err) {
    return { ok: false, code: 'upstream', message: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}
