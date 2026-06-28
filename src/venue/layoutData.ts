// Shapes occupy area and are drawn as resizable rectangles.
export type VenueShapeType = 'equipment' | 'renovation' | 'area' | 'corridor'
// Markers are point symbols that do not occupy area (doors, fire points, etc.).
export type VenueMarkerType = 'door_inward' | 'door_outward' | 'door_sliding' | 'fire' | 'power' | 'network'
export type VenueItemType = VenueShapeType | VenueMarkerType

export type VenueItemStatus = 'planned' | 'in_progress' | 'completed' | 'maintenance'

// Whether the item physically rests on the floor (ground) or is suspended
// above it (aerial). Ground items occupy usable floor area; aerial items do not.
export type VenueItemPlacement = 'ground' | 'aerial'

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
  // Z-axis (vertical) extrusion height in cm, used only by the 3D view.
  // 0 = flat tile on the floor; renderer drops to a 1cm sliver in that case.
  height3d: number
  // Distance from the floor to the bottom of the item, in cm. Lets sockets
  // and network ports "float" at desk height in 3D.
  elevation: number
  placement: VenueItemPlacement
}

export type VenueFloor = {
  id: string
  name: string
  width: number
  height: number
  // Net storey height in cm — informational in MVP (used by 3D ceiling hint
  // and inspector display); not enforced as a hard cap on item.height3d.
  floorHeight: number
  backgroundImage?: string
  items: VenueItem[]
}

// A saved viewport: zoom ratio + scroll offset. Persisted with the layout so
// the team's quick views survive reloads and sync across devices.
export type VenueViewBookmark = { zoom: number; left: number; top: number }

export const MAX_VENUE_VIEW_BOOKMARKS = 3

export type VenueLayout = {
  venueId: string
  name: string
  width: number
  height: number
  floors: VenueFloor[]
  viewBookmarks?: VenueViewBookmark[]
}

export type VenueNameTranslations = Record<string, { ja: string; en: string }>

// 按当前语种选择组件显示名:ja/en 用译名,缺失或 zh 回退中文原名。
export function resolveVenueItemName(
  name: string,
  id: string,
  locale: string,
  translations: VenueNameTranslations,
): string {
  if (locale === 'ja') return translations[id]?.ja || name
  if (locale === 'en') return translations[id]?.en || name
  return name
}

export type VenueHistory = {
  past: VenueLayout[]
  present: VenueLayout
  future: VenueLayout[]
}

export type VenueLayerMove = 'back' | 'backward' | 'forward' | 'front'

export type VenueAlignmentGuide = {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

export type VenueAlignmentSnap = {
  x: number
  y: number
  guides: VenueAlignmentGuide[]
}

export type VenueCanvasFitInput = {
  floorWidth: number
  floorHeight: number
  viewportWidth: number
  viewportHeight: number
  zoom: number
  padding: number
}

export type VenueCanvasFit = {
  scale: number
  width: number
  height: number
}

export const VENUE_STORAGE_KEY = 'guild-venue:layout:v2'
// Pre-v2 data lives under this key; we migrate from it but never overwrite it,
// so it stays as a recovery backup.
export const VENUE_LEGACY_STORAGE_KEY = 'guild-venue:layout:v1'
// Snapshot of the previous good write, taken before each save.
export const VENUE_BACKUP_STORAGE_KEY = 'guild-venue:layout:backup'
export const MAX_VENUE_HISTORY_STEPS = 20

// Default net storey height (cm). Standard interior ceiling in CN/JP commercial
// fit-outs sits around 2.7-2.9m, so 2.80m is a sensible centre value.
export const DEFAULT_FLOOR_HEIGHT = 280

export function centimetersToMeters(value: number): number {
  return Math.round((value / 100) * 100) / 100
}

export function metersToCentimeters(value: number): number {
  return Math.round(Number(`${value}e2`))
}

export function formatVenueMeasurement(value: number): string {
  return `${centimetersToMeters(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}m`
}

export function venueAreaSquareMeters(item: Pick<VenueItem, 'width' | 'height'>): number {
  return centimetersToMeters(item.width) * centimetersToMeters(item.height)
}

// Gross footprint of all 'area' items — used as the denominator for share %.
export function totalVenueAreaSquareMeters(items: VenueItem[]): number {
  return items.reduce(
    (sum, item) => (item.type === 'area' ? sum + venueAreaSquareMeters(item) : sum),
    0,
  )
}

// Usable floor area = gross area minus ground-placed non-area shapes (equipment,
// renovation, corridor). Aerial items (hung lighting, trusses, etc.) don't
// consume floor space and are excluded from the deduction.
export function usableVenueAreaSquareMeters(items: VenueItem[]): number {
  const gross = totalVenueAreaSquareMeters(items)
  const occupied = items.reduce((sum, item) => {
    if (item.type === 'area') return sum
    if (isVenueMarkerType(item.type)) return sum
    if (item.placement !== 'ground') return sum
    return sum + venueAreaSquareMeters(item)
  }, 0)
  return Math.max(0, gross - occupied)
}

export function formatVenueArea(squareMeters: number): string {
  return `${squareMeters.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}m²`
}

export function calculateVenueCanvasFit({
  floorWidth,
  floorHeight,
  viewportWidth,
  viewportHeight,
  zoom,
  padding,
}: VenueCanvasFitInput): VenueCanvasFit {
  const safeFloorWidth = Math.max(finiteNumber(floorWidth), 1)
  const safeFloorHeight = Math.max(finiteNumber(floorHeight), 1)
  const safeZoom = Math.max(finiteNumber(zoom), 0.01)
  const availWidth = Math.max(finiteNumber(viewportWidth) - finiteNumber(padding), 1)
  const availHeight = Math.max(finiteNumber(viewportHeight) - finiteNumber(padding), 1)
  const baseFit = viewportWidth > 0 && viewportHeight > 0
    ? Math.min(availWidth / safeFloorWidth, availHeight / safeFloorHeight)
    : 1
  const scale = baseFit * safeZoom

  return {
    scale,
    width: Math.max(1, Math.round(safeFloorWidth * scale)),
    height: Math.max(1, Math.round(safeFloorHeight * scale)),
  }
}

export const VENUE_SHAPE_TYPE_OPTIONS: { value: VenueShapeType; label: string }[] = [
  { value: 'equipment', label: '设备' },
  { value: 'renovation', label: '区域' },
  { value: 'area', label: '空间' },
]

export const VENUE_MARKER_TYPE_OPTIONS: { value: VenueMarkerType; label: string }[] = [
  { value: 'door_inward', label: '内开门' },
  { value: 'door_outward', label: '外开门' },
  { value: 'door_sliding', label: '推拉门' },
  { value: 'fire', label: '消防' },
  { value: 'power', label: '电源位' },
  { value: 'network', label: '网络口' },
]

// corridor renders as a shape (rectangle) but belongs to the "标识" tab in the panel.
export const VENUE_ITEM_TYPE_OPTIONS: { value: VenueItemType; label: string }[] = [
  ...VENUE_SHAPE_TYPE_OPTIONS,
  { value: 'corridor', label: '结构' },
  ...VENUE_MARKER_TYPE_OPTIONS,
]

const VENUE_MARKER_TYPE_SET = new Set<string>(VENUE_MARKER_TYPE_OPTIONS.map((option) => option.value))

export function isVenueMarkerType(type: VenueItemType): boolean {
  return VENUE_MARKER_TYPE_SET.has(type)
}

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
      floorHeight: DEFAULT_FLOOR_HEIGHT,
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
          height3d: 100,
          elevation: 0,
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
          height3d: 280,
          elevation: 0,
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
          height3d: 0,
          elevation: 0,
        },
        {
          id: 'door-1',
          type: 'door_inward',
          name: '主入口',
          x: 640,
          y: 600,
          width: 45,
          height: 45,
          rotation: 0,
          status: 'completed',
          note: '内开门，注意开门半径。',
          height3d: 200,
          elevation: 0,
        },
        {
          id: 'fire-1',
          type: 'fire',
          name: '灭火器',
          x: 980,
          y: 280,
          width: 32,
          height: 32,
          rotation: 0,
          status: 'completed',
          note: '消防点位需保持可见。',
          height3d: 60,
          elevation: 0,
        },
        {
          id: 'power-1',
          type: 'power',
          name: '设备区电源',
          x: 200,
          y: 200,
          width: 32,
          height: 32,
          rotation: 0,
          status: 'planned',
          note: '',
          height3d: 15,
          elevation: 30,
        },
      ],
    },
    {
      id: 'floor-2',
      name: '2F',
      width: 1200,
      height: 800,
      floorHeight: DEFAULT_FLOOR_HEIGHT,
      items: [],
    },
  ],
}

// Point markers (fire/power/network) render at a fixed on-screen size, so their
// stored width/height only matters for drag/snap math — keep it small and square.
const MARKER_SIZE = { width: 32, height: 32 }
// Doors draw to their real footprint; 0.45m × 0.45m is the standard size.
const DOOR_SIZE = { width: 45, height: 45 }

const DEFAULT_SIZE: Record<VenueItemType, { width: number; height: number }> = {
  equipment:    { width: 160, height: 80 },
  renovation:   { width: 240, height: 160 },
  area:         { width: 220, height: 140 },
  corridor:     { width: 320, height: 64 },
  door_inward:  DOOR_SIZE,
  door_outward: DOOR_SIZE,
  door_sliding: DOOR_SIZE,
  fire:         MARKER_SIZE,
  power:        MARKER_SIZE,
  network:      MARKER_SIZE,
}

// Per-type Z-axis defaults used by the 3D view. `height3d`/`elevation` are
// stored on each VenueItem; this table is the source of truth for "new item"
// and "legacy item missing these fields" fall-backs.
const DEFAULT_3D: Record<VenueItemType, { height3d: number; elevation: number }> = {
  equipment:    { height3d: 100, elevation: 0  },
  renovation:   { height3d: 280, elevation: 0  },
  // Areas render as 4 perimeter walls in 3D — default to a full-height wall so
  // new rooms read as enclosed spaces. Existing 0-height area items keep flat.
  area:         { height3d: 280, elevation: 0  },
  corridor:     { height3d: 0,   elevation: 0  },
  door_inward:  { height3d: 200, elevation: 0  },
  door_outward: { height3d: 200, elevation: 0  },
  door_sliding: { height3d: 200, elevation: 0  },
  fire:         { height3d: 60,  elevation: 0  },
  power:        { height3d: 15,  elevation: 30 },
  network:      { height3d: 10,  elevation: 30 },
}

export function default3DForType(type: VenueItemType): { height3d: number; elevation: number } {
  return DEFAULT_3D[type]
}

const DEFAULT_NAME: Record<VenueItemType, string> = {
  equipment:    '新增设备',
  renovation:   '新增区域',
  area:         '新增空间',
  corridor:     '新增结构',
  door_inward:  '内开门',
  door_outward: '外开门',
  door_sliding: '推拉门',
  fire:         '消防点',
  power:        '电源位',
  network:      '网络口',
}

export function createHistory(
  present: VenueLayout,
  past: VenueLayout[] = [],
  future: VenueLayout[] = [],
): VenueHistory {
  return {
    past: past.slice(-MAX_VENUE_HISTORY_STEPS),
    present,
    future: future.slice(0, MAX_VENUE_HISTORY_STEPS),
  }
}

export function pushHistory(history: VenueHistory, nextPresent: VenueLayout): VenueHistory {
  if (history.present === nextPresent) return history
  return {
    past: [...history.past, history.present].slice(-MAX_VENUE_HISTORY_STEPS),
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
    future: [history.present, ...history.future].slice(0, MAX_VENUE_HISTORY_STEPS),
  }
}

export function redoHistory(history: VenueHistory): VenueHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present].slice(-MAX_VENUE_HISTORY_STEPS),
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
  const z = DEFAULT_3D[type]
  const floor = layout.floors.find((candidate) => candidate.id === floorId)
  // Spawn centered in the floor so new items don't land under the floating panel
  // in the top-left corner.
  const x = floor ? Math.round(floor.width / 2 - size.width / 2) : 140
  const y = floor ? Math.round(floor.height / 2 - size.height / 2) : 120
  const item: VenueItem = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    name: DEFAULT_NAME[type],
    x,
    y,
    width: size.width,
    height: size.height,
    rotation: 0,
    status: 'planned',
    note: '',
    height3d: z.height3d,
    elevation: z.elevation,
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

export function moveVenueItems(
  layout: VenueLayout,
  floorId: string,
  itemIds: string[],
  delta: { x: number; y: number },
): VenueLayout {
  const selected = new Set(itemIds)
  if (selected.size === 0 || (delta.x === 0 && delta.y === 0)) return layout

  return updateFloor(layout, floorId, (floor) => ({
    ...floor,
    items: floor.items.map((item) =>
      selected.has(item.id)
        ? normalizeVenueItem({ ...item, x: item.x + delta.x, y: item.y + delta.y })
        : item
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

// ── Natural-language actions (scoped to the active floor) ─────
// Parsed server-side from text, applied client-side through the reducers below
// so every change is undoable + autosaved, and stays on the current canvas.
// Lengths are in METERS (user-facing); applied via metersToCentimeters.
export type VenueAction =
  | { op: 'add'; itemType: VenueItemType; name?: string; widthM?: number; heightM?: number; summary: string }
  | { op: 'update'; targetId: string; name?: string; itemType?: VenueItemType; status?: VenueItemStatus; widthM?: number; heightM?: number; rotationDeg?: number; note?: string; summary: string }
  | { op: 'move'; targetId: string; xM?: number; yM?: number; dxM?: number; dyM?: number; summary: string }
  | { op: 'delete'; targetId: string; summary: string }
  | { op: 'floor'; widthM?: number; heightM?: number; storeyHeightM?: number; backgroundImage?: string; name?: string; summary: string }

export function applyVenueAction(
  layout: VenueLayout,
  floorId: string,
  action: VenueAction,
  selectedItemId: string | null,
): { layout: VenueLayout; selectedItemId: string | null; error?: string } {
  const floor = layout.floors.find((candidate) => candidate.id === floorId)
  if (!floor) return { layout, selectedItemId, error: 'floor_not_found' }
  const hasTarget = (id: string) => floor.items.some((item) => item.id === id)

  switch (action.op) {
    case 'add': {
      let next = addVenueItem(layout, floorId, action.itemType)
      const created = next.floors.find((f) => f.id === floorId)?.items.at(-1)
      if (created) {
        const patch: Partial<VenueItem> = {}
        if (action.name) patch.name = action.name
        if (action.widthM) patch.width = metersToCentimeters(action.widthM)
        if (action.heightM) patch.height = metersToCentimeters(action.heightM)
        if (Object.keys(patch).length > 0) next = updateVenueItem(next, floorId, created.id, patch)
      }
      return { layout: next, selectedItemId: created?.id ?? selectedItemId }
    }
    case 'update': {
      if (!hasTarget(action.targetId)) return { layout, selectedItemId, error: 'target_not_found' }
      const patch: Partial<VenueItem> = {}
      if (action.name !== undefined) patch.name = action.name
      if (action.itemType) patch.type = action.itemType
      if (action.status) patch.status = action.status
      if (action.widthM) patch.width = metersToCentimeters(action.widthM)
      if (action.heightM) patch.height = metersToCentimeters(action.heightM)
      if (action.rotationDeg !== undefined) patch.rotation = action.rotationDeg
      if (action.note !== undefined) patch.note = action.note
      return { layout: updateVenueItem(layout, floorId, action.targetId, patch), selectedItemId: action.targetId }
    }
    case 'move': {
      if (!hasTarget(action.targetId)) return { layout, selectedItemId, error: 'target_not_found' }
      if (action.xM !== undefined || action.yM !== undefined) {
        const patch: Partial<VenueItem> = {}
        if (action.xM !== undefined) patch.x = metersToCentimeters(action.xM)
        if (action.yM !== undefined) patch.y = metersToCentimeters(action.yM)
        return { layout: updateVenueItem(layout, floorId, action.targetId, patch), selectedItemId: action.targetId }
      }
      const delta = {
        x: action.dxM ? metersToCentimeters(action.dxM) : 0,
        y: action.dyM ? metersToCentimeters(action.dyM) : 0,
      }
      return { layout: moveVenueItems(layout, floorId, [action.targetId], delta), selectedItemId: action.targetId }
    }
    case 'delete': {
      if (!hasTarget(action.targetId)) return { layout, selectedItemId, error: 'target_not_found' }
      const result = deleteVenueItem(layout, floorId, action.targetId, selectedItemId)
      return { layout: result.layout, selectedItemId: result.selectedItemId }
    }
    case 'floor': {
      const patch: Partial<VenueFloor> = {}
      if (action.widthM) patch.width = metersToCentimeters(action.widthM)
      if (action.heightM) patch.height = metersToCentimeters(action.heightM)
      if (action.storeyHeightM) patch.floorHeight = metersToCentimeters(action.storeyHeightM)
      if (action.backgroundImage !== undefined) patch.backgroundImage = action.backgroundImage || undefined
      if (action.name) patch.name = action.name
      return { layout: updateVenueFloor(layout, floorId, patch), selectedItemId }
    }
  }
}

export function moveVenueItemLayer(
  layout: VenueLayout,
  floorId: string,
  itemId: string,
  move: VenueLayerMove,
): VenueLayout {
  let changed = false
  const next = updateFloor(layout, floorId, (floor) => {
    const index = floor.items.findIndex((item) => item.id === itemId)
    if (index < 0) return floor

    const targetIndex = getLayerTargetIndex(index, floor.items.length, move)
    if (targetIndex === index) return floor

    const items = [...floor.items]
    const [item] = items.splice(index, 1)
    items.splice(targetIndex, 0, item)
    changed = true
    return { ...floor, items }
  })

  return changed ? next : layout
}

export function snapVenueItemToAlignment(
  movingItem: Pick<VenueItem, 'id' | 'width' | 'height'>,
  items: VenueItem[],
  position: { x: number; y: number },
  threshold = 8,
): VenueAlignmentSnap {
  const otherItems = items.filter((item) => item.id !== movingItem.id)
  const xSnap = findAxisSnap(
    [
      { kind: 'start' as const, position: position.x },
      { kind: 'center' as const, position: position.x + movingItem.width / 2 },
      { kind: 'end' as const, position: position.x + movingItem.width },
    ],
    otherItems.flatMap((item) => [
      { item, position: item.x },
      { item, position: item.x + item.width / 2 },
      { item, position: item.x + item.width },
    ]),
    threshold,
  )
  const ySnap = findAxisSnap(
    [
      { kind: 'start' as const, position: position.y },
      { kind: 'center' as const, position: position.y + movingItem.height / 2 },
      { kind: 'end' as const, position: position.y + movingItem.height },
    ],
    otherItems.flatMap((item) => [
      { item, position: item.y },
      { item, position: item.y + item.height / 2 },
      { item, position: item.y + item.height },
    ]),
    threshold,
  )

  const x = xSnap ? xForSnap(xSnap.position, xSnap.kind, movingItem.width) : position.x
  const y = ySnap ? xForSnap(ySnap.position, ySnap.kind, movingItem.height) : position.y
  const guides: VenueAlignmentGuide[] = []

  if (xSnap) {
    guides.push({
      axis: 'x',
      position: xSnap.position,
      start: Math.min(y, xSnap.item.y),
      end: Math.max(y + movingItem.height, xSnap.item.y + xSnap.item.height),
    })
  }
  if (ySnap) {
    guides.push({
      axis: 'y',
      position: ySnap.position,
      start: Math.min(x, ySnap.item.x),
      end: Math.max(x + movingItem.width, ySnap.item.x + ySnap.item.width),
    })
  }

  return { x: Math.round(x), y: Math.round(y), guides }
}

export function updateVenueFloor(
  layout: VenueLayout,
  floorId: string,
  patch: Partial<VenueFloor>,
): VenueLayout {
  return updateFloor(layout, floorId, (floor) => ({
    ...normalizeVenueFloor({ ...floor, ...patch }),
    items: patch.items ?? floor.items,
  }))
}

export function parseStoredVenueLayout(raw: string | null): VenueLayout {
  return parseStoredVenueLayoutOrNull(raw) ?? DEFAULT_VENUE_LAYOUT
}

// Returns the sanitized layout, or null if the raw string is missing/invalid —
// lets callers tell "no usable data" apart from a real layout.
function parseStoredVenueLayoutOrNull(raw: string | null): VenueLayout | null {
  if (!raw) return null
  try {
    return sanitizeVenueLayout(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export type VenueLoadResult = {
  layout: VenueLayout
  // false when raw data existed but couldn't be parsed — the caller must NOT
  // auto-overwrite storage in that case, so the bad-but-present data is kept
  // for manual recovery instead of being clobbered by a default.
  persistable: boolean
  // true when data was read from the legacy (v1) key and should be re-saved
  // under the current key (the legacy key is left untouched as a backup).
  migratedFromLegacy: boolean
}

// Load the venue layout with migration + safety: try the current key, then the
// legacy key; never treat a parse failure of existing data as "save default".
export function loadVenueLayout(storage: Pick<Storage, 'getItem'>): VenueLoadResult {
  const rawCurrent = storage.getItem(VENUE_STORAGE_KEY)
  if (rawCurrent != null) {
    const layout = parseStoredVenueLayoutOrNull(rawCurrent)
    return layout
      ? { layout, persistable: true, migratedFromLegacy: false }
      : { layout: DEFAULT_VENUE_LAYOUT, persistable: false, migratedFromLegacy: false }
  }

  const rawLegacy = storage.getItem(VENUE_LEGACY_STORAGE_KEY)
  if (rawLegacy != null) {
    const layout = parseStoredVenueLayoutOrNull(rawLegacy)
    return layout
      ? { layout, persistable: true, migratedFromLegacy: true }
      : { layout: DEFAULT_VENUE_LAYOUT, persistable: false, migratedFromLegacy: false }
  }

  return { layout: DEFAULT_VENUE_LAYOUT, persistable: true, migratedFromLegacy: false }
}

// Accept a stored layout but drop items whose type is no longer supported,
// rather than discarding the whole layout — keeps the user's work when
// categories are removed.
function sanitizeVenueLayout(value: unknown): VenueLayout | null {
  if (!value || typeof value !== 'object') return null
  const layout = value as VenueLayout
  if (
    typeof layout.venueId !== 'string' ||
    typeof layout.name !== 'string' ||
    typeof layout.width !== 'number' ||
    typeof layout.height !== 'number' ||
    !Array.isArray(layout.floors)
  ) {
    return null
  }
  // Pre-v2 layouts predate height3d/elevation/floorHeight. Don't reject them —
  // backfill with type-defaults so the user's work survives the migration.
  const floors = layout.floors
    .filter(isVenueFloorShape)
    .map((floor) => ({
      ...floor,
      floorHeight: finiteFloorHeight(floor.floorHeight),
      items: floor.items.filter(isVenueItem).map(backfillItem3D),
    }))
  if (floors.length === 0) return null
  return { ...layout, floors, viewBookmarks: sanitizeViewBookmarks(layout.viewBookmarks) }
}

// Keep only well-formed bookmarks, capped at the client limit. Returns undefined
// when empty so a seeded layout stays deep-equal to DEFAULT_VENUE_LAYOUT.
export function sanitizeViewBookmarks(value: unknown): VenueViewBookmark[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list: VenueViewBookmark[] = []
  for (const entry of value) {
    const b = entry as VenueViewBookmark
    if (b && typeof b === 'object'
      && typeof b.zoom === 'number' && Number.isFinite(b.zoom)
      && typeof b.left === 'number' && Number.isFinite(b.left)
      && typeof b.top === 'number' && Number.isFinite(b.top)) {
      list.push({ zoom: b.zoom, left: b.left, top: b.top })
    }
    if (list.length >= MAX_VENUE_VIEW_BOOKMARKS) break
  }
  return list.length ? list : undefined
}

function backfillItem3D(item: VenueItem): VenueItem {
  const z = DEFAULT_3D[item.type]
  return {
    ...item,
    height3d: Number.isFinite(item.height3d) ? Math.max(0, item.height3d as number) : z.height3d,
    elevation: Number.isFinite(item.elevation) ? Math.max(0, item.elevation as number) : z.elevation,
  }
}

function finiteFloorHeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(100, value)
    : DEFAULT_FLOOR_HEIGHT
}

export function readStoredVenueLayout(storage: Pick<Storage, 'getItem'>): VenueLayout {
  return parseStoredVenueLayout(storage.getItem(VENUE_STORAGE_KEY))
}

export function writeStoredVenueLayout(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  layout: VenueLayout,
): void {
  // Snapshot the previous good write before overwriting, so a bad save can be
  // rolled back from the backup key.
  const previous = storage.getItem(VENUE_STORAGE_KEY)
  if (previous != null) {
    try {
      storage.setItem(VENUE_BACKUP_STORAGE_KEY, previous)
    } catch {
      // Backup is best-effort (e.g. quota) — don't block the primary write.
    }
  }
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
    height3d: Math.max(0, finiteNumber(item.height3d)),
    elevation: Math.max(0, finiteNumber(item.elevation)),
  }
}

function normalizeVenueFloor(floor: VenueFloor): VenueFloor {
  return {
    ...floor,
    width: Math.max(100, finiteNumber(floor.width)),
    height: Math.max(100, finiteNumber(floor.height)),
    floorHeight: Math.max(100, finiteNumber(floor.floorHeight) || DEFAULT_FLOOR_HEIGHT),
  }
}

function getLayerTargetIndex(index: number, length: number, move: VenueLayerMove): number {
  if (move === 'back') return 0
  if (move === 'backward') return Math.max(0, index - 1)
  if (move === 'forward') return Math.min(length - 1, index + 1)
  return length - 1
}

function findAxisSnap(
  movingPositions: { kind: 'start' | 'center' | 'end'; position: number }[],
  targetPositions: { item: VenueItem; position: number }[],
  threshold: number,
): ({ item: VenueItem; kind: 'start' | 'center' | 'end'; position: number; distance: number } | null) {
  let closest: { item: VenueItem; kind: 'start' | 'center' | 'end'; position: number; distance: number } | null = null

  for (const moving of movingPositions) {
    for (const target of targetPositions) {
      const distance = Math.abs(target.position - moving.position)
      if (distance > threshold || (closest && distance >= closest.distance)) continue
      closest = {
        item: target.item,
        kind: moving.kind,
        position: target.position,
        distance,
      }
    }
  }

  return closest
}

function xForSnap(position: number, kind: 'start' | 'center' | 'end', size: number): number {
  if (kind === 'center') return position - size / 2
  if (kind === 'end') return position - size
  return position
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function isVenueFloorShape(value: unknown): value is VenueFloor {
  if (!value || typeof value !== 'object') return false
  const floor = value as VenueFloor
  return (
    typeof floor.id === 'string' &&
    typeof floor.name === 'string' &&
    typeof floor.width === 'number' &&
    typeof floor.height === 'number' &&
    Array.isArray(floor.items)
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
