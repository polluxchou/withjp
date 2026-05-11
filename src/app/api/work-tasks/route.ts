import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import type { WorkTaskType, WorkTaskStatus, AgentRole } from '@/lib/types'

const VALID_TYPES:    WorkTaskType[]   = ['fixed', 'adhoc']
const VALID_STATUSES: WorkTaskStatus[] = ['planned', 'doing', 'done', 'cancelled']
const VALID_EFFORTS   = [2, 4, 8]
const VALID_DEPTS:    AgentRole[]      = ['bd', 'ops', 'finance', 'content', 'growth', 'legal']

// GET /api/work-tasks
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db     = createServerClient()
  const params = req.nextUrl.searchParams

  const date        = params.get('date')
  const date_from   = params.get('date_from')
  const date_to     = params.get('date_to')
  const department  = params.get('department')
  const milestone_id = params.get('milestone_id')
  const owner       = params.get('owner_user_id')
  const status      = params.get('status')
  const task_type   = params.get('task_type')

  let query = db
    .from('work_tasks')
    .select(`
      *,
      owner:users!work_tasks_owner_user_id_fkey(id, name, user_code, role),
      milestone:milestones(id, title)
    `)
    .order('task_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (date)         query = query.eq('task_date', date)
  if (date_from)    query = query.gte('task_date', date_from)
  if (date_to)      query = query.lte('task_date', date_to)
  if (department)   query = query.eq('department', department)
  if (milestone_id) query = query.eq('milestone_id', milestone_id)
  if (owner)        query = query.eq('owner_user_id', owner)
  if (status)       query = query.eq('status', status)
  if (task_type)    query = query.eq('task_type', task_type)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/work-tasks
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()

  const {
    task_type, title, description, department,
    milestone_id, owner_user_id, executor_ids,
    task_date, effort_hours, status, notes,
  } = body

  if (!title?.trim())    return NextResponse.json({ data: null, error: 'title is required' }, { status: 400 })
  if (!task_date)        return NextResponse.json({ data: null, error: 'task_date is required' }, { status: 400 })
  if (!owner_user_id)    return NextResponse.json({ data: null, error: 'owner_user_id is required' }, { status: 400 })
  if (!department || !VALID_DEPTS.includes(department))
    return NextResponse.json({ data: null, error: 'valid department is required' }, { status: 400 })
  if (!VALID_EFFORTS.includes(Number(effort_hours)))
    return NextResponse.json({ data: null, error: 'effort_hours must be 2, 4, or 8' }, { status: 400 })

  const { data, error } = await db
    .from('work_tasks')
    .insert({
      task_type:     VALID_TYPES.includes(task_type) ? task_type : 'adhoc',
      title:         title.trim(),
      description:   description ?? null,
      department,
      milestone_id:  milestone_id ?? null,
      owner_user_id,
      executor_ids:  Array.isArray(executor_ids) ? executor_ids : [],
      task_date,
      effort_hours:  Number(effort_hours),
      status:        VALID_STATUSES.includes(status) ? status : 'planned',
      notes:         notes ?? null,
    })
    .select('*, owner:users!work_tasks_owner_user_id_fkey(id,name,user_code,role), milestone:milestones(id,title)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
