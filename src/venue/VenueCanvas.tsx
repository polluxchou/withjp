'use client'

import { forwardRef, useMemo, useRef, useState } from 'react'
import type { ForwardedRef, PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  formatVenueMeasurement,
  snapVenueItemToAlignment,
  type VenueAlignmentGuide,
  type VenueFloor,
  type VenueItem,
  type VenueItemType,
} from './layoutData'

type Props = {
  floor: VenueFloor
  selectedItemId: string | null
  zoom: number
  showGrid: boolean
  showRulers: boolean
  onSelectItem: (itemId: string | null) => void
  onItemChange: (itemId: string, patch: Partial<VenueItem>) => void
}

type DragState = {
  itemId: string
  startPointer: { x: number; y: number }
  startItem: { x: number; y: number }
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

function VenueCanvas(
  { floor, selectedItemId, zoom, showGrid, showRulers, onSelectItem, onItemChange }: Props,
  ref: ForwardedRef<SVGSVGElement>,
) {
  const t = useTranslations('venue')
  const localSvgRef = useRef<SVGSVGElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [alignmentGuides, setAlignmentGuides] = useState<VenueAlignmentGuide[]>([])
  const [pan, setPan] = useState<PanState | null>(null)
  const itemTypeLabels = useMemo(
    () => Object.fromEntries(VENUE_ITEM_TYPE_OPTIONS.map((option) => [option.value, t(`types.${option.value}`)])),
    [t],
  ) as Record<VenueItemType, string>

  const items = useMemo(() => floor.items.map((item) => {
    if (drag?.itemId === item.id && dragPosition) return { ...item, ...dragPosition }
    return item
  }), [floor.items, drag?.itemId, dragPosition])

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
    onSelectItem(item.id)
    const startPointer = svgPoint(event)
    setDrag({
      itemId: item.id,
      startPointer,
      startItem: { x: item.x, y: item.y },
    })
    setDragPosition({ x: item.x, y: item.y })
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
    const x = Math.round(drag.startItem.x + pointer.x - drag.startPointer.x)
    const y = Math.round(drag.startItem.y + pointer.y - drag.startPointer.y)
    const item = floor.items.find((candidate) => candidate.id === drag.itemId)
    if (!item) {
      setDragPosition({ x, y })
      setAlignmentGuides([])
      return
    }
    const snapped = snapVenueItemToAlignment(item, floor.items, { x, y })
    setDragPosition({ x: snapped.x, y: snapped.y })
    setAlignmentGuides(snapped.guides)
  }

  function finishDrag() {
    if (drag && dragPosition) {
      onItemChange(drag.itemId, dragPosition)
    }
    setDrag(null)
    setDragPosition(null)
    setAlignmentGuides([])
    setPan(null)
  }

  function startPan(event: PointerEvent<SVGGElement>) {
    const scroller = scrollerRef.current
    if (!scroller) return
    event.stopPropagation()
    onSelectItem(null)
    setPan({
      startClient: { x: event.clientX, y: event.clientY },
      startScroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const viewWidth = Math.max(320, floor.width / zoom)
  const viewHeight = Math.max(240, floor.height / zoom)
  const viewX = (floor.width - viewWidth) / 2
  const viewY = (floor.height - viewHeight) / 2

  return (
    <div ref={scrollerRef} className="relative h-full min-h-[560px] overflow-auto bg-slate-200 p-4">
      <div
        className="mx-auto shadow-sm"
        style={{
          width: Math.max(760, Math.round(floor.width * zoom)),
          height: Math.max(520, Math.round(floor.height * zoom)),
        }}
      >
        <svg
          ref={setRefs}
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          className="block w-full h-full bg-white border border-slate-300"
          role="img"
          aria-label={t('canvasAria', { floor: floor.name })}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onPointerLeave={finishDrag}
          onPointerDown={() => onSelectItem(null)}
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
              selected={item.id === selectedItemId}
              showRulers={showRulers}
              zoom={zoom}
              onPointerDown={(event) => startDrag(event, item)}
            />
          ))}
          <AlignmentGuides guides={alignmentGuides} />
        </svg>
      </div>
    </div>
  )
}

export default forwardRef(VenueCanvas)

function AlignmentGuides({ guides }: { guides: VenueAlignmentGuide[] }) {
  if (guides.length === 0) return null

  return (
    <g pointerEvents="none">
      {guides.map((guide) => (
        guide.axis === 'x'
          ? <line
              key={`x-${guide.position}-${guide.start}-${guide.end}`}
              x1={guide.position}
              y1={guide.start - 24}
              x2={guide.position}
              y2={guide.end + 24}
              stroke="#db2777"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          : <line
              key={`y-${guide.position}-${guide.start}-${guide.end}`}
              x1={guide.start - 24}
              y1={guide.position}
              x2={guide.end + 24}
              y2={guide.position}
              stroke="#db2777"
              strokeWidth="2"
              strokeDasharray="8 6"
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

function VenueShape({
  item,
  label,
  selected,
  showRulers,
  zoom,
  onPointerDown,
}: {
  item: VenueItem
  label: string
  selected: boolean
  showRulers: boolean
  zoom: number
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
}) {
  const style = TYPE_STYLE[item.type]
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2

  // The canvas scales user units by zoom² on screen (rendered px = floor*zoom,
  // viewBox = floor/zoom). Counter that so labels stay a near-constant on-screen
  // size, then clamp to the box so they never overflow small objects.
  const z2 = Math.max(zoom * zoom, 1e-4)
  const PAD = 6
  const innerW = Math.max(item.width - PAD * 2, 4)
  const innerH = Math.max(item.height - PAD * 2, 4)
  const hasLabel = label.length > 0

  const nameByWidth = innerW / Math.max(estTextUnits(item.name), 1)
  const nameByHeight = hasLabel ? innerH / 2.1 : innerH * 0.85
  const nameFont = Math.max(Math.min(14 / z2, nameByWidth, nameByHeight), 1)

  const showLabel = hasLabel && innerH >= nameFont * 2
  const subByWidth = innerW / Math.max(estTextUnits(label), 1)
  const subFont = Math.max(Math.min(11 / z2, subByWidth, nameFont * 0.82), 1)

  const nameY = showLabel ? cy - subFont * 0.72 : cy
  const subY = cy + nameFont * 0.72

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
        rx="6"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="2"
        strokeDasharray={style.dash}
      />
      {showRulers && <DimensionRulers item={item} />}
      <text
        x={cx}
        y={nameY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#0f172a"
        fontSize={nameFont}
        fontWeight="700"
        pointerEvents="none"
      >
        {item.name}
      </text>
      {showLabel && <text
        x={cx}
        y={subY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#475569"
        fontSize={subFont}
        pointerEvents="none"
      >
        {label}
      </text>}
      {selected && (
        <>
          <rect
            x={item.x - 5}
            y={item.y - 5}
            width={item.width + 10}
            height={item.height + 10}
            rx="8"
            fill="none"
            stroke="#0f172a"
            strokeWidth="2"
            strokeDasharray="8 5"
            pointerEvents="none"
          />
          <circle cx={item.x + item.width + 14} cy={cy} r="8" fill="#fff" stroke="#0f172a" strokeWidth="2" pointerEvents="none" />
          <circle cx={item.x + item.width + 14} cy={item.y - 14} r="6" fill="#0f172a" pointerEvents="none" />
        </>
      )}
    </g>
  )
}

function DimensionRulers({ item }: { item: VenueItem }) {
  const right = item.x + item.width
  const bottom = item.y + item.height
  const xLabel = item.x + item.width / 2
  const yLabel = item.y + item.height / 2
  const horizontalY = item.y - 14
  const verticalX = right + 14

  return (
    <g pointerEvents="none" stroke="#64748b" fill="#334155" fontSize="12" fontWeight="700">
      <line x1={item.x} y1={horizontalY} x2={right} y2={horizontalY} strokeWidth="1.5" />
      <line x1={item.x} y1={horizontalY - 5} x2={item.x} y2={horizontalY + 5} strokeWidth="1.5" />
      <line x1={right} y1={horizontalY - 5} x2={right} y2={horizontalY + 5} strokeWidth="1.5" />
      <text
        x={xLabel}
        y={horizontalY - 7}
        textAnchor="middle"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth="4"
        strokeLinejoin="round"
      >
        {formatVenueMeasurement(item.width)}
      </text>

      <line x1={verticalX} y1={item.y} x2={verticalX} y2={bottom} strokeWidth="1.5" />
      <line x1={verticalX - 5} y1={item.y} x2={verticalX + 5} y2={item.y} strokeWidth="1.5" />
      <line x1={verticalX - 5} y1={bottom} x2={verticalX + 5} y2={bottom} strokeWidth="1.5" />
      <text
        x={verticalX + 9}
        y={yLabel}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(90 ${verticalX + 9} ${yLabel})`}
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth="4"
        strokeLinejoin="round"
      >
        {formatVenueMeasurement(item.height)}
      </text>
    </g>
  )
}
