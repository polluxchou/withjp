// src/components/competitors/CompetitorDossierView.tsx
'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import CompetitorCard from './CompetitorCard'
import type { CompetitorBoard } from '@/lib/competitors/types'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'

export default function CompetitorDossierView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [addType, setAddType] = useState<'group' | 'streamer'>('group')
  const [addParentId, setAddParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1"
          />
          <Select
            value={addType}
            onChange={(e) => { setAddType(e.target.value as 'group' | 'streamer'); setAddParentId('') }}
          >
            <option value="group">{t('independent')}</option>
            <option value="streamer">{t('roleStreamer')}</option>
          </Select>
          {addType === 'streamer' && (
            <Select
              value={addParentId}
              onChange={(e) => setAddParentId(e.target.value)}
            >
              <option value="">{t('selectGroup')}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          )}
          <Button onClick={add} loading={pending}>
            <Plus size={16} strokeWidth={1.5} /> {t('addButton')}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-ink-500">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
