import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile, canModify } from '@/lib/auth/actor'

type Params = { params: { id: string } }

const VALID_STATUSES = ['planned', 'doing', 'done', 'cancelled']
const VALID_EFFORTS  = [2, 4, 8]

// PATCH /api/work-tasks/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()

  const actor = await getActorProfile(user.id)
  if (!actor?.is_admin) {
    const { data: existing } = await db
      .from('work_tasks')
      .select('owner_user_id')
      .eq('id', params.id)
      .single()
    if (!canModify(actor, existing?.owner_user_id ?? null)) {
      return NextResponse.json({ data: null, error: '权限不足：只能编辑自己创建的任务' }, { status: 403 })
    }
  }

  const body = await req.json()
  const { id: _id, created_at: _ca, updated_at: _ua, owner: _o, milestone: _m, ...updates } = body

  if ('effort_hours' in updates && !VALID_EFFORTS.includes(Number(updates.effort_hours))) {
    return NextResponse.json({ data: null, error: 'effort_hours must be 2, 4, or 8' }, { status: 400 })
  }
  if ('status' in updates && !VALID_STATUSES.includes(updates.status)) {
    return NextResponse.json({ data: null, error: 'invalid status' }, { status: 400 })
  }
  if ('title' in updates && !updates.title?.trim()) {
    return NextResponse.json({ data: null, error: 'title cannot be empty' }, { status: 400 })
  }

  const { data, error } = await db
    .from('work_tasks')
    .update(updates)
    .eq('id', params.id)
    .select('*, owner:users!work_tasks_owner_user_id_fkey(id,name,user_code,role), milestone:milestones(id,title)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/work-tasks/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()

  const actor = await getActorProfile(user.id)
  if (!actor?.is_admin) {
    const { data: existing } = await db
      .from('work_tasks')
      .select('owner_user_id')
      .eq('id', params.id)
      .single()
    if (!canModify(actor, existing?.owner_user_id ?? null)) {
      return NextResponse.json({ data: null, error: '权限不足：只能删除自己创建的任务' }, { status: 403 })
    }
  }

  const { error } = await db.from('work_tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
