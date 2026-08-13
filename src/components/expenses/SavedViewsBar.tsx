'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bookmark, X, Plus, Loader2 } from 'lucide-react'
import { FilterChip } from '@/components/ui/FilterChip'
import Button from '@/components/ui/Button'
import {
  type Filters,
  EMPTY_FILTERS,
  filtersEqual,
  isEmptyFilters,
} from '@/lib/expenses/filter-types'

interface SavedView {
  id:         string
  name:       string
  filters:    Filters
  created_at: string
  updated_at?: string
}

interface Props {
  currentFilters: Filters
  onApply:        (filters: Filters) => void
}

const LEGACY_STORAGE_KEY = 'app:expense-saved-views'
const MIGRATED_FLAG_KEY  = 'app:expense-saved-views:migrated-to-supabase'

// Merge stored filter shape onto EMPTY_FILTERS so missing keys (e.g. older
// schemas) don't leave the view in an undefined state when applied.
function normalizeFilters(raw: unknown): Filters {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_FILTERS }
  const src = raw as Record<string, unknown>
  const out: Filters = { ...EMPTY_FILTERS }
  ;(Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach((k) => {
    const v = src[k]
    if (typeof v === 'string') {
      // Filters values are all string-like; double-cast through unknown to
      // bypass the union-narrowing for fields like 'unpaid_only': '' | 'yes'.
      (out as unknown as Record<string, string>)[k] = v
    }
  })
  return out
}

export default function SavedViewsBar({ currentFilters, onApply }: Props) {
  const t = useTranslations('expenses.savedViews')
  const tCommon = useTranslations('common')
  const [views,    setViews]    = useState<SavedView[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [busy,     setBusy]     = useState(false)

  // Initial load: fetch from API; then one-time migrate localStorage if present.
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res  = await fetch('/api/expense-saved-views')
        const json = await res.json()
        if (cancelled) return
        const remote = (json.data ?? []).map((row: { id: string; name: string; filters: unknown; created_at: string; updated_at?: string }) => ({
          id:         row.id,
          name:       row.name,
          filters:    normalizeFilters(row.filters),
          created_at: row.created_at,
          updated_at: row.updated_at,
        })) as SavedView[]

        // One-time migration from localStorage if the user had local views
        // before this PR and hasn't migrated yet.
        const alreadyMigrated = typeof window !== 'undefined' && localStorage.getItem(MIGRATED_FLAG_KEY) === '1'
        if (!alreadyMigrated && typeof window !== 'undefined') {
          let legacy: SavedView[] = []
          try {
            const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
            if (raw) {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed)) {
                legacy = parsed.map((v) => ({
                  id:         String(v.id ?? ''),
                  name:       String(v.name ?? '').trim(),
                  filters:    normalizeFilters(v.filters),
                  created_at: typeof v.created_at === 'number' ? new Date(v.created_at).toISOString() : String(v.created_at ?? ''),
                })).filter((v) => v.name)
              }
            }
          } catch {
            // ignore parse errors — flag will still flip to prevent retry storms
          }

          // Push any legacy view whose name isn't already on the server
          const remoteNames = new Set(remote.map((v) => v.name))
          const toUpload = legacy.filter((v) => !remoteNames.has(v.name))
          for (const v of toUpload) {
            try {
              const r = await fetch('/api/expense-saved-views', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: v.name, filters: v.filters }),
              })
              const rj = await r.json()
              if (rj?.data) {
                remote.push({
                  id:         rj.data.id,
                  name:       rj.data.name,
                  filters:    normalizeFilters(rj.data.filters),
                  created_at: rj.data.created_at,
                  updated_at: rj.data.updated_at,
                })
              }
            } catch {
              // skip on error
            }
          }

          localStorage.setItem(MIGRATED_FLAG_KEY, '1')
        }

        if (!cancelled) setViews(remote)
      } catch {
        // network/auth error — leave list empty; user can retry by reloading
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  async function createView() {
    const name = window.prompt(t('namePrompt'))?.trim()
    if (!name) return
    setBusy(true)
    try {
      const res  = await fetch('/api/expense-saved-views', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, filters: currentFilters }),
      })
      const json = await res.json()
      if (json?.data) {
        setViews((vs) => [...vs, {
          id:         json.data.id,
          name:       json.data.name,
          filters:    normalizeFilters(json.data.filters),
          created_at: json.data.created_at,
          updated_at: json.data.updated_at,
        }])
      } else if (json?.error) {
        window.alert(t('saveFailed', { error: json.error }))
      }
    } catch (err) {
      window.alert(t('saveFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  async function deleteView(id: string) {
    const target = views.find((v) => v.id === id)
    if (!target) return
    if (!window.confirm(t('deleteConfirm', { name: target.name }))) return
    setBusy(true)
    // Optimistic local removal; revert on failure
    const prev = views
    setViews(views.filter((v) => v.id !== id))
    try {
      const res  = await fetch(`/api/expense-saved-views/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json?.error) {
        setViews(prev)
        window.alert(t('deleteFailed', { error: json.error }))
      }
    } catch (err) {
      setViews(prev)
      window.alert(t('deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const emptyActive  = isEmptyFilters(currentFilters)
  const activeViewId = hydrated
    ? views.find((v) => filtersEqual(v.filters, currentFilters))?.id ?? null
    : null
  const canSave = !emptyActive && !activeViewId

  if (!hydrated) {
    return (
      <div className="h-9 flex items-center gap-2 text-xs text-ink-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Bookmark className="w-3.5 h-3.5 text-ink-400 mr-0.5" strokeWidth={1.5} />

      <FilterChip label={tCommon('all')} set={emptyActive} onClick={() => onApply(EMPTY_FILTERS)} />

      {/* FilterChip's built-in onClear slot only renders while `set` is true
          (it's meant for "clear the currently-applied filter"), but every
          saved view needs to stay deletable even while a different view is
          active — so delete is a separate ghost Button next to the chip
          rather than forced into that slot. Component-API gap, flagged in
          the migration report. */}
      {views.map((v) => {
        const active = activeViewId === v.id
        return (
          <div key={v.id} className="flex items-center gap-0.5">
            <FilterChip label={v.name} set={active} onClick={() => onApply(v.filters)} />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={t('deleteTooltip')}
              title={t('deleteTooltip')}
              onClick={() => deleteView(v.id)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )
      })}

      {canSave && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={createView}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t('saveCurrent')}
        </Button>
      )}
    </div>
  )
}
