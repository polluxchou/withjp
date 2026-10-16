'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  DEFAULT_VENUE_LAYOUT,
  VENUE_STORAGE_KEY,
  createHistory,
  loadVenueLayout,
  pushHistory,
  redoHistory,
  undoHistory,
  writeStoredVenueLayout,
  type VenueLayout,
  type VenueNameTranslations,
  type VenueViewBookmark,
} from '@/venue/layoutData'
import {
  firstItemSelection,
  localImportCandidate,
  pickActiveVenueId,
  reconcileSelection,
  updateHistoryBookmarks,
} from '@/lib/venue/editor'
import type { SaveState, VenueSummary } from './types'

// Remembers the last-opened venue per browser so reloads return to it.
const ACTIVE_VENUE_KEY = 'guild-venue:active-venue'
const DEFAULT_VENUE_ID = 'guild-main'

// 场地布置的文档模型:场馆列表与权限、版面(含撤销/重做历史)、楼层与组件选中、
// 云端加载与自动保存、译名。所有改版面的操作都经 commit 进历史。
export function useVenueDocument() {
  const t = useTranslations('venue')
  const [nameTranslations, setNameTranslations] = useState<VenueNameTranslations>({})
  const [history, setHistory] = useState(() => createHistory(DEFAULT_VENUE_LAYOUT))
  const [selectedFloorId, setSelectedFloorId] = useState(DEFAULT_VENUE_LAYOUT.floors[0].id)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => firstItemSelection(DEFAULT_VENUE_LAYOUT.floors[0]))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [hydrated, setHydrated] = useState(false)
  // false when stored data existed but couldn't be parsed: we then show the
  // default WITHOUT auto-saving, so the bad-but-present data isn't clobbered.
  // The first deliberate edit flips this back on.
  const [persistable, setPersistable] = useState(true)
  const [loading, setLoading] = useState(true)
  // When set, a local (browser) layout exists that predates the cloud seed and
  // can be imported once. Cleared after the user imports or the offer lapses.
  const [localImportLayout, setLocalImportLayout] = useState<VenueLayout | null>(null)
  const [venues, setVenues] = useState<VenueSummary[]>([])
  const [activeVenueId, setActiveVenueId] = useState<string>(DEFAULT_VENUE_ID)
  // Suppress the one debounced save that the effect would otherwise fire right
  // after the initial load applies the freshly fetched (or fallback) layout.
  const skipNextSave = useRef(true)

  const refreshTranslations = useCallback(async (venueId: string) => {
    try {
      const res = await fetch('/api/venue/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      if (!res.ok) return
      const body = (await res.json()) as { data: VenueNameTranslations | null }
      if (body.data) setNameTranslations(body.data)
    } catch {
      // 翻译是增强项,失败时画布静默显示中文。
    }
  }, [])

  // Source of truth is the DB (GET /api/venue). localStorage is now only an
  // offline fallback (on fetch failure) and a one-time import source.
  useEffect(() => {
    let cancelled = false

    function applyLayout(layout: VenueLayout) {
      // The next save effect run is the post-hydration echo of this loaded
      // layout, not a user edit — skip it so we don't redundantly PUT.
      skipNextSave.current = true
      setHistory(createHistory(layout))
      setSelectedFloorId(layout.floors[0]?.id ?? DEFAULT_VENUE_LAYOUT.floors[0].id)
      setSelectedItemIds(firstItemSelection(layout.floors[0]))
    }

    async function load() {
      try {
        const listRes = await fetch('/api/venue')
        if (!listRes.ok) throw new Error(`status ${listRes.status}`)
        const listBody = (await listRes.json()) as { data: VenueSummary[] | null }
        const list = listBody.data ?? []
        if (cancelled) return
        if (list.length === 0) throw new Error('no venues')
        setVenues(list)

        const activeId = pickActiveVenueId(list, window.localStorage.getItem(ACTIVE_VENUE_KEY), DEFAULT_VENUE_ID)
        setActiveVenueId(activeId)

        const [layoutRes, translations] = await Promise.all([
          fetch(`/api/venue?id=${encodeURIComponent(activeId)}`),
          refreshTranslations(activeId),
        ])
        if (!layoutRes.ok) throw new Error(`status ${layoutRes.status}`)
        const layoutBody = (await layoutRes.json()) as { data: VenueLayout | null }
        if (cancelled) return
        const cloud = layoutBody.data ?? DEFAULT_VENUE_LAYOUT
        applyLayout(cloud)
        setPersistable(true)

        // One-time import offer: only for the seeded shared venue, when the cloud
        // is still the untouched seed but this browser holds a non-default layout.
        if (activeId === DEFAULT_VENUE_ID) {
          try {
            const local = localImportCandidate(cloud, window.localStorage.getItem(VENUE_STORAGE_KEY), DEFAULT_VENUE_LAYOUT)
            if (local) setLocalImportLayout(local)
          } catch {
            // localStorage unreadable — skip the import offer silently.
          }
        }
      } catch {
        if (cancelled) return
        // Offline / API failure: fall back to whatever this browser cached.
        const fallback = loadVenueLayout(window.localStorage)
        applyLayout(fallback.layout)
        // Offline copy is editable locally (writes just won't reach the DB).
        setVenues([{ id: fallback.layout.venueId, name: fallback.layout.name, canEdit: true, canManage: false }])
        setActiveVenueId(fallback.layout.venueId)
        setPersistable(fallback.persistable)
        setSaveState('error')
      } finally {
        if (cancelled) return
        setLoading(false)
        setHydrated(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [refreshTranslations])

  const layout = history.present

  // Permissions for the active venue (from the venue list). Default to editable
  // before the list loads / for the offline fallback; the DB still enforces 403.
  const activeVenue = venues.find((venue) => venue.id === activeVenueId)
  const canEdit = activeVenue?.canEdit ?? true
  const canManage = activeVenue?.canManage ?? false
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit

  // Persist on change: cache to localStorage immediately (offline copy), then
  // debounce a full PUT to the DB so rapid edits collapse into one request.
  useEffect(() => {
    if (!hydrated || !persistable) return
    if (skipNextSave.current) { skipNextSave.current = false; return }

    try {
      writeStoredVenueLayout(window.localStorage, layout)
    } catch {
      // localStorage write failure shouldn't block the cloud save.
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/venue', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layout),
          })
          if (cancelled) return
          setSaveState(res.ok ? 'saved' : 'error')
          if (res.ok) void refreshTranslations(layout.venueId)
        } catch {
          if (cancelled) return
          setSaveState('error')
        }
      })()
    }, 800)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [hydrated, persistable, layout, refreshTranslations])

  function commit(nextLayout: VenueLayout, nextSelectedItemIds = selectedItemIds) {
    // Read-only viewers can't change the document (the DB would 403 the save).
    if (!canEditRef.current) return
    setHistory((current) => pushHistory(current, nextLayout))
    setSelectedItemIds(nextSelectedItemIds)
    setSaveState('idle')
    // A deliberate edit means we now own the state — safe to persist again even
    // if the load was degraded (the previous raw is snapshotted to the backup key).
    setPersistable(true)
  }

  // Bookmarks are view state, not document content: no undo step, but they
  // persist via the layout PUT, so read-only viewers can't save them.
  function updateViewBookmarks(updater: (prev: VenueViewBookmark[]) => VenueViewBookmark[]) {
    if (!canEditRef.current) return
    setHistory((current) => updateHistoryBookmarks(current, updater))
    setPersistable(true)
  }

  function undo() {
    setHistory((current) => {
      const next = undoHistory(current)
      const selection = reconcileSelection(next.present, selectedFloorId, selectedItemIds)
      setSelectedFloorId(selection.floorId)
      setSelectedItemIds(selection.itemIds)
      setSaveState('idle')
      return next
    })
  }

  function redo() {
    setHistory((current) => {
      const next = redoHistory(current)
      const selection = reconcileSelection(next.present, selectedFloorId, selectedItemIds)
      setSelectedFloorId(selection.floorId)
      setSelectedItemIds(selection.itemIds)
      setSaveState('idle')
      return next
    })
  }

  // Load a different venue's layout. skipNextSave avoids re-PUTing the freshly
  // loaded layout as if it were a user edit.
  function applyLoadedLayout(next: VenueLayout) {
    skipNextSave.current = true
    setHistory(createHistory(next))
    setSelectedFloorId(next.floors[0]?.id ?? '')
    setSelectedItemIds(firstItemSelection(next.floors[0]))
    setPersistable(true)
  }

  function selectFloor(floorId: string) {
    const floor = layout.floors.find((candidate) => candidate.id === floorId)
    setSelectedFloorId(floorId)
    setSelectedItemIds(firstItemSelection(floor))
  }

  async function switchVenue(id: string) {
    if (id === activeVenueId) return
    try {
      const res = await fetch(`/api/venue?id=${encodeURIComponent(id)}`)
      const body = (await res.json()) as { data: VenueLayout | null }
      if (!res.ok || !body.data) throw new Error('load failed')
      setActiveVenueId(id)
      window.localStorage.setItem(ACTIVE_VENUE_KEY, id)
      applyLoadedLayout(body.data)
      void refreshTranslations(id)
    } catch {
      setSaveState('error')
    }
  }

  // Rename the currently-active venue. Pushes the new name into history so the
  // existing autosave effect catches it; also patches the in-memory venues
  // summary so the dropdown reflects the change without re-fetching.
  function renameActiveVenue(name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === layout.name) return
    commit({ ...layout, name: trimmed })
    setVenues((prev) => prev.map((v) => (v.id === activeVenueId ? { ...v, name: trimmed } : v)))
  }

  async function createNewVenue() {
    try {
      const res = await fetch('/api/venue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t('newVenueName') }),
      })
      const body = (await res.json()) as { data: VenueLayout | null }
      if (!res.ok || !body.data) throw new Error('create failed')
      const created = body.data
      // The creator owns the new venue → full edit + manage rights.
      setVenues((prev) => [...prev, { id: created.venueId, name: created.name, canEdit: true, canManage: true }])
      setActiveVenueId(created.venueId)
      window.localStorage.setItem(ACTIVE_VENUE_KEY, created.venueId)
      applyLoadedLayout(created)
    } catch {
      setSaveState('error')
    }
  }

  function importLocalLayout() {
    if (!localImportLayout) return
    commit(localImportLayout)
    setSelectedFloorId(localImportLayout.floors[0]?.id ?? selectedFloorId)
    setSelectedItemIds(firstItemSelection(localImportLayout.floors[0]))
    setLocalImportLayout(null)
  }

  return {
    // 文档与历史
    history,
    layout,
    commit,
    undo,
    redo,
    updateViewBookmarks,
    // 选中
    selectedFloorId,
    selectFloor,
    selectedItemIds,
    setSelectedItemIds,
    // 场馆与权限
    venues,
    activeVenueId,
    canEdit,
    canManage,
    switchVenue,
    renameActiveVenue,
    createNewVenue,
    // 加载/保存状态
    loading,
    saveState,
    setSaveState,
    localImportLayout,
    importLocalLayout,
    nameTranslations,
  }
}
