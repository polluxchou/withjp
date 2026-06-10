'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import Button from '@/components/ui/Button'
import { ChevronRight, ChevronLeft, Users, XCircle, RotateCcw } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import type { Creator, CreatorStatus } from '@/lib/types'
import { fmtCompact } from '@/lib/currency'
import { ALL_STATUSES, nextStatus, canTransition } from '@/lib/state-machine/creator-lifecycle'

export default function PipelinePage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState<string | null>(null)
  const locale = useLocale()
  const t = useTranslations('pipeline')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/creators')
      const json = await res.json()
      setCreators(json.data ?? [])
    } catch (err) {
      console.error('Failed to load creators:', err)
      setCreators([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
        <div className="text-center py-12 text-sm text-zinc-400">{tCommon('loading')}</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ALL_STATUSES.map((status) => (
            <div key={status} className="flex-shrink-0 w-56">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <LifecycleBadge status={status} size="sm" />
                <span className="text-xs text-zinc-400 ml-auto font-medium">
                  {byStatus[status].length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px]">
                {byStatus[status].length === 0 ? (
                  <div className="border-2 border-dashed border-zinc-200 rounded-xl h-20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-zinc-300" />
                  </div>
                ) : (
                  byStatus[status].map((creator) => {
                    const next = nextStatus(creator.status)
                    const previous = getPreviousStatus(creator.status)
                    return (
                      <div key={creator.id} className="bg-white border border-zinc-200 rounded-xl p-3 hover:shadow-sm transition-shadow group">
                        <Link href={`/creators/${creator.id}`} className="block">
                          <div className="font-medium text-sm text-zinc-900 truncate">{creator.name}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">{creator.platform}</div>
                          {creator.profile?.niche && (
                            <div className="text-xs text-zinc-400">{creator.profile.niche}</div>
                          )}
                          {creator.profile?.followers && (
                            <div className="text-xs text-zinc-400 mt-1">
                              {fmtCompact(creator.profile.followers, locale)} {t('followers')}
                            </div>
                          )}
                        </Link>
                        <div className="mt-2 flex gap-1.5">
                          {creator.status === 'terminated' ? (
                            <button
                              onClick={() => reactivate(creator)}
                              disabled={moving === creator.id}
                              className="w-full flex items-center justify-center gap-1 text-xs text-zinc-600 hover:text-primary-hover font-medium border border-zinc-200 hover:border-violet-300 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                              title={t('reactivate')}
                            >
                              {moving === creator.id ? '...' : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <>
                              {previous && (
                                <button
                                  onClick={() => rollback(creator, previous)}
                                  disabled={moving === creator.id}
                                  className="flex-1 flex items-center justify-center text-xs text-zinc-500 hover:text-zinc-700 font-medium border border-zinc-200 hover:border-zinc-300 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                                  title={t('moveBack', { status: tStatus(previous) })}
                                >
                                  {moving === creator.id ? '...' : <ChevronLeft className="w-4 h-4" />}
                                </button>
                              )}
                              {next && (
                                <button
                                  onClick={() => advance(creator)}
                                  disabled={moving === creator.id}
                                  className="flex-1 flex items-center justify-center text-xs text-primary hover:text-violet-800 font-medium border border-violet-100 hover:border-violet-300 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                                  title={t('moveForward', { status: tStatus(next) })}
                                >
                                  {moving === creator.id ? '...' : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                              {canTransition(creator.status, 'terminated') && (
                                <button
                                  onClick={() => terminate(creator)}
                                  disabled={moving === creator.id}
                                  className="flex items-center justify-center text-xs text-rose-500 hover:text-rose-700 border border-zinc-200 hover:border-rose-300 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50"
                                  title={t('terminate')}
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
      <div className="mt-6 bg-white border border-zinc-200 rounded-xl p-4">
        <p className="text-xs font-medium text-zinc-500 mb-2">{t('stateMachineRules')}</p>
        <div className="flex flex-wrap gap-1.5 items-center text-xs text-zinc-400">
          {ALL_STATUSES.filter((s) => s !== 'terminated').map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1">
              <LifecycleBadge status={s} size="sm" />
              {i < arr.length - 1 && (
                <>
                  <ChevronRight className="w-3 h-3 text-zinc-300" />
                  <ChevronLeft className="w-3 h-3 text-zinc-300" />
                </>
              )}
            </span>
          ))}
          <span className="text-zinc-300 px-1">·</span>
          <LifecycleBadge status="terminated" size="sm" />
        </div>
        <p className="text-xs text-zinc-400 mt-2">
          {t('transitionsInfo')}
        </p>
      </div>
    </div>
  )
}
