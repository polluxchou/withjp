import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// PATCH /api/agents/:id — update model_provider and/or model_name
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()

  const allowed = ['model_provider', 'model_name'] as const
  type AllowedKey = (typeof allowed)[number]
  const updates: Partial<Record<AllowedKey, string | null>> = {}

  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { data: null, error: 'No valid fields to update' },
      { status: 400 }
    )
  }

  const VALID_PROVIDERS = ['anthropic', 'openai', 'gemini']
  if (updates.model_provider !== undefined && updates.model_provider !== null) {
    if (!VALID_PROVIDERS.includes(updates.model_provider)) {
      return NextResponse.json(
        { data: null, error: `model_provider must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      )
    }
  }

  const { data, error } = await db
    .from('agents')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}
