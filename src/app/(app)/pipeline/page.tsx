'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import LifecycleBadge from '@/components/creators/LifecycleBadge'
import Button from '@/components/ui/Button'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import Link from 'next/link'
import type { Creator, CreatorStatus } from '@/lib/types'
import { ALL_STATUSES, STATUS_LABEL, nextStatus, canTransition } from '@/lib/state-machine/creator-lifecycle'

export default function PipelinePage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/creators')
    const json = await res.json()
    setCreators(json.data ?? [])
    setLoading(false)
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
        title="Pipeline"
        subtitle="Creator lifecycle — drag creators through the funnel"
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ALL_STATUSES.map((status) => (
            <div key={status} className="flex-shrink-0 w-56">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <LifecycleBadge status={status} size="sm" />
                <span className="text-xs text-slate-400 ml-auto font-medium">
                  {byStatus[status].length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px]">
                {byStatus[status].length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl h-20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-300" />
                  </div>
                ) : (
                  byStatus[status].map((creator) => {
                    const next = nextStatus(creator.status)
                    const previous = getPreviousStatus(creator.status)
                    return (
                      <div key={creator.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-sm transition-shadow group">
                        <Link href={`/creators/${creator.id}`} className="block">
                          <div className="font-medium text-sm text-slate-900 truncate">{creator.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{creator.platform}</div>
                          {creator.profile?.niche && (
                            <div className="text-xs text-slate-400">{creator.profile.niche}</div>
                          )}
                          {creator.profile?.followers && (
                            <div className="text-xs text-slate-400 mt-1">
                              {creator.profile.followers.toLocaleString()} followers
                            </div>
                          )}
                        </Link>
                        <div className="mt-2 flex gap-1.5">
                          {previous && (
                            <button
                              onClick={() => rollback(creator, previous)}
                              disabled={moving === creator.id}
                              className="flex-1 flex items-center justify-center text-xs text-slate-500 hover:text-slate-700 font-medium border border-slate-200 hover:border-slate-300 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                              title={`回退到 ${STATUS_LABEL[previous]}`}
                            >
                              {moving === creator.id ? '...' : <ChevronLeft className="w-4 h-4" />}
                            </button>
                          )}
                          {next && (
                            <button
                              onClick={() => advance(creator)}
                              disabled={moving === creator.id}
                              className={`${previous ? 'flex-1' : 'w-full'} flex items-center justify-center text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-100 hover:border-indigo-300 rounded-lg py-1.5 transition-colors disabled:opacity-50`}
                              title={`前进到 ${STATUS_LABEL[next]}`}
                            >
                              {moving === creator.id ? '...' : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          {!next && !previous && (
                            <div className="w-full text-center text-xs text-emerald-500 font-medium py-1.5">✓</div>
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
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-medium text-slate-500 mb-2">State Machine Rules</p>
        <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-400">
          {ALL_STATUSES.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <LifecycleBadge status={s} size="sm" />
              {i < ALL_STATUSES.length - 1 && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                  <ChevronLeft className="w-3 h-3 text-slate-300" />
                </>
              )}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Transitions are bi-directional (forward and backward) and validated server-side.
          Each transition auto-generates a task for the responsible agent.
          Use rollback (←) to move creators back to previous stages when needed.
        </p>
      </div>
    </div>
  )
}
