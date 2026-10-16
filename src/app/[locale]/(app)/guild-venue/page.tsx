'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import VenueCanvas, { type VenueRulerOptions } from '@/venue/VenueCanvas'
import { autoChainBandDepth } from '@/venue/dimension-chain'
import Venue3DCanvas from '@/venue/Venue3DCanvas'
import VenueInspector from '@/venue/VenueInspector'
import { registerVenueIntent } from '@/components/intent/CommandPanel'
import { useRouter } from '@/i18n/navigation'
import {
  applyVenueAction,
  addVenueItem,
  deleteVenueItem,
  mergeVenueAreas,
  moveVenueItemLayer,
  moveVenueItems,
  resolveVenueItemName,
  unmergeVenueAreas,
  updateVenueFloor,
  updateVenueItem,
  type VenueFloor,
  type VenueItem,
  type VenueItemType,
  type VenueLayerMove,
} from '@/venue/layoutData'
import {
  applyFloorDefaults,
  applyToAreaPairs,
  areasFullyMerged,
  cloneVenueItems,
  selectedAreaItems,
  zoomInStep,
  zoomOutStep,
} from '@/lib/venue/editor'
import CanvasSettingsPanel from '@/venue/editor/CanvasSettingsPanel'
import CollaboratorsModal from '@/venue/editor/CollaboratorsModal'
import FloatingPanel from '@/venue/editor/FloatingPanel'
import ToolRail from '@/venue/editor/ToolRail'
import VenueToolbar, { type VenueViewMode } from '@/venue/editor/VenueToolbar'
import { downloadFile, exportCanvasAsPng, exportSvgAsPng } from '@/venue/editor/exportImage'
import type { SaveState } from '@/venue/editor/types'
import { useVenueDocument } from '@/venue/editor/useVenueDocument'
import { useVenueItemCosts } from '@/venue/editor/useVenueItemCosts'
import { useVenueShortcuts } from '@/venue/editor/useVenueShortcuts'
import { useViewBookmarks } from '@/venue/editor/useViewBookmarks'
import { useVisibleTypesPreference } from '@/venue/editor/useVisibleTypesPreference'

const INSPECTOR_WIDTH = 320
const INSPECTOR_COLLAPSED_WIDTH = 44

export default function GuildVenuePage() {
  const t = useTranslations('venue')
  const locale = useLocale()
  const [visibleTypes, setVisibleTypes] = useVisibleTypesPreference()
  const {
    history,
    layout,
    commit,
    undo,
    redo,
    updateViewBookmarks,
    selectedFloorId,
    selectFloor,
    selectedItemIds,
    setSelectedItemIds,
    venues,
    activeVenueId,
    canEdit,
    canManage,
    switchVenue,
    renameActiveVenue,
    createNewVenue,
    loading,
    saveState,
    setSaveState,
    localImportLayout,
    importLocalLayout,
    nameTranslations,
  } = useVenueDocument()
  const [zoom, setZoom] = useState(1.2)
  const [showGrid, setShowGrid] = useState(true)
  const [rulerOptions, setRulerOptions] = useState<VenueRulerOptions>({
    items: true,
    totalBounds: true,
    chain: false,
    chainBandDepth: null,
  })
  const [snapEnabled, setSnapEnabled] = useState(true)
  // 2D is the canonical edit surface; 3D is a read-only preview for now (S3).
  // Selection state is shared so clicking a box in 3D updates the inspector.
  const [viewMode, setViewMode] = useState<VenueViewMode>('2d')
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [clipboard, setClipboard] = useState<VenueItem[]>([])
  // Collaborator-management modal (owner / admin only).
  const [collabOpen, setCollabOpen] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)

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
  // 带深滑杆停在自动模式时要显示这个值。口径跟画布一致——都用套过类型筛选的楼层。
  // 顶链与左链的自动值可能不同,滑杆是两条链共用的,取顶链的当代表位置。
  const chainAutoDepth = useMemo(
    () => autoChainBandDepth(visibleFloor.items, 'horizontal'),
    [visibleFloor.items],
  )
  const selectedItemId = selectedItemIds.at(-1) ?? null
  const selectedItem = activeFloor?.items.find((item) => item.id === selectedItemId) ?? null

  const selectedLayerIndex = activeFloor && selectedItemId
    ? activeFloor.items.findIndex((item) => item.id === selectedItemId)
    : -1

  // Expose the current canvas to the global command panel ("用文字操作") so it can
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

  const router = useRouter()
  const { placedItems, placedItemsTotalCost, floorItems, floorItemsTotalCost, costsVisible } =
    useVenueItemCosts(activeFloor, selectedItem)

  const bookmarks = useViewBookmarks({
    bookmarks: viewBookmarks,
    zoom,
    setZoom,
    scrollerRef,
    updateBookmarks: updateViewBookmarks,
  })

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

  // Selected 空间 items, and whether ALL pairs among them are already merged.
  const selectedAreas = useMemo(
    () => selectedAreaItems(activeFloor, selectedItemIds),
    [selectedItemIds, activeFloor],
  )
  const canMergeAreas = selectedAreas.length >= 2
  const areasAlreadyMerged = areasFullyMerged(selectedAreas)

  function mergeSelectedAreas() {
    if (!activeFloor || selectedAreas.length < 2) return
    commit(applyToAreaPairs(layout, activeFloor.id, selectedAreas, mergeVenueAreas))
  }

  function unmergeSelectedAreas() {
    if (!activeFloor || selectedAreas.length < 2) return
    commit(applyToAreaPairs(layout, activeFloor.id, selectedAreas, unmergeVenueAreas))
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

  // Clone items with fresh ids, append them to the active floor, and select the
  // new copies.
  function cloneItemsToFloor(source: VenueItem[]) {
    if (!activeFloor || source.length === 0) return
    const copies = cloneVenueItems(source, Date.now())
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

  function updateFloorDefaults(patch: Pick<Partial<VenueFloor>, 'width' | 'height' | 'floorHeight'>) {
    if (!activeFloor) return
    commit(applyFloorDefaults(layout, activeFloor, patch))
  }

  useVenueShortcuts({
    hasSelection: selectedItemIds.length > 0,
    hasClipboard: clipboard.length > 0,
    handlers: {
      delete: removeSelectedItems,
      copy: copySelectedItems,
      paste: pasteClipboard,
      duplicate: duplicateSelectedItems,
      undo,
      redo,
    },
  })

  function exportJson() {
    downloadFile(`${layout.venueId}.json`, JSON.stringify(layout, null, 2), 'application/json')
  }

  function exportPng() {
    const fail = () => setSaveState('error')
    if (viewMode === '3d') {
      exportCanvasAsPng(canvasAreaRef.current?.querySelector('canvas'), `${layout.venueId}-${activeFloor.name}-3d.png`, fail)
      return
    }
    exportSvgAsPng(svgRef.current, activeFloor, `${layout.venueId}-${activeFloor.name}.png`, fail)
  }

  if (loading) {
    return (
      <div className="h-[calc(100dvh-4rem)] min-h-[760px] flex items-center justify-center text-sm font-medium text-ink-500">
        {t('loading')}
      </div>
    )
  }

  if (!activeFloor) return null

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] min-h-[760px] flex flex-col">
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {/* 只读徽标与保存状态同属「状态展示」，统一走 Tag（design-system §6.1），
                外层 span 只负责承载 title 提示——Tag 契约里没有 title 透传。 */}
            {!canEdit && (
              <span title={t('readOnlyHint')} className="inline-flex">
                <Tag label={t('readOnly')} tone="neutral" />
              </span>
            )}
            <StatusPill state={saveState} />
          </div>
        }
      />

      {localImportLayout && (
        <div className="mb-2 flex items-center gap-3 rounded-card border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-text">
          <span className="flex-1">{t('importLocalPrompt')}</span>
          <Button variant="secondary" size="sm" onClick={importLocalLayout} className="shrink-0">
            {t('importLocal')}
          </Button>
        </div>
      )}

      <div className="bg-surface border border-line rounded-card overflow-hidden flex-1 min-h-0 grid grid-rows-[auto_1fr]">
        <VenueToolbar
          canEdit={canEdit}
          onAddItem={addItem}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          canMergeAreas={canMergeAreas}
          areasAlreadyMerged={areasAlreadyMerged}
          onMergeAreas={mergeSelectedAreas}
          onUnmergeAreas={unmergeSelectedAreas}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((value) => !value)}
          rulerOptions={rulerOptions}
          onRulerOptionsChange={setRulerOptions}
          chainAutoDepth={chainAutoDepth}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((value) => !value)}
          zoom={zoom}
          onZoomOut={() => setZoom(zoomOutStep)}
          onZoomIn={() => setZoom(zoomInStep)}
          bookmarks={viewBookmarks}
          onAddBookmark={bookmarks.add}
          onRecallBookmark={bookmarks.recall}
          onOverwriteBookmark={bookmarks.overwrite}
          onRemoveBookmark={bookmarks.remove}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <div
          className="min-h-0 grid"
          style={{ gridTemplateColumns: `64px minmax(720px,1fr) ${inspectorCollapsed ? INSPECTOR_COLLAPSED_WIDTH : INSPECTOR_WIDTH}px` }}
        >
          <ToolRail activeFloor={activeFloor.name} />

          {/* 画布区外壳：2D/3D 两种画布都是 h-full，这层底色恒被完全覆盖，
              画布自身的"桌面灰"由 VenueCanvas / Venue3DCanvas 内部持有（工程语义，不动）。 */}
          <div ref={canvasAreaRef} className="relative min-h-0 bg-canvas overflow-hidden">
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
              floorItemsTotalCost={costsVisible ? floorItemsTotalCost : null}
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
                zoom={zoom}
              />
            ) : (
              <VenueCanvas
                ref={svgRef}
                scrollRef={scrollerRef}
                floor={activeFloor}
                selectedItemIds={selectedItemIds}
                zoom={zoom}
                showGrid={showGrid}
                rulerOptions={rulerOptions}
                visibleTypes={visibleTypes}
                fitWidthReserve={inspectorCollapsed ? INSPECTOR_WIDTH - INSPECTOR_COLLAPSED_WIDTH : 0}
                onSelectItems={setSelectedItemIds}
                onItemChange={updateItem}
                onItemsMove={moveItems}
                itemName={(item) => resolveVenueItemName(item.name, item.id, locale, nameTranslations)}
                snapEnabled={snapEnabled}
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
            placedItemsTotalCost={costsVisible ? placedItemsTotalCost : null}
            onOpenItems={() => router.push('/items')}
            emptyStateActions={
              <CanvasSettingsPanel
                canEdit={canEdit}
                floor={activeFloor}
                onFloorDefaultsChange={updateFloorDefaults}
                onBackgroundImageChange={updateBackgroundImage}
                visibleTypes={visibleTypes}
                onVisibleTypesChange={setVisibleTypes}
                onExportJson={exportJson}
                onExportPng={exportPng}
              />
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

function StatusPill({ state }: { state: SaveState }) {
  const t = useTranslations('venue')
  if (state === 'idle') return null
  return state === 'saved'
    ? <Tag label={t('autoSaved')} tone="success" />
    : <Tag label={t('saveFailed')} tone="danger" />
}
