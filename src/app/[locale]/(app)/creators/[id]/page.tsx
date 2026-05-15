'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import TaskCard from '@/components/tasks/TaskCard'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CreatorForm from '@/components/creators/CreatorForm'
import {
  ArrowLeft, ChevronRight, Play, DollarSign,
  TrendingUp, Activity, Clock, Edit,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import type { Creator, Task, Finance, LifecycleTransition, CreatorActivityLog } from '@/lib/types'
import {
  nextStatus, ALL_STATUSES,
} from '@/lib/state-machine/creator-lifecycle'
import { getPlatformUrl } from '@/lib/creators/platforms'
import { fmtCompact } from '@/lib/currency'
import { format } from 'date-fns/format'
import { ExternalLink } from 'lucide-react'

interface CreatorDetail extends Creator {
  tasks:         Task[]
  finance:       Finance[]
  transitions:   LifecycleTransition[]
  activity_logs: CreatorActivityLog[]
}

export default function CreatorDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const [data,    setData]    = useState<CreatorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [executing, setExecuting]         = useState<string | null>(null)
  const [showFinance, setShowFinance]     = useState(false)
  const [showEdit, setShowEdit]           = useState(false)
  const [financeForm, setFinanceForm]     = useState({ revenue: '', cost: '', period: '', notes: '' })
  const [tab, setTab] = useState<'tasks' | 'finance' | 'timeline' | 'activity'>('tasks')
  const locale = useLocale()
  const t = useTranslations('creatorDetail')
  const tCreators = useTranslations('creators')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')
  const tTasks = useTranslations('tasks')
  const tExpenses = useTranslations('expenses')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/creators/${id}`)
      const json = await res.json()
      setData(json.data)
    } catch (err) {
      console.error('Failed to load creator:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function transition() {
    if (!data) return
    const next = nextStatus(data.status)
    if (!next) return
    setTransitioning(true)
    await fetch(`/api/creators/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: next, triggered_by: 'user' }),
    })
    await load()
    setTransitioning(false)
  }

  async function executeTask(taskId: string) {
    setExecuting(taskId)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute' }),
    })
    await load()
    setExecuting(null)
  }

  async function submitFinance(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_id: id,
        revenue:    Number(financeForm.revenue),
        cost:       Number(financeForm.cost),
        period:     financeForm.period,
        notes:      financeForm.notes || undefined,
      }),
    })
    setShowFinance(false)
    setFinanceForm({ revenue: '', cost: '', period: '', notes: '' })
    await load()
  }

  if (loading) return <div className="p-12 text-center text-sm text-slate-400">{tCommon('loading')}</div>
  if (!data)   return <div className="p-12 text-center text-sm text-red-500">{tCreators('creatorNotFound')}</div>

  const next = nextStatus(data.status)
  const totalRevenue = data.finance.reduce((s, f) => s + Number(f.revenue), 0)
  const totalCost    = data.finance.reduce((s, f) => s + Number(f.cost), 0)
  const totalProfit  = totalRevenue - totalCost
  const avgROI       = data.finance.length
    ? data.finance.reduce((s, f) => s + Number(f.roi), 0) / data.finance.length
    : null

  const platformUrl = getPlatformUrl(data.platform, data.profile?.platform_id)

  return (
    <div>
      {/* Back + header */}
      <Link href="/creators" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> {tCreators('title')}
      </Link>

      <Header
        title={
          <div className="flex items-center gap-2">
            <span>{data.name}</span>
            {platformUrl && (
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 transition-colors"
                title={t('visitPlatform', { platform: data.platform })}
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
          </div>
        }
        subtitle={`${data.platform} · ${data.profile?.niche ?? tCreators('noNiche')} · ${data.profile?.followers != null ? fmtCompact(data.profile.followers, locale) : '—'} ${tCreators('followers')}`}
        actions={
          <div className="flex items-center gap-2">
            <LifecycleBadge status={data.status} />
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              <Edit className="w-3.5 h-3.5" /> {tCommon('edit')}
            </Button>
            {next && (
              <Button onClick={transition} loading={transitioning} size="sm">
                <ChevronRight className="w-3.5 h-3.5" />
                {t('moveTo', { status: tStatus(next) })}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowFinance(true)}>
              <DollarSign className="w-3.5 h-3.5" /> {tCreators('logRevenue')}
            </Button>
          </div>
        }
      />

      {/* Finance KPIs */}
      {data.finance.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: t('revenue'),  value: `¥${fmtCompact(totalRevenue, locale)}`,   color: 'text-emerald-600' },
            { label: t('cost'),     value: `¥${fmtCompact(totalCost, locale)}`,      color: 'text-red-500' },
            { label: t('profit'),   value: `¥${fmtCompact(totalProfit, locale)}`,    color: totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
            { label: t('avgROI'),   value: avgROI != null ? `${avgROI.toFixed(1)}%` : '—', color: (avgROI ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{tCreators('profile')}</h3>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400">{tCreators('platform')}</dt>
              <dd className="font-medium text-slate-900 truncate">
                {platformUrl ? (
                  <a
                    href={platformUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                  >
                    {data.platform}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  data.platform
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{tCreators('broadcastAccount')}</dt>
              <dd className="font-medium text-slate-900 truncate">
                {data.broadcast_account ? (
                  data.broadcast_account.account_url ? (
                    <a
                      href={data.broadcast_account.account_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                    >
                      {data.broadcast_account.name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    data.broadcast_account.name
                  )
                ) : '—'}
              </dd>
              {data.broadcast_account && (
                <p className="text-xs text-slate-400 truncate">{data.broadcast_account.account_handle}</p>
              )}
            </div>
            <div>
              <dt className="text-xs text-slate-400">{tCreators('operator')}</dt>
              <dd className="font-medium text-slate-900 truncate">{data.operator_user?.name ?? '—'}</dd>
              {data.operator_user && (
                <p className="text-xs text-slate-400 truncate">
                  {data.operator_user.user_code}{data.operator_user.email ? ` · ${data.operator_user.email}` : ''}
                </p>
              )}
            </div>
            {[
              [tCreators('niche'),        data.profile?.niche ?? '—'],
              [tCreators('followers'),    data.profile?.followers != null ? fmtCompact(data.profile.followers, locale) : '—'],
              [tCreators('avgViews'),     data.profile?.avg_views  != null ? fmtCompact(data.profile.avg_views, locale)  : '—'],
              [tCreators('location'),     data.profile?.location ?? '—'],
              [tCreators('email'),        data.contact_info?.email ?? '—'],
              [tCreators('wechat'),       data.contact_info?.wechat ?? '—'],
              [tCreators('added'),        format(new Date(data.created_at), 'MMM d, yyyy')],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-slate-400">{k as string}</dt>
                <dd className="font-medium text-slate-900 truncate">{v as string}</dd>
              </div>
            ))}
          </dl>
          {data.notes && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">{tCreators('notes')}</p>
              <p className="text-sm text-slate-600">{data.notes}</p>
            </div>
          )}
        </div>

        {/* Lifecycle progress */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{tCreators('lifecycle')}</h3>
          <div className="space-y-2">
            {ALL_STATUSES.map((s, i) => {
              const statusIdx   = ALL_STATUSES.indexOf(data.status)
              const isCompleted = i < statusIdx
              const isCurrent   = s === data.status
              const isPending   = i > statusIdx
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${isCompleted ? 'bg-indigo-600 text-white' : isCurrent ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                    {isCompleted ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${isCurrent ? 'text-indigo-600' : isPending ? 'text-slate-400' : 'text-slate-600'}`}>
                    {tStatus(s)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {(['tasks', 'finance', 'timeline', 'activity'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}>
            {t === 'tasks' ? `${tCreators('tasks')} (${data.tasks.length})` :
             t === 'finance' ? `${tCreators('finance')} (${data.finance.length})` :
             t === 'activity' ? `${tCreators('activity')} (${data.activity_logs?.length || 0})` :
             tCreators('timeline')}
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          {data.tasks.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              {t('noTasksYet')}
            </div>
          )}
          {data.tasks.map((task) => (
            <div key={task.id} className="space-y-2">
              <TaskCard task={task} />
              {task.status === 'pending' && (
                <div className="pl-7">
                  <Button
                    size="sm"
                    loading={executing === task.id}
                    onClick={() => executeTask(task.id)}
                  >
                    <Play className="w-3 h-3" />
                    {tCommon('run')} {task.agent?.name ?? tTasks('agent')}
                  </Button>
                </div>
              )}
              {task.status === 'done' && task.output && (
                <details className="pl-7">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">{t('viewOutput')}</summary>
                  <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-60 text-slate-700">
                    {JSON.stringify(task.output, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Finance tab */}
      {tab === 'finance' && (
        <div>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setShowFinance(true)}>
              <DollarSign className="w-3.5 h-3.5" /> {tCreators('logRevenue')}
            </Button>
          </div>
          {data.finance.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              {t('noFinanceYet')}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {[tExpenses('period'), t('revenue'), t('cost'), t('profit'), 'ROI', tCreators('notes')].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.finance.map((f) => (
                    <tr key={f.id} className="border-b border-slate-50">
                      <td className="px-5 py-3 font-medium">{f.period}</td>
                      <td className="px-5 py-3 text-emerald-600">¥{fmtCompact(Number(f.revenue), locale)}</td>
                      <td className="px-5 py-3 text-red-500">¥{fmtCompact(Number(f.cost), locale)}</td>
                      <td className={`px-5 py-3 font-medium ${Number(f.profit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        ¥{fmtCompact(Number(f.profit), locale)}
                      </td>
                      <td className={`px-5 py-3 font-medium ${Number(f.roi) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {Number(f.roi).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-slate-400">{f.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="space-y-0">
          {data.transitions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              {t('noTransitionsYet')}
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-200" />
              {data.transitions.map((transition) => (
                <div key={transition.id} className="relative mb-4">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white" />
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <LifecycleBadge status={transition.from_status} size="sm" />
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <LifecycleBadge status={transition.to_status} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {format(new Date(transition.triggered_at), 'MMM d, yyyy HH:mm')}
                      <span>·</span>
                      <span>{t('by', { actor: transition.triggered_by })}</span>
                    </div>
                    {transition.notes && <p className="text-xs text-slate-500 mt-1">{transition.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Log tab */}
      {tab === 'activity' && (
        <div className="space-y-0">
          {!data.activity_logs || data.activity_logs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              {t('noActivityYet')}
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-200" />
              {data.activity_logs.map((log) => {
                const activityColors: Record<string, string> = {
                  created: 'bg-green-600',
                  updated: 'bg-blue-600',
                  status_changed: 'bg-indigo-600',
                  task_created: 'bg-purple-600',
                  task_completed: 'bg-emerald-600',
                  finance_logged: 'bg-amber-600',
                  note_added: 'bg-slate-600',
                  contact_updated: 'bg-cyan-600',
                  profile_updated: 'bg-blue-600',
                  other: 'bg-gray-600',
                }
                const dotColor = activityColors[log.activity_type] || 'bg-slate-600'

                return (
                  <div key={log.id} className="relative mb-4">
                    <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full ${dotColor} border-2 border-white`} />
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-slate-900">{log.title}</h4>
                          {log.description && (
                            <p className="text-sm text-slate-600 mt-1">{log.description}</p>
                          )}
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 ml-3">
                          {log.activity_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                        <span>·</span>
                        <span>{t('by', { actor: log.actor })}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Log Revenue Modal */}
      <Modal open={showFinance} onClose={() => setShowFinance(false)} title={t('logRevenueCost')}>
        <form onSubmit={submitFinance} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t('revenueField')}</label>
              <input type="number" value={financeForm.revenue}
                onChange={(e) => setFinanceForm((f) => ({ ...f, revenue: e.target.value }))}
                placeholder="80000" required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t('costField')}</label>
              <input type="number" value={financeForm.cost}
                onChange={(e) => setFinanceForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="20000" required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t('periodField')}</label>
            <input value={financeForm.period}
              onChange={(e) => setFinanceForm((f) => ({ ...f, period: e.target.value }))}
              placeholder="2024-Q2 or 2024-05" required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{tCreators('notes')}</label>
            <textarea value={financeForm.notes}
              onChange={(e) => setFinanceForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder={tCommon('none')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowFinance(false)}>{tCommon('cancel')}</Button>
            <Button type="submit">{t('saveRecord')}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Creator Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={t('editCreator')} width="max-w-2xl">
        <CreatorForm
          creator={data}
          onSuccess={() => { setShowEdit(false); load() }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  )
}
