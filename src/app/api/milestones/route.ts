import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateMilestoneTasks } from '@/lib/milestones/auto-tasks'
import { authGuard } from '@/lib/auth/guard'
import {
  normalizeDayStamp,
  planStatusRecompute,
  resolveCompletion,
  type RecomputableMilestone,
} from '@/lib/milestones/completion'
import type { Milestone } from '@/lib/types'

let lastSyncAt = 0
const SYNC_INTERVAL_MS = 60_000

// 时间兜底：把每一行「未完成」的节点重算成此刻该有的状态(节流到每分钟一次)。
//
// 原先这里是两条写死的单向 UPDATE(→ missed、→ at_risk),没有任何反向路径 ——
// 一旦某行被判成 missed,之后把目标日期往后改,它永远出不来,列表上就出现
// 「已逾期」和「剩 15 天」并排显示的自相矛盾。现在改成「读回来 → 按同一套
// 规则重算 → 只写真正变了的行」,规则的唯一真相在 completion.ts,而不是散在
// 两条 SQL 过滤条件里。
async function syncStatusByTime(db: ReturnType<typeof createServerClient>) {
  const tick = Date.now()
  if (tick - lastSyncAt < SYNC_INTERVAL_MS) return
  lastSyncAt = tick

  // 只取 completed_date is null 的行,是不变式之外的第二道闸：万一有旁路写入
  // (seed / 脚本)留下「有完成日期却不是 completed」的行,时间兜底也不该把一个
  // 已经交付的节点改判成逾期。
  const { data, error } = await db
    .from('milestones')
    .select('id, status, start_date, target_date')
    .is('completed_date', null)
  if (error || !data) return

  const groups = planStatusRecompute(data as RecomputableMilestone[], new Date())

  // 每个目标状态一条 UPDATE —— 最多四条,通常零条(没有任何行需要改)。
  // 写入时再挂一次 `.is('completed_date', null)`：读到写之间可能有人刚填上
  // 完成日期,那一行不该被兜底拽回开放态。
  await Promise.all(
    groups.map(({ status, ids }) =>
      db.from('milestones')
        .update({ status })
        .in('id', ids)
        .is('completed_date', null),
    ),
  )
}

// GET /api/milestones
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  await syncStatusByTime(db)

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const type     = searchParams.get('type')
  const level    = searchParams.get('level')
  const priority = searchParams.get('priority')

  // eslint-disable-next-line
  let query = (db.from('milestones') as any)
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .order('target_date', { ascending: true })

  if (status)   query = query.eq('status', status)
  if (type)     query = query.eq('type', type)
  if (level)    query = query.eq('level', level)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  const now = Date.now()
  const enriched = (data ?? []).map((m: Milestone) => ({
    ...m,
    days_until_target: Math.ceil(
      (new Date(m.target_date).getTime() - now) / 86400000
    ),
  }))

  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/milestones
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db   = createServerClient()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    title, description, type, level, priority, risk_level,
    owner_agent_id, involved_agent_ids, linked_creator_ids,
    parent_milestone_id, start_date, target_date, completed_date,
    success_metric, notes,
  } = body

  if (!title || !type || !start_date || !target_date) {
    return NextResponse.json(
      { data: null, error: 'title, type, start_date, and target_date are required' },
      { status: 400 }
    )
  }

  // 建节点时也允许直接带上完成日期(补录历史节点),状态由同一套规则推导,
  // 而不是让调用方自己传 status —— 建表接口从来不收 status。
  const completedStamp = normalizeDayStamp(completed_date)
  if (completedStamp === undefined) {
    return NextResponse.json({ data: null, error: 'completed_date is not a valid date' }, { status: 400 })
  }
  if (completedStamp && new Date(completedStamp) < new Date(start_date as string)) {
    return NextResponse.json(
      { data: null, error: 'completed_date must not be earlier than start_date' },
      { status: 400 },
    )
  }

  const completion = resolveCompletion(
    { start_date: start_date as string, target_date: target_date as string, status: 'planned', completed_date: null },
    { completed_date: completedStamp },
    new Date(),
  )

  const { data: milestone, error } = await db
    .from('milestones')
    .insert({
      title,
      description:         description ?? null,
      type,
      level:               level               ?? 'company',
      priority:            priority            ?? 'medium',
      risk_level:          risk_level          ?? 'low',
      owner_agent_id:      owner_agent_id      ?? null,
      involved_agent_ids:  involved_agent_ids  ?? [],
      linked_creator_ids:  linked_creator_ids  ?? [],
      parent_milestone_id: parent_milestone_id ?? null,
      start_date,
      target_date,
      completed_date:      completion.completed_date,
      status:              completion.status,
      success_metric:      success_metric      ?? {},
      notes:               notes               ?? null,
      created_by_user_id:  user.id,
    })
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .single()

  if (error || !milestone) {
    return NextResponse.json(
      { data: null, error: error?.message ?? 'Insert failed' },
      { status: 500 }
    )
  }

  // Auto-generate tasks when owner + creators are set
  if (milestone.owner_agent_id && Array.isArray(linked_creator_ids) && linked_creator_ids.length > 0) {
    await generateMilestoneTasks(db, milestone as Milestone)
  }

  return NextResponse.json({ data: milestone, error: null }, { status: 201 })
}
