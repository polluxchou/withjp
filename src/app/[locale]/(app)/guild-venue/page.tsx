'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Box,
  Building2,
  DoorOpen,
  Download,
  Flame,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Map,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  ShieldCheck,
  Undo2,
  Users,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import Header from '@/components/layout/Header'
import VenueCanvas from '@/venue/VenueCanvas'
import VenueInspector from '@/venue/VenueInspector'
import {
  DEFAULT_VENUE_LAYOUT,
  VENUE_STORAGE_KEY,
  addVenueItem,
  centimetersToMeters,
  createHistory,
  deleteVenueItem,
  moveVenueItemLayer,
  parseStoredVenueLayout,
  pushHistory,
  redoHistory,
  undoHistory,
  updateVenueFloor,
  updateVenueItem,
  metersToCentimeters,
  type VenueFloor,
  type VenueLayerMove,
  writeStoredVenueLayout,
  type VenueItem,
  type VenueItemType,
} from '@/venue/layoutData'

type SaveState = 'idle' | 'saved' | 'error'

const TOOL_ICON: Record<VenueItemType, typeof Box> = {
  equipment:   Monitor,
  renovation:  Wrench,
  area:        Building2,
  corridor:    Map,
  workstation: Users,
  fire:        Flame,
  exit:        DoorOpen,
  safety:      ShieldCheck,
}

export default function GuildVenuePage() {
  const t = useTranslations('venue')
  const [history, setHistory] = useState(() => createHistory(DEFAULT_VENUE_LAYOUT))
  const [selectedFloorId, setSelectedFloorId] = useState(DEFAULT_VENUE_LAYOUT.floors[0].id)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(DEFAULT_VENUE_LAYOUT.floors[0].items[0]?.id ?? null)
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [hydrated, setHydrated] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const stored = parseStoredVenueLayout(window.localStorage.getItem(VENUE_STORAGE_KEY))
    setHistory(createHistory(stored))
    setSelectedFloorId(stored.floors[0]?.id ?? DEFAULT_VENUE_LAYOUT.floors[0].id)
    setSelectedItemId(stored.floors[0]?.items[0]?.id ?? null)
    setHydrated(true)
  }, [])

  const layout = history.present
  const activeFloor = useMemo(
    () => layout.floors.find((floor) => floor.id === selectedFloorId) ?? layout.floors[0],
    [layout.floors, selectedFloorId],
  )
  const selectedItem = activeFloor?.items.find((item) => item.id === selectedItemId) ?? null
  const selectedLayerIndex = activeFloor && selectedItemId
    ? activeFloor.items.findIndex((item) => item.id === selectedItemId)
    : -1

  useEffect(() => {
    if (!hydrated) return
    try {
      writeStoredVenueLayout(window.localStorage, layout)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [hydrated, layout])

  function commit(nextLayout: typeof layout, nextSelectedItemId = selectedItemId) {
    setHistory((current) => pushHistory(current, nextLayout))
    setSelectedItemId(nextSelectedItemId)
    setSaveState('idle')
  }

  function addItem(type: VenueItemType) {
    if (!activeFloor) return
    const next = addVenueItem(layout, activeFloor.id, type)
    const nextFloor = next.floors.find((floor) => floor.id === activeFloor.id)
    const nextItem = nextFloor?.items.at(-1)
    commit(next, nextItem?.id ?? selectedItemId)
  }

  function updateItem(itemId: string, patch: Partial<VenueItem>) {
    if (!activeFloor) return
    commit(updateVenueItem(layout, activeFloor.id, itemId, patch), itemId)
  }

  function removeSelectedItem() {
    if (!activeFloor || !selectedItemId) return
    const result = deleteVenueItem(layout, activeFloor.id, selectedItemId, selectedItemId)
    commit(result.layout, result.selectedItemId)
  }

  function moveSelectedItemLayer(move: VenueLayerMove) {
    if (!activeFloor || !selectedItemId) return
    commit(moveVenueItemLayer(layout, activeFloor.id, selectedItemId, move), selectedItemId)
  }

  function updateBackgroundImage(backgroundImage: string) {
    if (!activeFloor) return
    commit(updateVenueFloor(layout, activeFloor.id, { backgroundImage: backgroundImage.trim() || undefined }))
  }

  function updateFloorDefaults(patch: Pick<Partial<VenueFloor>, 'width' | 'height'>) {
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
      setSelectedFloorId(floor.id)
      setSelectedItemId(floor.items.some((item) => item.id === selectedItemId) ? selectedItemId : floor.items[0]?.id ?? null)
      setSaveState('idle')
      return next
    })
  }

  function redo() {
    setHistory((current) => {
      const next = redoHistory(current)
      const floor = next.present.floors.find((candidate) => candidate.id === selectedFloorId) ?? next.present.floors[0]
      setSelectedFloorId(floor.id)
      setSelectedItemId(floor.items.some((item) => item.id === selectedItemId) ? selectedItemId : floor.items[0]?.id ?? null)
      setSaveState('idle')
      return next
    })
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isUndoTarget(event.target)) return
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return

      const key = event.key.toLowerCase()
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

  function exportSvg() {
    const svg = svgRef.current
    if (!svg) {
      setSaveState('error')
      return
    }
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`
    downloadFile(`${layout.venueId}-${activeFloor.name}.svg`, source, 'image/svg+xml')
  }

  if (!activeFloor) return null

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] min-h-[760px] flex flex-col">
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill state={saveState} />
          </div>
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-0 grid grid-rows-[auto_1fr]">
        <div className="min-h-14 border-b border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
          <select
            value={selectedFloorId}
            onChange={(event) => {
              const floorId = event.target.value
              const floor = layout.floors.find((candidate) => candidate.id === floorId)
              setSelectedFloorId(floorId)
              setSelectedItemId(floor?.items[0]?.id ?? null)
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={t('floorSelect')}
          >
            {layout.floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{layout.name} · {floor.name}</option>
            ))}
          </select>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {(['equipment', 'renovation', 'area', 'corridor'] as VenueItemType[]).map((type) => {
            const Icon = TOOL_ICON[type]
            return (
              <ToolbarButton
                key={type}
                icon={Icon}
                label={t(`addTypes.${type}`)}
                onClick={() => addItem(type)}
              />
            )
          })}

          <div className="w-px h-6 bg-slate-200 mx-1" />

          <ToolbarButton icon={Undo2} label={t('undo')} onClick={undo} disabled={history.past.length === 0} />
          <ToolbarButton icon={Redo2} label={t('redo')} onClick={redo} disabled={history.future.length === 0} />
          <ToolbarButton icon={Grid3X3} label={t('grid')} onClick={() => setShowGrid((value) => !value)} active={showGrid} />
          <ToolbarButton icon={ZoomOut} label={t('zoomOut')} onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} />
          <span className="min-w-14 text-center text-xs font-semibold text-slate-500">{Math.round(zoom * 100)}%</span>
          <ToolbarButton icon={ZoomIn} label={t('zoomIn')} onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))} />

          <div className="flex-1" />

          <ToolbarButton icon={Download} label={t('exportJson')} onClick={exportJson} />
          <ToolbarButton icon={ImageIcon} label={t('exportSvg')} onClick={exportSvg} />
        </div>

        <div className="min-h-0 grid grid-cols-[64px_minmax(720px,1fr)_320px]">
          <ToolRail activeFloor={activeFloor.name} />

          <div className="relative min-h-0 bg-slate-100 overflow-hidden">
            <FloatingPanel
              layoutName={layout.name}
              floorName={activeFloor.name}
              items={activeFloor.items}
              selectedItemId={selectedItemId}
              onSelect={setSelectedItemId}
              floorWidth={activeFloor.width}
              floorHeight={activeFloor.height}
              onFloorDefaultsChange={updateFloorDefaults}
              backgroundImage={activeFloor.backgroundImage ?? ''}
              onBackgroundChange={updateBackgroundImage}
            />
            <VenueCanvas
              ref={svgRef}
              floor={activeFloor}
              selectedItemId={selectedItemId}
              zoom={zoom}
              showGrid={showGrid}
              onSelectItem={setSelectedItemId}
              onItemChange={updateItem}
            />
          </div>

          <VenueInspector
            item={selectedItem}
            layerIndex={selectedLayerIndex}
            layerCount={activeFloor.items.length}
            onChange={(patch) => selectedItem && updateItem(selectedItem.id, patch)}
            onMoveLayer={moveSelectedItemLayer}
            onDelete={removeSelectedItem}
          />
        </div>
      </div>
    </div>
  )
}

function ToolRail({ activeFloor }: { activeFloor: string }) {
  const t = useTranslations('venue')
  const tools = [
    { key: 'venues', icon: Building2, label: t('railVenues') },
    { key: 'areas', icon: Map, label: t('railAreas') },
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
  items,
  selectedItemId,
  floorWidth,
  floorHeight,
  backgroundImage,
  onSelect,
  onFloorDefaultsChange,
  onBackgroundChange,
}: {
  layoutName: string
  floorName: string
  items: VenueItem[]
  selectedItemId: string | null
  floorWidth: number
  floorHeight: number
  backgroundImage: string
  onSelect: (id: string) => void
  onFloorDefaultsChange: (patch: Pick<Partial<VenueFloor>, 'width' | 'height'>) => void
  onBackgroundChange: (value: string) => void
}) {
  const t = useTranslations('venue')
  const [collapsed, setCollapsed] = useState(false)

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
          <h2 className="text-sm font-semibold text-slate-900 mt-1 truncate">{layoutName} · {floorName}</h2>
        </div>
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
      <div className="p-3 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-500 mb-1.5">{t('canvasDefaults')}</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-1">{t('canvasWidth')}</span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={centimetersToMeters(floorWidth)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value > 0) {
                  onFloorDefaultsChange({ width: metersToCentimeters(value) })
                }
              }}
              aria-label={t('canvasWidth')}
              className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-1">{t('canvasHeight')}</span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={centimetersToMeters(floorHeight)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value > 0) {
                  onFloorDefaultsChange({ height: metersToCentimeters(value) })
                }
              }}
              aria-label={t('canvasHeight')}
              className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1.5">{t('backgroundImage')}</span>
          <input
            value={backgroundImage}
            onChange={(event) => onBackgroundChange(event.target.value)}
            placeholder={t('backgroundPlaceholder')}
            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {items.map((item) => {
          const Icon = TOOL_ICON[item.type]
          const active = item.id === selectedItemId
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
                <span className="block text-sm font-medium truncate">{item.name}</span>
                <span className="block text-[11px] text-slate-400 truncate">
                  {formatMeters(item.width)}×{formatMeters(item.height)} · {formatMeters(item.x)}, {formatMeters(item.y)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
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
}: {
  icon: typeof Box
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
          : active
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden xl:inline">{label}</span>
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

function formatMeters(value: number) {
  return `${centimetersToMeters(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}m`
}

function isUndoTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  const tag = target.tagName.toLowerCase()
  return !target.isContentEditable && tag !== 'input' && tag !== 'textarea' && tag !== 'select'
}
