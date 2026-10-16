// 场地布置编辑器的纯逻辑：从 guild-venue/page.tsx 原样抽出,行为不变。
// import 用相对路径带 .ts 后缀而不是 @/ 别名:node --test 不解析别名,
// 这是本文件能被单测覆盖的前提(与 venue-intent.ts 同一个约定)。
import { parseStoredVenueLayout, updateVenueFloor } from '../../venue/layoutData.ts'
import type {
  VenueFloor,
  VenueHistory,
  VenueItem,
  VenueItemType,
  VenueLayout,
  VenueViewBookmark,
} from '@/venue/layoutData'

// ── 选中 ────────────────────────────────────────────────────────────────────

// 楼层的默认选中:第一件组件;空楼层则什么都不选。
export function firstItemSelection(floor: Pick<VenueFloor, 'items'> | undefined): string[] {
  return floor?.items[0]?.id ? [floor.items[0].id] : []
}

// 撤销/重做后校正楼层与选中:原楼层不在了就退回第一层,已不存在的组件从
// 选中里剔除,剔空了就退回该楼层的默认选中。
export function reconcileSelection(
  present: VenueLayout,
  selectedFloorId: string,
  selectedItemIds: string[],
): { floorId: string; itemIds: string[] } {
  const floor = present.floors.find((candidate) => candidate.id === selectedFloorId) ?? present.floors[0]
  const existing = new Set(floor.items.map((item) => item.id))
  const nextSelection = selectedItemIds.filter((itemId) => existing.has(itemId))
  return {
    floorId: floor.id,
    itemIds: nextSelection.length > 0 ? nextSelection : firstItemSelection(floor),
  }
}

// ── 场馆加载 ────────────────────────────────────────────────────────────────

// 优先回到本浏览器上次打开的场馆;它已不在列表里就退回共享主场馆,再不行取第一个。
// 调用方保证 list 非空。
export function pickActiveVenueId(
  list: { id: string }[],
  storedId: string | null,
  defaultId: string,
): string {
  return storedId && list.some((v) => v.id === storedId)
    ? storedId
    : list.some((v) => v.id === defaultId) ? defaultId : list[0].id
}

// Structural equality for layouts. Sufficient here: layouts are plain JSON
// (no functions/dates), so serialized comparison detects whether the cloud copy
// is still the untouched seed and whether the local copy differs.
export function layoutsEqual(a: VenueLayout, b: VenueLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// One-time import offer: only when the cloud is still the untouched seed but
// this browser holds a different layout. Returns the local layout to offer, or null.
export function localImportCandidate(
  cloud: VenueLayout,
  raw: string | null,
  seed: VenueLayout,
): VenueLayout | null {
  if (!raw) return null
  const local = parseStoredVenueLayout(raw)
  return layoutsEqual(cloud, seed) && !layoutsEqual(local, cloud) ? local : null
}

// ── 类型筛选 ────────────────────────────────────────────────────────────────

// 从 localStorage 原文恢复筛选:与当前有效类型取交集(过滤已废弃类型)。
// 没有/脏数据/交集为空都返回 null,调用方保持默认全部。
export function parseVisibleTypes(raw: string | null, allTypes: VenueItemType[]): VenueItemType[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const valid = allTypes.filter((t) => parsed.includes(t))
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

// 勾选/取消一个类型。始终至少保留一个可见类型:取消最后一个时返回 null(不变)。
export function toggleVisibleType(visibleTypes: VenueItemType[], value: VenueItemType): VenueItemType[] | null {
  if (visibleTypes.includes(value)) {
    if (visibleTypes.length <= 1) return null
    return visibleTypes.filter((type) => type !== value)
  }
  return [...visibleTypes, value]
}

// ── 缩放 ────────────────────────────────────────────────────────────────────

export const MIN_VENUE_ZOOM = 0.5
export const MAX_VENUE_ZOOM = 5.0

// 每步 10%,toFixed(2) 消掉浮点尾差。缩小只管下限、放大只管上限(与原实现一致)。
export function zoomOutStep(value: number): number {
  return Math.max(MIN_VENUE_ZOOM, Number((value - 0.1).toFixed(2)))
}

export function zoomInStep(value: number): number {
  return Math.min(MAX_VENUE_ZOOM, Number((value + 0.1).toFixed(2)))
}

// ── 编辑操作 ────────────────────────────────────────────────────────────────

const defaultIdSuffix = () => Math.random().toString(36).slice(2, 7)

// Clone items with fresh ids, offset a little so the copies are visible.
export function cloneVenueItems(
  source: VenueItem[],
  stamp: number,
  idSuffix: () => string = defaultIdSuffix,
): VenueItem[] {
  return source.map((item, index) => ({
    ...item,
    id: `${item.type}-${stamp}-${index}-${idSuffix()}`,
    x: item.x + 24,
    y: item.y + 24,
  }))
}

// 多选里的「空间」组件(按选中顺序;选不足两个时为空)。
export function selectedAreaItems(floor: Pick<VenueFloor, 'items'> | undefined, selectedItemIds: string[]): VenueItem[] {
  if (selectedItemIds.length < 2) return []
  return selectedItemIds
    .map((id) => floor?.items.find((it) => it.id === id))
    .filter((it): it is VenueItem => it?.type === 'area')
}

// Whether ALL pairs among the selected area items are already merged.
export function areasFullyMerged(areas: VenueItem[]): boolean {
  return areas.length >= 2 && areas.every((a) =>
    areas.every((b) => a === b || (a.mergedWith ?? []).includes(b.id))
  )
}

// 对选中空间两两执行合并/拆分(op 传 mergeVenueAreas 或 unmergeVenueAreas)。
export function applyToAreaPairs(
  layout: VenueLayout,
  floorId: string,
  areas: VenueItem[],
  op: (layout: VenueLayout, floorId: string, idA: string, idB: string) => VenueLayout,
): VenueLayout {
  let next = layout
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      next = op(next, floorId, areas[i].id, areas[j].id)
    }
  }
  return next
}

// 改楼层宽/高/层高。第一层同时决定整个场馆的宽高,其它楼层不动场馆宽高。
export function applyFloorDefaults(
  layout: VenueLayout,
  activeFloor: VenueFloor,
  patch: Pick<Partial<VenueFloor>, 'width' | 'height' | 'floorHeight'>,
): VenueLayout {
  const next = updateVenueFloor(layout, activeFloor.id, patch)
  const nextFloor = next.floors.find((floor) => floor.id === activeFloor.id) ?? activeFloor
  return {
    ...next,
    width: activeFloor.id === layout.floors[0]?.id ? nextFloor.width : next.width,
    height: activeFloor.id === layout.floors[0]?.id ? nextFloor.height : next.height,
  }
}

// ── 视角书签 ────────────────────────────────────────────────────────────────

// Bookmarks live on the layout so they persist to the DB, but they're view
// state, not document content — update history.present in place (no undo step).
// 清空后写回 undefined,不留空数组。
export function updateHistoryBookmarks(
  history: VenueHistory,
  updater: (prev: VenueViewBookmark[]) => VenueViewBookmark[],
): VenueHistory {
  const next = updater(history.present.viewBookmarks ?? [])
  return {
    ...history,
    present: { ...history.present, viewBookmarks: next.length ? next : undefined },
  }
}

export function appendBookmark(prev: VenueViewBookmark[], snapshot: VenueViewBookmark, max: number): VenueViewBookmark[] {
  return prev.length >= max ? prev : [...prev, snapshot]
}

export function replaceBookmark(prev: VenueViewBookmark[], index: number, snapshot: VenueViewBookmark): VenueViewBookmark[] {
  return prev.map((entry, i) => (i === index ? snapshot : entry))
}

export function removeBookmark(prev: VenueViewBookmark[], index: number): VenueViewBookmark[] {
  return prev.filter((_, i) => i !== index)
}

// 书签按钮上的当前序号:删到越界时回到第一个。
export function safeBookmarkIndex(active: number, count: number): number {
  return active < count ? active : 0
}

// 主按钮一键切到下一个视角(循环)。
export function nextBookmarkIndex(safeActive: number, count: number): number {
  return count === 0 ? 0 : (safeActive + 1) % count
}

// ── 快捷键 ──────────────────────────────────────────────────────────────────

export type VenueShortcut = 'delete' | 'copy' | 'paste' | 'duplicate' | 'undo' | 'redo'

// 按键 → 编辑动作。返回 null 表示不处理(也不 preventDefault)。
// Delete/Backspace 不需要修饰键;其余需要 ⌘ 或 Ctrl。
export function resolveVenueShortcut(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  context: { hasSelection: boolean; hasClipboard: boolean },
): VenueShortcut | null {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    return context.hasSelection ? 'delete' : null
  }

  const meta = event.metaKey || event.ctrlKey
  if (!meta) return null

  const key = event.key.toLowerCase()
  if (key === 'c') return context.hasSelection ? 'copy' : null
  if (key === 'v') return context.hasClipboard ? 'paste' : null
  if (key === 'd') return context.hasSelection ? 'duplicate' : null
  if (key === 'z' && event.shiftKey) return 'redo'
  if (key === 'z') return 'undo'
  if (key === 'y') return 'redo'
  return null
}
