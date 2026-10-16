'use client'

import { useTranslations } from 'next-intl'
import { Grid3X3, Link2, Magnet, MapPin, Package, Redo2, Undo2, Unlink2, ZoomIn, ZoomOut } from 'lucide-react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { VenueRulerOptions } from '@/venue/VenueCanvas'
import {
  MAX_VENUE_VIEW_BOOKMARKS,
  VENUE_SHAPE_TYPE_OPTIONS,
  type VenueItemType,
  type VenueViewBookmark,
} from '@/venue/layoutData'
import AddMenu from './AddMenu'
import RulerMenu from './RulerMenu'
import ToolbarButton from './ToolbarButton'
import ViewBookmarks from './ViewBookmarks'
import { FACILITY_MENU_TYPES, MARKER_MENU_TYPES, TOOL_ICON } from './toolCatalog'

export type VenueViewMode = '2d' | '3d'

// 画布上方的工具栏:添加组件、撤销/重做、合并空间、网格/标尺/吸附、缩放、
// 视角书签、2D/3D 切换。只读访客看不到编辑类按钮。
export default function VenueToolbar({
  canEdit,
  onAddItem,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canMergeAreas,
  areasAlreadyMerged,
  onMergeAreas,
  onUnmergeAreas,
  showGrid,
  onToggleGrid,
  rulerOptions,
  onRulerOptionsChange,
  chainAutoDepth,
  snapEnabled,
  onToggleSnap,
  zoom,
  onZoomOut,
  onZoomIn,
  bookmarks,
  onAddBookmark,
  onRecallBookmark,
  onOverwriteBookmark,
  onRemoveBookmark,
  viewMode,
  onViewModeChange,
}: {
  canEdit: boolean
  onAddItem: (type: VenueItemType) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  canMergeAreas: boolean
  areasAlreadyMerged: boolean
  onMergeAreas: () => void
  onUnmergeAreas: () => void
  showGrid: boolean
  onToggleGrid: () => void
  rulerOptions: VenueRulerOptions
  onRulerOptionsChange: (next: VenueRulerOptions) => void
  chainAutoDepth: number
  snapEnabled: boolean
  onToggleSnap: () => void
  zoom: number
  onZoomOut: () => void
  onZoomIn: () => void
  bookmarks: VenueViewBookmark[]
  onAddBookmark: () => void
  onRecallBookmark: (index: number) => void
  onOverwriteBookmark: (index: number) => void
  onRemoveBookmark: (index: number) => void
  viewMode: VenueViewMode
  onViewModeChange: (mode: VenueViewMode) => void
}) {
  const t = useTranslations('venue')

  return (
    <div className="min-h-14 border-b border-line px-3 py-2 flex items-center gap-2 overflow-x-auto">
      {canEdit && (
        <>
          {VENUE_SHAPE_TYPE_OPTIONS.map((option) => (
            <ToolbarButton
              key={option.value}
              icon={TOOL_ICON[option.value]}
              label={t(`addTypes.${option.value}`)}
              onClick={() => onAddItem(option.value)}
            />
          ))}
          {/* corridor(结构)是 shape，作为顶层添加按钮与设备/区域/空间并列 */}
          <ToolbarButton
            icon={TOOL_ICON.corridor}
            label={t('addTypes.corridor')}
            onClick={() => onAddItem('corridor')}
          />
          <AddMenu label={t('addMarker')} icon={MapPin} types={MARKER_MENU_TYPES} onAdd={onAddItem} />
          <AddMenu label={t('addFacility')} icon={Package} types={FACILITY_MENU_TYPES} onAdd={onAddItem} />

          <div className="w-px h-6 bg-line-strong mx-1" />

          <ToolbarButton iconOnly icon={Undo2} label={t('undo')} onClick={onUndo} disabled={!canUndo} />
          <ToolbarButton iconOnly icon={Redo2} label={t('redo')} onClick={onRedo} disabled={!canRedo} />
          {canMergeAreas && (
            areasAlreadyMerged
              ? <ToolbarButton iconOnly icon={Unlink2} label={t('unmergeAreas')} onClick={onUnmergeAreas} />
              : <ToolbarButton iconOnly icon={Link2} label={t('mergeAreas')} onClick={onMergeAreas} />
          )}
        </>
      )}
      <ToolbarButton iconOnly icon={Grid3X3} label={t('grid')} onClick={onToggleGrid} active={showGrid} />
      <RulerMenu options={rulerOptions} onChange={onRulerOptionsChange} autoDepth={chainAutoDepth} />
      {viewMode === '2d' && <ToolbarButton iconOnly icon={Magnet} label={t('snapEnabled')} onClick={onToggleSnap} active={snapEnabled} />}

      <div className="w-px h-6 bg-line-strong mx-1" />

      <ToolbarButton iconOnly icon={ZoomOut} label={t('zoomOut')} onClick={onZoomOut} />
      <span className="min-w-14 text-center text-xs font-semibold text-ink-500 tabular-nums">{Math.round(zoom * 100)}%</span>
      <ToolbarButton iconOnly icon={ZoomIn} label={t('zoomIn')} onClick={onZoomIn} />

      {viewMode === '2d' && canEdit && (
        <>
          <div className="w-px h-6 bg-line-strong mx-1" />
          <ViewBookmarks
            bookmarks={bookmarks}
            max={MAX_VENUE_VIEW_BOOKMARKS}
            onAdd={onAddBookmark}
            onRecall={onRecallBookmark}
            onOverwrite={onOverwriteBookmark}
            onRemove={onRemoveBookmark}
          />
        </>
      )}

      <div className="w-px h-6 bg-line-strong mx-1" />
      {/* 2D/3D 是典型的小范围互斥切换（design-system §6.1）→ SegmentedControl。 */}
      <div className="shrink-0">
        <SegmentedControl
          label={t('viewModeLabel')}
          value={viewMode}
          onChange={(next) => onViewModeChange(next as VenueViewMode)}
          items={[
            { value: '2d', label: t('mode2d') },
            { value: '3d', label: t('mode3d') },
          ]}
        />
      </div>

      <div className="flex-1" />
    </div>
  )
}
