export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import type { ModelProvider } from '@/lib/types'

// POST /api/agents/test-connection
// Body: { provider: ModelProvider, model_name: string }
// Makes a minimal single-token call to verify credentials and connectivity.
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const body = await req.json()
  const { provider, model_name } = body as { provider: ModelProvider; model_name: string }

  if (!provider || !model_name) {
    return NextResponse.json({ ok: false, error: 'provider and model_name are required' }, { status: 400 })
  }

  try {
    switch (provider) {
      case 'anthropic': await testAnthropic(model_name); break
      case 'openai':    await testOpenAI(model_name);    break
      case 'gemini':    await testGemini(model_name);    break
      default:
        return NextResponse.json({ ok: false, error: `Unknown provider: ${provider}` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, provider, model_name })
  } catch (err) {
    const raw     = err instanceof Error ? err.message : String(err)
    const friendly = friendlyError(provider, raw)
    return NextResponse.json({ ok: false, error: friendly, raw }, { status: 200 })
  }
}

async function testAnthropic(model: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in .env.local')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  await client.messages.create({
    model,
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  })
}

async function testOpenAI(model: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env.local')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })
  await client.chat.completions.create({
    model,
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  })
}

async function testGemini(model: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env.local')

  const base = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
  const url  = `${base}/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
}

// ── Error translation ──────────────────────────────────────────

function friendlyError(provider: ModelProvider, raw: string): string {
  // Missing key
  if (raw.includes('not set in .env.local')) return raw

  // Network / DNS failures (common in restricted networks / mainland China)
  if (raw.includes('fetch failed') || raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED') || raw.includes('ETIMEDOUT')) {
    if (provider === 'gemini') {
      return `Cannot reach Gemini API. Google services may be blocked in your network. Set GEMINI_BASE_URL in .env.local to route through a proxy (e.g. a relay hosted outside the restricted region).`
    }
    return `Cannot reach ${provider} API — the server cannot connect to the internet or the endpoint is blocked.`
  }

  // Auth errors
  if (raw.includes('401') || raw.includes('403') || raw.includes('invalid_api_key') || raw.includes('API key')) {
    return `Invalid API key for ${provider}. Verify the key in your .env.local file.`
  }

  // Rate limits
  if (raw.includes('429') || raw.includes('rate_limit') || raw.includes('quota')) {
    return `${provider} rate limit or quota exceeded. The key is valid — try again in a moment.`
  }

  // Model not found
  if (raw.includes('model') && (raw.includes('not found') || raw.includes('does not exist') || raw.includes('404'))) {
    return `Model not available. Check the model name is correct for your ${provider} account tier.`
  }

  return raw
}
