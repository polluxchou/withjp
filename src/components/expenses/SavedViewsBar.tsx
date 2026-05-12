'use client'

import { useEffect, useState } from 'react'
import { Bookmark, X, Plus } from 'lucide-react'
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
  created_at: number
}

interface Props {
  currentFilters: Filters
  onApply:        (filters: Filters) => void
}

const STORAGE_KEY = 'app:expense-saved-views'

function loadViews(): SavedView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedView[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistViews(views: SavedView[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(views)) } catch {}
}

export default function SavedViewsBar({ currentFilters, onApply }: Props) {
  const [views,    setViews]    = useState<SavedView[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setViews(loadViews())
    setHydrated(true)
  }, [])

  const update = (next: SavedView[]) => {
    setViews(next)
    persistViews(next)
  }

  const createView = () => {
    const name = window.prompt('视图名称（例：本月待付款 / 跨境差旅）')?.trim()
    if (!name) return
    const view: SavedView = {
      id:         `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      filters:    currentFilters,
      created_at: Date.now(),
    }
    update([...views, view])
  }

  const deleteView = (id: string) => {
    const target = views.find((v) => v.id === id)
    if (!target) return
    if (!window.confirm(`删除视图「${target.name}」？`)) return
    update(views.filter((v) => v.id !== id))
  }

  const emptyActive = isEmptyFilters(currentFilters)
  const activeViewId = hydrated
    ? views.find((v) => filtersEqual(v.filters, currentFilters))?.id ?? null
    : null
  const canSave = !emptyActive && !activeViewId

  // Don't render anything on first paint to avoid SSR/hydration mismatch
  // (localStorage isn't available server-side).
  if (!hydrated) {
    return <div className="h-9" aria-hidden="true" />
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
        全部
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
              title="删除视图"
              className={`pr-2 pl-0.5 py-1 rounded-r-lg transition-colors ${
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
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <Plus className="w-3 h-3" /> 保存当前
        </button>
      )}
    </div>
  )
}
