'use client'

import { CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { Edges, Line, OrbitControls, TransformControls, useTexture } from '@react-three/drei'
import { DoubleSide, type Group } from 'three'
import { useTranslations } from 'next-intl'
import { MousePointer2, Move, RotateCcw, MoveVertical } from 'lucide-react'
import type { VenueFloor, VenueItem, VenueItemType, VenueMarkerType } from './layoutData'

// Kept visually in sync with VenueCanvas TYPE_STYLE — same palette so 2D and 3D
// read as the same surface.
const TYPE_STYLE_3D: Record<VenueItemType, { fill: string; stroke: string }> = {
  equipment:    { fill: '#dbeafe', stroke: '#2563eb' },
  renovation:   { fill: '#dcfce7', stroke: '#16a34a' },
  area:         { fill: '#ede9fe', stroke: '#7c3aed' },
  corridor:     { fill: '#fef3c7', stroke: '#d97706' },
  window:       { fill: '#cffafe', stroke: '#0891b2' },
  truss:        { fill: '#fef3c7', stroke: '#d97706' }, // placeholder — refined by 3D task
  light:        { fill: '#fef3c7', stroke: '#d97706' }, // placeholder — refined by 3D task
  door_inward:  { fill: '#dbeafe', stroke: '#2563eb' },
  door_outward: { fill: '#e0e7ff', stroke: '#4f46e5' },
  door_sliding: { fill: '#cffafe', stroke: '#0891b2' },
  fire:         { fill: '#fee2e2', stroke: '#dc2626' },
  power:        { fill: '#fef3c7', stroke: '#d97706' },
  network:      { fill: '#ede9fe', stroke: '#7c3aed' },
}

const SELECTION_ACCENT = '#f4511e'
const AREA_WALL_THICKNESS = 10
// Real-world door opening dimensions. The 2D marker is a tiny 32×32 dot, but in
// 3D we want a realistic 80×~200 cm leaf so the room reads correctly.
const DOOR_OPENING_WIDTH = 80
const DOOR_PANEL_THICKNESS = 5
// How close (cm) a door's centre must be to a wall midline for it to be
// considered "attached" — half the wall thickness plus a generous fudge factor.
const DOOR_ATTACH_THRESHOLD = AREA_WALL_THICKNESS / 2 + 30
// How high (cm) above each item's top the leader line rises before the name
// chip floats. Long enough to clear short items, short enough that tall walls
// don't push labels off the top of the viewport.
const LABEL_LEADER_HEIGHT = 60

type TransformMode = 'select' | 'translate' | 'rotate' | 'scale'
type DoorType = Extract<VenueMarkerType, 'door_inward' | 'door_outward' | 'door_sliding'>
type WallSide = 'N' | 'S' | 'W' | 'E'

type WallPort = { offset: number; width: number; sourceId: string; band?: { bottom: number; top: number }; thickness?: number }
type AreaPorts = { N: WallPort[]; S: WallPort[]; W: WallPort[]; E: WallPort[] }
// Segments of a wall that are covered by an adjacent area (no wall rendered there).
type SharedCut = { start: number; end: number }
type AreaSharedWalls = { N: SharedCut[]; S: SharedCut[]; W: SharedCut[]; E: SharedCut[] }
type DoorPlacement = {
  areaCenterX: number
  areaCenterZ: number
  areaRotationDeg: number
  // Panel center and Y rotation in AREA-LOCAL coords. Combined with the area
  // transform at render time to get world placement.
  panelLocal: [number, number, number]
  panelLocalRotY: number
  doorType: DoorType
  height3d: number
}

type Props = {
  floor: VenueFloor
  selectedItemIds: string[]
  onSelectItems: (ids: string[]) => void
  onItemChange: (itemId: string, patch: Partial<VenueItem>) => void
  // Resolves the display name per item (locale译名); falls back to item.name.
  itemName?: (item: VenueItem) => string
  zoom?: number
}

const BASE_FOV = 35

function CameraFovSync({ zoom }: { zoom: number }) {
  const { camera, invalidate } = useThree()
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = BASE_FOV / zoom
      camera.updateProjectionMatrix()
      invalidate()
    }
  }, [zoom, camera, invalidate])
  return null
}

export default function Venue3DCanvas({ floor, selectedItemIds, onSelectItems, onItemChange, itemName, zoom = 1 }: Props) {
  const t = useTranslations('venue')
  const [transformMode, setTransformMode] = useState<TransformMode>('select')

  const itemRefs = useRef(new Map<string, Group>())
  const registerItemRef = useCallback((id: string, group: Group | null) => {
    if (group) itemRefs.current.set(id, group)
    else itemRefs.current.delete(id)
  }, [])

  const cameraDistance = Math.max(floor.width, floor.height) * 1.4
  const cameraInit = useMemo(() => ({
    position: [
      floor.width / 2 + cameraDistance * 0.7,
      cameraDistance * 0.9,
      floor.height / 2 + cameraDistance * 0.7,
    ] as [number, number, number],
    fov: 35,
    near: 1,
    far: Math.max(floor.width, floor.height) * 20,
  }), [floor.width, floor.height, cameraDistance])
  const orbitTarget = useMemo<[number, number, number]>(
    () => [floor.width / 2, 0, floor.height / 2],
    [floor.width, floor.height],
  )
  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const glOptions = useMemo(() => ({ preserveDrawingBuffer: true, antialias: true }), [])
  const handlePointerMissed = useCallback(() => onSelectItems([]), [onSelectItems])

  // Match every door marker against every area's walls. The output is two
  // lookups: per-area ports (used to cut wall openings) and per-door placement
  // info (used to render the realistic door panel + skip the default box).
  const { areaPorts, doorPlacements } = useMemo(
    () => computeDoorAttachments(floor.items),
    [floor.items],
  )
  const areaSharedWalls = useMemo(
    () => computeAreaAdjacencies(floor.items),
    [floor.items],
  )

  const selectedId = selectedItemIds.length === 1 ? selectedItemIds[0] : null
  const selectedItem = selectedId ? floor.items.find((item) => item.id === selectedId) ?? null : null
  const showGizmo = transformMode !== 'select' && !!selectedItem

  // World positions (top-centre of each item) fed into SceneProjector.
  const labelEntries = useMemo(() => floor.items.map((item) => {
    const placement = doorPlacements.get(item.id)
    let world: [number, number, number]
    if (placement) {
      const aRad = (placement.areaRotationDeg * Math.PI) / 180
      const cos = Math.cos(aRad); const sin = Math.sin(aRad)
      const lx = placement.panelLocal[0]; const lz = placement.panelLocal[2]
      world = [
        placement.areaCenterX + lx * cos - lz * sin,
        placement.height3d,
        placement.areaCenterZ + lx * sin + lz * cos,
      ]
    } else {
      world = [
        item.x + item.width / 2,
        item.elevation + Math.max(item.height3d, 1),
        item.y + item.height / 2,
      ]
    }
    return { id: item.id, world }
  }), [floor.items, doorPlacements])

  // Projected screen positions updated by SceneProjector each frame.
  const projectedRef = useRef<Record<string, { x: number; y: number }>>({})
  const [projected, setProjected] = useState<Record<string, { x: number; y: number }>>({})
  const onProjected = useCallback((pos: Record<string, { x: number; y: number }>) => {
    projectedRef.current = pos
    setProjected(pos)
  }, [])

  // Normalised horizontal camera direction (XZ plane) for face-on detection.
  const [cameraDir, setCameraDir] = useState<{ x: number; z: number }>({ x: 0, z: -1 })

  // Canvas container size (for edge layout math).
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect
      setCanvasSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const resolvedItemName = useCallback(
    (item: VenueItem) => (itemName ? itemName(item) : item.name),
    [itemName],
  )

  return (
    <div ref={containerRef} className="relative h-full min-h-[560px] w-full bg-slate-50">
      <Canvas
        shadows={false}
        camera={cameraInit}
        gl={glOptions}
        frameloop="demand"
        onPointerMissed={handlePointerMissed}
      >
        <CameraFovSync zoom={zoom} />
        <SceneProjector entries={labelEntries} onUpdate={onProjected} onCameraDir={setCameraDir} />
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[floor.width, floor.height * 2, floor.height]} intensity={0.45} />

        <Suspense fallback={null}>
          <Floor floor={floor} />
        </Suspense>

        {floor.items.map((item) => {
          if (isDoorType(item.type)) {
            const placement = doorPlacements.get(item.id)
            if (placement) {
              return (
                <Door3D
                  key={item.id}
                  item={item}
                  placement={placement}
                  selected={selectedSet.has(item.id)}
                  onSelect={onSelectItems}
                />
              )
            }
          }
          if (item.type === 'window') return null
          return (
            <VenueItem3DMesh
              key={item.id}
              item={item}
              ports={item.type === 'area' ? areaPorts.get(item.id) : undefined}
              sharedWalls={item.type === 'area' ? areaSharedWalls.get(item.id) : undefined}
              selected={selectedSet.has(item.id)}
              onSelect={onSelectItems}
              registerRef={registerItemRef}
            />
          )
        })}

        {showGizmo && selectedItem && (
          <ItemTransformGizmo
            key={`${selectedItem.id}:${transformMode}`}
            mode={transformMode}
            item={selectedItem}
            getTarget={() => itemRefs.current.get(selectedItem.id) ?? null}
            onCommit={(patch) => onItemChange(selectedItem.id, patch)}
          />
        )}

        <OrbitControls
          makeDefault
          target={orbitTarget}
          enableDamping={false}
          minDistance={50}
          maxDistance={cameraDistance * 3}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>

      <EdgeLabelOverlay
        items={floor.items}
        projected={projected}
        canvasSize={canvasSize}
        selectedIds={selectedSet}
        itemName={resolvedItemName}
        cameraDir={cameraDir}
        floorWidth={floor.width}
        floorHeight={floor.height}
      />

      <TransformToolbar
        mode={transformMode}
        onChange={setTransformMode}
        labels={{
          select:    t('transformSelect'),
          translate: t('transformTranslate'),
          rotate:    t('transformRotate'),
          scale:     t('transformScale'),
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Adjacent-area shared-wall computation

function computeAreaAdjacencies(items: VenueItem[]): Map<string, AreaSharedWalls> {
  const areas = items.filter((it) => it.type === 'area' && it.rotation === 0)
  const result = new Map<string, AreaSharedWalls>()
  for (const a of areas) result.set(a.id, { N: [], S: [], W: [], E: [] })

  const t = AREA_WALL_THICKNESS

  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]
      const b = areas[j]

      // Only suppress the shared wall if both items have explicitly merged with each other.
      const merged = a.mergedWith?.includes(b.id) && b.mergedWith?.includes(a.id)
      if (!merged) continue

      // A's East wall meets B's West wall
      if (Math.abs((a.x + a.width) - b.x) <= t) {
        const lo = Math.max(a.y, b.y)
        const hi = Math.min(a.y + a.height, b.y + b.height)
        if (hi > lo) {
          // Convert world overlap to local wall axis (Z, centered on each area)
          const aCz = a.y + a.height / 2
          const bCz = b.y + b.height / 2
          result.get(a.id)!.E.push({ start: lo - aCz, end: hi - aCz })
          result.get(b.id)!.W.push({ start: lo - bCz, end: hi - bCz })
        }
      }

      // A's West wall meets B's East wall
      if (Math.abs(a.x - (b.x + b.width)) <= t) {
        const lo = Math.max(a.y, b.y)
        const hi = Math.min(a.y + a.height, b.y + b.height)
        if (hi > lo) {
          const aCz = a.y + a.height / 2
          const bCz = b.y + b.height / 2
          result.get(a.id)!.W.push({ start: lo - aCz, end: hi - aCz })
          result.get(b.id)!.E.push({ start: lo - bCz, end: hi - bCz })
        }
      }

      // A's South wall meets B's North wall
      if (Math.abs((a.y + a.height) - b.y) <= t) {
        const lo = Math.max(a.x, b.x)
        const hi = Math.min(a.x + a.width, b.x + b.width)
        if (hi > lo) {
          const aCx = a.x + a.width / 2
          const bCx = b.x + b.width / 2
          result.get(a.id)!.S.push({ start: lo - aCx, end: hi - aCx })
          result.get(b.id)!.N.push({ start: lo - bCx, end: hi - bCx })
        }
      }

      // A's North wall meets B's South wall
      if (Math.abs(a.y - (b.y + b.height)) <= t) {
        const lo = Math.max(a.x, b.x)
        const hi = Math.min(a.x + a.width, b.x + b.width)
        if (hi > lo) {
          const aCx = a.x + a.width / 2
          const bCx = b.x + b.width / 2
          result.get(a.id)!.N.push({ start: lo - aCx, end: hi - aCx })
          result.get(b.id)!.S.push({ start: lo - bCx, end: hi - bCx })
        }
      }
    }
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Door attachment math

function isDoorType(type: VenueItemType): type is DoorType {
  return type === 'door_inward' || type === 'door_outward' || type === 'door_sliding'
}

function computeDoorAttachments(items: VenueItem[]): {
  areaPorts: Map<string, AreaPorts>
  doorPlacements: Map<string, DoorPlacement>
} {
  const areas = items.filter((it) => it.type === 'area')
  const doors = items.filter((it) => isDoorType(it.type))

  const areaPorts = new Map<string, AreaPorts>()
  for (const area of areas) {
    areaPorts.set(area.id, { N: [], S: [], W: [], E: [] })
  }
  const doorPlacements = new Map<string, DoorPlacement>()

  for (const door of doors) {
    // Door world centre (2D). For each area we pick the door's *closest* wall
    // within the threshold and punch a port there. When two areas share a wall
    // (e.g. adjacent rooms) the door now opens both sides instead of leaving
    // one wall intact and looking like it pokes through the room next door.
    const dx = door.x + door.width / 2
    const dy = door.y + door.height / 2
    let best: {
      areaId: string
      side: WallSide
      offset: number
      distance: number
      area: VenueItem
    } | null = null

    for (const area of areas) {
      const cx = area.x + area.width / 2
      const cy = area.y + area.height / 2
      const aw = area.width / 2
      const ad = area.height / 2
      const theta = (area.rotation * Math.PI) / 180

      const rx = dx - cx
      const ry = dy - cy
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const lx = rx * cos + ry * sin
      const lz = -rx * sin + ry * cos

      const candidates: { side: WallSide; distance: number; offset: number }[] = []
      if (Math.abs(lx) <= aw + DOOR_OPENING_WIDTH / 2) {
        candidates.push({ side: 'N', distance: Math.abs(lz + ad), offset: lx })
        candidates.push({ side: 'S', distance: Math.abs(lz - ad), offset: lx })
      }
      if (Math.abs(lz) <= ad + DOOR_OPENING_WIDTH / 2) {
        candidates.push({ side: 'W', distance: Math.abs(lx + aw), offset: lz })
        candidates.push({ side: 'E', distance: Math.abs(lx - aw), offset: lz })
      }

      // Pick the closest wall *within this area*. Multiple area matches are
      // collected; the global best wins the door-panel placement.
      let areaBest: { side: WallSide; distance: number; offset: number } | null = null
      for (const c of candidates) {
        if (c.distance > DOOR_ATTACH_THRESHOLD) continue
        if (areaBest === null || c.distance < areaBest.distance) areaBest = c
      }
      if (areaBest === null) continue

      const wallLen = areaBest.side === 'N' || areaBest.side === 'S' ? area.width : area.height
      const half = wallLen / 2
      const margin = DOOR_OPENING_WIDTH / 2 + AREA_WALL_THICKNESS
      const clamped = Math.max(-half + margin, Math.min(half - margin, areaBest.offset))

      const ports = areaPorts.get(area.id)
      if (ports) ports[areaBest.side].push({ offset: clamped, width: DOOR_OPENING_WIDTH, sourceId: door.id })

      if (best === null || areaBest.distance < best.distance) {
        best = {
          areaId: area.id,
          side: areaBest.side,
          offset: clamped,
          distance: areaBest.distance,
          area,
        }
      }
    }

    if (best === null) continue

    const { area, side } = best
    const aw = area.width / 2
    const ad = area.height / 2
    const pose = doorPose(side, door.type as DoorType, best.offset, aw, ad, Math.max(door.height3d, 1))
    doorPlacements.set(door.id, {
      areaCenterX: area.x + area.width / 2,
      areaCenterZ: area.y + area.height / 2,
      areaRotationDeg: area.rotation,
      panelLocal: pose.panelLocal,
      panelLocalRotY: pose.panelLocalRotY,
      doorType: door.type as DoorType,
      height3d: Math.max(door.height3d, 1),
    })
  }

  const windows = items.filter((it) => it.type === 'window')
  for (const win of windows) {
    const wx = win.x + win.width / 2
    const wy = win.y + win.height / 2
    for (const area of areas) {
      const cx = area.x + area.width / 2
      const cy = area.y + area.height / 2
      const aw = area.width / 2
      const ad = area.height / 2
      const theta = (area.rotation * Math.PI) / 180
      const rx = wx - cx
      const ry = wy - cy
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const lx = rx * cos + ry * sin
      const lz = -rx * sin + ry * cos
      const candidates: { side: WallSide; distance: number; offset: number; openW: number }[] = []
      if (Math.abs(lx) <= aw + win.width / 2) {
        candidates.push({ side: 'N', distance: Math.abs(lz + ad), offset: lx, openW: win.width })
        candidates.push({ side: 'S', distance: Math.abs(lz - ad), offset: lx, openW: win.width })
      }
      if (Math.abs(lz) <= ad + win.height / 2) {
        candidates.push({ side: 'W', distance: Math.abs(lx + aw), offset: lz, openW: win.height })
        candidates.push({ side: 'E', distance: Math.abs(lx - aw), offset: lz, openW: win.height })
      }
      let areaBest: { side: WallSide; distance: number; offset: number; openW: number } | null = null
      for (const c of candidates) {
        if (c.distance > DOOR_ATTACH_THRESHOLD) continue
        if (areaBest === null || c.distance < areaBest.distance) areaBest = c
      }
      if (areaBest === null) continue
      const wallLen = areaBest.side === 'N' || areaBest.side === 'S' ? area.width : area.height
      const half = wallLen / 2
      const margin = areaBest.openW / 2 + AREA_WALL_THICKNESS
      const clamped = Math.max(-half + margin, Math.min(half - margin, areaBest.offset))
      const ports = areaPorts.get(area.id)
      if (ports) ports[areaBest.side].push({
        offset: clamped,
        width: areaBest.openW,
        sourceId: win.id,
        band: { bottom: win.elevation, top: win.elevation + Math.max(win.height3d, 1) },
        thickness: win.thickness,
      })
    }
  }

  return { areaPorts, doorPlacements }
}

// Returns the door panel's centre + Y-rotation in area-local coordinates. The
// hinge is always at the "left" end of the opening as you traverse the wall in
// the +along direction. Sliding doors don't swing — the panel slides toward the
// -along side, exposing half the opening.
function doorPose(
  side: WallSide,
  doorType: DoorType,
  offset: number,
  aw: number,  // area.width / 2
  ad: number,  // area.height / 2
  height3d: number,
): { panelLocal: [number, number, number]; panelLocalRotY: number } {
  const DW = DOOR_OPENING_WIDTH
  const hy = height3d / 2
  const halfW = DW / 2

  if (side === 'N') {
    // Wall at z = -ad, along axis = +X, inward = +Z, outward = -Z.
    if (doorType === 'door_inward')  return { panelLocal: [offset - halfW, hy, -ad + halfW], panelLocalRotY: -Math.PI / 2 }
    if (doorType === 'door_outward') return { panelLocal: [offset - halfW, hy, -ad - halfW], panelLocalRotY:  Math.PI / 2 }
    return { panelLocal: [offset - halfW, hy, -ad], panelLocalRotY: 0 }
  }
  if (side === 'S') {
    // Wall at z = +ad, along axis = +X, inward = -Z, outward = +Z.
    if (doorType === 'door_inward')  return { panelLocal: [offset - halfW, hy,  ad - halfW], panelLocalRotY:  Math.PI / 2 }
    if (doorType === 'door_outward') return { panelLocal: [offset - halfW, hy,  ad + halfW], panelLocalRotY: -Math.PI / 2 }
    return { panelLocal: [offset - halfW, hy,  ad], panelLocalRotY: 0 }
  }
  if (side === 'E') {
    // Wall at x = +aw, along axis = +Z, inward = -X, outward = +X.
    if (doorType === 'door_inward')  return { panelLocal: [ aw - halfW, hy, offset - halfW], panelLocalRotY: -Math.PI }
    if (doorType === 'door_outward') return { panelLocal: [ aw + halfW, hy, offset - halfW], panelLocalRotY: 0 }
    return { panelLocal: [ aw, hy, offset - halfW], panelLocalRotY: -Math.PI / 2 }
  }
  // W
  // Wall at x = -aw, along axis = +Z, inward = +X, outward = -X.
  if (doorType === 'door_inward')  return { panelLocal: [-aw + halfW, hy, offset - halfW], panelLocalRotY: 0 }
  if (doorType === 'door_outward') return { panelLocal: [-aw - halfW, hy, offset - halfW], panelLocalRotY: -Math.PI }
  return { panelLocal: [-aw, hy, offset - halfW], panelLocalRotY: -Math.PI / 2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar + gizmo

function TransformToolbar({
  mode, onChange, labels,
}: {
  mode: TransformMode
  onChange: (next: TransformMode) => void
  labels: Record<TransformMode, string>
}) {
  const items: { id: TransformMode; icon: typeof MousePointer2 }[] = [
    { id: 'select',    icon: MousePointer2 },
    { id: 'translate', icon: Move },
    { id: 'rotate',    icon: RotateCcw },
    { id: 'scale',     icon: MoveVertical },
  ]
  return (
    <div className="absolute left-1/2 top-3 -translate-x-1/2 inline-flex rounded-lg border border-slate-200 bg-white/95 shadow-sm backdrop-blur overflow-hidden">
      {items.map(({ id, icon: Icon }, index) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={labels[id]}
          aria-label={labels[id]}
          aria-pressed={mode === id}
          className={`h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
            index > 0 ? 'border-l border-slate-200' : ''
          } ${
            mode === id
              ? 'bg-indigo-50 text-indigo-700'
              : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{labels[id]}</span>
        </button>
      ))}
    </div>
  )
}

function ItemTransformGizmo({
  mode, item, getTarget, onCommit,
}: {
  mode: Exclude<TransformMode, 'select'>
  item: VenueItem
  getTarget: () => Group | null
  onCommit: (patch: Partial<VenueItem>) => void
}) {
  const [shiftHeld, setShiftHeld] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const target = getTarget()
  if (!target) return null

  function handleMouseUp() {
    const t = getTarget()
    if (!t) return
    if (mode === 'translate') {
      onCommit({
        x: Math.round(t.position.x - item.width / 2),
        y: Math.round(t.position.z - item.height / 2),
      })
    } else if (mode === 'rotate') {
      const deg = -t.rotation.y * 180 / Math.PI
      const step = shiftHeld ? 15 : 0.5
      const quantized = Math.round(deg / step) * step
      const normalized = ((quantized + 180) % 360 + 360) % 360 - 180
      onCommit({ rotation: normalized })
    } else if (mode === 'scale') {
      const yExtent = Math.max(item.height3d, 1)
      const newHeight = Math.max(1, Math.round(yExtent * t.scale.y))
      t.scale.set(1, 1, 1)
      onCommit({ height3d: newHeight })
    }
  }

  return (
    <TransformControls
      object={target}
      mode={mode}
      showX={mode === 'translate'}
      showY={mode === 'rotate' || mode === 'scale'}
      showZ={mode === 'translate'}
      translationSnap={mode === 'translate' ? 10 : null}
      rotationSnap={mode === 'rotate' ? degToRad(shiftHeld ? 15 : 0.5) : null}
      onMouseUp={handleMouseUp}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor

function Floor({ floor }: { floor: VenueFloor }) {
  const w = floor.width
  const d = floor.height
  return (
    <group>
      {floor.backgroundImage ? (
        <Suspense fallback={<FloorPlain w={w} d={d} />}>
          <FloorTextured w={w} d={d} src={floor.backgroundImage} />
        </Suspense>
      ) : (
        <FloorPlain w={w} d={d} />
      )}
      <gridHelper args={[Math.max(w, d) * 1.4, 24, '#cbd5e1', '#e2e8f0']} position={[w / 2, 0.5, d / 2]} />
    </group>
  )
}

function FloorPlain({ w, d }: { w: number; d: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#f1f5f9" side={DoubleSide} />
    </mesh>
  )
}

function FloorTextured({ w, d, src }: { w: number; d: number; src: string }) {
  const texture = useTexture(src)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={texture} side={DoubleSide} />
    </mesh>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Items

function VenueItem3DMesh({
  item,
  ports,
  sharedWalls,
  selected,
  onSelect,
  registerRef,
}: {
  item: VenueItem
  ports?: AreaPorts
  sharedWalls?: AreaSharedWalls
  selected: boolean
  onSelect: (ids: string[]) => void
  registerRef: (id: string, group: Group | null) => void
}) {
  const groupRef = useRef<Group | null>(null)
  const style = TYPE_STYLE_3D[item.type]
  const isArea = item.type === 'area'

  const yExtent = Math.max(item.height3d, 1)

  useEffect(() => {
    registerRef(item.id, groupRef.current)
    return () => registerRef(item.id, null)
  }, [item.id, registerRef])

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    const additive = event.nativeEvent.shiftKey
    if (additive) {
      if (selected) onSelect([])
      else onSelect([item.id])
    } else {
      onSelect([item.id])
    }
  }

  const edgeColor = selected ? SELECTION_ACCENT : style.stroke
  const transparent = item.status === 'maintenance'
  const opacity = transparent ? 0.7 : 1

  return (
    <group
      ref={groupRef}
      position={[
        item.x + item.width / 2,
        item.elevation,
        item.y + item.height / 2,
      ]}
      rotation={[0, -degToRad(item.rotation), 0]}
      onClick={handleClick}
    >
      {isArea ? (
        <AreaWalls
          width={item.width}
          depth={item.height}
          height={yExtent}
          fill={style.fill}
          edgeColor={edgeColor}
          selected={selected}
          opacity={opacity}
          transparent={transparent}
          ports={ports}
          sharedWalls={sharedWalls}
        />
      ) : (
        <mesh position={[0, yExtent / 2, 0]} castShadow={false} receiveShadow={false}>
          <boxGeometry args={[item.width, yExtent, item.height]} />
          <meshStandardMaterial
            color={style.fill}
            emissive={selected ? SELECTION_ACCENT : '#000000'}
            emissiveIntensity={selected ? 0.18 : 0}
            opacity={opacity}
            transparent={transparent}
          />
          <Edges threshold={15} color={edgeColor} scale={1.001} />
        </mesh>
      )}
    </group>
  )
}

function AreaWalls({
  width, depth, height, fill, edgeColor, selected, opacity, transparent, ports, sharedWalls,
}: {
  width: number
  depth: number
  height: number
  fill: string
  edgeColor: string
  selected: boolean
  opacity: number
  transparent: boolean
  ports?: AreaPorts
  sharedWalls?: AreaSharedWalls
}) {
  const t = AREA_WALL_THICKNESS
  // For each wall, the renderable range along the wall axis:
  //   N/S walls run the full width    (-width/2 .. +width/2)
  //   W/E walls slot between N/S      (-depth/2 + t .. +depth/2 - t)
  // Doors cut openings; shared-wall segments are also cut (no wall between adjacent areas).
  const nSegments = segmentWall(width, ports?.N ?? [], sharedWalls?.N ?? [])
  const sSegments = segmentWall(width, ports?.S ?? [], sharedWalls?.S ?? [])
  const wSegments = segmentWall(depth, ports?.W ?? [], sharedWalls?.W ?? [], { padStart: t, padEnd: t })
  const eSegments = segmentWall(depth, ports?.E ?? [], sharedWalls?.E ?? [], { padStart: t, padEnd: t })

  function wallMaterial(key: string) {
    return (
      <>
        <meshStandardMaterial
          color={fill}
          emissive={selected ? SELECTION_ACCENT : '#000000'}
          emissiveIntensity={selected ? 0.18 : 0}
          opacity={opacity}
          transparent={transparent}
        />
        <Edges threshold={15} color={edgeColor} scale={1.001} />
      </>
    )
  }

  const GLASS_COLOR = '#bae6fd'
  function bandBlocks(side: WallSide, port: WallPort): JSX.Element[] {
    if (!port.band) return []
    const b = Math.max(0, Math.min(port.band.bottom, height))
    const tp = Math.max(b, Math.min(port.band.top, height))
    const w = port.width
    const off = port.offset
    const sillH = b
    const lintelH = height - tp
    const glassH = tp - b
    const glassDepth = Math.max(1, port.thickness ?? 0)
    const isNS = side === 'N' || side === 'S'
    const zN = -depth / 2 + t / 2
    const zS = depth / 2 - t / 2
    const xW = -width / 2 + t / 2
    const xE = width / 2 - t / 2
    const out: JSX.Element[] = []
    const push = (key: string, cy: number, h: number, glass: boolean) => {
      if (h <= 0) return
      const args: [number, number, number] = isNS ? [w, h, glass ? glassDepth : t] : [glass ? glassDepth : t, h, w]
      const pos: [number, number, number] = isNS ? [off, cy, side === 'N' ? zN : zS] : [side === 'W' ? xW : xE, cy, off]
      out.push(
        <mesh key={key} position={pos}>
          <boxGeometry args={args} />
          {glass
            ? <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.45} />
            : wallMaterial(key)}
        </mesh>,
      )
    }
    push(`${side}-sill-${port.sourceId}`, sillH / 2, sillH, false)
    push(`${side}-lintel-${port.sourceId}`, tp + lintelH / 2, lintelH, false)
    push(`${side}-glass-${port.sourceId}`, b + glassH / 2, glassH, true)
    return out
  }

  return (
    <>
      {nSegments.map((s, i) => (
        <mesh key={`N${i}`} position={[(s.start + s.end) / 2, height / 2, -depth / 2 + t / 2]}>
          <boxGeometry args={[s.end - s.start, height, t]} />
          {wallMaterial(`N${i}`)}
        </mesh>
      ))}
      {sSegments.map((s, i) => (
        <mesh key={`S${i}`} position={[(s.start + s.end) / 2, height / 2,  depth / 2 - t / 2]}>
          <boxGeometry args={[s.end - s.start, height, t]} />
          {wallMaterial(`S${i}`)}
        </mesh>
      ))}
      {wSegments.map((s, i) => (
        <mesh key={`W${i}`} position={[-width / 2 + t / 2, height / 2, (s.start + s.end) / 2]}>
          <boxGeometry args={[t, height, s.end - s.start]} />
          {wallMaterial(`W${i}`)}
        </mesh>
      ))}
      {eSegments.map((s, i) => (
        <mesh key={`E${i}`} position={[ width / 2 - t / 2, height / 2, (s.start + s.end) / 2]}>
          <boxGeometry args={[t, height, s.end - s.start]} />
          {wallMaterial(`E${i}`)}
        </mesh>
      ))}
      {(['N', 'S', 'W', 'E'] as WallSide[]).flatMap((side) =>
        (ports?.[side] ?? []).filter((p) => p.band).flatMap((p) => bandBlocks(side, p)),
      )}
    </>
  )
}

function segmentWall(
  length: number,
  ports: WallPort[],
  shared: SharedCut[],
  pad: { padStart?: number; padEnd?: number } = {},
): { start: number; end: number }[] {
  const padStart = pad.padStart ?? 0
  const padEnd = pad.padEnd ?? 0
  const low = -length / 2 + padStart
  const high = length / 2 - padEnd
  if (high <= low) return []

  const cuts = [
    ...ports.map((p) => ({ start: p.offset - p.width / 2, end: p.offset + p.width / 2 })),
    ...shared,
  ]
    .filter((c) => c.end > low && c.start < high)
    .sort((a, b) => a.start - b.start)

  const segments: { start: number; end: number }[] = []
  let cursor = low
  for (const c of cuts) {
    const cStart = Math.max(c.start, low)
    const cEnd = Math.min(c.end, high)
    if (cStart > cursor) segments.push({ start: cursor, end: cStart })
    cursor = Math.max(cursor, cEnd)
  }
  if (cursor < high) segments.push({ start: cursor, end: high })
  // Drop sub-1cm slivers that would render as flicker artefacts.
  return segments.filter((s) => s.end - s.start > 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Door3D — realistic door panel for a door attached to an area wall.

function Door3D({
  item,
  placement,
  selected,
  onSelect,
}: {
  item: VenueItem
  placement: DoorPlacement
  selected: boolean
  onSelect: (ids: string[]) => void
}) {
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    const additive = event.nativeEvent.shiftKey
    if (additive) {
      if (selected) onSelect([])
      else onSelect([item.id])
    } else {
      onSelect([item.id])
    }
  }

  const style = TYPE_STYLE_3D[placement.doorType]
  const edgeColor = selected ? SELECTION_ACCENT : style.stroke

  // The whole door rides in the area's coordinate system: outer group sits at
  // the area centre with the area's Y-rotation, inner mesh uses the local pose
  // we precomputed.
  return (
    <group
      position={[placement.areaCenterX, 0, placement.areaCenterZ]}
      rotation={[0, -degToRad(placement.areaRotationDeg), 0]}
      onClick={handleClick}
    >
      <group
        position={placement.panelLocal}
        rotation={[0, placement.panelLocalRotY, 0]}
      >
        <mesh>
          <boxGeometry args={[DOOR_OPENING_WIDTH, placement.height3d, DOOR_PANEL_THICKNESS]} />
          <meshStandardMaterial
            color={style.fill}
            emissive={selected ? SELECTION_ACCENT : '#000000'}
            emissiveIntensity={selected ? 0.2 : 0}
          />
          <Edges threshold={15} color={edgeColor} scale={1.001} />
        </mesh>
      </group>
    </group>
  )
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

// ─────────────────────────────────────────────────────────────────────────────
// SceneProjector — runs inside Canvas, projects world positions → screen pixels each frame.
// Also emits the camera's normalised horizontal direction (XZ plane) for face detection.
function SceneProjector({
  entries,
  onUpdate,
  onCameraDir,
}: {
  entries: Array<{ id: string; world: [number, number, number] }>
  onUpdate: (pos: Record<string, { x: number; y: number }>) => void
  onCameraDir: (dir: { x: number; z: number }) => void
}) {
  const { camera, size } = useThree()
  const vec = useMemo(() => new Vector3(), [])
  const dirVec = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const result: Record<string, { x: number; y: number }> = {}
    for (const { id, world } of entries) {
      vec.set(...world)
      vec.project(camera)
      if (vec.z > 1) continue
      result[id] = {
        x: (vec.x * 0.5 + 0.5) * size.width,
        y: (vec.y * -0.5 + 0.5) * size.height,
      }
    }
    onUpdate(result)
    // Emit normalised horizontal camera direction for face-on detection.
    camera.getWorldDirection(dirVec)
    const hLen = Math.sqrt(dirVec.x * dirVec.x + dirVec.z * dirVec.z)
    if (hLen > 0.01) onCameraDir({ x: dirVec.x / hLen, z: dirVec.z / hLen })
  })
  return null
}

// FACE_ON_THRESHOLD: if |sin(angle from cardinal)| < this, camera is ~face-on to that wall.
const FACE_ON_THRESHOLD = 0.35  // ≈ 20°

// EdgeLabelOverlay — SVG overlay outside Canvas with edge-distributed label chips.
function EdgeLabelOverlay({
  items,
  projected,
  canvasSize,
  selectedIds,
  itemName,
  cameraDir,
  floorWidth,
  floorHeight,
}: {
  items: VenueItem[]
  projected: Record<string, { x: number; y: number }>
  canvasSize: { width: number; height: number }
  selectedIds: Set<string>
  itemName: (item: VenueItem) => string
  cameraDir: { x: number; z: number }
  floorWidth: number
  floorHeight: number
}) {
  const { width: W, height: H } = canvasSize

  const labels = useMemo(() => {
    if (W === 0 || H === 0) return []

    // Face-on detection: filter to near-side items when camera nearly perpendicular to a wall.
    // Camera dir (dx, dz) is normalised. Near side = items whose centre is "in front of" the
    // floor's midpoint relative to camera direction.
    const fcx = floorWidth / 2
    const fcz = floorHeight / 2
    const isFaceOn = Math.abs(cameraDir.x) < FACE_ON_THRESHOLD || Math.abs(cameraDir.z) < FACE_ON_THRESHOLD
    const visibleItems = isFaceOn
      ? items.filter((item) => {
          const ix = item.x + item.width / 2
          const iz = item.y + item.height / 2  // item.y maps to world Z
          // dot > 0 → item is on the near side (between camera and center)
          return (ix - fcx) * (-cameraDir.x) + (iz - fcz) * (-cameraDir.z) >= 0
        })
      : items

    // Collect valid projected points.
    const pts: Array<{ item: VenueItem; x: number; y: number }> = []
    for (const item of visibleItems) {
      const p = projected[item.id]
      if (!p) continue
      pts.push({ item, x: p.x, y: p.y })
    }
    if (pts.length === 0) return []

    // Bounding box of all projected points.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (const { x, y } of pts) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x
      if (y < by0) by0 = y; if (y > by1) by1 = y
    }
    // Label zone: expand bounding box by PAD, clamp to viewport.
    const PAD = 56
    const zx0 = Math.max(4,  bx0 - PAD)
    const zy0 = Math.max(4,  by0 - PAD)
    const zx1 = Math.min(W - 4, bx1 + PAD)
    const zy1 = Math.min(H - 4, by1 + PAD)
    const zcx = (zx0 + zx1) / 2
    const zcy = (zy0 + zy1) / 2

    type Slot = { item: VenueItem; from: { x: number; y: number }; t: number }
    const edges: Record<'top' | 'bottom' | 'left' | 'right', Slot[]> = {
      top: [], bottom: [], left: [], right: [],
    }

    for (const { item, x, y } of pts) {
      // Assign to nearest zone edge based on angle from zone centre.
      const dx = (x - zcx) / (zx1 - zx0 + 1)
      const dy = (y - zcy) / (zy1 - zy0 + 1)
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) edges.right.push({ item, from: { x, y }, t: y })
        else         edges.left.push ({ item, from: { x, y }, t: y })
      } else {
        if (dy >= 0) edges.bottom.push({ item, from: { x, y }, t: x })
        else         edges.top.push   ({ item, from: { x, y }, t: x })
      }
    }

    type LabelEntry = { id: string; name: string; from: { x: number; y: number }; to: { x: number; y: number }; selected: boolean }
    const result: LabelEntry[] = []

    function distribute(slots: Slot[], edge: 'top' | 'bottom' | 'left' | 'right') {
      slots.sort((a, b) => a.t - b.t)
      const n = slots.length
      if (n === 0) return
      for (let i = 0; i < n; i++) {
        const { item, from } = slots[i]
        const frac = (i + 0.5) / n
        let to: { x: number; y: number }
        if (edge === 'top')         to = { x: zx0 + frac * (zx1 - zx0), y: zy0 }
        else if (edge === 'bottom') to = { x: zx0 + frac * (zx1 - zx0), y: zy1 }
        else if (edge === 'left')   to = { x: zx0, y: zy0 + frac * (zy1 - zy0) }
        else                        to = { x: zx1, y: zy0 + frac * (zy1 - zy0) }
        result.push({ id: item.id, name: itemName(item), from, to, selected: selectedIds.has(item.id) })
      }
    }

    distribute(edges.top, 'top')
    distribute(edges.bottom, 'bottom')
    distribute(edges.left, 'left')
    distribute(edges.right, 'right')
    return result
  }, [items, projected, W, H, itemName, selectedIds, cameraDir, floorWidth, floorHeight])

  if (W === 0) return null

  return (
    <>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' } as CSSProperties}
        viewBox={`0 0 ${W} ${H}`}
      >
        {labels.map((lbl) => (
          <line
            key={`line-${lbl.id}`}
            x1={lbl.from.x} y1={lbl.from.y}
            x2={lbl.to.x}   y2={lbl.to.y}
            stroke={lbl.selected ? '#f4511e' : '#94a3b8'}
            strokeWidth={1}
            strokeDasharray="5 3"
          />
        ))}
      </svg>
      {labels.map((lbl) => (
        <div
          key={`chip-${lbl.id}`}
          style={{
            position: 'absolute',
            left: lbl.to.x,
            top: lbl.to.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            userSelect: 'none',
          } as CSSProperties}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap shadow-sm border ${
            lbl.selected
              ? 'bg-[#f4511e] text-white border-[#f4511e]'
              : 'bg-white/95 text-slate-700 border-slate-200'
          }`}
        >
          {lbl.name}
        </div>
      ))}
    </>
  )
}
