'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import SectionCard from '@/components/ui/SectionCard'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import { ChevronRight, ChevronLeft, Users, XCircle, RotateCcw, GitBranch } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import type { Creator, CreatorStatus } from '@/lib/types'
import { fmtCompact } from '@/lib/currency'
import { ALL_STATUSES, nextStatus, canTransition } from '@/lib/state-machine/creator-lifecycle'

// 卡内四个操作按钮（reactivate/rollback/advance/terminate）共享的基底类——
// 抽出常量防止手写重复串静默漂移（此前 terminate 就漏了 font-medium），
// 惯例同 RecordRow.tsx 的 ROW_CLASS。调用处只追加宽度(w-full/flex-1/px-2)
// 与语义色(text-*/hover:border-*)。
const CARD_BTN = 'flex items-center justify-center text-xs font-medium border border-line rounded-field py-1.5 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1'

export default function PipelinePage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const locale = useLocale()
  const t = useTranslations('pipeline')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')

  // tCommon 不进依赖：同 locale 下 next-intl 引用稳定，与 creators/page.tsx
  // 的 load() 同判。
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/creators')
      if (!res.ok) {
        console.error('Failed to load creators:', res.status)
        throw new Error(tCommon('loadFailed'))
      }
      const json = await res.json()
      setLoadError(json.error ?? null)
      setCreators(json.data ?? [])
    } catch (err) {
      console.error('Failed to load creators:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setCreators([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function advance(creator: Creator) {
    const next = nextStatus(creator.status)
    if (!next) return
    setMoving(creator.id)
    await fetch(`/api/creators/${creator.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: next, triggered_by: 'user' }),
    })
    await load()
    setMoving(null)
  }

  async function rollback(creator: Creator, targetStatus: CreatorStatus) {
    if (!canTransition(creator.status, targetStatus)) return
    setMoving(creator.id)
    await fetch(`/api/creators/${creator.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: targetStatus, triggered_by: 'user', notes: 'Rollback operation' }),
    })
    await load()
    setMoving(null)
  }

  async function terminate(creator: Creator) {
    if (!canTransition(creator.status, 'terminated')) return
    if (typeof window !== 'undefined' && !window.confirm(t('confirmTerminate'))) return
    setMoving(creator.id)
    await fetch(`/api/creators/${creator.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: 'terminated', triggered_by: 'user', notes: 'Contract terminated' }),
    })
    await load()
    setMoving(null)
  }

  async function reactivate(creator: Creator) {
    if (!canTransition(creator.status, 'contacted')) return
    setMoving(creator.id)
    await fetch(`/api/creators/${creator.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: 'contacted', triggered_by: 'user', notes: 'Reactivated' }),
    })
    await load()
    setMoving(null)
  }

  function getPreviousStatus(current: CreatorStatus): CreatorStatus | null {
    const statusOrder: CreatorStatus[] = [
      'prospect', 'contacted', 'engaged', 'onboarded', 'live_ready', 'live', 'monetized'
    ]
    const currentIndex = statusOrder.indexOf(current)
    if (currentIndex <= 0) return null
    const previous = statusOrder[currentIndex - 1]
    return canTransition(current, previous) ? previous : null
  }

  const byStatus = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = creators.filter((c) => c.status === s)
    return acc
  }, {} as Record<CreatorStatus, Creator[]>)

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ALL_STATUSES.map((status) => (
            <div key={status} className="flex-shrink-0 w-56">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <LifecycleBadge status={status} size="sm" />
                <span className="text-xs text-ink-400 ml-auto font-medium">
                  {byStatus[status].length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px]">
                {byStatus[status].length === 0 ? (
                  <div className="border-2 border-dashed border-line-strong rounded-card h-20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-ink-400" />
                  </div>
                ) : (
                  byStatus[status].map((creator) => {
                    const next = nextStatus(creator.status)
                    const previous = getPreviousStatus(creator.status)
                    return (
                      <div key={creator.id} className="bg-surface border border-line rounded-card p-3 hover:border-line-strong transition-colors">
                        <Link href={`/creators/${creator.id}`} className="block">
                          <div className="font-medium text-sm text-ink-900 truncate">{creator.name}</div>
                          <div className="text-xs text-ink-400 mt-0.5">{creator.platform}</div>
                          {creator.profile?.niche && (
                            <div className="text-xs text-ink-400">{creator.profile.niche}</div>
                          )}
                          {creator.profile?.followers && (
                            <div className="text-xs text-ink-400 mt-1">
                              {fmtCompact(creator.profile.followers, locale)} {t('followers')}
                            </div>
                          )}
                        </Link>
                        <div className="mt-2 flex gap-1.5">
                          {creator.status === 'terminated' ? (
                            <button
                              onClick={() => reactivate(creator)}
                              disabled={moving === creator.id}
                              className={`${CARD_BTN} w-full gap-1 text-ink-700 hover:text-primary-hover hover:border-primary-border`}
                              title={t('reactivate')}
                              aria-label={t('reactivate')}
                            >
                              {moving === creator.id ? '...' : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <>
                              {previous && (
                                <button
                                  onClick={() => rollback(creator, previous)}
                                  disabled={moving === creator.id}
                                  className={`${CARD_BTN} flex-1 text-ink-500 hover:text-ink-700 hover:border-line-strong`}
                                  title={t('moveBack', { status: tStatus(previous) })}
                                  aria-label={t('moveBack', { status: tStatus(previous) })}
                                >
                                  {moving === creator.id ? '...' : <ChevronLeft className="w-4 h-4" />}
                                </button>
                              )}
                              {next && (
                                <button
                                  onClick={() => advance(creator)}
                                  disabled={moving === creator.id}
                                  className={`${CARD_BTN} flex-1 text-primary hover:text-primary-hover hover:border-primary-border`}
                                  title={t('moveForward', { status: tStatus(next) })}
                                  aria-label={t('moveForward', { status: tStatus(next) })}
                                >
                                  {moving === creator.id ? '...' : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                              {canTransition(creator.status, 'terminated') && (
                                <button
                                  onClick={() => terminate(creator)}
                                  disabled={moving === creator.id}
                                  className={`${CARD_BTN} px-2 text-danger-text hover:border-danger-border`}
                                  title={t('terminate')}
                                  aria-label={t('terminate')}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6">
        <SectionCard icon={<GitBranch />} title={t('stateMachineRules')} footer={t('transitionsInfo')}>
          <div className="flex flex-wrap gap-1.5 items-center text-xs text-ink-400">
            {ALL_STATUSES.filter((s) => s !== 'terminated').map((s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <LifecycleBadge status={s} size="sm" />
                {i < arr.length - 1 && (
                  <>
                    <ChevronRight className="w-3 h-3 text-ink-400/60" />
                    <ChevronLeft className="w-3 h-3 text-ink-400/60" />
                  </>
                )}
              </span>
            ))}
            <span className="text-ink-400/60 px-1">·</span>
            <LifecycleBadge status="terminated" size="sm" />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
