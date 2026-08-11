// src/components/competitors/CompetitorDossierView.tsx
'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import CompetitorCard from './CompetitorCard'
import ShotDateStrip from './ShotDateStrip'
import { SHOT_WINDOW_SIZE, collectShotDates, resolveAnchor, windowOf } from '@/lib/competitors/shotGrid'
import type { CompetitorBoard } from '@/lib/competitors/types'

export default function CompetitorDossierView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [addType, setAddType] = useState<'group' | 'streamer'>('group')
  const [addParentId, setAddParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 整页共用的截图日期轴：所有竞品(含子主播)有图日期的并集
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  const shotAxis = useMemo(() => collectShotDates(board.competitors), [board.competitors])
  const selectedDate = useMemo(() => resolveAnchor(shotAxis, anchorDate), [shotAxis, anchorDate])
  const dateWindow = useMemo(
    () => windowOf(shotAxis, selectedDate ? shotAxis.indexOf(selectedDate) : -1, SHOT_WINDOW_SIZE),
    [shotAxis, selectedDate],
  )

  // 顶层竞品可作为父账号选项。
  const parentOptions = useMemo(
    () => board.competitors.map((c) => ({
      id: c.id,
      label: c.latest?.display_name ?? c.display_name ?? c.handle,
    })),
    [board.competitors],
  )

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
    const body: { url: string; parent_id?: string } = { url: value }
    if (addType === 'streamer' && addParentId) body.parent_id = addParentId
    startTransition(async () => {
      try {
        const res = await fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('addFailed')); return }
        setInput('')
        setAddType('group')
        setAddParentId('')
        await refresh()
      } catch {
        setError(t('addFailed'))
      }
    })
  }, [input, parent, refresh, t])

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

  const assignParent = useCallback((id: string, parentId: string | null) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId }),
        })
        if (!res.ok) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  const updateHandle = useCallback((id: string, raw: string) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: raw }),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  return (
    <div className="space-y-4">
      {board.canEdit && (
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select
            value={addType}
            onChange={(e) => { setAddType(e.target.value as 'group' | 'streamer'); setAddParentId('') }}
            className="rounded-md border border-zinc-300 px-2 py-2 text-sm text-zinc-700"
          >
            <option value="group">{t('independent')}</option>
            <option value="streamer">{t('roleStreamer')}</option>
          </select>
          {addType === 'streamer' && (
            <select
              value={addParentId}
              onChange={(e) => setAddParentId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm text-zinc-700"
            >
              <option value="">{t('selectGroup')}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}
          <button
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            <Plus size={16} /> {t('addButton')}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          <ShotDateStrip
            axis={shotAxis}
            dateWindow={dateWindow}
            selectedDate={selectedDate}
            onPick={setAnchorDate}
          />
          {board.competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              c={c}
              canEdit={board.canEdit}
              onChanged={refresh}
              onDeleteId={remove}
              parentOptions={parentOptions}
              onAssignParent={assignParent}
              onUpdateHandle={updateHandle}
              dateWindow={dateWindow}
              selectedDate={selectedDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
