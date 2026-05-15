export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import StatsCard from '@/components/dashboard/StatsCard'
import TaskCard from '@/components/tasks/TaskCard'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import {
  Users, TrendingUp, CheckSquare, DollarSign,
  ArrowRight, Activity,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { DashboardStats, Task, Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES } from '@/lib/state-machine/creator-lifecycle'
import { fmtCompact } from '@/lib/currency'

async function getDashboardData() {
  const db = createServerClient()
  const [creatorsAllRes, financeRes, tasksAllRes, recentTasksRes, recentCreatorsRes] = await Promise.all([
    db.from('creators').select('id, status'),
    db.from('finance').select('revenue, cost, profit, roi, creator_id'),
    db.from('tasks').select('id, status'),
    db.from('tasks')
      .select('*, creator:creators(id,name,platform,status), agent:agents(id,name,role)')
      .order('created_at', { ascending: false }).limit(5),
    db.from('creators')
      .select('*').order('created_at', { ascending: false }).limit(5),
  ])

  const creators    = creatorsAllRes.data ?? []
  const financeRows = financeRes.data ?? []
  const tasks       = tasksAllRes.data ?? []

  const creators_by_status = ALL_STATUSES.reduce(
    (acc, s) => { acc[s] = creators.filter((c) => c.status === s).length; return acc },
    {} as Record<CreatorStatus, number>
  )

  const total_revenue = financeRows.reduce((s, r) => s + Number(r.revenue), 0)
  const total_cost    = financeRows.reduce((s, r) => s + Number(r.cost),    0)
  const total_profit  = total_revenue - total_cost
  const rois          = financeRows.filter((r) => r.roi != null).map((r) => Number(r.roi))
  const avg_roi       = rois.length ? rois.reduce((s, r) => s + r, 0) / rois.length : 0
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

  return {
    stats,
    recentTasks:    (recentTasksRes.data  ?? []) as Task[],
    recentCreators: (recentCreatorsRes.data ?? []) as Creator[],
  }
}

export default async function DashboardPage() {
  const { stats, recentTasks, recentCreators } = await getDashboardData()
  const t = await getTranslations('dashboard')
  const tCreators = await getTranslations('creators')
  const tStatus = await getTranslations('status')
  const locale = await getLocale()

  const fmt = (n: number) => `¥${fmtCompact(n, locale)}`

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link href="/creators" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-800">
            {t('viewAllCreators')} <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatsCard
          label={t('totalCreators')}
          value={stats?.total_creators ?? 0}
          icon={Users}
          sub={t('acrossAllStages')}
        />
        <StatsCard
          label={t('totalRevenue')}
          value={fmt(stats?.total_revenue ?? 0)}
          icon={DollarSign}
          accent="bg-emerald-50 text-emerald-600"
          sub={`${t('profit')}: ${fmt(stats?.total_profit ?? 0)}`}
        />
        <StatsCard
          label={t('avgROI')}
          value={`${(stats?.avg_roi ?? 0).toFixed(1)}%`}
          icon={TrendingUp}
          accent="bg-blue-50 text-blue-600"
          sub={t('profitableCreators', { count: stats?.profitable_creators ?? 0 })}
        />
        <StatsCard
          label={t('openTasks')}
          value={(stats?.pending_tasks ?? 0) + (stats?.running_tasks ?? 0)}
          icon={CheckSquare}
          accent="bg-amber-50 text-amber-600"
          sub={t('completedTotal', { count: stats?.done_tasks ?? 0 })}
        />
      </div>

      {/* Pipeline funnel + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Funnel */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">{t('pipelineFunnel')}</h2>
          </div>
          <div className="space-y-2">
            {ALL_STATUSES.map((s) => {
              const count = stats?.creators_by_status[s] ?? 0
              const total = stats?.total_creators || 1
              const pct   = Math.round((count / total) * 100)
              return (
                <div key={s}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">{tStatus(s)}</span>
                    <span className="font-medium text-slate-900">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <Link href="/pipeline" className="mt-4 flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-800">
            {t('openPipeline')} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Recent Tasks */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('recentTasks')}</h2>
            <Link href="/tasks" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">{t('viewAll')}</Link>
          </div>
          {recentTasks.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              {t('noTasksYet')}
            </div>
          )}
          {recentTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>

      {/* Recent Creators */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{t('recentlyAddedCreators')}</h2>
          <Link href="/creators" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">{t('viewAll')}</Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {recentCreators.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('noCreatorsYet')}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{tCreators('creator')}</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{tCreators('platform')}</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{tCreators('status')}</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{tCreators('niche')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentCreators.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-5 py-3 text-slate-500">{c.platform}</td>
                    <td className="px-5 py-3"><LifecycleBadge status={c.status} size="sm" /></td>
                    <td className="px-5 py-3 text-slate-400">{c.profile?.niche ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/creators/${c.id}`} className="text-xs text-indigo-600 hover:text-indigo-800">{tCreators('view')} →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
