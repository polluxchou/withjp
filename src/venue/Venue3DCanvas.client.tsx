'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, Line, OrbitControls, TransformControls, useTexture } from '@react-three/drei'
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

type WallPort = { offset: number; width: number; doorId: string }
type AreaPorts = { N: WallPort[]; S: WallPort[]; W: WallPort[]; E: WallPort[] }
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
}

export default function Venue3DCanvas({ floor, selectedItemIds, onSelectItems, onItemChange }: Props) {
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

  const selectedId = selectedItemIds.length === 1 ? selectedItemIds[0] : null
  const selectedItem = selectedId ? floor.items.find((item) => item.id === selectedId) ?? null : null
  const showGizmo = transformMode !== 'select' && !!selectedItem

  return (
    <div className="relative h-full min-h-[560px] w-full bg-slate-50">
      <Canvas
        shadows={false}
        camera={cameraInit}
        gl={glOptions}
        frameloop="demand"
        onPointerMissed={handlePointerMissed}
      >
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[floor.width, floor.height * 2, floor.height]} intensity={0.45} />

        <Suspense fallback={null}>
          <Floor floor={floor} />
        </Suspense>

        {floor.items.map((item) => {
          // Placed doors render their own realistic panel and skip the generic
          // box; they also opt out of the TransformControls ref because their
          // 3D position is derived from the host wall, not the door's own (x,y).
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
          return (
            <VenueItem3DMesh
              key={item.id}
              item={item}
              ports={item.type === 'area' ? areaPorts.get(item.id) : undefined}
              selected={selectedSet.has(item.id)}
              onSelect={onSelectItems}
              registerRef={registerItemRef}
            />
          )
        })}

        <ItemLabels
          items={floor.items}
          doorPlacements={doorPlacements}
          selectedIds={selectedSet}
        />

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
      if (ports) ports[areaBest.side].push({ offset: clamped, width: DOOR_OPENING_WIDTH, doorId: door.id })

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
  selected,
  onSelect,
  registerRef,
}: {
  item: VenueItem
  ports?: AreaPorts
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
  width, depth, height, fill, edgeColor, selected, opacity, transparent, ports,
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
}) {
  const t = AREA_WALL_THICKNESS
  // For each wall, the renderable range along the wall axis:
  //   N/S walls run the full width    (-width/2 .. +width/2)
  //   W/E walls slot between N/S      (-depth/2 + t .. +depth/2 - t)
  // Doors cut openings; everything else stays solid wall.
  const nSegments = segmentWall(width, ports?.N ?? [])
  const sSegments = segmentWall(width, ports?.S ?? [])
  const wSegments = segmentWall(depth, ports?.W ?? [], { padStart: t, padEnd: t })
  const eSegments = segmentWall(depth, ports?.E ?? [], { padStart: t, padEnd: t })

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
    </>
  )
}

function segmentWall(
  length: number,
  ports: WallPort[],
  pad: { padStart?: number; padEnd?: number } = {},
): { start: number; end: number }[] {
  const padStart = pad.padStart ?? 0
  const padEnd = pad.padEnd ?? 0
  const low = -length / 2 + padStart
  const high = length / 2 - padEnd
  if (high <= low) return []

  const cuts = [...ports]
    .map((p) => ({ start: p.offset - p.width / 2, end: p.offset + p.width / 2 }))
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
// Item labels — dashed leader + floating name chip.

function ItemLabels({
  items,
  doorPlacements,
  selectedIds,
}: {
  items: VenueItem[]
  doorPlacements: Map<string, DoorPlacement>
  selectedIds: Set<string>
}) {
  return (
    <>
      {items.map((item) => {
        const placement = doorPlacements.get(item.id)
        let anchor: [number, number, number]
        if (placement) {
          // Door panel sits in area-local coords; rotate around Y into world.
          const aRad = degToRad(placement.areaRotationDeg)
          const cos = Math.cos(aRad)
          const sin = Math.sin(aRad)
          const lx = placement.panelLocal[0]
          const lz = placement.panelLocal[2]
          const wx = placement.areaCenterX + lx * cos - lz * sin
          const wz = placement.areaCenterZ + lx * sin + lz * cos
          anchor = [wx, placement.height3d, wz]
        } else {
          const yExtent = Math.max(item.height3d, 1)
          anchor = [
            item.x + item.width / 2,
            item.elevation + yExtent,
            item.y + item.height / 2,
          ]
        }
        const labelPos: [number, number, number] = [
          anchor[0],
          anchor[1] + LABEL_LEADER_HEIGHT,
          anchor[2],
        ]
        return (
          <ItemLabel
            key={`lbl-${item.id}`}
            name={item.name}
            anchor={anchor}
            labelPos={labelPos}
            selected={selectedIds.has(item.id)}
          />
        )
      })}
    </>
  )
}

function ItemLabel({
  name, anchor, labelPos, selected,
}: {
  name: string
  anchor: [number, number, number]
  labelPos: [number, number, number]
  selected: boolean
}) {
  const lineColor = selected ? SELECTION_ACCENT : '#94a3b8'
  return (
    <>
      <Line
        points={[anchor, labelPos]}
        color={lineColor}
        lineWidth={1}
        dashed
        dashSize={4}
        gapSize={3}
      />
      <Html
        position={labelPos}
        center
        // Disable wrapper pointer events so labels never block clicks on the
        // 3D meshes underneath them.
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap shadow-sm border ${
            selected
              ? 'bg-[#f4511e] text-white border-[#f4511e]'
              : 'bg-white/95 text-slate-700 border-slate-200'
          }`}
        >
          {name}
        </div>
      </Html>
    </>
  )
}
