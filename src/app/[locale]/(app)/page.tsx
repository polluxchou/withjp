export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import { Stat, StatBand } from '@/components/ui/Stat'
import SectionCard from '@/components/ui/SectionCard'
import RecordRow from '@/components/ui/RecordRow'
import ProgressBar from '@/components/ui/ProgressBar'
import Tag from '@/components/ui/Tag'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import EmptyState from '@/components/ui/EmptyState'
import { toneOf } from '@/lib/ui/status-tone'
import {
  Users, CheckSquare,
  ArrowRight, Activity,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageGreeting from '@/components/ui/PageGreeting'
import type { DashboardStats, Task, Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES } from '@/lib/state-machine/creator-lifecycle'
import { fmtCompact } from '@/lib/currency-format'

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
  const tTasks = await getTranslations('tasks')
  const locale = await getLocale()

  const fmt = (n: number) => `¥${fmtCompact(n, locale)}`

  return (
    <div>
      <Header
        title={<PageGreeting />}
        subtitle={t('subtitle')}
        actions={
          <Link href="/creators" className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary-hover">
            {t('viewAllCreators')} <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />

      {/* KPI band — StatBand + Stat×4 (new language KPI has no icon chip,
          see docs/design-system.md §6.2; delta/note carry the pre-existing
          `sub` copy, no trend deltas are available from this data source). */}
      <div className="mb-8">
        <StatBand>
          <Stat
            label={t('totalCreators')}
            value={stats?.total_creators ?? 0}
            note={t('acrossAllStages')}
          />
          <Stat
            label={t('totalRevenue')}
            value={fmt(stats?.total_revenue ?? 0)}
            note={`${t('profit')}: ${fmt(stats?.total_profit ?? 0)}`}
          />
          <Stat
            label={t('avgROI')}
            value={`${(stats?.avg_roi ?? 0).toFixed(1)}%`}
            note={t('profitableCreators', { count: stats?.profitable_creators ?? 0 })}
          />
          <Stat
            label={t('openTasks')}
            value={(stats?.pending_tasks ?? 0) + (stats?.running_tasks ?? 0)}
            note={t('completedTotal', { count: stats?.done_tasks ?? 0 })}
          />
        </StatBand>
      </div>

      {/* Pipeline funnel + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Funnel */}
        <div className="lg:col-span-1">
          <SectionCard
            icon={<Activity />}
            title={t('pipelineFunnel')}
            accent="violet"
            footer={
              <Link href="/pipeline" className="flex items-center gap-1 text-primary font-medium hover:text-primary-hover">
                {t('openPipeline')} <ArrowRight className="w-3 h-3" />
              </Link>
            }
          >
            <div className="space-y-3">
              {ALL_STATUSES.map((s) => {
                const count = stats?.creators_by_status[s] ?? 0
                const total = stats?.total_creators || 1
                return (
                  <div key={s}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-ink-500">{tStatus(s)}</span>
                      <span className="font-medium text-ink-900 tabular-nums">{count}</span>
                    </div>
                    {/* tone="default" pinned explicitly — ProgressBar's own
                        >90% auto-warning heuristic reads as risk for a
                        generic progress bar, but a pipeline stage holding
                        >90% of all creators (e.g. everyone still sitting at
                        prospect) is a normal distribution shape, not a
                        warning signal. */}
                    <ProgressBar value={count} max={total} label={tStatus(s)} tone="default" />
                  </div>
                )
              })}
            </div>
          </SectionCard>
        </div>

        {/* Recent Tasks */}
        <div className="lg:col-span-2">
          <SectionCard
            padding="none"
            icon={<CheckSquare />}
            title={t('recentTasks')}
            actions={<Link href="/tasks" className="text-xs text-primary font-medium hover:text-primary-hover">{t('viewAll')}</Link>}
          >
            {recentTasks.length === 0 ? (
              <EmptyState title={t('noTasksYet')} />
            ) : (
              <div>
                {recentTasks.map((task) => (
                  <RecordRow
                    key={task.id}
                    href={task.creator ? `/creators/${task.creator.id}` : undefined}
                    status={toneOf('task', task.status)}
                    title={task.title}
                    meta={task.creator ? [{ text: `${task.creator.name} · ${task.creator.platform}` }] : []}
                    tags={
                      <div className="flex items-center gap-1.5 flex-none">
                        {/* status dot alone is color-only — pair it with the
                            text Tag so status isn't carried by color alone
                            (design-system §6.2). */}
                        <Tag size="sm" tone={toneOf('task', task.status)} label={tTasks(task.status)} />
                        {task.agent?.name && <Tag size="sm" tone="violet" label={task.agent.name} />}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Recent Creators */}
      <div className="mt-6">
        <SectionCard
          padding="none"
          icon={<Users />}
          title={t('recentlyAddedCreators')}
          actions={<Link href="/creators" className="text-xs text-primary font-medium hover:text-primary-hover">{t('viewAll')}</Link>}
        >
          {recentCreators.length === 0 ? (
            <EmptyState title={t('noCreatorsYet')} />
          ) : (
            <div>
              {recentCreators.map((c) => (
                <RecordRow
                  key={c.id}
                  href={`/creators/${c.id}`}
                  status={toneOf('creator', c.status)}
                  title={c.name}
                  meta={[
                    { text: c.platform },
                    { text: c.profile?.niche ?? tCreators('noNiche') },
                  ]}
                  tags={
                    <div className="flex items-center gap-1.5 flex-none">
                      <LifecycleBadge status={c.status} size="sm" />
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
