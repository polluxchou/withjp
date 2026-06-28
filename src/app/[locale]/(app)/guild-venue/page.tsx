'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  ArrowLeftRight,
  Bookmark,
  Box,
  Building2,
  ChevronDown,
  DoorClosed,
  DoorOpen,
  Download,
  Edit2,
  Flame,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  ListFilter,
  Lock,
  Map as MapIcon,
  MapPin,
  Monitor,
  Network,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Redo2,
  Ruler,
  Undo2,
  Users,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import Header from '@/components/layout/Header'
import VenueCanvas from '@/venue/VenueCanvas'
import Venue3DCanvas from '@/venue/Venue3DCanvas'
import VenueInspector, { type PlacedItemSummary } from '@/venue/VenueInspector'
import { registerVenueIntent } from '@/components/intent/CommandBar'
import { useRouter } from '@/i18n/navigation'
import type { Item } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import {
  DEFAULT_VENUE_LAYOUT,
  loadVenueLayout,
  parseStoredVenueLayout,
  applyVenueAction,
  addVenueItem,
  centimetersToMeters,
  createHistory,
  deleteVenueItem,
  formatVenueArea,
  formatVenueMeasurement,
  moveVenueItemLayer,
  totalVenueAreaSquareMeters,
  usableVenueAreaSquareMeters,
  venueAreaSquareMeters,
  isVenueMarkerType,
  VENUE_ITEM_TYPE_OPTIONS,
  VENUE_MARKER_TYPE_OPTIONS,
  VENUE_SHAPE_TYPE_OPTIONS,
  pushHistory,
  redoHistory,
  undoHistory,
  updateVenueFloor,
  updateVenueItem,
  metersToCentimeters,
  type VenueFloor,
  type VenueLayerMove,
  moveVenueItems,
  resolveVenueItemName,
  type VenueNameTranslations,
  writeStoredVenueLayout,
  VENUE_STORAGE_KEY,
  MAX_VENUE_VIEW_BOOKMARKS,
  type VenueItem,
  type VenueItemType,
  type VenueLayout,
  type VenueViewBookmark,
} from '@/venue/layoutData'

type SaveState = 'idle' | 'saved' | 'error'
// canEdit: may modify the canvas; canManage: may manage collaborators (owner/admin).
type VenueSummary = { id: string; name: string; canEdit: boolean; canManage: boolean }
type UserOption = { id: string; name: string; email: string | null }
// Remembers the last-opened venue per browser so reloads return to it.
const ACTIVE_VENUE_KEY = 'guild-venue:active-venue'
const DEFAULT_VENUE_ID = 'guild-main'

const TOOL_ICON: Record<VenueItemType, typeof Box> = {
  equipment:    Monitor,
  renovation:   Wrench,
  area:         Building2,
  corridor:     MapIcon,
  door_inward:  DoorOpen,
  door_outward: DoorClosed,
  door_sliding: ArrowLeftRight,
  fire:         Flame,
  power:        Plug,
  network:      Network,
}

const INSPECTOR_WIDTH = 320
const INSPECTOR_COLLAPSED_WIDTH = 44
const ALL_VENUE_TYPES = VENUE_ITEM_TYPE_OPTIONS.map((option) => option.value)

export default function GuildVenuePage() {
  const t = useTranslations('venue')
  const locale = useLocale()
  const [nameTranslations, setNameTranslations] = useState<VenueNameTranslations>({})
  const [history, setHistory] = useState(() => createHistory(DEFAULT_VENUE_LAYOUT))
  const [selectedFloorId, setSelectedFloorId] = useState(DEFAULT_VENUE_LAYOUT.floors[0].id)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => {
    const firstId = DEFAULT_VENUE_LAYOUT.floors[0].items[0]?.id
    return firstId ? [firstId] : []
  })
  const [zoom, setZoom] = useState(1.2)
  const [showGrid, setShowGrid] = useState(true)
  const [showRulers, setShowRulers] = useState(true)
  // 2D is the canonical edit surface; 3D is a read-only preview for now (S3).
  // Selection state is shared so clicking a box in 3D updates the inspector.
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [visibleTypes, setVisibleTypes] = useState<VenueItemType[]>(ALL_VENUE_TYPES)
  const [clipboard, setClipboard] = useState<VenueItem[]>([])
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
  // Bumped on every recall so the apply-scroll effect runs even when zoom is unchanged.
  const [recallTick, setRecallTick] = useState(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
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
      setSelectedItemIds(layout.floors[0]?.items[0]?.id ? [layout.floors[0].items[0].id] : [])
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

        const stored = window.localStorage.getItem(ACTIVE_VENUE_KEY)
        const activeId = stored && list.some((v) => v.id === stored)
          ? stored
          : list.some((v) => v.id === DEFAULT_VENUE_ID) ? DEFAULT_VENUE_ID : list[0].id
        setActiveVenueId(activeId)

        const layoutRes = await fetch(`/api/venue?id=${encodeURIComponent(activeId)}`)
        if (!layoutRes.ok) throw new Error(`status ${layoutRes.status}`)
        const layoutBody = (await layoutRes.json()) as { data: VenueLayout | null }
        if (cancelled) return
        const cloud = layoutBody.data ?? DEFAULT_VENUE_LAYOUT
        applyLayout(cloud)
        void refreshTranslations(activeId)
        setPersistable(true)

        // One-time import offer: only for the seeded shared venue, when the cloud
        // is still the untouched seed but this browser holds a non-default layout.
        if (activeId === DEFAULT_VENUE_ID) {
          try {
            const raw = window.localStorage.getItem(VENUE_STORAGE_KEY)
            if (raw) {
              const local = parseStoredVenueLayout(raw)
              if (layoutsEqual(cloud, DEFAULT_VENUE_LAYOUT) && !layoutsEqual(local, cloud)) {
                setLocalImportLayout(local)
              }
            }
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
  const viewBookmarks = layout.viewBookmarks ?? []
  const activeFloor = useMemo(
    () => layout.floors.find((floor) => floor.id === selectedFloorId) ?? layout.floors[0],
    [layout.floors, selectedFloorId],
  )
  // Floor with the type filter applied — used by the 3D view (the 2D canvas
  // filters internally via its visibleTypes prop).
  const visibleFloor = useMemo(() => {
    const allowed = new Set(visibleTypes)
    return { ...activeFloor, items: activeFloor.items.filter((item) => allowed.has(item.type)) }
  }, [activeFloor, visibleTypes])
  const selectedItemId = selectedItemIds.at(-1) ?? null
  const selectedItem = activeFloor?.items.find((item) => item.id === selectedItemId) ?? null

  // Permissions for the active venue (from the venue list). Default to editable
  // before the list loads / for the offline fallback; the DB still enforces 403.
  const activeVenue = venues.find((venue) => venue.id === activeVenueId)
  const canEdit = activeVenue?.canEdit ?? true
  const canManage = activeVenue?.canManage ?? false
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit
  // Collaborator-management modal (owner / admin only).
  const [collabOpen, setCollabOpen] = useState(false)

  const selectedLayerIndex = activeFloor && selectedItemId
    ? activeFloor.items.findIndex((item) => item.id === selectedItemId)
    : -1

  // Expose the current canvas to the global command bar ("用文字操作") so it can
  // scope NL instructions to this floor and apply the parsed action via commit.
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const activeFloorIdRef = useRef(activeFloor?.id ?? '')
  activeFloorIdRef.current = activeFloor?.id ?? ''
  const selectedIdRef = useRef(selectedItemId)
  selectedIdRef.current = selectedItemId
  useEffect(() => {
    registerVenueIntent({
      getItems: () => {
        const floor = layoutRef.current.floors.find((f) => f.id === activeFloorIdRef.current)
        return (floor?.items ?? []).map((item) => ({ id: item.id, name: item.name, type: item.type }))
      },
      apply: (action) => {
        const result = applyVenueAction(layoutRef.current, activeFloorIdRef.current, action, selectedIdRef.current)
        if (result.error) { setSaveState('error'); return }
        commit(result.layout, result.selectedItemId ? [result.selectedItemId] : [])
      },
    })
    return () => registerVenueIntent(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cross-feature read: surface the items placed in the selected zone + their
  // summed cost. Failure to load is non-fatal (the canvas still works).
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [expenseById, setExpenseById] = useState<Record<string, Expense>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const [itemsRes, exRes] = await Promise.all([fetch('/api/items'), fetch('/api/expenses')])
        const itemsJson = await itemsRes.json()
        const exJson = await exRes.json()
        if (itemsJson?.data) setItems(itemsJson.data as Item[])
        if (exJson?.data) {
          const map: Record<string, Expense> = {}
          for (const e of exJson.data as Expense[]) map[e.id] = e
          setExpenseById(map)
        }
      } catch { /* 联动展示是增强项，失败不阻断画布 */ }
    })()
  }, [])

  const placedItems: PlacedItemSummary[] = useMemo(() => {
    if (!selectedItem) return []
    return items
      .filter((it) => it.placement_venue_item_id === selectedItem.id)
      .map((it) => {
        const ex = it.expense_id ? expenseById[it.expense_id] : null
        const cost = ex ? Number(ex.unit_price) * it.quantity : 0
        return { id: it.id, item_code: it.item_code, name: it.name, quantity: it.quantity, cost }
      })
  }, [items, expenseById, selectedItem])
  const placedItemsTotalCost = useMemo(
    () => placedItems.reduce((sum, p) => sum + p.cost, 0),
    [placedItems],
  )

  // Floor-level rollup: every item whose placement_venue_item_id lands on any
  // venue item in the active floor. Used by the FloatingPanel "物品" tab so
  // the operator can see everything the floor owns without selecting a zone.
  // Carries the zone name so a row can say "直播间 A → 摄像机". `null` zone
  // means the item belongs to no zone yet (sits at floor level).
  const floorItems = useMemo(() => {
    if (!activeFloor) return [] as Array<{ id: string; item_code: string; name: string; quantity: number; cost: number; zoneName: string | null }>
    const venueItemById = new Map(activeFloor.items.map((it) => [it.id, it]))
    return items
      .filter((it) => it.placement_venue_item_id && venueItemById.has(it.placement_venue_item_id))
      .map((it) => {
        const zone = venueItemById.get(it.placement_venue_item_id!) ?? null
        const ex = it.expense_id ? expenseById[it.expense_id] : null
        const cost = ex ? Number(ex.unit_price) * it.quantity : 0
        return {
          id: it.id,
          item_code: it.item_code,
          name: it.name,
          quantity: it.quantity,
          cost,
          zoneName: zone?.name ?? null,
        }
      })
  }, [items, expenseById, activeFloor])
  const floorItemsTotalCost = useMemo(
    () => floorItems.reduce((sum, p) => sum + p.cost, 0),
    [floorItems],
  )

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

  // After a bookmark recall sets the zoom (and the canvas resizes), restore the
  // saved scroll offset on the next frame.
  useEffect(() => {
    if (!pendingScrollRef.current) return
    const target = pendingScrollRef.current
    pendingScrollRef.current = null
    const id = requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      if (scroller) {
        scroller.scrollLeft = target.left
        scroller.scrollTop = target.top
      }
    })
    return () => cancelAnimationFrame(id)
  }, [recallTick])

  function currentViewSnapshot(): VenueViewBookmark | null {
    const scroller = scrollerRef.current
    if (!scroller) return null
    return { zoom, left: scroller.scrollLeft, top: scroller.scrollTop }
  }

  // Bookmarks live on the layout so they persist to the DB, but they're view
  // state, not document content — update history.present in place (no undo step)
  // and let the debounced save push them.
  function updateViewBookmarks(updater: (prev: VenueViewBookmark[]) => VenueViewBookmark[]) {
    // Bookmarks persist via the layout PUT, so read-only viewers can't save them.
    if (!canEditRef.current) return
    setHistory((current) => {
      const next = updater(current.present.viewBookmarks ?? [])
      return {
        ...current,
        present: { ...current.present, viewBookmarks: next.length ? next : undefined },
      }
    })
    setPersistable(true)
  }

  function addViewBookmark() {
    const snapshot = currentViewSnapshot()
    if (!snapshot) return
    updateViewBookmarks((prev) => (prev.length >= MAX_VENUE_VIEW_BOOKMARKS ? prev : [...prev, snapshot]))
  }

  function overwriteViewBookmark(index: number) {
    const snapshot = currentViewSnapshot()
    if (!snapshot) return
    updateViewBookmarks((prev) => prev.map((entry, i) => (i === index ? snapshot : entry)))
  }

  function removeViewBookmark(index: number) {
    updateViewBookmarks((prev) => prev.filter((_, i) => i !== index))
  }

  function recallViewBookmark(index: number) {
    const bookmark = viewBookmarks[index]
    if (!bookmark) return
    pendingScrollRef.current = { left: bookmark.left, top: bookmark.top }
    setZoom(bookmark.zoom)
    setRecallTick((tick) => tick + 1)
  }

  function commit(nextLayout: typeof layout, nextSelectedItemIds = selectedItemIds) {
    // Read-only viewers can't change the document (the DB would 403 the save).
    if (!canEditRef.current) return
    setHistory((current) => pushHistory(current, nextLayout))
    setSelectedItemIds(nextSelectedItemIds)
    setSaveState('idle')
    // A deliberate edit means we now own the state — safe to persist again even
    // if the load was degraded (the previous raw is snapshotted to the backup key).
    setPersistable(true)
  }

  function addItem(type: VenueItemType) {
    if (!activeFloor) return
    const next = addVenueItem(layout, activeFloor.id, type)
    const nextFloor = next.floors.find((floor) => floor.id === activeFloor.id)
    const nextItem = nextFloor?.items.at(-1)
    commit(next, nextItem?.id ? [nextItem.id] : selectedItemIds)
  }

  function updateItem(itemId: string, patch: Partial<VenueItem>) {
    if (!activeFloor) return
    commit(updateVenueItem(layout, activeFloor.id, itemId, patch))
  }

  function moveItems(itemIds: string[], delta: { x: number; y: number }) {
    if (!activeFloor) return
    commit(moveVenueItems(layout, activeFloor.id, itemIds, delta), itemIds)
  }

  function removeSelectedItem() {
    if (!activeFloor || !selectedItemId) return
    const result = deleteVenueItem(layout, activeFloor.id, selectedItemId, selectedItemId)
    commit(result.layout, selectedItemIds.filter((itemId) => itemId !== selectedItemId))
  }

  function removeSelectedItems() {
    if (!activeFloor || selectedItemIds.length === 0) return
    const ids = new Set(selectedItemIds)
    const next = updateVenueFloor(layout, activeFloor.id, {
      items: activeFloor.items.filter((item) => !ids.has(item.id)),
    })
    commit(next, [])
  }

  // Clone items with fresh ids, offset a little so the copies are visible, append
  // them to the active floor, and select the new copies.
  function cloneItemsToFloor(source: VenueItem[]) {
    if (!activeFloor || source.length === 0) return
    const stamp = Date.now()
    const copies = source.map((item, index) => ({
      ...item,
      id: `${item.type}-${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      x: item.x + 24,
      y: item.y + 24,
    }))
    const next = updateVenueFloor(layout, activeFloor.id, {
      items: [...activeFloor.items, ...copies],
    })
    commit(next, copies.map((item) => item.id))
  }

  function copySelectedItems() {
    if (!activeFloor || selectedItemIds.length === 0) return
    const ids = new Set(selectedItemIds)
    setClipboard(activeFloor.items.filter((item) => ids.has(item.id)))
  }

  function pasteClipboard() {
    cloneItemsToFloor(clipboard)
  }

  function duplicateSelectedItems() {
    if (!activeFloor) return
    const ids = new Set(selectedItemIds)
    cloneItemsToFloor(activeFloor.items.filter((item) => ids.has(item.id)))
  }

  function moveSelectedItemLayer(move: VenueLayerMove) {
    if (!activeFloor || !selectedItemId) return
    commit(moveVenueItemLayer(layout, activeFloor.id, selectedItemId, move), selectedItemIds)
  }

  function updateBackgroundImage(backgroundImage: string) {
    if (!activeFloor) return
    commit(updateVenueFloor(layout, activeFloor.id, { backgroundImage: backgroundImage.trim() || undefined }))
  }

  // Load a different venue's layout. skipNextSave avoids re-PUTing the freshly
  // loaded layout as if it were a user edit.
  function applyLoadedLayout(next: VenueLayout) {
    skipNextSave.current = true
    setHistory(createHistory(next))
    setSelectedFloorId(next.floors[0]?.id ?? '')
    setSelectedItemIds(next.floors[0]?.items[0]?.id ? [next.floors[0].items[0].id] : [])
    setPersistable(true)
  }

  function selectFloor(floorId: string) {
    const floor = layout.floors.find((candidate) => candidate.id === floorId)
    setSelectedFloorId(floorId)
    setSelectedItemIds(floor?.items[0]?.id ? [floor.items[0].id] : [])
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

  function updateFloorDefaults(patch: Pick<Partial<VenueFloor>, 'width' | 'height' | 'floorHeight'>) {
    if (!activeFloor) return
    const next = updateVenueFloor(layout, activeFloor.id, patch)
    const nextFloor = next.floors.find((floor) => floor.id === activeFloor.id) ?? activeFloor
    commit({
      ...next,
      width: activeFloor.id === layout.floors[0]?.id ? nextFloor.width : next.width,
      height: activeFloor.id === layout.floors[0]?.id ? nextFloor.height : next.height,
    })
  }

  function undo() {
    setHistory((current) => {
      const next = undoHistory(current)
      const floor = next.present.floors.find((candidate) => candidate.id === selectedFloorId) ?? next.present.floors[0]
      const existing = new Set(floor.items.map((item) => item.id))
      const nextSelection = selectedItemIds.filter((itemId) => existing.has(itemId))
      setSelectedFloorId(floor.id)
      setSelectedItemIds(nextSelection.length > 0 ? nextSelection : (floor.items[0]?.id ? [floor.items[0].id] : []))
      setSaveState('idle')
      return next
    })
  }

  function redo() {
    setHistory((current) => {
      const next = redoHistory(current)
      const floor = next.present.floors.find((candidate) => candidate.id === selectedFloorId) ?? next.present.floors[0]
      const existing = new Set(floor.items.map((item) => item.id))
      const nextSelection = selectedItemIds.filter((itemId) => existing.has(itemId))
      setSelectedFloorId(floor.id)
      setSelectedItemIds(nextSelection.length > 0 ? nextSelection : (floor.items[0]?.id ? [floor.items[0].id] : []))
      setSaveState('idle')
      return next
    })
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isUndoTarget(event.target)) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedItemIds.length === 0) return
        event.preventDefault()
        removeSelectedItems()
        return
      }

      const meta = event.metaKey || event.ctrlKey
      if (!meta) return

      const key = event.key.toLowerCase()
      if (key === 'c') {
        if (selectedItemIds.length === 0) return
        event.preventDefault()
        copySelectedItems()
        return
      }
      if (key === 'v') {
        if (clipboard.length === 0) return
        event.preventDefault()
        pasteClipboard()
        return
      }
      if (key === 'd') {
        if (selectedItemIds.length === 0) return
        event.preventDefault()
        duplicateSelectedItems()
        return
      }
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        redo()
        return
      }
      if (key === 'z') {
        event.preventDefault()
        undo()
        return
      }
      if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function exportJson() {
    downloadFile(`${layout.venueId}.json`, JSON.stringify(layout, null, 2), 'application/json')
  }

  // Rasterize the canvas SVG to a PNG at the floor's native resolution
  // (2x for retina sharpness). The selection chrome is stripped from a clone
  // first, and a white backdrop is painted so transparent regions don't turn
  // black in the PNG.
  function exportPng() {
    // In 3D, grab the WebGL canvas directly (preserveDrawingBuffer is enabled).
    if (viewMode === '3d') {
      const canvasEl = canvasAreaRef.current?.querySelector('canvas')
      if (!canvasEl) {
        setSaveState('error')
        return
      }
      try {
        canvasEl.toBlob((blob) => {
          if (!blob) {
            setSaveState('error')
            return
          }
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${layout.venueId}-${activeFloor.name}-3d.png`
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)
        }, 'image/png')
      } catch {
        setSaveState('error')
      }
      return
    }

    const svg = svgRef.current
    if (!svg) {
      setSaveState('error')
      return
    }
    try {
      const width = activeFloor.width
      const height = activeFloor.height
      const scale = 2

      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.querySelectorAll('[data-venue-selection]').forEach((node) => node.remove())
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))

      const source = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`
      const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))

      const image = new Image()
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(width * scale)
          canvas.height = Math.round(height * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            setSaveState('error')
            return
          }
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => {
            if (!blob) {
              setSaveState('error')
              return
            }
            const pngUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = pngUrl
            link.download = `${layout.venueId}-${activeFloor.name}.png`
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(pngUrl)
          }, 'image/png')
        } catch {
          setSaveState('error')
        } finally {
          URL.revokeObjectURL(svgUrl)
        }
      }
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        setSaveState('error')
      }
      image.src = svgUrl
    } catch {
      setSaveState('error')
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100dvh-4rem)] min-h-[760px] flex items-center justify-center text-sm font-medium text-slate-500">
        {t('loading')}
      </div>
    )
  }

  if (!activeFloor) return null

  function importLocalLayout() {
    if (!localImportLayout) return
    commit(localImportLayout)
    setSelectedFloorId(localImportLayout.floors[0]?.id ?? selectedFloorId)
    setSelectedItemIds(localImportLayout.floors[0]?.items[0]?.id ? [localImportLayout.floors[0].items[0].id] : [])
    setLocalImportLayout(null)
  }

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] min-h-[760px] flex flex-col">
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {!canEdit && (
              <span
                title={t('readOnlyHint')}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
              >
                <Lock className="w-3 h-3" />
                {t('readOnly')}
              </span>
            )}
            <StatusPill state={saveState} />
          </div>
        }
      />

      {localImportLayout && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">{t('importLocalPrompt')}</span>
          <button
            type="button"
            onClick={importLocalLayout}
            className="h-8 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            {t('importLocal')}
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-0 grid grid-rows-[auto_1fr]">
        <div className="min-h-14 border-b border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
          {canEdit && (
            <>
              {VENUE_SHAPE_TYPE_OPTIONS.map((option) => (
                <ToolbarButton
                  key={option.value}
                  icon={TOOL_ICON[option.value]}
                  label={t(`addTypes.${option.value}`)}
                  onClick={() => addItem(option.value)}
                />
              ))}
              <AddMarkerMenu onAdd={addItem} />

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <ToolbarButton iconOnly icon={Undo2} label={t('undo')} onClick={undo} disabled={history.past.length === 0} />
              <ToolbarButton iconOnly icon={Redo2} label={t('redo')} onClick={redo} disabled={history.future.length === 0} />
            </>
          )}
          <ToolbarButton iconOnly icon={Grid3X3} label={t('grid')} onClick={() => setShowGrid((value) => !value)} active={showGrid} />
          <ToolbarButton iconOnly icon={Ruler} label={t('dimensionRulers')} onClick={() => setShowRulers((value) => !value)} active={showRulers} />

          <div className="w-px h-6 bg-slate-200 mx-1" />

          <ToolbarButton iconOnly icon={ZoomOut} label={t('zoomOut')} onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} />
          <span className="min-w-14 text-center text-xs font-semibold text-slate-500">{Math.round(zoom * 100)}%</span>
          <ToolbarButton iconOnly icon={ZoomIn} label={t('zoomIn')} onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))} />

          {viewMode === '2d' && canEdit && (
            <>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <ViewBookmarks
                bookmarks={viewBookmarks}
                max={MAX_VENUE_VIEW_BOOKMARKS}
                onAdd={addViewBookmark}
                onRecall={recallViewBookmark}
                onOverwrite={overwriteViewBookmark}
                onRemove={removeViewBookmark}
              />
            </>
          )}

          <div className="w-px h-6 bg-slate-200 mx-1" />
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              title={t('modeSwitchTo2d')}
              aria-label={t('modeSwitchTo2d')}
              aria-pressed={viewMode === '2d'}
              className={`h-9 px-3 text-xs font-semibold transition-colors ${
                viewMode === '2d'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t('mode2d')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              title={t('modeSwitchTo3d')}
              aria-label={t('modeSwitchTo3d')}
              aria-pressed={viewMode === '3d'}
              className={`h-9 px-3 text-xs font-semibold border-l border-slate-200 transition-colors ${
                viewMode === '3d'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t('mode3d')}
            </button>
          </div>

          <div className="flex-1" />
        </div>

        <div
          className="min-h-0 grid"
          style={{ gridTemplateColumns: `64px minmax(720px,1fr) ${inspectorCollapsed ? INSPECTOR_COLLAPSED_WIDTH : INSPECTOR_WIDTH}px` }}
        >
          <ToolRail activeFloor={activeFloor.name} />

          <div ref={canvasAreaRef} className="relative min-h-0 bg-slate-100 overflow-hidden">
            <FloatingPanel
              layoutName={layout.name}
              floorName={activeFloor.name}
              venues={venues}
              activeVenueId={activeVenueId}
              floors={layout.floors}
              selectedFloorId={selectedFloorId}
              onSwitchVenue={switchVenue}
              onSelectFloor={selectFloor}
              onCreateVenue={createNewVenue}
              onRenameActiveVenue={renameActiveVenue}
              canManage={canManage}
              onManageCollaborators={() => setCollabOpen(true)}
              floorItems={floorItems}
              floorItemsTotalCost={floorItemsTotalCost}
              items={activeFloor.items}
              selectedItemIds={selectedItemIds}
              onSelect={(itemId) => setSelectedItemIds([itemId])}
              visibleTypes={visibleTypes}
              locale={locale}
              nameTranslations={nameTranslations}
            />
            {viewMode === '3d' ? (
              <Venue3DCanvas
                floor={visibleFloor}
                selectedItemIds={selectedItemIds}
                onSelectItems={setSelectedItemIds}
                onItemChange={updateItem}
                itemName={(item) => resolveVenueItemName(item.name, item.id, locale, nameTranslations)}
              />
            ) : (
              <VenueCanvas
                ref={svgRef}
                scrollRef={scrollerRef}
                floor={activeFloor}
                selectedItemIds={selectedItemIds}
                zoom={zoom}
                showGrid={showGrid}
                showRulers={showRulers}
                visibleTypes={visibleTypes}
                fitWidthReserve={inspectorCollapsed ? INSPECTOR_WIDTH - INSPECTOR_COLLAPSED_WIDTH : 0}
                onSelectItems={setSelectedItemIds}
                onItemChange={updateItem}
                onItemsMove={moveItems}
                itemName={(item) => resolveVenueItemName(item.name, item.id, locale, nameTranslations)}
              />
            )}
          </div>

          <VenueInspector
            item={selectedItem}
            layerIndex={selectedLayerIndex}
            layerCount={activeFloor.items.length}
            collapsed={inspectorCollapsed}
            storeyHeightCm={activeFloor.floorHeight}
            placedItems={placedItems}
            placedItemsTotalCost={placedItemsTotalCost}
            onOpenItems={() => router.push('/items')}
            emptyStateActions={
              <div className="space-y-4">
                {canEdit && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">{t('canvasSettings')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-slate-400 mb-1">{t('canvasWidth')}</span>
                      <input
                        type="number" min="1" step="0.1"
                        value={centimetersToMeters(activeFloor.width)}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (Number.isFinite(value) && value > 0) updateFloorDefaults({ width: metersToCentimeters(value) })
                        }}
                        aria-label={t('canvasWidth')}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-slate-400 mb-1">{t('canvasHeight')}</span>
                      <input
                        type="number" min="1" step="0.1"
                        value={centimetersToMeters(activeFloor.height)}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (Number.isFinite(value) && value > 0) updateFloorDefaults({ height: metersToCentimeters(value) })
                        }}
                        aria-label={t('canvasHeight')}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="block col-span-2">
                      <span className="block text-[11px] text-slate-400 mb-1">{t('floorStoreyHeight')}</span>
                      <input
                        type="number" min="1" step="0.1"
                        value={centimetersToMeters(activeFloor.floorHeight)}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (Number.isFinite(value) && value > 0) updateFloorDefaults({ floorHeight: metersToCentimeters(value) })
                        }}
                        aria-label={t('floorStoreyHeight')}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[11px] text-slate-400 mb-1">{t('backgroundImage')}</span>
                    <input
                      value={activeFloor.backgroundImage ?? ''}
                      onChange={(event) => updateBackgroundImage(event.target.value)}
                      placeholder={t('backgroundPlaceholder')}
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">{t('canvasActions')}</p>
                  <TypeFilter visibleTypes={visibleTypes} onChange={setVisibleTypes} fullWidth />
                  <button
                    type="button"
                    onClick={exportJson}
                    className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {t('exportJson')}
                  </button>
                  <button
                    type="button"
                    onClick={exportPng}
                    className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {t('exportImage')}
                  </button>
                </div>
              </div>
            }
            onToggleCollapsed={() => setInspectorCollapsed((value) => !value)}
            onChange={(patch) => selectedItem && updateItem(selectedItem.id, patch)}
            onMoveLayer={moveSelectedItemLayer}
            onDelete={removeSelectedItem}
          />
        </div>
      </div>

      {collabOpen && canManage && (
        <CollaboratorsModal venueId={activeVenueId} onClose={() => setCollabOpen(false)} />
      )}
    </div>
  )
}

function ToolRail({ activeFloor }: { activeFloor: string }) {
  const t = useTranslations('venue')
  const tools = [
    { key: 'venues', icon: Building2, label: t('railVenues') },
    { key: 'areas', icon: MapIcon, label: t('railAreas') },
    { key: 'library', icon: Box, label: t('railLibrary') },
    { key: 'layers', icon: Layers, label: t('railLayers') },
  ]

  return (
    <aside className="bg-white border-r border-slate-200 py-3 flex flex-col items-center gap-2">
      {tools.map(({ key, icon: Icon, label }, index) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          className={`w-11 h-11 rounded-xl inline-flex items-center justify-center transition-colors ${
            index === 0 ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Icon className="w-5 h-5" />
        </button>
      ))}
      <div className="flex-1" />
      <div className="w-10 min-h-10 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-500 flex items-center justify-center">
        {activeFloor}
      </div>
    </aside>
  )
}

function FloatingPanel({
  layoutName,
  floorName,
  venues,
  activeVenueId,
  floors,
  selectedFloorId,
  onSwitchVenue,
  onSelectFloor,
  onCreateVenue,
  onRenameActiveVenue,
  canManage,
  onManageCollaborators,
  floorItems,
  floorItemsTotalCost,
  items,
  selectedItemIds,
  visibleTypes,
  onSelect,
  locale,
  nameTranslations,
}: {
  layoutName: string
  floorName: string
  venues: VenueSummary[]
  activeVenueId: string
  floors: VenueFloor[]
  selectedFloorId: string
  onSwitchVenue: (id: string) => void
  onSelectFloor: (id: string) => void
  onCreateVenue: () => void
  onRenameActiveVenue: (name: string) => void
  canManage: boolean
  onManageCollaborators: () => void
  floorItems: Array<{ id: string; item_code: string; name: string; quantity: number; cost: number; zoneName: string | null }>
  floorItemsTotalCost: number
  items: VenueItem[]
  selectedItemIds: string[]
  visibleTypes: VenueItemType[]
  onSelect: (id: string) => void
  locale: string
  nameTranslations: VenueNameTranslations
}) {
  const t = useTranslations('venue')
  const [collapsed, setCollapsed] = useState(false)
  const [venueMenuOpen, setVenueMenuOpen] = useState(false)
  // When non-null, the active venue row in the dropdown is swapped for an
  // inline input prefilled with this value — Enter saves, Escape / blur cancels.
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const venueMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!venueMenuOpen) return
    const handle = (event: MouseEvent) => {
      if (venueMenuRef.current && !venueMenuRef.current.contains(event.target as Node)) setVenueMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [venueMenuOpen])
  const [listTab, setListTab] = useState<'shapes' | 'markers' | 'items'>('shapes')
  const totalAreaSqMeters = totalVenueAreaSquareMeters(items)
  const usableAreaSqMeters = usableVenueAreaSquareMeters(items)
  const visibleTypeSet = useMemo(() => new Set(visibleTypes), [visibleTypes])
  // Rank the three largest 'area' spaces (by area share) — computed over all
  // items so the badge stays stable regardless of the active type filter.
  const areaRank = useMemo(() => {
    const map = new Map<string, number>()
    items
      .filter((item) => item.type === 'area')
      .sort((a, b) => venueAreaSquareMeters(b) - venueAreaSquareMeters(a))
      .slice(0, 3)
      .forEach((item, index) => map.set(item.id, index))
    return map
  }, [items])
  // corridor renders as a shape but is grouped under the "标识" tab
  const isInMarkersTab = (type: VenueItemType) => isVenueMarkerType(type) || type === 'corridor'
  const markerCount = items.filter((item) => isInMarkersTab(item.type)).length
  const shapeCount = items.length - markerCount
  const listItems = items
    .filter((item) => visibleTypeSet.has(item.type))
    .filter((item) => (listTab === 'markers' ? isInMarkersTab(item.type) : !isInMarkersTab(item.type)))
    .sort((a, b) => venueAreaSquareMeters(b) - venueAreaSquareMeters(a))

  if (collapsed) {
    return (
      <div className="absolute left-4 top-4 z-10">
        <button
          type="button"
          title={t('expandVenuePanel')}
          aria-label={t('expandVenuePanel')}
          onClick={() => setCollapsed(false)}
          className="h-11 max-w-56 rounded-xl border border-slate-200 bg-white/95 px-3 shadow-lg backdrop-blur inline-flex items-center gap-2 text-left text-slate-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-white transition-colors"
        >
          <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate-500">{t('currentVenue')}</span>
            <span className="block truncate text-sm font-semibold">{layoutName} · {floorName}</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-4 z-10 w-72 rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="p-4 border-b border-slate-100 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{t('currentVenue')}</p>
          <div ref={venueMenuRef} className="relative mt-1">
            <button
              type="button"
              onClick={() => setVenueMenuOpen((open) => !open)}
              title={t('switchVenue')}
              className="flex w-full items-center gap-1 rounded-md -mx-1 px-1 text-left hover:bg-slate-100/70 transition-colors"
            >
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{layoutName} · {floorName}</h2>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${venueMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {venueMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {venues.map((venue) => {
                  const isActiveVenue = venue.id === activeVenueId
                  const isEditing = isActiveVenue && renameDraft !== null
                  return (
                    <div key={venue.id}>
                      {isEditing ? (
                        // Inline rename: Enter commits, Escape / blur cancels.
                        // We keep the row in place (no layout shift) and swap
                        // only the label for an input.
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                          <input
                            autoFocus
                            value={renameDraft ?? ''}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onRenameActiveVenue(renameDraft ?? '')
                                setRenameDraft(null)
                              } else if (e.key === 'Escape') {
                                setRenameDraft(null)
                              }
                            }}
                            onBlur={() => setRenameDraft(null)}
                            className="flex-1 min-w-0 rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1 pr-1">
                          <button
                            type="button"
                            // Keep the dropdown open after a venue switch so the
                            // user can drill down into the freshly-loaded floors
                            // without re-opening the menu. The menu closes only
                            // when a floor is picked.
                            onClick={() => onSwitchVenue(venue.id)}
                            className={`flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs ${
                              isActiveVenue ? 'font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                            <span className="truncate flex-1">{venue.name}</span>
                            {/* Chevron telegraphs "click to drill down" — points
                                down when this venue's floors are showing below,
                                right when collapsed. */}
                            <ChevronDown
                              className={`w-3 h-3 flex-shrink-0 text-slate-400 transition-transform ${
                                isActiveVenue ? '' : '-rotate-90'
                              }`}
                            />
                          </button>
                          {isActiveVenue && (
                            <button
                              type="button"
                              onClick={() => setRenameDraft(venue.name)}
                              title={t('renameVenue')}
                              aria-label={t('renameVenue')}
                              // Hover-visible edit affordance: invisible until the
                              // row (or the icon itself) is hovered, so the menu
                              // looks calm by default.
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-opacity"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                      {/* Floors of the active venue (the only one whose floors are loaded). */}
                      {isActiveVenue && floors.map((floor) => (
                        <button
                          key={floor.id}
                          type="button"
                          onClick={() => { onSelectFloor(floor.id); setVenueMenuOpen(false) }}
                          className={`flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-xs ${
                            floor.id === selectedFloorId ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{floor.name}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
                <div className="my-1 h-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => { onCreateVenue(); setVenueMenuOpen(false) }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('newVenue')}
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {t('totalSpaceArea')} {formatVenueArea(totalAreaSqMeters)}
            {totalAreaSqMeters > 0 && (
              <span className="ml-1 text-slate-500">· {t('usableSpaceArea')} {formatVenueArea(usableAreaSqMeters)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {canManage && (
            <button
              type="button"
              title={t('collaboratorsTitle')}
              aria-label={t('collaboratorsTitle')}
              onClick={onManageCollaborators}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-indigo-700 transition-colors"
            >
              <Users className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            title={t('collapseVenuePanel')}
            aria-label={t('collapseVenuePanel')}
            onClick={() => setCollapsed(true)}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-indigo-700 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex gap-1 border-b border-slate-100 px-2 pt-2">
        {([
          ['shapes', t('tabShapes'), shapeCount],
          ['markers', t('tabMarkers'), markerCount],
          ['items', t('tabItems'), floorItems.length],
        ] as const).map(([key, tabLabel, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setListTab(key)}
            className={`flex-1 rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              listTab === key
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {tabLabel} <span className="text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[calc(100dvh-24rem)] min-h-72 overflow-auto p-2">
        {listTab === 'items' ? (
          // Floor-level item rollup. Pulls from the items module rather than
          // the canvas — clicking a row opens that item's edit page so the
          // operator can update status / move it. Total cost lands at the
          // bottom as a sticky-feeling summary row.
          <>
            {floorItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-400">{t('floorItemsEmpty')}</p>
            )}
            {floorItems.length > 0 && floorItems.map((it) => (
              <a
                key={it.id}
                href={`/items/${it.id}`}
                className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors text-slate-600 hover:bg-slate-50"
              >
                <Package className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{it.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {it.item_code}
                    {it.quantity > 1 && ` · ×${it.quantity}`}
                    {it.zoneName && ` · ${it.zoneName}`}
                  </span>
                </span>
                {it.cost > 0 && (
                  <span className="text-[11px] font-medium text-slate-500 tabular-nums whitespace-nowrap mt-0.5">
                    ¥{Math.round(it.cost).toLocaleString('zh-CN')}
                  </span>
                )}
              </a>
            ))}
            {floorItems.length > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
                <span className="text-slate-500">{t('floorItemsTotal')}</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  ¥{Math.round(floorItemsTotalCost).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {listItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-400">{t('filterEmpty')}</p>
            )}
            {listItems.map((item) => {
              const Icon = TOOL_ICON[item.type]
              const active = selectedItemIds.includes(item.id)
              const isMarker = isVenueMarkerType(item.type)
              // Only 空间 participates in area accounting — 设备/区域/结构 show just
              // their dimensions (no m² figure, no share).
              const countsArea = item.type === 'area'
              const areaSqMeters = venueAreaSquareMeters(item)
              const share = item.type === 'area' && totalAreaSqMeters > 0
                ? (areaSqMeters / totalAreaSqMeters) * 100
                : null
              // Top-3 spaces by area get an emphasized (bold + darker) metric line.
              const isTopArea = areaRank.get(item.id) !== undefined
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{resolveVenueItemName(item.name, item.id, locale, nameTranslations)}</span>
                    <span className={`block text-[11px] truncate ${isTopArea ? 'font-semibold text-slate-600' : 'text-slate-400'}`}>
                      {isMarker ? (
                        t(`types.${item.type}`)
                      ) : (
                        <>
                          {formatVenueMeasurement(item.width)}×{formatVenueMeasurement(item.height)}
                          {countsArea && ` · ${formatVenueArea(areaSqMeters)}`}
                          {share !== null && ` · ${share.toFixed(1)}%`}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// Single-button view-bookmark control. Empty → an add button; with saved views
// → a dropdown to switch / overwrite / remove, plus add until the cap is hit.
function ViewBookmarks({
  bookmarks,
  max,
  onAdd,
  onRecall,
  onOverwrite,
  onRemove,
}: {
  bookmarks: VenueViewBookmark[]
  max: number
  onAdd: () => void
  onRecall: (index: number) => void
  onOverwrite: (index: number) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('venue')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const count = bookmarks.length
  const safeActive = active < count ? active : 0

  const goTo = (index: number) => {
    setActive(index)
    onRecall(index)
  }

  // One-click cycle to the next saved view.
  const cycle = () => goTo(count === 0 ? 0 : (safeActive + 1) % count)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setOpen((value) => !value)
  }

  // Empty: a single add button.
  if (count === 0) {
    return (
      <div ref={ref} className="flex-shrink-0">
        <button
          ref={buttonRef}
          type="button"
          onClick={onAdd}
          title={t('viewSaveCurrent')}
          aria-label={t('viewSaveCurrent')}
          className="h-9 shrink-0 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          <Bookmark className="w-4 h-4 flex-shrink-0" />
          <Plus className="w-3 h-3 flex-shrink-0" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="flex-shrink-0 inline-flex rounded-lg border border-indigo-200 overflow-hidden">
      {/* Main: one-click switch to the next saved view. */}
      <button
        type="button"
        onClick={cycle}
        title={t('viewSwitchNext')}
        aria-label={t('viewSwitchNext')}
        className="h-9 inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <Bookmark className="w-4 h-4 flex-shrink-0" />
        <span>{safeActive + 1}</span>
      </button>
      {/* Chevron: open the manage menu (switch to a specific view / overwrite / remove / add). */}
      <button
        ref={buttonRef}
        type="button"
        onClick={openMenu}
        title={t('viewBookmarks')}
        aria-label={t('viewBookmarks')}
        className="h-9 inline-flex items-center justify-center border-l border-indigo-200 bg-indigo-50 px-1.5 text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && count > 0 && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {bookmarks.map((_, index) => (
            <div key={index} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  goTo(index)
                  setOpen(false)
                }}
                className={`flex-1 text-left text-xs font-medium ${index === safeActive ? 'text-indigo-700' : 'text-slate-700'}`}
              >
                {t('viewBookmarkN', { n: index + 1 })}
              </button>
              <button
                type="button"
                onClick={() => onOverwrite(index)}
                title={t('viewOverwrite')}
                className="px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:text-indigo-600"
              >
                {t('viewOverwriteShort')}
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                title={t('viewRemove')}
                className="text-slate-400 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {count < max && (
            <>
              <div className="my-1 h-px bg-slate-100" />
              <button
                type="button"
                onClick={() => onAdd()}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('viewSaveCurrent')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AddMarkerMenu({ onAdd }: { onAdd: (type: VenueItemType) => void }) {
  const t = useTranslations('venue')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const toggleOpen = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setOpen((value) => !value)
  }

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
      >
        <MapPin className="w-4 h-4 flex-shrink-0" />
        <span className="whitespace-nowrap">{t('addMarker')}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {/* corridor(结构)归在标识菜单里——它是 shape 但分组在标识 tab，此处提供其唯一的添加入口 */}
          {([...VENUE_MARKER_TYPE_OPTIONS, { value: 'corridor' }] as { value: VenueItemType }[]).map((option) => {
            const Icon = TOOL_ICON[option.value]
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onAdd(option.value)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span>{t(`types.${option.value}`)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TypeFilter({
  visibleTypes,
  onChange,
  fullWidth = false,
}: {
  visibleTypes: VenueItemType[]
  onChange: (next: VenueItemType[]) => void
  fullWidth?: boolean
}) {
  const t = useTranslations('venue')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // The toolbar is horizontally scrollable, which clips an absolutely-positioned
  // menu — anchor it with fixed coords from the trigger so it escapes the clip.
  const toggleOpen = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setOpen((value) => !value)
  }

  const visibleSet = new Set(visibleTypes)
  const allSelected = VENUE_ITEM_TYPE_OPTIONS.every((option) => visibleSet.has(option.value))
  const summary = allSelected
    ? t('filterAllComponents')
    : t('filterCount', { count: visibleTypes.length })

  const toggle = (value: VenueItemType) => {
    if (visibleSet.has(value)) {
      // Always keep at least one type visible.
      if (visibleTypes.length <= 1) return
      onChange(visibleTypes.filter((type) => type !== value))
    } else {
      onChange([...visibleTypes, value])
    }
  }

  return (
    <div ref={ref} className={fullWidth ? 'w-full' : 'flex-shrink-0'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          allSelected
            ? 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
            : 'border-indigo-200 bg-indigo-50 text-indigo-700'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ListFilter className="w-4 h-4 flex-shrink-0" />
          <span className="whitespace-nowrap">{summary}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && (
        <div
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            // Cap height to the remaining viewport so the 10-type list never
            // clips off-screen when the trigger sits low on the canvas.
            maxHeight: `calc(100vh - ${menuPos.top + 16}px)`,
            overflowY: 'auto',
          }}
          className="z-50 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange(ALL_VENUE_TYPES)}
            disabled={allSelected}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            {t('filterShowAll')}
          </button>
          <div className="my-1 h-px bg-slate-100" />
          {VENUE_ITEM_TYPE_OPTIONS.map((option) => {
            const Icon = TOOL_ICON[option.value]
            const checked = visibleSet.has(option.value)
            const lockedLast = checked && visibleTypes.length <= 1
            return (
              <label
                key={option.value}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 ${lockedLast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lockedLast}
                  onChange={() => toggle(option.value)}
                  className="accent-indigo-600"
                />
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span>{t(`types.${option.value}`)}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  primary,
  iconOnly,
}: {
  icon: typeof Box
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  // Always render as an icon-only square (label lives in the tooltip), trimming
  // the horizontal footprint for self-explanatory utility controls.
  iconOnly?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`h-9 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-semibold leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        iconOnly ? 'w-9' : 'gap-1.5 px-3'
      } ${
        primary
          ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
          : active
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!iconOnly && <span className="hidden whitespace-nowrap xl:inline">{label}</span>}
    </button>
  )
}

function StatusPill({ state }: { state: SaveState }) {
  const t = useTranslations('venue')
  if (state === 'idle') return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
      state === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {state === 'saved' ? t('autoSaved') : t('saveFailed')}
    </span>
  )
}

// Owner / admin tool: pick which system users may co-edit this venue. The list
// is every WithJP profile (by name + email); current editors come pre-checked.
function CollaboratorsModal({ venueId, onClose }: { venueId: string; onClose: () => void }) {
  const t = useTranslations('venue')
  const [users, setUsers] = useState<UserOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [usersRes, editorsRes] = await Promise.all([
          fetch('/api/users'),
          fetch(`/api/venue/collaborators?id=${encodeURIComponent(venueId)}`),
        ])
        const usersJson = (await usersRes.json()) as { data: UserOption[] | null }
        const editorsJson = (await editorsRes.json()) as { data: { userIds: string[] } | null }
        if (cancelled) return
        if (usersJson.data) setUsers(usersJson.data)
        if (editorsJson.data?.userIds) setSelected(new Set(editorsJson.data.userIds))
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [venueId])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
    : users

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(false)
    try {
      const res = await fetch('/api/venue/collaborators', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, userIds: Array.from(selected) }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      onClose()
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{t('collaboratorsTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('collaboratorsDesc')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('collaboratorsCancel')}
            className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('collaboratorsSearch')}
            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="min-h-40 flex-1 overflow-auto px-3 py-3">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">{t('collaboratorsLoading')}</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">{t('collaboratorsEmpty')}</p>
          ) : (
            filtered.map((user) => (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(user.id)}
                  onChange={() => toggle(user.id)}
                  className="accent-indigo-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">{user.name}</span>
                  {user.email && <span className="block truncate text-xs text-slate-400">{user.email}</span>}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
          <span className="text-xs text-slate-400">
            {error ? (
              <span className="text-red-600">{t('collaboratorsError')}</span>
            ) : (
              t('collaboratorsCount', { count: selected.size })
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {t('collaboratorsCancel')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {t('collaboratorsSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// Structural equality for layouts. Sufficient here: layouts are plain JSON
// (no functions/dates), so serialized comparison detects whether the cloud copy
// is still the untouched seed and whether the local copy differs.
function layoutsEqual(a: VenueLayout, b: VenueLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isUndoTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  const tag = target.tagName.toLowerCase()
  return !target.isContentEditable && tag !== 'input' && tag !== 'textarea' && tag !== 'select'
}
