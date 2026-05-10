import type { ModelConfig } from './model-config'

// ── Shared types ─────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const STRUCTURED_SYSTEM_PROMPT =
  'You are a specialized AI agent in a creator guild operating system. Always respond with valid JSON only — no markdown, no explanation outside the JSON.'

// ── Structured JSON output (used by task executor) ───────────

export async function generateStructuredOutput(
  config: ModelConfig,
  userPrompt: string
): Promise<string> {
  switch (config.provider) {
    case 'anthropic': return callAnthropic(config.model, userPrompt)
    case 'openai':    return callOpenAI(config.model, userPrompt)
    case 'gemini':    return callGemini(config.model, userPrompt)
    default:
      throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`)
  }
}

// ── Chat response (used by conversation executor) ────────────

export async function generateChatResponse(
  config: ModelConfig,
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> {
  switch (config.provider) {
    case 'anthropic': return callAnthropicChat(config.model, systemPrompt, history)
    case 'openai':    return callOpenAIChat(config.model, systemPrompt, history)
    case 'gemini':    return callGeminiChat(config.model, systemPrompt, history)
    default:
      throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`)
  }
}

// ── Provider implementations ──────────────────────────────────

async function callAnthropic(model: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system:   STRUCTURED_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

async function callAnthropicChat(model: string, systemPrompt: string, history: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system:   systemPrompt,
    messages: history.map((m) => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

async function callOpenAI(model: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: STRUCTURED_SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
  })

  return completion.choices[0]?.message?.content ?? ''
}

async function callOpenAIChat(model: string, systemPrompt: string, history: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role:    m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
    ],
  })

  return completion.choices[0]?.message?.content ?? ''
}

// ── Gemini via REST API ───────────────────────────────────────
// Using the raw REST API so GEMINI_BASE_URL can point to a proxy/relay
// for networks where google.com is blocked.

function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return key
}

function geminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}

async function geminiPost(model: string, body: object): Promise<string> {
  const url = `${geminiBaseUrl()}/v1beta/models/${model}:generateContent?key=${geminiApiKey()}`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? ''
}

async function callGemini(model: string, userPrompt: string): Promise<string> {
  const fullPrompt = `${STRUCTURED_SYSTEM_PROMPT}\n\n${userPrompt}`
  return geminiPost(model, {
    contents:         [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  })
}

async function callGeminiChat(model: string, systemPrompt: string, history: ChatMessage[]): Promise<string> {
  // Inject system prompt as first exchange so it works across all models.
  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood.' }] },
    ...history.map((m) => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
  ]
  return geminiPost(model, { contents })
}
