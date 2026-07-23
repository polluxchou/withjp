'use client'

import { useCallback, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, ChevronDown, ChevronRight, BadgeCheck } from 'lucide-react'
import Sparkline from './Sparkline'
import { formatCount } from '@/lib/competitors/metrics'
import type { CompetitorBoard, CompetitorWithHistory } from '@/lib/competitors/types'

export default function CompetitorMonitoringView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [pending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/competitors', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const json = await res.json()
      if (json.data) setBoard(json.data as CompetitorBoard)
    } catch {
      setError(t('actionFailed'))
    }
  }, [t])

  const add = useCallback(() => {
    const value = input.trim()
    if (!value) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: value }),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('addFailed')); return }
        setInput('')
        await refresh()
      } catch {
        setError(t('addFailed'))
      }
    })
  }, [input, refresh, t])

  const remove = useCallback((id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
        if (!res.ok) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  return (
    <div className="space-y-6">
      {board.canEdit ? (
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            <Plus size={16} /> {t('addButton')}
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">{t('readOnly')}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {board.competitors.map((c) => (
            <CompetitorRow
              key={c.id}
              c={c}
              canEdit={board.canEdit}
              open={!!expanded[c.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [c.id]: !s[c.id] }))}
              onDelete={() => remove(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CompetitorRow({
  c, canEdit, open, onToggle, onDelete,
}: {
  c: CompetitorWithHistory
  canEdit: boolean
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const t = useTranslations('competitors')
  const followerSeries = c.history.map((h) => h.followers).filter((n): n is number => n != null)

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-4">
        <button onClick={onToggle} className="flex items-start gap-2 text-left">
          {open ? <ChevronDown size={16} className="mt-1" /> : <ChevronRight size={16} className="mt-1" />}
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              {c.latest?.display_name ?? c.display_name ?? c.handle}
              {c.latest?.verified && <BadgeCheck size={14} className="text-sky-500" />}
              <span className="text-sm text-neutral-500">@{c.handle}</span>
            </div>
            {c.latest?.region && <div className="text-xs text-neutral-500">{t('region')}: {c.latest.region}</div>}
            {c.latest?.bio && <div className="mt-0.5 max-w-prose text-xs text-neutral-500">{c.latest.bio}</div>}
            {c.latest && <div className="mt-0.5 text-[11px] text-neutral-400">{t('latestOn', { date: c.latest.captured_on })}</div>}
          </div>
        </button>

        <div className="flex items-center gap-6">
          <Metric label={t('colFollowers')} value={c.latest?.followers} />
          <Metric label={t('colLikes')} value={c.latest?.likes} />
          <Metric label={t('colVideos')} value={c.latest?.videos} />
          <div className="text-sky-500"><Sparkline values={followerSeries} /></div>
          {canEdit && (
            <button onClick={onDelete} aria-label={t('delete')} className="text-neutral-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 pl-6">
          {c.history.length === 0 ? (
            <p className="text-xs text-neutral-500">{t('noData')}</p>
          ) : (
            <table className="w-full max-w-xl text-xs" aria-label={t('history')}>
              <caption className="mb-1 text-left text-xs font-medium text-neutral-500">{t('history')}</caption>
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 text-left font-normal">{t('colDate')}</th>
                  <th className="py-1 text-right font-normal">{t('colFollowers')}</th>
                  <th className="py-1 text-right font-normal">{t('colLikes')}</th>
                  <th className="py-1 text-right font-normal">{t('colVideos')}</th>
                </tr>
              </thead>
              <tbody>
                {c.history.slice().reverse().map((h) => (
                  <tr key={h.captured_on} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{h.captured_on}</td>
                    <td className="py-1 text-right">{formatCount(h.followers)}</td>
                    <td className="py-1 text-right">{formatCount(h.likes)}</td>
                    <td className="py-1 text-right">{formatCount(h.videos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  )
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums">{formatCount(value ?? null)}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  )
}
