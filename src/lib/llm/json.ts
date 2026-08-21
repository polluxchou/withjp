// 双供应商的「要一段 JSON」传输层。
//
// 抽出来的直接动机是消掉两份重复：src/lib/intent/parser.ts 与
// src/lib/venue/venue-intent.ts 各有一份功能相同的 Gemini shim（文本不完全
// 一致，只差对齐空格）。顺带把 DeepSeek 接进来 —— 意图解析的快档换成它。
//
// buildRequest / extractText 是导出的纯函数：两家的请求体和响应形状完全不同，
// 而 node --test 下没有网络，只有把这两步拆出来才测得到。

export type LlmProvider = 'gemini' | 'deepseek'

export interface LlmModel {
  provider: LlmProvider
  model:    string
}

export interface LlmDeps {
  fetchImpl?: typeof fetch
}

export function describeModel(m: LlmModel): string {
  return `${m.provider}:${m.model}`
}

function requireKey(name: string): string {
  const key = process.env[name]
  // 错误信息里只提变量名，绝不带 prompt —— 它会进日志。
  if (!key) throw new Error(`${name} is not configured`)
  return key
}

function baseUrl(name: string, fallback: string): string {
  return (process.env[name] ?? fallback).replace(/\/$/, '')
}

// DeepSeek 的 json_object 模式要求 prompt 里出现 "json"。现有三条意图 prompt
// 写的是大写 "JSON"，大小写他们文档没保证，所以这里固定补一条小写的；顺带
// 禁掉 markdown 围栏（调用方的 tryParse 不剥围栏）。
const DEEPSEEK_JSON_SYSTEM = 'Output a single valid json object. No prose, no markdown fences.'

export function buildRequest(m: LlmModel, prompt: string): { url: string; init: RequestInit } {
  if (m.provider === 'gemini') {
    const key  = requireKey('GEMINI_API_KEY')
    const base = baseUrl('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')
    return {
      url: `${base}/v1beta/models/${m.model}:generateContent?key=${key}`,
      init: {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    }
  }

  const key  = requireKey('DEEPSEEK_API_KEY')
  const base = baseUrl('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
  return {
    url: `${base}/chat/completions`,
    init: {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:    m.model,
        messages: [
          { role: 'system', content: DEEPSEEK_JSON_SYSTEM },
          { role: 'user',   content: prompt },
        ],
        temperature:     0,
        response_format: { type: 'json_object' },
      }),
    },
  }
}

// 形状不符时返回空串而不是抛：调用方拿到空串会走 tryParse 失败 → 降级重试，
// 比抛异常炸掉整条请求好。
export function extractText(m: LlmModel, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>
  if (m.provider === 'gemini') {
    const cands = d.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
    return cands?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  const choices = d.choices as { message?: { content?: string } }[] | undefined
  return choices?.[0]?.message?.content ?? ''
}

export async function llmJson(m: LlmModel, prompt: string, deps?: LlmDeps): Promise<string> {
  const doFetch = deps?.fetchImpl ?? fetch
  const { url, init } = buildRequest(m, prompt)
  const res = await doFetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${describeModel(m)} ${res.status}: ${text}`)
  }
  return extractText(m, await res.json())
}
