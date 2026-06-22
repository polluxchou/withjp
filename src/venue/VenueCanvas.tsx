'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { ForwardedRef, PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  calculateVenueCanvasFit,
  formatVenueMeasurement,
  snapVenueItemToAlignment,
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
  equipment:   { fill: '#dbeafe', stroke: '#2563eb' },
  renovation:  { fill: '#dcfce7', stroke: '#16a34a' },
  area:        { fill: '#ede9fe', stroke: '#7c3aed' },
  corridor:    { fill: '#fef3c7', stroke: '#d97706', dash: '10 7' },
  workstation: { fill: '#e0f2fe', stroke: '#0284c7' },
  fire:        { fill: '#fee2e2', stroke: '#dc2626' },
  exit:        { fill: '#ffe4e6', stroke: '#e11d48' },
  safety:      { fill: '#ccfbf1', stroke: '#0f766e' },
}

// Inner padding of the centering wrapper (p-4 = 16px each side) plus a little
// breathing room, subtracted when fitting the floor to the viewport.
const VIEWPORT_PADDING = 40

function VenueCanvas(
  { floor, selectedItemIds, zoom, showGrid, showRulers, onSelectItems, onItemChange, onItemsMove }: Props,
  ref: ForwardedRef<SVGSVGElement>,
) {
  const t = useTranslations('venue')
  const localSvgRef = useRef<SVGSVGElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [alignmentGuides, setAlignmentGuides] = useState<VenueAlignmentGuide[]>([])
  const [pan, setPan] = useState<PanState | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const itemTypeLabels = useMemo(
    () => Object.fromEntries(VENUE_ITEM_TYPE_OPTIONS.map((option) => [option.value, t(`types.${option.value}`)])),
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

  const items = useMemo(() => floor.items.map((item) => {
    const position = dragPositions[item.id]
    if (position) return { ...item, ...position }
    return item
  }), [floor.items, dragPositions])

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
    const snapped = snapVenueItemToAlignment(activeItem, snapTargets, { x, y })
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
    setDrag(null)
    setDragPositions({})
    setAlignmentGuides([])
    setPan(null)
  }

  function startPan(event: PointerEvent<SVGGElement>) {
    const scroller = scrollerRef.current
    if (!scroller) return
    event.stopPropagation()
    onSelectItems([])
    setPan({
      startClient: { x: event.clientX, y: event.clientY },
      startScroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  // Linear screen scale: at zoom=1 the floor exactly fits the viewport ("100%"),
  // and zoom multiplies from there. `scale` is on-screen px per floor unit, so any
  // overlay that should stay a constant on-screen size is sized as `px / scale`.
  const fit = calculateVenueCanvasFit({
    floorWidth: floor.width,
    floorHeight: floor.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    zoom,
    padding: VIEWPORT_PADDING,
  })
  const { scale } = fit

  return (
    <div ref={scrollerRef} className="relative h-full min-h-[560px] overflow-auto bg-slate-200">
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
            onPointerLeave={finishDrag}
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

            <g onPointerDown={startPan} className={pan ? 'cursor-grabbing' : 'cursor-grab'}>
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

            {items.map((item) => (
              <VenueShape
                key={item.id}
                item={item}
                label={itemTypeLabels[item.type]}
                selected={selectedItemIds.includes(item.id)}
                showRulers={showRulers}
                scale={scale}
                onPointerDown={(event) => startDrag(event, item)}
              />
            ))}
            <AlignmentGuides guides={alignmentGuides} scale={scale} />
            {/* Callouts for objects too small to hold a label render last so they sit on top. */}
            {items.map((item) => (
              <VenueCallout
                key={`callout-${item.id}`}
                item={item}
                label={itemTypeLabels[item.type]}
                scale={scale}
                floorWidth={floor.width}
              />
            ))}
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
function computeLabelLayout(item: VenueItem, label: string, scale: number): LabelLayout {
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  const padU = 4 / scale
  const innerW = Math.max(item.width - padU * 2, 1)
  const innerH = Math.max(item.height - padU * 2, 1)
  const hasLabel = label.length > 0

  const nameByWidth = innerW / Math.max(estTextUnits(item.name), 1)
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
  selected,
  showRulers,
  scale,
  onPointerDown,
}: {
  item: VenueItem
  label: string
  selected: boolean
  showRulers: boolean
  scale: number
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
}) {
  const style = TYPE_STYLE[item.type]
  const layout = computeLabelLayout(item, label, scale)
  const { cx, cy } = layout
  const stroke = 2 / scale

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
        rx={6 / scale}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={stroke}
        strokeDasharray={style.dash ? `${10 / scale} ${7 / scale}` : undefined}
      />
      {showRulers && <DimensionRulers item={item} scale={scale} />}
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
            {item.name}
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
        <>
          <rect
            x={item.x - 5 / scale}
            y={item.y - 5 / scale}
            width={item.width + 10 / scale}
            height={item.height + 10 / scale}
            rx={8 / scale}
            fill="none"
            stroke="#0f172a"
            strokeWidth={stroke}
            strokeDasharray={`${8 / scale} ${5 / scale}`}
            pointerEvents="none"
          />
          <circle cx={item.x + item.width + 14 / scale} cy={cy} r={8 / scale} fill="#fff" stroke="#0f172a" strokeWidth={stroke} pointerEvents="none" />
          <circle cx={item.x + item.width + 14 / scale} cy={item.y - 14 / scale} r={6 / scale} fill="#0f172a" pointerEvents="none" />
        </>
      )}
    </g>
  )
}

// Leader-line label for objects too small to hold text inside. Drawn outside the
// rotation transform so the callout text always reads horizontally, and anchored
// at the object's center (rotation-invariant) so it tracks rotated boxes too.
function VenueCallout({
  item,
  label,
  scale,
  floorWidth,
}: {
  item: VenueItem
  label: string
  scale: number
  floorWidth: number
}) {
  const layout = computeLabelLayout(item, label, scale)
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
        {item.name}
      </text>
    </g>
  )
}

function DimensionRulers({ item, scale }: { item: VenueItem; scale: number }) {
  const right = item.x + item.width
  const bottom = item.y + item.height
  const xLabel = item.x + item.width / 2
  const yLabel = item.y + item.height / 2
  const offset = 14 / scale
  const tick = 5 / scale
  const lineW = 1.5 / scale
  const halo = 3.5 / scale
  const textGap = 7 / scale
  const horizontalY = item.y - offset
  const verticalX = right + offset
  const vTextX = verticalX + textGap + 2 / scale

  return (
    <g pointerEvents="none" stroke="#64748b" fill="#334155" fontSize={11 / scale} fontWeight="700">
      <line x1={item.x} y1={horizontalY} x2={right} y2={horizontalY} strokeWidth={lineW} />
      <line x1={item.x} y1={horizontalY - tick} x2={item.x} y2={horizontalY + tick} strokeWidth={lineW} />
      <line x1={right} y1={horizontalY - tick} x2={right} y2={horizontalY + tick} strokeWidth={lineW} />
      <text
        x={xLabel}
        y={horizontalY - textGap}
        textAnchor="middle"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth={halo}
        strokeLinejoin="round"
      >
        {formatVenueMeasurement(item.width)}
      </text>

      <line x1={verticalX} y1={item.y} x2={verticalX} y2={bottom} strokeWidth={lineW} />
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
        {formatVenueMeasurement(item.height)}
      </text>
    </g>
  )
}
