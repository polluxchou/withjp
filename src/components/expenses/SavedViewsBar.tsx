'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bookmark, X, Plus, Loader2 } from 'lucide-react'
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
      <div className="h-9 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Bookmark className="w-3.5 h-3.5 text-slate-400 mr-0.5" />

      <button
        type="button"
        onClick={() => onApply(EMPTY_FILTERS)}
        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
          emptyActive
            ? 'bg-indigo-600 text-white border border-indigo-600'
            : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
        }`}
      >
        {tCommon('all')}
      </button>

      {views.map((v) => {
        const active = activeViewId === v.id
        return (
          <span
            key={v.id}
            className={`group inline-flex items-center rounded-lg text-xs font-medium border transition-colors ${
              active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <button
              type="button"
              onClick={() => onApply(v.filters)}
              className="pl-3 pr-1.5 py-1"
            >
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => deleteView(v.id)}
              disabled={busy}
              title={t('deleteTooltip')}
              className={`pr-2 pl-0.5 py-1 rounded-r-lg transition-colors disabled:opacity-50 ${
                active ? 'hover:bg-indigo-700' : 'text-slate-300 hover:text-rose-600'
              }`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}

      {canSave && (
        <button
          type="button"
          onClick={createView}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t('saveCurrent')}
        </button>
      )}
    </div>
  )
}
