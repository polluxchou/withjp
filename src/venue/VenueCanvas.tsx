'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { ForwardedRef, PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  calculateVenueCanvasFit,
  formatVenueArea,
  formatVenueMeasurement,
  isVenueMarkerType,
  snapVenueItemToAlignment,
  totalVenueAreaSquareMeters,
  venueAreaSquareMeters,
  type VenueAlignmentGuide,
  type VenueFloor,
  type VenueItem,
  type VenueItemType,
} from './layoutData'

type Props = {
  floor: VenueFloor
  selectedItemIds: string[]
  zoom: number
  showGrid: boolean
  showRulers: boolean
  onSelectItems: (itemIds: string[]) => void
  onItemChange: (itemId: string, patch: Partial<VenueItem>) => void
  onItemsMove: (itemIds: string[], delta: { x: number; y: number }) => void
  // Right-side px to treat as unavailable when fitting, so collapsing/expanding
  // the inspector never rescales the canvas (fit stays as if it were expanded).
  fitWidthReserve?: number
  // Item types to render; when omitted all types show.
  visibleTypes?: VenueItemType[]
  // Resolves the display name per item (locale译名); falls back to item.name.
  itemName?: (item: VenueItem) => string
  // Lets the page read/write the scroll container (for view bookmarks).
  scrollRef?: { current: HTMLDivElement | null }
  // When true (default), dragging snaps item edges/centers to neighbors.
  snapEnabled?: boolean
}

type DragState = {
  activeItemId: string
  itemIds: string[]
  startPointer: { x: number; y: number }
  startItems: { id: string; x: number; y: number }[]
}

type PanState = {
  startClient: { x: number; y: number }
  startScroll: { left: number; top: number }
}

const TYPE_STYLE: Record<VenueItemType, { fill: string; stroke: string; dash?: string }> = {
  equipment:    { fill: '#dbeafe', stroke: '#2563eb' },
  renovation:   { fill: '#dcfce7', stroke: '#16a34a' },
  area:         { fill: '#ede9fe', stroke: '#7c3aed' },
  corridor:     { fill: '#fef3c7', stroke: '#d97706', dash: '10 7' },
  window:       { fill: '#cffafe', stroke: '#0891b2' },
  door_inward:  { fill: '#dbeafe', stroke: '#2563eb' },
  door_outward: { fill: '#e0e7ff', stroke: '#4f46e5' },
  door_sliding: { fill: '#cffafe', stroke: '#0891b2' },
  fire:         { fill: '#fee2e2', stroke: '#dc2626' },
  power:        { fill: '#fef3c7', stroke: '#d97706' },
  network:      { fill: '#ede9fe', stroke: '#7c3aed' },
}

// Inner padding of the centering wrapper (p-4 = 16px each side) plus a little
// breathing room, subtracted when fitting the floor to the viewport.
const VIEWPORT_PADDING = 40

// Dim layer drawn between the selected item (on top) and everything else.
// Kept light so the layers underneath stay clearly visible.
const SELECTION_SCRIM_FILL = '#0f172a'
const SELECTION_SCRIM_OPACITY = 0.18

// Emphasis colour for the selected item (border + selection chrome).
const SELECTION_ACCENT = '#f4511e'

function VenueCanvas(
  { floor, selectedItemIds, zoom, showGrid, showRulers, onSelectItems, onItemChange, onItemsMove, fitWidthReserve = 0, visibleTypes, itemName, scrollRef, snapEnabled = true }: Props,
  ref: ForwardedRef<SVGSVGElement>,
) {
  const t = useTranslations('venue')
  const localSvgRef = useRef<SVGSVGElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [alignmentGuides, setAlignmentGuides] = useState<VenueAlignmentGuide[]>([])
  const [pan, setPan] = useState<PanState | null>(null)
  const [marquee, setMarquee] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const itemTypeLabels = useMemo(
    () => Object.fromEntries(VENUE_ITEM_TYPE_OPTIONS.map((option) => [option.value, t(`types.${option.value}`)])),
    [t],
  ) as Record<VenueItemType, string>
  const markerGlyphs = useMemo(
    () => Object.fromEntries(VENUE_ITEM_TYPE_OPTIONS
      .filter((option) => isVenueMarkerType(option.value))
      .map((option) => [option.value, t(`markerShort.${option.value}`)])),
    [t],
  ) as Record<VenueItemType, string>

  // Track the visible canvas area so "100%" can mean "the whole floor fits".
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const items = useMemo(() => {
    const typeFilter = visibleTypes ? new Set(visibleTypes) : null
    return floor.items
      .filter((item) => !typeFilter || typeFilter.has(item.type))
      .map((item) => {
        const position = dragPositions[item.id]
        if (position) return { ...item, ...position }
        return item
      })
  }, [floor.items, dragPositions, visibleTypes])

  function setRefs(node: SVGSVGElement | null) {
    localSvgRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  function svgPoint(event: PointerEvent<SVGSVGElement | SVGGElement>) {
    const svg = localSvgRef.current
    if (!svg) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }

  function startDrag(event: PointerEvent<SVGGElement>, item: VenueItem) {
    event.stopPropagation()
    const modifier = event.metaKey || event.ctrlKey
    if (modifier) {
      onSelectItems(
        selectedItemIds.includes(item.id)
          ? selectedItemIds.filter((selectedId) => selectedId !== item.id)
          : [...selectedItemIds, item.id],
      )
      return
    }

    const itemIds = selectedItemIds.includes(item.id) ? selectedItemIds : [item.id]
    onSelectItems(itemIds)
    const startPointer = svgPoint(event)
    const startItems = floor.items
      .filter((candidate) => itemIds.includes(candidate.id))
      .map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y }))
    setDrag({
      activeItemId: item.id,
      itemIds,
      startPointer,
      startItems,
    })
    setDragPositions(Object.fromEntries(startItems.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (pan) {
      const scroller = scrollerRef.current
      if (!scroller) return
      scroller.scrollLeft = pan.startScroll.left - (event.clientX - pan.startClient.x)
      scroller.scrollTop = pan.startScroll.top - (event.clientY - pan.startClient.y)
      return
    }
    if (marquee) {
      setMarquee((m) => m ? { ...m, current: svgPoint(event) } : null)
      return
    }
    if (!drag) return
    const pointer = svgPoint(event)
    const activeStart = drag.startItems.find((candidate) => candidate.id === drag.activeItemId)
    const activeItem = floor.items.find((candidate) => candidate.id === drag.activeItemId)
    if (!activeStart || !activeItem) {
      setAlignmentGuides([])
      return
    }
    const x = Math.round(activeStart.x + pointer.x - drag.startPointer.x)
    const y = Math.round(activeStart.y + pointer.y - drag.startPointer.y)
    const snapTargets = floor.items.filter((candidate) => !drag.itemIds.includes(candidate.id) || candidate.id === drag.activeItemId)
    const snapped = snapEnabled
      ? snapVenueItemToAlignment(activeItem, snapTargets, { x, y })
      : { x, y, guides: [] }
    const delta = { x: snapped.x - activeStart.x, y: snapped.y - activeStart.y }
    setDragPositions(Object.fromEntries(
      drag.startItems.map((candidate) => [
        candidate.id,
        { x: candidate.x + delta.x, y: candidate.y + delta.y },
      ]),
    ))
    setAlignmentGuides(snapped.guides)
  }

  function finishDrag() {
    if (drag) {
      const activeStart = drag.startItems.find((candidate) => candidate.id === drag.activeItemId)
      const activePosition = activeStart ? dragPositions[drag.activeItemId] : null
      if (activeStart && activePosition) {
        const delta = { x: activePosition.x - activeStart.x, y: activePosition.y - activeStart.y }
        if (drag.itemIds.length === 1) {
          onItemChange(drag.activeItemId, activePosition)
        } else {
          onItemsMove(drag.itemIds, delta)
        }
      }
    }
    if (marquee) {
      const rx = Math.min(marquee.start.x, marquee.current.x)
      const ry = Math.min(marquee.start.y, marquee.current.y)
      const rw = Math.abs(marquee.current.x - marquee.start.x)
      const rh = Math.abs(marquee.current.y - marquee.start.y)
      if (rw > 2 || rh > 2) {
        const hit = floor.items
          .filter((item) => item.x < rx + rw && item.x + item.width > rx && item.y < ry + rh && item.y + item.height > ry)
          .map((item) => item.id)
        onSelectItems(hit)
      } else {
        // Treat tiny drag as a click — deselect all
        onSelectItems([])
      }
      setMarquee(null)
    }
    setDrag(null)
    setDragPositions({})
    setAlignmentGuides([])
    setPan(null)
  }

  function startPan(event: PointerEvent<SVGGElement>) {
    event.stopPropagation()
    if (event.button === 1) {
      // Middle-click → pan
      const scroller = scrollerRef.current
      if (!scroller) return
      onSelectItems([])
      setPan({
        startClient: { x: event.clientX, y: event.clientY },
        startScroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
      })
    } else {
      // Left-click → marquee selection
      const pt = svgPoint(event)
      setMarquee({ start: pt, current: pt })
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  // Linear screen scale: at zoom=1 the floor exactly fits the viewport ("100%"),
  // and zoom multiplies from there. `scale` is on-screen px per floor unit, so any
  // overlay that should stay a constant on-screen size is sized as `px / scale`.
  const fit = calculateVenueCanvasFit({
    floorWidth: floor.width,
    floorHeight: floor.height,
    viewportWidth: Math.max(viewport.width - fitWidthReserve, 1),
    viewportHeight: viewport.height,
    zoom,
    padding: VIEWPORT_PADDING,
  })
  const { scale } = fit

  // Plan dimension rulers per shape:
  //  - dedupe: stacked shapes sharing a horizontal span (same x+width) draw the
  //    width ruler once (topmost); same-vertical-span shapes draw height once
  //    (rightmost).
  //  - placement: keep the default side (width above, height right) unless a
  //    neighbour occupies it — then push the ruler to the free opposite side
  //    (width below, height left) so it sits outside the components.
  //  - if both sides are blocked, keep the default side but dash the ruler to
  //    show it's overlaying a component.
  // Rotated shapes keep simple defaults (their spans aren't axis-aligned).
  const rulerPlan = useMemo(() => {
    const reach = 34 / scale
    const axis = items.filter((item) => !isVenueMarkerType(item.type) && item.rotation === 0)
    const occupied = (selfId: string, x: number, y: number, w: number, h: number) =>
      axis.some((o) => o.id !== selfId
        && o.x < x + w && o.x + o.width > x
        && o.y < y + h && o.y + o.height > y)

    const widthOwner = new Map<string, { id: string; y: number }>()
    const heightOwner = new Map<string, { id: string; right: number }>()
    for (const item of axis) {
      const wKey = `${item.x}|${item.width}`
      const wPrev = widthOwner.get(wKey)
      if (!wPrev || item.y < wPrev.y) widthOwner.set(wKey, { id: item.id, y: item.y })
      const hKey = `${item.y}|${item.height}`
      const hPrev = heightOwner.get(hKey)
      const right = item.x + item.width
      if (!hPrev || right > hPrev.right) heightOwner.set(hKey, { id: item.id, right })
    }

    const plan = new Map<string, RulerPlan>()
    for (const item of items) {
      if (isVenueMarkerType(item.type)) continue
      if (item.rotation !== 0) {
        plan.set(item.id, { showWidth: true, widthSide: 'top', widthDashed: false, showHeight: true, heightSide: 'right', heightDashed: false })
        continue
      }
      const right = item.x + item.width
      const bottom = item.y + item.height

      let widthSide: 'top' | 'bottom' = 'top'
      let widthDashed = false
      if (occupied(item.id, item.x, item.y - reach, item.width, reach)) {
        if (!occupied(item.id, item.x, bottom, item.width, reach)) widthSide = 'bottom'
        else widthDashed = true
      }

      let heightSide: 'right' | 'left' = 'right'
      let heightDashed = false
      if (occupied(item.id, right, item.y, reach, item.height)) {
        if (!occupied(item.id, item.x - reach, item.y, reach, item.height)) heightSide = 'left'
        else heightDashed = true
      }

      plan.set(item.id, {
        showWidth: widthOwner.get(`${item.x}|${item.width}`)?.id === item.id,
        widthSide,
        widthDashed,
        showHeight: heightOwner.get(`${item.y}|${item.height}`)?.id === item.id,
        heightSide,
        heightDashed,
      })
    }

    // Merge overlapping ruler labels into "xxx | yyy".
    // Threshold: half a font-height in world units — texts closer than this will visually collide.
    const labelThreshold = (11 / scale) * 1.2
    const axisById = new Map(axis.map((it) => [it.id, it]))

    // Height rulers: text sits at y-midpoint of item; merge when midpoints too close on same side.
    const heightEntries = Array.from(plan.entries()).filter(([, p]) => p.showHeight)
    for (let i = 0; i < heightEntries.length; i++) {
      const [idA, pA] = heightEntries[i]
      const itA = axisById.get(idA)
      if (!itA) continue
      const yMidA = itA.y + itA.height / 2
      for (let j = i + 1; j < heightEntries.length; j++) {
        const [idB, pB] = heightEntries[j]
        if (pA.heightSide !== pB.heightSide) continue
        const itB = axisById.get(idB)
        if (!itB) continue
        if (Math.abs((itB.y + itB.height / 2) - yMidA) < labelThreshold) {
          const merged = `${formatVenueMeasurement(itA.height)} | ${formatVenueMeasurement(itB.height)}`
          plan.set(idA, { ...pA, heightLabel: merged })
          plan.set(idB, { ...pB, showHeight: false })
          break
        }
      }
    }

    // Width rulers: text sits at x-midpoint of item; merge when midpoints too close on same side.
    const widthEntries = Array.from(plan.entries()).filter(([, p]) => p.showWidth)
    for (let i = 0; i < widthEntries.length; i++) {
      const [idA, pA] = widthEntries[i]
      const itA = axisById.get(idA)
      if (!itA) continue
      const xMidA = itA.x + itA.width / 2
      const yA = pA.widthSide === 'bottom' ? itA.y + itA.height : itA.y
      for (let j = i + 1; j < widthEntries.length; j++) {
        const [idB, pB] = widthEntries[j]
        if (pA.widthSide !== pB.widthSide) continue
        const itB = axisById.get(idB)
        if (!itB) continue
        const yB = pB.widthSide === 'bottom' ? itB.y + itB.height : itB.y
        if (Math.abs((itB.x + itB.width / 2) - xMidA) < labelThreshold && Math.abs(yB - yA) < labelThreshold) {
          const merged = `${formatVenueMeasurement(itA.width)} | ${formatVenueMeasurement(itB.width)}`
          plan.set(idA, { ...pA, widthLabel: merged })
          plan.set(idB, { ...pB, showWidth: false })
          break
        }
      }
    }

    return plan
  }, [items, scale])

  const defaultRulerPlan: RulerPlan = { showWidth: true, widthSide: 'top', widthDashed: false, showHeight: true, heightSide: 'right', heightDashed: false }

  // Spotlight selection: dim everything except the selected layer(s), which render
  // on top with their area + share of the total space footprint.
  const selectedSet = new Set(selectedItemIds)
  const unselectedItems = items.filter((item) => !selectedSet.has(item.id))
  const selectedItems = items.filter((item) => selectedSet.has(item.id))
  const totalAreaSqMeters = totalVenueAreaSquareMeters(floor.items)
  const selectionMetrics = (item: VenueItem) => {
    // Only 空间 is area-accounted — markers, 设备/区域/结构 get no on-canvas metric.
    if (item.type !== 'area') return undefined
    const areaSqMeters = venueAreaSquareMeters(item)
    const share = item.type === 'area' && totalAreaSqMeters > 0
      ? ` · ${((areaSqMeters / totalAreaSqMeters) * 100).toFixed(1)}%`
      : ''
    return `${formatVenueArea(areaSqMeters)}${share}`
  }

  return (
    <div
      ref={(node) => {
        scrollerRef.current = node
        if (scrollRef) scrollRef.current = node
      }}
      className="relative h-full min-h-[560px] overflow-auto bg-slate-200"
    >
      <div className="grid min-h-full min-w-full place-items-center p-4">
        <div className="shadow-sm" style={{ width: fit.width, height: fit.height }}>
          <svg
            ref={setRefs}
            viewBox={`0 0 ${floor.width} ${floor.height}`}
            width={fit.width}
            height={fit.height}
            className="block bg-white border border-slate-300"
            role="img"
            aria-label={t('canvasAria', { floor: floor.name })}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onPointerLeave={() => { setDrag(null); setDragPositions({}); setAlignmentGuides([]); setPan(null) }}
            onPointerDown={() => onSelectItems([])}
          >
            <defs>
              <pattern id="venue-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
              <pattern id="venue-grid-major" width="120" height="120" patternUnits="userSpaceOnUse">
                <rect width="120" height="120" fill="url(#venue-grid)" />
                <path d="M 120 0 L 0 0 0 120" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
              </pattern>
            </defs>

            <g onPointerDown={startPan} className={pan ? 'cursor-grabbing' : marquee ? 'cursor-crosshair' : 'cursor-crosshair'}>
              <rect x="0" y="0" width={floor.width} height={floor.height} fill="#fff" />
              {showGrid && <rect x="0" y="0" width={floor.width} height={floor.height} fill="url(#venue-grid-major)" />}
              {floor.backgroundImage && (
                <image
                  href={floor.backgroundImage}
                  x="0"
                  y="0"
                  width={floor.width}
                  height={floor.height}
                  preserveAspectRatio="xMidYMid meet"
                  opacity="0.42"
                />
              )}
            </g>

            {unselectedItems.map((item) => isVenueMarkerType(item.type) ? (
              <VenueMarker
                key={item.id}
                item={item}
                glyph={markerGlyphs[item.type]}
                label={itemTypeLabels[item.type]}
                selected={false}
                scale={scale}
                onPointerDown={(event) => startDrag(event, item)}
              />
            ) : (
              <VenueShape
                key={item.id}
                item={item}
                label={itemTypeLabels[item.type]}
                itemName={itemName}
                selected={false}
                showRulers={showRulers}
                ruler={rulerPlan.get(item.id) ?? defaultRulerPlan}
                scale={scale}
                onPointerDown={(event) => startDrag(event, item)}
              />
            ))}
            {unselectedItems.filter((item) => !isVenueMarkerType(item.type)).map((item) => (
              <VenueCallout
                key={`callout-${item.id}`}
                item={item}
                label={itemTypeLabels[item.type]}
                itemName={itemName}
                scale={scale}
                floorWidth={floor.width}
              />
            ))}
            {selectedItems.length > 0 && (
              <rect
                x="0"
                y="0"
                width={floor.width}
                height={floor.height}
                fill={SELECTION_SCRIM_FILL}
                opacity={SELECTION_SCRIM_OPACITY}
                pointerEvents="none"
              />
            )}
            {selectedItems.map((item) => isVenueMarkerType(item.type) ? (
              <VenueMarker
                key={item.id}
                item={item}
                glyph={markerGlyphs[item.type]}
                label={itemTypeLabels[item.type]}
                selected
                scale={scale}
                onPointerDown={(event) => startDrag(event, item)}
              />
            ) : (
              <VenueShape
                key={item.id}
                item={item}
                label={itemTypeLabels[item.type]}
                itemName={itemName}
                selected
                showRulers={showRulers}
                ruler={rulerPlan.get(item.id) ?? defaultRulerPlan}
                scale={scale}
                metricsText={selectionMetrics(item)}
                onPointerDown={(event) => startDrag(event, item)}
              />
            ))}
            {selectedItems.filter((item) => !isVenueMarkerType(item.type)).map((item) => (
              <VenueCallout
                key={`callout-${item.id}`}
                item={item}
                label={itemTypeLabels[item.type]}
                itemName={itemName}
                scale={scale}
                floorWidth={floor.width}
              />
            ))}
            <AlignmentGuides guides={alignmentGuides} scale={scale} />
            {marquee && (() => {
              const rx = Math.min(marquee.start.x, marquee.current.x)
              const ry = Math.min(marquee.start.y, marquee.current.y)
              const rw = Math.abs(marquee.current.x - marquee.start.x)
              const rh = Math.abs(marquee.current.y - marquee.start.y)
              return (
                <rect
                  x={rx} y={ry} width={rw} height={rh}
                  fill="rgba(99,102,241,0.08)"
                  stroke="#6366f1"
                  strokeWidth={1.5 / scale}
                  strokeDasharray={`${6 / scale} ${4 / scale}`}
                  pointerEvents="none"
                />
              )
            })()}
          </svg>
        </div>
      </div>
    </div>
  )
}

export default forwardRef(VenueCanvas)

function AlignmentGuides({ guides, scale }: { guides: VenueAlignmentGuide[]; scale: number }) {
  if (guides.length === 0) return null
  const overshoot = 24 / scale
  const width = 2 / scale
  const dash = `${8 / scale} ${6 / scale}`

  return (
    <g pointerEvents="none">
      {guides.map((guide) => (
        guide.axis === 'x'
          ? <line
              key={`x-${guide.position}-${guide.start}-${guide.end}`}
              x1={guide.position}
              y1={guide.start - overshoot}
              x2={guide.position}
              y2={guide.end + overshoot}
              stroke="#db2777"
              strokeWidth={width}
              strokeDasharray={dash}
            />
          : <line
              key={`y-${guide.position}-${guide.start}-${guide.end}`}
              x1={guide.start - overshoot}
              y1={guide.position}
              x2={guide.end + overshoot}
              y2={guide.position}
              stroke="#db2777"
              strokeWidth={width}
              strokeDasharray={dash}
            />
      ))}
    </g>
  )
}

// CJK / full-width glyphs render ~1 em wide, latin ~0.6 em. Used to estimate
// label width so it can be clamped to the object box.
function estTextUnits(text: string): number {
  let units = 0
  for (const ch of text) {
    units += /[⺀-〿　-鿿＀-￯]/.test(ch) ? 1 : 0.6
  }
  return units
}

type LabelLayout = {
  mode: 'inside' | 'callout'
  cx: number
  cy: number
  nameFont: number
  subFont: number
  showSub: boolean
  nameY: number
  subY: number
}

// Decide how an object's label is drawn. Fonts are expressed in floor units but
// targeted at a constant on-screen size (target px / scale), then clamped to the
// box. If the name can't reach a readable on-screen size inside the box, the
// caller draws an external leader-line callout instead.
function computeLabelLayout(item: VenueItem, label: string, scale: number, displayName: string): LabelLayout {
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  const padU = 4 / scale
  const innerW = Math.max(item.width - padU * 2, 1)
  const innerH = Math.max(item.height - padU * 2, 1)
  const hasLabel = label.length > 0

  const nameByWidth = innerW / Math.max(estTextUnits(displayName), 1)
  const nameByHeight = hasLabel ? innerH / 2.1 : innerH * 0.85
  const nameFont = Math.min(14 / scale, nameByWidth, nameByHeight)

  const mode: 'inside' | 'callout' = nameFont * scale >= 9 ? 'inside' : 'callout'

  const subFont = Math.min(11 / scale, innerW / Math.max(estTextUnits(label), 1), nameFont * 0.82)
  const showSub = hasLabel && innerH >= nameFont * 2 && subFont * scale >= 8
  const nameY = showSub ? cy - subFont * 0.72 : cy
  const subY = cy + nameFont * 0.72

  return { mode, cx, cy, nameFont, subFont, showSub, nameY, subY }
}

function VenueShape({
  item,
  label,
  itemName,
  selected,
  showRulers,
  ruler,
  scale,
  metricsText,
  onPointerDown,
}: {
  item: VenueItem
  label: string
  itemName?: (item: VenueItem) => string
  selected: boolean
  showRulers: boolean
  ruler: RulerPlan
  scale: number
  metricsText?: string
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
}) {
  const displayName = itemName ? itemName(item) : item.name
  const style = TYPE_STYLE[item.type]
  const layout = computeLabelLayout(item, label, scale, displayName)
  const { cx, cy } = layout
  const stroke = 2 / scale
  // Box border + selection dashes at 2/3 the handle stroke for a lighter outline.
  const borderStroke = (4 / 3) / scale

  return (
    <g
      transform={`rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={onPointerDown}
      className="cursor-move"
    >
      <rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rx={0}
        fill={style.fill}
        stroke={selected ? SELECTION_ACCENT : style.stroke}
        strokeWidth={borderStroke}
        strokeDasharray={style.dash ? `${10 / scale} ${7 / scale}` : undefined}
      />
      {showRulers && <DimensionRulers item={item} scale={scale} plan={ruler} />}
      {layout.mode === 'inside' && (
        <>
          <text
            x={cx}
            y={layout.nameY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#0f172a"
            fontSize={layout.nameFont}
            fontWeight="700"
            pointerEvents="none"
          >
            {displayName}
          </text>
          {layout.showSub && (
            <text
              x={cx}
              y={layout.subY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#475569"
              fontSize={layout.subFont}
              pointerEvents="none"
            >
              {label}
            </text>
          )}
        </>
      )}
      {selected && (
        // Tagged so PNG export can strip the on-screen selection chrome before
        // rasterizing — see exportPng() in the guild-venue page.
        <g data-venue-selection="true">
          <rect
            x={item.x - 5 / scale}
            y={item.y - 5 / scale}
            width={item.width + 10 / scale}
            height={item.height + 10 / scale}
            rx={0}
            fill="none"
            stroke={SELECTION_ACCENT}
            strokeWidth={borderStroke}
            strokeDasharray={`${8 / scale} ${5 / scale}`}
            pointerEvents="none"
          />
          <circle cx={item.x + item.width + 14 / scale} cy={cy} r={8 / scale} fill="#fff" stroke={SELECTION_ACCENT} strokeWidth={stroke} pointerEvents="none" />
          <circle cx={item.x + item.width + 14 / scale} cy={item.y - 14 / scale} r={6 / scale} fill={SELECTION_ACCENT} pointerEvents="none" />
          {metricsText && (
            <text
              x={cx}
              y={item.y + item.height + 15 / scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11.5 / scale}
              fontWeight="700"
              fill="#0f172a"
              paintOrder="stroke"
              stroke="#fff"
              strokeWidth={4 / scale}
              strokeLinejoin="round"
              pointerEvents="none"
            >
              {metricsText}
            </text>
          )}
        </g>
      )}
    </g>
  )
}

// Point marker (door, fire point, power, network…) — a fixed-size badge with a
// short glyph and a name label. Does not occupy area and is not resizable.
function VenueMarker({
  item,
  glyph,
  label,
  selected,
  scale,
  onPointerDown,
}: {
  item: VenueItem
  glyph: string
  label: string
  selected: boolean
  scale: number
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
}) {
  const style = TYPE_STYLE[item.type]
  const accent = selected ? SELECTION_ACCENT : style.stroke
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  const halo = 3.5 / scale
  const isDoor = item.type === 'door_inward' || item.type === 'door_outward' || item.type === 'door_sliding'
  const badgeR = 11 / scale
  // Doors draw to their real footprint (item.width in floor units, scaled with
  // the canvas); point markers stay a fixed on-screen badge.
  const doorSpan = item.width
  const halfExtent = isDoor ? doorSpan / 2 : badgeR
  const vertExtent = isDoor ? doorSpan : badgeR
  const labelX = cx + halfExtent + 5 / scale
  const labelWidth = Math.max(estTextUnits(label), 1) * (11 / scale)
  // Transparent hit area: the symbol is drawn with thin/pointer-none strokes, so
  // without this there's almost nothing to click. Covers the symbol and its label.
  const hitX = cx - halfExtent - 4 / scale
  const hitWidth = labelX + labelWidth + 4 / scale - hitX
  const hitHalf = vertExtent + 4 / scale

  return (
    <g
      transform={`rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={onPointerDown}
      className="cursor-move"
    >
      <rect
        x={hitX}
        y={cy - hitHalf}
        width={hitWidth}
        height={hitHalf * 2}
        fill="transparent"
      />
      {selected && (
        <circle
          cx={cx}
          cy={cy}
          r={vertExtent + 5 / scale}
          fill="none"
          stroke={SELECTION_ACCENT}
          strokeWidth={(4 / 3) / scale}
          strokeDasharray={`${6 / scale} ${4 / scale}`}
          pointerEvents="none"
        />
      )}
      {isDoor ? (
        <DoorSymbol type={item.type} cx={cx} cy={cy} span={doorSpan} color={accent} scale={scale} />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={11 / scale} fill={style.fill} stroke={accent} strokeWidth={1.5 / scale} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11 / scale}
            fontWeight="700"
            fill={accent}
            pointerEvents="none"
          >
            {glyph}
          </text>
        </>
      )}
      <text
        x={labelX}
        y={cy}
        textAnchor="start"
        dominantBaseline="central"
        fontSize={11 / scale}
        fontWeight="600"
        fill="#0f172a"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth={halo}
        strokeLinejoin="round"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  )
}

// Architectural door glyphs: a hinged leaf with a quarter-circle swing arc for
// inward/outward doors (mirrored vertically), and offset panels for a slider.
function DoorSymbol({
  type,
  cx,
  cy,
  span,
  color,
  scale,
}: {
  type: VenueItemType
  cx: number
  cy: number
  span: number
  color: string
  scale: number
}) {
  const leafW = 2 / scale
  const thinW = 1.25 / scale
  const hx = cx - span / 2
  const jx = cx + span / 2

  if (type === 'door_sliding') {
    // Two overlapping panels (one shifted up-left, one shifted down-right) read
    // as the two leaves of a sliding door passing each other.
    const len = span * 0.62
    const depth = span * 0.14
    return (
      <g pointerEvents="none" stroke={color} fill="none" strokeLinejoin="round">
        <line x1={hx} y1={cy} x2={jx} y2={cy} strokeWidth={thinW} opacity={0.35} />
        <rect x={hx} y={cy - depth} width={len} height={depth} strokeWidth={leafW} />
        <rect x={jx - len} y={cy} width={len} height={depth} strokeWidth={leafW} />
      </g>
    )
  }

  const ly = type === 'door_inward' ? cy - span : cy + span
  const sweep = type === 'door_inward' ? 1 : 0
  return (
    <g pointerEvents="none" stroke={color} fill="none" strokeLinecap="round">
      <line x1={hx} y1={cy} x2={jx} y2={cy} strokeWidth={thinW} opacity={0.4} />
      <line x1={hx} y1={cy} x2={hx} y2={ly} strokeWidth={leafW} />
      <path d={`M ${hx} ${ly} A ${span} ${span} 0 0 ${sweep} ${jx} ${cy}`} strokeWidth={thinW} />
    </g>
  )
}

// Leader-line label for objects too small to hold text inside. Drawn outside the
// rotation transform so the callout text always reads horizontally, and anchored
// at the object's center (rotation-invariant) so it tracks rotated boxes too.
function VenueCallout({
  item,
  label,
  itemName,
  scale,
  floorWidth,
}: {
  item: VenueItem
  label: string
  itemName?: (item: VenueItem) => string
  scale: number
  floorWidth: number
}) {
  const displayName = itemName ? itemName(item) : item.name
  const layout = computeLabelLayout(item, label, scale, displayName)
  if (layout.mode !== 'callout') return null

  const { cx, cy } = layout
  // Name only — the colored box already conveys type, so a second "设备" line
  // here only adds clutter in dense clusters.
  const nameFont = 11.5 / scale
  const halo = 3.5 / scale

  // Steer the callout toward the side with more room and keep the leader
  // horizontal so stacked objects' labels separate by their own spacing
  // instead of converging diagonally onto neighbouring area names.
  const toLeft = cx > floorWidth * 0.6
  const dir = toLeft ? -1 : 1
  const anchorX = toLeft ? item.x : item.x + item.width
  const lineX = anchorX + dir * (16 / scale)
  const textX = lineX + dir * (4 / scale)
  const textAnchor = toLeft ? 'end' : 'start'

  return (
    <g pointerEvents="none">
      <line x1={anchorX} y1={cy} x2={lineX} y2={cy} stroke="#94a3b8" strokeWidth={1.25 / scale} />
      <circle cx={anchorX} cy={cy} r={2.5 / scale} fill="#64748b" />
      <text
        x={textX}
        y={cy}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fontSize={nameFont}
        fontWeight="700"
        fill="#0f172a"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth={halo}
        strokeLinejoin="round"
      >
        {displayName}
      </text>
    </g>
  )
}

type RulerPlan = {
  showWidth: boolean
  widthSide: 'top' | 'bottom'
  widthDashed: boolean
  widthLabel?: string
  showHeight: boolean
  heightSide: 'right' | 'left'
  heightDashed: boolean
  heightLabel?: string
}

function DimensionRulers({
  item,
  scale,
  plan,
}: {
  item: VenueItem
  scale: number
  plan: RulerPlan
}) {
  const right = item.x + item.width
  const bottom = item.y + item.height
  const xLabel = item.x + item.width / 2
  const yLabel = item.y + item.height / 2
  const offset = 14 / scale
  const tick = 5 / scale
  const lineW = 1.5 / scale
  const halo = 3.5 / scale
  const textGap = 7 / scale
  const dash = `${6 / scale} ${4 / scale}`

  // Width ruler: above by default, flipped below when that side is occupied.
  const horizontalY = plan.widthSide === 'bottom' ? bottom + offset : item.y - offset
  const widthTextY = plan.widthSide === 'bottom' ? horizontalY + textGap : horizontalY - textGap
  const widthBaseline = plan.widthSide === 'bottom' ? 'hanging' : 'auto'

  // Height ruler: right by default, flipped left when that side is occupied.
  const verticalX = plan.heightSide === 'left' ? item.x - offset : right + offset
  const vTextX = plan.heightSide === 'left' ? verticalX - textGap - 2 / scale : verticalX + textGap + 2 / scale

  return (
    <g pointerEvents="none" stroke="#64748b" fill="#334155" fontSize={11 / scale} fontWeight="700">
      {plan.showWidth && (
        <>
          <line x1={item.x} y1={horizontalY} x2={right} y2={horizontalY} strokeWidth={lineW} strokeDasharray={plan.widthDashed ? dash : undefined} />
          <line x1={item.x} y1={horizontalY - tick} x2={item.x} y2={horizontalY + tick} strokeWidth={lineW} />
          <line x1={right} y1={horizontalY - tick} x2={right} y2={horizontalY + tick} strokeWidth={lineW} />
          <text
            x={xLabel}
            y={widthTextY}
            textAnchor="middle"
            dominantBaseline={widthBaseline}
            paintOrder="stroke"
            stroke="#fff"
            strokeWidth={halo}
            strokeLinejoin="round"
          >
            {plan.widthLabel ?? formatVenueMeasurement(item.width)}
          </text>
        </>
      )}

      {plan.showHeight && (
        <>
          <line x1={verticalX} y1={item.y} x2={verticalX} y2={bottom} strokeWidth={lineW} strokeDasharray={plan.heightDashed ? dash : undefined} />
          <line x1={verticalX - tick} y1={item.y} x2={verticalX + tick} y2={item.y} strokeWidth={lineW} />
          <line x1={verticalX - tick} y1={bottom} x2={verticalX + tick} y2={bottom} strokeWidth={lineW} />
          <text
            x={vTextX}
            y={yLabel}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(90 ${vTextX} ${yLabel})`}
            paintOrder="stroke"
            stroke="#fff"
            strokeWidth={halo}
            strokeLinejoin="round"
          >
            {plan.heightLabel ?? formatVenueMeasurement(item.height)}
          </text>
        </>
      )}
    </g>
  )
}
