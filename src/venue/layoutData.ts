export type VenueItemType =
  | 'equipment'
  | 'renovation'
  | 'area'
  | 'corridor'
  | 'workstation'
  | 'fire'
  | 'exit'
  | 'safety'

export type VenueItemStatus = 'planned' | 'in_progress' | 'completed' | 'maintenance'

export type VenueItem = {
  id: string
  type: VenueItemType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  status: VenueItemStatus
  note: string
}

export type VenueFloor = {
  id: string
  name: string
  width: number
  height: number
  backgroundImage?: string
  items: VenueItem[]
}

export type VenueLayout = {
  venueId: string
  name: string
  width: number
  height: number
  floors: VenueFloor[]
}

export type VenueHistory = {
  past: VenueLayout[]
  present: VenueLayout
  future: VenueLayout[]
}

export const VENUE_STORAGE_KEY = 'guild-venue:layout:v1'

export function centimetersToMeters(value: number): number {
  return Math.round((value / 100) * 100) / 100
}

export function metersToCentimeters(value: number): number {
  return Math.round(Number(`${value}e2`))
}

export const VENUE_ITEM_TYPE_OPTIONS: { value: VenueItemType; label: string }[] = [
  { value: 'equipment', label: '设备' },
  { value: 'renovation', label: '装修' },
  { value: 'area', label: '区域' },
  { value: 'corridor', label: '通道' },
  { value: 'workstation', label: '工位' },
  { value: 'fire', label: '消防' },
  { value: 'exit', label: '安全出口' },
  { value: 'safety', label: '安全' },
]

export const VENUE_ITEM_STATUS_OPTIONS: { value: VenueItemStatus; label: string }[] = [
  { value: 'planned', label: '规划中' },
  { value: 'in_progress', label: '施工中' },
  { value: 'completed', label: '已完成' },
  { value: 'maintenance', label: '待维修' },
]

export const DEFAULT_VENUE_LAYOUT: VenueLayout = {
  venueId: 'guild-main',
  name: '主场地',
  width: 1200,
  height: 800,
  floors: [
    {
      id: 'floor-1',
      name: '1F',
      width: 1200,
      height: 800,
      items: [
        {
          id: 'eq-1',
          type: 'equipment',
          name: '直播设备架',
          x: 120,
          y: 80,
          width: 160,
          height: 80,
          rotation: 0,
          status: 'completed',
          note: '靠墙放置，保留走线空间。',
        },
        {
          id: 'area-1',
          type: 'renovation',
          name: '直播间 A 装修区',
          x: 360,
          y: 120,
          width: 260,
          height: 180,
          rotation: 3,
          status: 'in_progress',
          note: '吸音墙和灯光轨道施工中。',
        },
        {
          id: 'corridor-1',
          type: 'corridor',
          name: '主通道',
          x: 120,
          y: 560,
          width: 620,
          height: 72,
          rotation: 0,
          status: 'planned',
          note: '保持通道净宽，不堆放设备。',
        },
        {
          id: 'exit-1',
          type: 'exit',
          name: '安全出口',
          x: 980,
          y: 260,
          width: 110,
          height: 56,
          rotation: 0,
          status: 'completed',
          note: '出口标识需要保持可见。',
        },
      ],
    },
    {
      id: 'floor-2',
      name: '2F',
      width: 1200,
      height: 800,
      items: [
        {
          id: 'workstation-1',
          type: 'workstation',
          name: '运营工位',
          x: 180,
          y: 140,
          width: 220,
          height: 120,
          rotation: 0,
          status: 'planned',
          note: '预留 4 个运营工位。',
        },
      ],
    },
  ],
}

const DEFAULT_SIZE: Record<VenueItemType, { width: number; height: number }> = {
  equipment:   { width: 160, height: 80 },
  renovation:  { width: 240, height: 160 },
  area:        { width: 220, height: 140 },
  corridor:    { width: 320, height: 64 },
  workstation: { width: 180, height: 100 },
  fire:        { width: 80, height: 80 },
  exit:        { width: 110, height: 56 },
  safety:      { width: 120, height: 72 },
}

const DEFAULT_NAME: Record<VenueItemType, string> = {
  equipment:   '新增设备',
  renovation:  '新增装修区',
  area:        '新增区域',
  corridor:    '新增通道',
  workstation: '新增工位',
  fire:        '新增消防点',
  exit:        '新增安全出口',
  safety:      '新增安全项',
}

export function createHistory(
  present: VenueLayout,
  past: VenueLayout[] = [],
  future: VenueLayout[] = [],
): VenueHistory {
  return { past, present, future }
}

export function pushHistory(history: VenueHistory, nextPresent: VenueLayout): VenueHistory {
  if (history.present === nextPresent) return history
  return {
    past: [...history.past, history.present],
    present: nextPresent,
    future: [],
  }
}

export function undoHistory(history: VenueHistory): VenueHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoHistory(history: VenueHistory): VenueHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}

export function addVenueItem(
  layout: VenueLayout,
  floorId: string,
  type: VenueItemType,
): VenueLayout {
  const size = DEFAULT_SIZE[type]
  const item: VenueItem = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    name: DEFAULT_NAME[type],
    x: 140,
    y: 120,
    width: size.width,
    height: size.height,
    rotation: 0,
    status: 'planned',
    note: '',
  }

  return updateFloor(layout, floorId, (floor) => ({
    ...floor,
    items: [...floor.items, item],
  }))
}

export function updateVenueItem(
  layout: VenueLayout,
  floorId: string,
  itemId: string,
  patch: Partial<VenueItem>,
): VenueLayout {
  return updateFloor(layout, floorId, (floor) => ({
    ...floor,
    items: floor.items.map((item) =>
      item.id === itemId ? normalizeVenueItem({ ...item, ...patch }) : item
    ),
  }))
}

export function deleteVenueItem(
  layout: VenueLayout,
  floorId: string,
  itemId: string,
  selectedItemId: string | null,
): { layout: VenueLayout; selectedItemId: string | null } {
  return {
    layout: updateFloor(layout, floorId, (floor) => ({
      ...floor,
      items: floor.items.filter((item) => item.id !== itemId),
    })),
    selectedItemId: selectedItemId === itemId ? null : selectedItemId,
  }
}

export function updateVenueFloor(
  layout: VenueLayout,
  floorId: string,
  patch: Partial<VenueFloor>,
): VenueLayout {
  return updateFloor(layout, floorId, (floor) => ({
    ...floor,
    ...patch,
    items: patch.items ?? floor.items,
  }))
}

export function parseStoredVenueLayout(raw: string | null): VenueLayout {
  if (!raw) return DEFAULT_VENUE_LAYOUT
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isVenueLayout(parsed)) return parsed
  } catch {
    return DEFAULT_VENUE_LAYOUT
  }
  return DEFAULT_VENUE_LAYOUT
}

export function readStoredVenueLayout(storage: Pick<Storage, 'getItem'>): VenueLayout {
  return parseStoredVenueLayout(storage.getItem(VENUE_STORAGE_KEY))
}

export function writeStoredVenueLayout(
  storage: Pick<Storage, 'setItem'>,
  layout: VenueLayout,
): void {
  storage.setItem(VENUE_STORAGE_KEY, JSON.stringify(layout))
}

function updateFloor(
  layout: VenueLayout,
  floorId: string,
  updater: (floor: VenueFloor) => VenueFloor,
): VenueLayout {
  return {
    ...layout,
    floors: layout.floors.map((floor) => floor.id === floorId ? updater(floor) : floor),
  }
}

function normalizeVenueItem(item: VenueItem): VenueItem {
  return {
    ...item,
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    width: Math.max(8, finiteNumber(item.width)),
    height: Math.max(8, finiteNumber(item.height)),
    rotation: finiteNumber(item.rotation),
  }
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function isVenueLayout(value: unknown): value is VenueLayout {
  if (!value || typeof value !== 'object') return false
  const layout = value as VenueLayout
  return (
    typeof layout.venueId === 'string' &&
    typeof layout.name === 'string' &&
    typeof layout.width === 'number' &&
    typeof layout.height === 'number' &&
    Array.isArray(layout.floors) &&
    layout.floors.every(isVenueFloor)
  )
}

function isVenueFloor(value: unknown): value is VenueFloor {
  if (!value || typeof value !== 'object') return false
  const floor = value as VenueFloor
  return (
    typeof floor.id === 'string' &&
    typeof floor.name === 'string' &&
    typeof floor.width === 'number' &&
    typeof floor.height === 'number' &&
    Array.isArray(floor.items) &&
    floor.items.every(isVenueItem)
  )
}

function isVenueItem(value: unknown): value is VenueItem {
  if (!value || typeof value !== 'object') return false
  const item = value as VenueItem
  return (
    typeof item.id === 'string' &&
    isVenueItemType(item.type) &&
    typeof item.name === 'string' &&
    typeof item.x === 'number' &&
    typeof item.y === 'number' &&
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    typeof item.rotation === 'number' &&
    isVenueItemStatus(item.status) &&
    typeof item.note === 'string'
  )
}

function isVenueItemType(value: unknown): value is VenueItemType {
  return typeof value === 'string' && VENUE_ITEM_TYPE_OPTIONS.some((option) => option.value === value)
}

function isVenueItemStatus(value: unknown): value is VenueItemStatus {
  return typeof value === 'string' && VENUE_ITEM_STATUS_OPTIONS.some((option) => option.value === value)
}
