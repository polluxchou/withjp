import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/agents
export async function GET() {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { data, error } = await db
    .from('agents')
    .select('*')
    .order('role')

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/agents — create a custom agent
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { name, role, responsibility, prompt_template, input_schema, output_schema } = body

  if (!name || !role || !responsibility || !prompt_template) {
    return NextResponse.json(
      { data: null, error: 'name, role, responsibility, and prompt_template are required' },
      { status: 400 }
    )
  }

  const { data, error } = await db
    .from('agents')
    .insert({ name, role, responsibility, prompt_template, input_schema: input_schema ?? {}, output_schema: output_schema ?? {} })
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
