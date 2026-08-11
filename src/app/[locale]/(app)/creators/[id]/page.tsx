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
import { Field, Input, Textarea } from '@/components/ui/Field'
import SectionCard from '@/components/ui/SectionCard'
import Tabs from '@/components/ui/Tabs'
import { Stat, StatBand } from '@/components/ui/Stat'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import LoadingState from '@/components/ui/LoadingState'
import Tag from '@/components/ui/Tag'
import { toneOf, type Tone } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'
import {
  ArrowLeft, ChevronRight, Play, DollarSign,
  Clock, Edit, Info, GitBranch,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import type { Creator, Task, Finance, LifecycleTransition, CreatorActivityLog, ActivityType } from '@/lib/types'
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

// Activity-log entries are categorical event types, not a lifecycle status —
// kept as a small local tone map (same idiom as ExpenseCategory's dedicated
// category-color.ts) rather than folded into the shared status-tone.ts
// domain table, which is reserved for actual state-machine status enums
// (docs/design-system.md §1.3).
//
// The label rendered alongside this tone comes from
// messages/{zh,en,ja}.json's `creatorDetail.activityTypes.*` — unlike this
// Record<ActivityType, Tone>, that lookup is a plain string key with no
// compile-time exhaustiveness check. Adding a new ActivityType value means
// updating both: this map (TS will already force that) AND all three
// activityTypes.* locale files (nothing will force that).
const ACTIVITY_TONE: Record<ActivityType, Tone> = {
  created:         'success',
  updated:         'info',
  status_changed:  'violet',
  task_created:    'violet',
  task_completed:  'success',
  finance_logged:  'warning',
  note_added:      'neutral',
  contact_updated: 'info',
  profile_updated: 'info',
  other:           'neutral',
}

// Mirrors the small Tone→dot-class lookup every Tag-adjacent component keeps
// locally (Tag.tsx's own DOT record, RecordRow.tsx's DOT record) — needed as
// its own map here because this dot sits absolutely-positioned on the
// timeline rail rather than inline next to text, so Tag's own dot variant
// doesn't apply directly.
const ACTIVITY_DOT: Record<Tone, string> = {
  success: 'bg-success-dot', warning: 'bg-warning-dot', danger: 'bg-danger-dot',
  info: 'bg-info-dot', neutral: 'bg-muted-dot', violet: 'bg-primary',
}

export default function CreatorDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const [data,    setData]    = useState<CreatorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      // /api/creators/[id] maps every creators-query error to 404 — mostly
      // "no such creator", but also rare system faults (bad uuid, RLS, DB
      // down) it can't tell apart. With no finer signal, 404 renders as the
      // plain not-found state below (no retry). Any other non-ok status
      // (401/403/500/…) is a real error: prefer the response's own
      // json.error text, falling back to the generic copy.
      if (!res.ok && res.status !== 404) {
        console.error('Failed to load creator:', res.status, json.error)
        setLoadError(json.error ?? tCommon('loadFailed'))
        setData(null)
      } else {
        setLoadError(null)
        setData(json.data)
      }
    } catch (err) {
      console.error('Failed to load creator:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setData(null)
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

  if (loading) return <LoadingState />
  if (!data) {
    // loadError only ever comes from a real system failure (network/parse
    // exception, or a non-404 error status) — see load() above. A clean
    // 404 (creator genuinely doesn't exist) has no loadError and gets no
    // retry button, since retrying a missing record can't succeed.
    return loadError
      ? <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
      : <ErrorState title={tCreators('creatorNotFound')} />
  }

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
      <Link href="/creators" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> {tCreators('title')}
      </Link>

      <Header
        title={
          // Header renders `title` inside an <h1 className="... truncate">
          // — a block-level div here would be invalid inside that truncate
          // flow (PR1 review note). span + min-w-0 keeps it inline-flex, and
          // truncate moves onto the name's own span so the external-link
          // icon never gets squeezed.
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="truncate">{data.name}</span>
            {platformUrl && (
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-primary hover:text-primary-hover transition-colors"
                title={t('visitPlatform', { platform: data.platform })}
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
          </span>
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
        <div className="mb-6">
          <StatBand>
            <Stat label={t('revenue')} value={`¥${fmtCompact(totalRevenue, locale)}`} />
            {/* cost is a positive spend amount, not a negative value — §2
                "负值用 danger text" doesn't apply here, so this stays the
                default ink tone (deliberate change from an earlier
                always-red rendering; see PR description). */}
            <Stat label={t('cost')} value={`¥${fmtCompact(totalCost, locale)}`} />
            <Stat label={t('profit')} value={`¥${fmtCompact(totalProfit, locale)}`} tone={totalProfit >= 0 ? 'default' : 'danger'} />
            <Stat label={t('avgROI')} value={avgROI != null ? `${avgROI.toFixed(1)}%` : '—'} tone={(avgROI ?? 0) >= 0 ? 'default' : 'danger'} />
          </StatBand>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="col-span-2">
          <SectionCard icon={<Info />} title={tCreators('profile')}>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-400">{tCreators('platform')}</dt>
                <dd className="font-medium text-ink-900 truncate">
                  {platformUrl ? (
                    <a
                      href={platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-hover inline-flex items-center gap-1"
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
                <dt className="text-xs text-ink-400">{tCreators('broadcastAccount')}</dt>
                <dd className="font-medium text-ink-900 truncate">
                  {data.broadcast_account ? (
                    data.broadcast_account.account_url ? (
                      <a
                        href={data.broadcast_account.account_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-hover inline-flex items-center gap-1"
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
                  <p className="text-xs text-ink-400 truncate">{data.broadcast_account.account_handle}</p>
                )}
              </div>
              <div>
                <dt className="text-xs text-ink-400">{tCreators('operator')}</dt>
                <dd className="font-medium text-ink-900 truncate">{data.operator_user?.name ?? '—'}</dd>
                {data.operator_user && (
                  <p className="text-xs text-ink-400 truncate">
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
                  <dt className="text-xs text-ink-400">{k as string}</dt>
                  <dd className="font-medium text-ink-900 truncate">{v as string}</dd>
                </div>
              ))}
            </dl>
            {data.notes && (
              <div className="mt-3 pt-3 border-t border-line-soft">
                <p className="text-xs text-ink-400 mb-1">{tCreators('notes')}</p>
                <p className="text-sm text-ink-700">{data.notes}</p>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Lifecycle progress */}
        <SectionCard icon={<GitBranch />} title={tCreators('lifecycle')}>
          <div className="space-y-2">
            {ALL_STATUSES.map((s, i) => {
              const statusIdx   = ALL_STATUSES.indexOf(data.status)
              const isCompleted = i < statusIdx
              const isCurrent   = s === data.status
              const isPending   = i > statusIdx
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-none text-xs font-bold
                    ${isCompleted ? 'bg-primary text-white' : isCurrent ? 'bg-primary-soft text-primary ring-2 ring-primary' : 'bg-muted-soft text-ink-400'}`}>
                    {isCompleted ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${isCurrent ? 'text-primary' : isPending ? 'text-ink-400' : 'text-ink-700'}`}>
                    {tStatus(s)}
                  </span>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <Tabs
          items={[
            { value: 'tasks',    label: `${tCreators('tasks')} (${data.tasks.length})` },
            { value: 'finance',  label: `${tCreators('finance')} (${data.finance.length})` },
            { value: 'timeline', label: tCreators('timeline') },
            { value: 'activity', label: `${tCreators('activity')} (${data.activity_logs?.length || 0})` },
          ]}
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
        />
      </div>

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          {data.tasks.length === 0 ? (
            <EmptyState title={t('noTasksYet')} />
          ) : (
            data.tasks.map((task) => (
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
                    {/* w-fit + rounded-field 让 focus 环贴着文字而非撑满整行
                        （<summary> 默认 block）——同 team/page.tsx 的
                        SUMMARY_CLASS 配方，环本身取自 recipes.ts。 */}
                    <summary className={`w-fit text-xs text-ink-400 cursor-pointer hover:text-ink-700 rounded-field ${FOCUS_RING}`}>{t('viewOutput')}</summary>
                    <pre className="mt-2 text-xs bg-canvas border border-line rounded-field p-3 overflow-auto max-h-60 text-ink-700">
                      {JSON.stringify(task.output, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
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
            <EmptyState title={t('noFinanceYet')} />
          ) : (
            <SectionCard padding="none">
              <Table label={tCreators('finance')}>
                <THead>
                  <Tr>
                    <Th>{tExpenses('period')}</Th>
                    <Th align="right">{t('revenue')}</Th>
                    <Th align="right">{t('cost')}</Th>
                    <Th align="right">{t('profit')}</Th>
                    <Th align="right">ROI</Th>
                    <Th>{tCreators('notes')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.finance.map((f) => (
                    <Tr key={f.id}>
                      <Td className="font-medium text-ink-900">{f.period}</Td>
                      <Td align="right" numeric>{`¥${fmtCompact(Number(f.revenue), locale)}`}</Td>
                      {/* cost is a positive spend amount, not a negative
                          value — §2 "负值用 danger text" doesn't apply;
                          deliberate change from an earlier always-red cell. */}
                      <Td align="right" numeric>{`¥${fmtCompact(Number(f.cost), locale)}`}</Td>
                      <Td align="right" className={`tabular-nums font-medium ${Number(f.profit) >= 0 ? 'text-ink-900' : 'text-danger-text'}`}>
                        {`¥${fmtCompact(Number(f.profit), locale)}`}
                      </Td>
                      <Td align="right" className={`tabular-nums font-medium ${Number(f.roi) >= 0 ? 'text-ink-900' : 'text-danger-text'}`}>
                        {`${Number(f.roi).toFixed(1)}%`}
                      </Td>
                      <Td className="text-ink-400">{f.notes ?? '—'}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </SectionCard>
          )}
        </div>
      )}

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div>
          {data.transitions.length === 0 ? (
            <EmptyState title={t('noTransitionsYet')} />
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-line" />
              {data.transitions.map((transition) => (
                <div key={transition.id} className="relative mb-4">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary border-2 border-surface" />
                  <div className="bg-surface border border-line rounded-card p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <LifecycleBadge status={transition.from_status} size="sm" />
                      <ChevronRight className="w-4 h-4 text-ink-400" />
                      <LifecycleBadge status={transition.to_status} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-ink-400">
                      <Clock className="w-3 h-3" />
                      {format(new Date(transition.triggered_at), 'MMM d, yyyy HH:mm')}
                      <span>·</span>
                      <span>{t('by', { actor: transition.triggered_by })}</span>
                    </div>
                    {transition.notes && <p className="text-xs text-ink-500 mt-1">{transition.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Log tab */}
      {tab === 'activity' && (
        <div>
          {!data.activity_logs || data.activity_logs.length === 0 ? (
            <EmptyState title={t('noActivityYet')} />
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-line" />
              {data.activity_logs.map((log) => {
                const tone = ACTIVITY_TONE[log.activity_type]
                return (
                  <div key={log.id} className="relative mb-4">
                    <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-surface ${ACTIVITY_DOT[tone]}`} />
                    <div className="bg-surface border border-line rounded-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-ink-900">{log.title}</h4>
                          {log.description && (
                            <p className="text-sm text-ink-700 mt-1">{log.description}</p>
                          )}
                        </div>
                        {/* flex-none — Tag itself has no className prop, so
                            the wrapping div carries it (same idiom as
                            TaskCard.tsx's own agent Tag), preventing it from
                            shrinking/wrapping as a bare flex child next to
                            the title/description column above. */}
                        <div className="flex-none">
                          <Tag size="sm" tone={tone} label={t(`activityTypes.${log.activity_type}`)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-ink-400">
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
            <Field label={t('revenueField')} required>
              <Input
                type="number" value={financeForm.revenue}
                onChange={(e) => setFinanceForm((f) => ({ ...f, revenue: e.target.value }))}
                placeholder="80000"
              />
            </Field>
            <Field label={t('costField')} required>
              <Input
                type="number" value={financeForm.cost}
                onChange={(e) => setFinanceForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="20000"
              />
            </Field>
          </div>
          <Field label={t('periodField')} required>
            <Input
              value={financeForm.period}
              onChange={(e) => setFinanceForm((f) => ({ ...f, period: e.target.value }))}
              placeholder="2024-Q2 or 2024-05"
            />
          </Field>
          <Field label={tCreators('notes')}>
            <Textarea
              value={financeForm.notes}
              onChange={(e) => setFinanceForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={tCommon('none')}
            />
          </Field>
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
