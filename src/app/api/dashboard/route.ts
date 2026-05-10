export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import type { CreatorStatus, DashboardStats } from '@/lib/types'
import { ALL_STATUSES } from '@/lib/state-machine/creator-lifecycle'

// GET /api/dashboard — aggregated stats for the home dashboard
export async function GET() {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const [creatorsRes, tasksRes, financeRes] = await Promise.all([
    db.from('creators').select('id, status'),
    db.from('tasks').select('id, status'),
    db.from('finance').select('revenue, cost, profit, roi, creator_id'),
  ])

  const creators    = creatorsRes.data ?? []
  const tasks       = tasksRes.data ?? []
  const financeRows = financeRes.data ?? []

  // Creators by status
  const creators_by_status = ALL_STATUSES.reduce(
    (acc, s) => {
      acc[s] = creators.filter((c) => c.status === s).length
      return acc
    },
    {} as Record<CreatorStatus, number>
  )

  // Finance aggregation
  const total_revenue = financeRows.reduce((s, r) => s + Number(r.revenue), 0)
  const total_cost    = financeRows.reduce((s, r) => s + Number(r.cost),    0)
  const total_profit  = total_revenue - total_cost
  const rois          = financeRows.filter((r) => r.roi != null).map((r) => Number(r.roi))
  const avg_roi       = rois.length ? rois.reduce((s, r) => s + r, 0) / rois.length : 0

  // Profitable = creators with at least one finance record where roi > 0
  const profitableCreatorIds = new Set(
    financeRows.filter((r) => Number(r.roi) > 0).map((r) => r.creator_id)
  )

  const stats: DashboardStats = {
    total_creators:      creators.length,
    creators_by_status,
    total_revenue,
    total_profit,
    avg_roi,
    pending_tasks:       tasks.filter((t) => t.status === 'pending').length,
    running_tasks:       tasks.filter((t) => t.status === 'running').length,
    done_tasks:          tasks.filter((t) => t.status === 'done').length,
    profitable_creators: profitableCreatorIds.size,
  }

  return NextResponse.json({ data: stats, error: null })
}
