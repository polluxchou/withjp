'use client'

import { layoutChainLabels, type DimensionChainAxis, type DimensionChainSegment } from './dimension-chain'
import { formatVenueMeasurement } from './layoutData'

// 尺寸链专用青绿。与组件标尺的灰 #64748b、外轮廓总尺寸的红 #ef4444 是「三条标注
// 必须一眼分得开」的一套,改其中任何一个都要回头确认另外两个还认得出来。
const CHAIN_LINE = '#0d9488'
const CHAIN_TEXT = '#0f766e'
const CHAIN_GAP_TEXT = '#5eead4'

// 链线离组件近边的距离。组件标尺在 14/scale、外轮廓总尺寸在 80/scale,
// 这里取 50/scale 夹在中间,三层由内到外互不打架。
const CHAIN_OFFSET = 50

export default function DimensionChain({
  segments,
  axis,
  anchor,
  scale,
}: {
  segments: DimensionChainSegment[]
  axis: DimensionChainAxis
  anchor: number
  scale: number
}) {
  if (segments.length === 0) return null

  const horizontal = axis === 'horizontal'
  const fontSize = 11 / scale
  const baseline = anchor - CHAIN_OFFSET / scale
  const tick = 6 / scale
  const lineW = 1.6 / scale
  const halo = 3.5 / scale
  const textGap = 6 / scale
  const rowGap = 15 / scale
  const dash = `${4 / scale} ${3 / scale}`

  const labels = segments.map((segment) => formatVenueMeasurement(segment.length))
  const rows = layoutChainLabels(segments, {
    // SVG 里拿不到字体度量,按经验字宽比估算:11px 无衬线的数字+m 大约 0.62 个字高宽
    labelWidth: (_segment, index) => labels[index].length * 0.62 * fontSize,
    minGap: 4 / scale,
  })

  // along = 沿链方向,cross = 垂直链方向。两条链都是「cross 变小 = 更靠外」。
  const at = (along: number, cross: number) =>
    horizontal ? { x: along, y: cross } : { x: cross, y: along }

  const line = (along1: number, cross1: number, along2: number, cross2: number) => {
    const a = at(along1, cross1)
    const b = at(along2, cross2)
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }

  const cuts = [segments[0].start, ...segments.map((segment) => segment.end)]

  return (
    <g pointerEvents="none" stroke={CHAIN_LINE} fontSize={fontSize} fontWeight="700">
      {segments.map((segment, index) => (
        <line
          key={`seg-${index}`}
          {...line(segment.start, baseline, segment.end, baseline)}
          strokeWidth={lineW}
          strokeDasharray={segment.itemId === null ? dash : undefined}
          opacity={segment.itemId === null ? 0.6 : 1}
        />
      ))}

      {cuts.map((cut, index) => (
        <g key={`cut-${index}`}>
          <line {...line(cut, baseline - tick, cut, baseline + tick)} strokeWidth={lineW} />
          <line {...line(cut, baseline + tick, cut, anchor)} strokeWidth={0.8 / scale} opacity={0.3} />
        </g>
      ))}

      {segments.map((segment, index) => {
        const mid = (segment.start + segment.end) / 2
        const cross = baseline - textGap - rows[index] * rowGap
        const point = at(mid, cross)
        return (
          <g key={`label-${index}`}>
            {rows[index] > 0 && (
              <line
                {...line(mid, baseline - tick, mid, cross + fontSize * 0.3)}
                strokeWidth={0.9 / scale}
                opacity={0.55}
              />
            )}
            <text
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="auto"
              transform={horizontal ? undefined : `rotate(-90 ${point.x} ${point.y})`}
              fill={segment.itemId === null ? CHAIN_GAP_TEXT : CHAIN_TEXT}
              stroke="#fff"
              strokeWidth={halo}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {labels[index]}
            </text>
          </g>
        )
      })}
    </g>
  )
}
