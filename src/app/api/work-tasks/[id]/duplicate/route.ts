import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// POST /api/work-tasks/:id/duplicate
// Body: { target_date: string }  — copies the task to a new date
export async function POST(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()
  const { target_date } = body

  if (!target_date) {
    return NextResponse.json({ data: null, error: 'target_date is required' }, { status: 400 })
  }

  // Fetch original
  const { data: original, error: fetchErr } = await db
    .from('work_tasks')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !original) {
    return NextResponse.json({ data: null, error: fetchErr?.message ?? 'Not found' }, { status: 404 })
  }

  // Insert copy with new date, reset status to planned
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = original

  const { data, error } = await db
    .from('work_tasks')
    .insert({ ...rest, task_date: target_date, status: 'planned' })
    .select('*, owner:users!work_tasks_owner_user_id_fkey(id,name,user_code,role), milestone:milestones(id,title)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
