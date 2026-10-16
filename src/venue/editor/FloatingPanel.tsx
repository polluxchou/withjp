'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Package, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'
import Tabs from '@/components/ui/Tabs'
import {
  formatVenueArea,
  formatVenueMeasurement,
  isVenueMarkerType,
  resolveVenueItemName,
  totalVenueAreaSquareMeters,
  usableVenueAreaSquareMeters,
  venueAreaSquareMeters,
  type VenueFloor,
  type VenueItem,
  type VenueItemType,
  type VenueNameTranslations,
} from '@/venue/layoutData'
import {
  countListTabs,
  listTabItems,
  topAreaRank,
  type FloorItemCost,
  type VenueListTab,
} from '@/lib/venue/floor-items'
import { TOOL_ICON } from './toolCatalog'
import type { VenueSummary } from './types'
import VenueSwitcherList from './VenueSwitcherList'

export default function FloatingPanel({
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
  floorItems: FloorItemCost[]
  /** null = 看不到成本（非管理员），合计行不显示。 */
  floorItemsTotalCost: number | null
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
  const [listTab, setListTab] = useState<VenueListTab>('shapes')
  const activeListItemRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    activeListItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedItemIds])
  const totalAreaSqMeters = totalVenueAreaSquareMeters(items)
  const usableAreaSqMeters = usableVenueAreaSquareMeters(items)
  const visibleTypeSet = useMemo(() => new Set(visibleTypes), [visibleTypes])
  const areaRank = useMemo(() => topAreaRank(items), [items])
  const { markerCount, shapeCount } = countListTabs(items)
  const listItems = listTabItems(items, visibleTypeSet, listTab)

  if (collapsed) {
    return (
      <div className="absolute left-4 bottom-4 z-20">
        <button
          type="button"
          title={t('expandVenuePanel')}
          aria-label={t('expandVenuePanel')}
          onClick={() => setCollapsed(false)}
          className="h-11 max-w-56 rounded-card border border-line bg-white/95 px-3 shadow-pop backdrop-blur inline-flex items-center gap-2 text-left text-ink-700 hover:border-primary-border hover:text-primary-hover hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
        >
          <PanelLeftOpen className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-ink-500">{t('currentVenue')}</span>
            <span className="block truncate text-sm font-semibold">{layoutName} · {floorName}</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-4 z-20 w-72 rounded-card border border-line bg-white/95 shadow-pop backdrop-blur">
      <div className="p-4 border-b border-line-soft flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-500">{t('currentVenue')}</p>
          <div ref={venueMenuRef} className="relative mt-1">
            <button
              type="button"
              onClick={() => setVenueMenuOpen((open) => !open)}
              title={t('switchVenue')}
              className="flex w-full items-center gap-1 rounded-field -mx-1 px-1 text-left hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{layoutName} · {floorName}</h2>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-ink-400 transition-transform ${venueMenuOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} />
            </button>
            {venueMenuOpen && (
              <VenueSwitcherList
                venues={venues}
                activeVenueId={activeVenueId}
                floors={floors}
                selectedFloorId={selectedFloorId}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onSwitchVenue={onSwitchVenue}
                onSelectFloor={onSelectFloor}
                onCreateVenue={onCreateVenue}
                onRenameActiveVenue={onRenameActiveVenue}
                onClose={() => setVenueMenuOpen(false)}
              />
            )}
          </div>
          <p className="text-micro text-ink-400 mt-1 tabular-nums">
            {t('totalSpaceArea')} {formatVenueArea(totalAreaSqMeters)}
            {totalAreaSqMeters > 0 && (
              <span className="ml-1 text-ink-500">· {t('usableSpaceArea')} {formatVenueArea(usableAreaSqMeters)}</span>
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
              className="w-8 h-8 rounded-field inline-flex items-center justify-center text-ink-500 hover:bg-line-soft hover:text-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              <Users className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            title={t('collapseVenuePanel')}
            aria-label={t('collapseVenuePanel')}
            onClick={() => setCollapsed(true)}
            className="w-8 h-8 rounded-field inline-flex items-center justify-center text-ink-500 hover:bg-line-soft hover:text-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
          >
            <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {/* 列表范围切换（空间 / 标识 / 物品）走共享 Tabs（design-system §6.1）；
          计数并入 label 文本，Tabs 契约里 label 是纯字符串。
          保留 px-3：FloatingPanel 自身就是容器（头部 p-4、列表 p-2），tab 文字
          顶到卡片边框比发丝线短一截更难看，内衬与上下两块对齐优先。 */}
      <div className="px-3 pt-2">
        <Tabs
          label={t('listTabsLabel')}
          value={listTab}
          onChange={(next) => setListTab(next as VenueListTab)}
          items={[
            { value: 'shapes', label: `${t('tabShapes')} ${shapeCount}` },
            { value: 'markers', label: `${t('tabMarkers')} ${markerCount}` },
            { value: 'items', label: `${t('tabItems')} ${floorItems.length}` },
          ]}
        />
      </div>
      <div className="max-h-[calc(100dvh-24rem)] min-h-72 overflow-auto p-2">
        {listTab === 'items' ? (
          // Floor-level item rollup. Pulls from the items module rather than
          // the canvas — clicking a row opens that item's edit page so the
          // operator can update status / move it. Total cost lands at the
          // bottom as a sticky-feeling summary row.
          <>
            {floorItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-ink-400">{t('floorItemsEmpty')}</p>
            )}
            {floorItems.length > 0 && floorItems.map((it) => (
              <a
                key={it.id}
                href={`/items/${it.id}`}
                className="w-full flex items-start gap-2 rounded-field px-2.5 py-2 text-left transition-colors text-ink-700 hover:bg-line-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
              >
                <Package className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{it.name}</span>
                  <span className="block text-micro text-ink-400 truncate">
                    {it.item_code}
                    {it.quantity > 1 && ` · ×${it.quantity}`}
                    {it.zoneName && ` · ${it.zoneName}`}
                  </span>
                </span>
                {it.cost > 0 && (
                  <span className="text-micro font-medium text-ink-500 font-mono tabular-nums whitespace-nowrap mt-0.5">
                    ¥{Math.round(it.cost).toLocaleString('zh-CN')}
                  </span>
                )}
              </a>
            ))}
            {floorItems.length > 0 && floorItemsTotalCost !== null && (
              <div className="mt-2 flex items-center justify-between border-t border-line-soft px-3 py-2 text-xs">
                <span className="text-ink-500">{t('floorItemsTotal')}</span>
                <span className="font-semibold text-ink-700 font-mono tabular-nums">
                  ¥{Math.round(floorItemsTotalCost).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {listItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-ink-400">{t('filterEmpty')}</p>
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
                  ref={active ? activeListItemRef : null}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-2 rounded-field px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                    active ? 'bg-primary-soft text-primary-hover' : 'text-ink-700 hover:bg-line-soft'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{resolveVenueItemName(item.name, item.id, locale, nameTranslations)}</span>
                    <span className={`block text-micro truncate tabular-nums ${isTopArea ? 'font-semibold text-ink-700' : 'text-ink-400'}`}>
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
