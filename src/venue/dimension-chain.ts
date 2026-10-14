import { isVenueMarkerType, type VenueItem } from './layoutData.ts'

export type DimensionChainAxis = 'horizontal' | 'vertical'

export type DimensionChainSegment = {
  start: number
  end: number
  length: number
  // null 表示这一段没有任何组件占据(空隙)
  itemId: string | null
}

export type DimensionChainPlan = {
  segments: DimensionChainSegment[]
  // 近边坐标:横链取最小 y,竖链取最小 x。渲染层据此把链线摆到外侧。
  anchor: number
}

// 自动带深:该方向总跨度的 10%,夹在 0.6m–2.0m。只是个缺省值——它对贴边判定
// 太敏感(实测中 4cm 的差额就能把整个驻车场排除出链),所以工具栏给了滑杆让
// 用户现场拨,这里的常量只决定滑杆的起始位置。
const BAND_DEPTH_RATIO = 0.1
const BAND_DEPTH_MIN = 60
const BAND_DEPTH_MAX = 200

// 小于半厘米的段当成浮点噪声丢掉
const EPSILON = 0.5

type Box = {
  id: string
  near: number
  far: number
  start: number
  end: number
  area: number
}

// 旋转组件取绕中心旋转后的外接正矩形
function axisAlignedBox(item: VenueItem) {
  if (item.rotation === 0) {
    return { x: item.x, y: item.y, width: item.width, height: item.height }
  }
  const theta = (item.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(theta))
  const sin = Math.abs(Math.sin(theta))
  const width = item.width * cos + item.height * sin
  const height = item.width * sin + item.height * cos
  return {
    x: item.x + item.width / 2 - width / 2,
    y: item.y + item.height / 2 - height / 2,
    width,
    height,
  }
}

function collectBoxes(items: VenueItem[], axis: DimensionChainAxis): Box[] {
  const horizontal = axis === 'horizontal'
  const boxes: Box[] = []
  for (const item of items) {
    if (isVenueMarkerType(item.type)) continue
    const box = axisAlignedBox(item)
    if (box.width <= 0 || box.height <= 0) continue
    boxes.push({
      id: item.id,
      near: horizontal ? box.y : box.x,
      far: horizontal ? box.y + box.height : box.x + box.width,
      start: horizontal ? box.x : box.y,
      end: horizontal ? box.x + box.width : box.y + box.height,
      area: box.width * box.height,
    })
  }
  return boxes
}

function clampBandDepth(span: number): number {
  return Math.min(Math.max(span * BAND_DEPTH_RATIO, BAND_DEPTH_MIN), BAND_DEPTH_MAX)
}

// 覆盖该点的成员里选面积最小的——嵌套组件因此切开外层空间,而不是被它盖掉。
// 面积相同按 id 字典序,保证同一份数据每次算出同样的链。
function ownerAt(band: Box[], position: number): string | null {
  let best: Box | null = null
  for (const box of band) {
    if (position < box.start || position > box.end) continue
    if (!best || box.area < best.area || (box.area === best.area && box.id < best.id)) best = box
  }
  return best ? best.id : null
}

// 工具栏的带深滑杆停在自动模式时,要把这个值显示出来并作为滑块位置。
export function autoChainBandDepth(items: VenueItem[], axis: DimensionChainAxis): number {
  const boxes = collectBoxes(items, axis)
  if (boxes.length === 0) return BAND_DEPTH_MIN
  const nearEdge = Math.min(...boxes.map((b) => b.near))
  const farEdge = Math.max(...boxes.map((b) => b.far))
  return clampBandDepth(farEdge - nearEdge)
}

export function planDimensionChain(
  items: VenueItem[],
  axis: DimensionChainAxis,
  // null/省略 = 用自动值。用户拨了滑杆就传具体数值进来。
  bandDepthOverride?: number | null,
): DimensionChainPlan {
  const boxes = collectBoxes(items, axis)
  if (boxes.length === 0) return { segments: [], anchor: 0 }

  const nearEdge = Math.min(...boxes.map((b) => b.near))
  const farEdge = Math.max(...boxes.map((b) => b.far))
  const bandDepth = bandDepthOverride ?? clampBandDepth(farEdge - nearEdge)
  const band = boxes.filter((b) => b.near <= nearEdge + bandDepth)
  if (band.length === 0) return { segments: [], anchor: nearEdge }

  const cuts = new Set<number>()
  for (const box of band) {
    cuts.add(box.start)
    cuts.add(box.end)
  }
  const sorted = Array.from(cuts).sort((a, z) => a - z)

  const segments: DimensionChainSegment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (end - start < EPSILON) continue
    const itemId = ownerAt(band, (start + end) / 2)
    const previous = segments[segments.length - 1]
    if (previous && previous.itemId === itemId && previous.end === start) {
      previous.end = end
      previous.length = end - previous.start
      continue
    }
    segments.push({ start, end, length: end - start, itemId })
  }

  return { segments, anchor: nearEdge }
}

// 贪心区间装箱:按顺序把每个标签放进「能放下它的最小排号」。第 0 排紧贴链线,
// 排号越大越靠外。窄段因此自动让到上一排,后面的宽段又能落回第 0 排。
export function layoutChainLabels(
  segments: DimensionChainSegment[],
  options: {
    labelWidth: (segment: DimensionChainSegment, index: number) => number
    minGap: number
  },
): number[] {
  const rowEnds: number[] = []
  return segments.map((segment, index) => {
    const width = options.labelWidth(segment, index)
    const mid = (segment.start + segment.end) / 2
    const left = mid - width / 2
    const right = mid + width / 2
    for (let row = 0; row < rowEnds.length; row++) {
      if (left >= rowEnds[row] + options.minGap) {
        rowEnds[row] = right
        return row
      }
    }
    rowEnds.push(right)
    return rowEnds.length - 1
  })
}
