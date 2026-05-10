import { NextRequest, NextResponse } from 'next/server'
import { generateStructuredOutput } from '@/lib/agents/providers'
import { authGuard } from '@/lib/auth/guard'
import type { ModelProvider } from '@/lib/types'

const VALID_PROVIDERS: ModelProvider[] = ['anthropic', 'openai', 'gemini']

// POST /api/providers/test
// Body: { provider, model_name }
// Makes a minimal live call to verify the API key + model are reachable.
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const body = await req.json()
  const { provider, model_name } = body as { provider: ModelProvider; model_name: string }

  if (!provider || !model_name) {
    return NextResponse.json(
      { data: null, error: 'provider and model_name are required' },
      { status: 400 }
    )
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { data: null, error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const raw = await generateStructuredOutput(
      { provider, model: model_name },
      'Reply with exactly this JSON and nothing else: {"ok":true}'
    )

    // Accept as long as the call didn't throw — even non-JSON is a reachability success
    const reachable = true
    let parsed: unknown = null
    try { parsed = JSON.parse(raw) } catch { /* non-JSON is fine for a connectivity test */ }

    return NextResponse.json({
      data: { reachable, provider, model_name, response: parsed ?? raw },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ data: null, error: message }, { status: 502 })
  }
}
