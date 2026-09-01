// 纯函数：把一串带日期的粉丝数映射为折线几何。
//
// buildWeeklyCurve 的坐标一律归一化到 0–100 百分比，折线走 viewBox="0 0 100 100"，
// 圆点与日期刻度用同一组百分比做 CSS 绝对定位。
// 这样文字不随 viewBox 缩放（11px 恒为 11px），而圆点也不会被非等比拉成椭圆。

export interface WeeklyCurvePoint {
  week_start: string
  /** null = 该周缺采（占住槽位但不画点）；与 yPct 同时为 null */
  followers: number | null
  /** 横向位置（0–100），含左右内缩 */
  xPct: number
  /** 纵向位置（0–100，0 = 顶部）；缺采的周为 null */
  yPct: number | null
  /** 日期刻度文案 M/D */
  tick: string
}

export interface WeeklyCurve {
  points: WeeklyCurvePoint[]
  /**
   * 每段连续有数据的 <polyline points>。缺采的周把折线断开，所以是数组而非单串——
   * 一条横跨空档的直线会把「两周的变化」画成「一周的变化」。
   * 不足 2 点的段不产出（孤立的点只画圆点）。
   */
  segments: string[]
}

interface WeeklyCurveInput {
  week_start: string
  /** null 表示该周缺采：占位但不参与量程与折线 */
  followers: number | null
}

interface WeeklyCurveOptions {
  /** 左右内缩百分比，给端点圆点和数值标签留出不被裁的空间 */
  inset?: number
  /** y 轴最小量程 = |末值| × 该比例：占满全高所需的波动幅度 */
  minSpanRatio?: number
  /** 数据跨度之上、上下各留白的比例 */
  padRatio?: number
  /**
   * 横向定位口径。
   * 'edge'（默认）：首尾按 inset 内缩，给端点圆点留出不被裁的余量——无标签的
   *   compact 稀疏图用它。
   * 'cell'：把 n 个点放到 n 等分格的中心，于是圆点与刻度行的等分 grid 逐列对齐；
   *   此时 inset 不再生效（格心只由点数决定）。
   */
  align?: 'edge' | 'cell'
}

const ISO_DATE = /^\d{4}-(\d{2})-(\d{2})$/

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * "2026-08-04" → "8/4"。
 * 刻意不经 new Date()：纯日期串按 UTC 午夜解析，东八区取本地月/日会推早一天。
 */
function weekTick(weekStart: string): string {
  const m = ISO_DATE.exec(weekStart)
  return m ? `${Number(m[1])}/${Number(m[2])}` : weekStart
}

/**
 * 把按周聚合的粉丝点转成带日期刻度的曲线几何。
 *
 * y 轴域刻意不取 [min, max]：那样任何微小波动都被拉满全高，+1% 也画成悬崖。
 * 取「数据跨度 + 上下各 padRatio 留白」与「末值的 minSpanRatio」中的较大者——
 * 于是 5% 以内的波动按真实比例呈现，跨度为 0 时落在中线而非凭空造斜坡。
 */
export function buildWeeklyCurve(
  weekly: WeeklyCurveInput[],
  { inset = 8, minSpanRatio = 0.05, padRatio = 0.25, align = 'edge' }: WeeklyCurveOptions = {},
): WeeklyCurve {
  // null 是「这周缺采」的有效输入，占住槽位；NaN/Infinity 是脏数据，照旧丢掉。
  const rows = (Array.isArray(weekly) ? weekly : []).filter(
    (w) => w && (w.followers === null || Number.isFinite(w.followers)),
  )
  const values = rows
    .map((w) => w.followers)
    .filter((v): v is number => v !== null)
  if (values.length === 0) return { points: [], segments: [] }

  const max = Math.max(...values)
  const min = Math.min(...values)
  const mid = (max + min) / 2
  const minSpan = Math.abs(values[values.length - 1]) * minSpanRatio
  const span = Math.max((max - min) * (1 + 2 * padRatio), minSpan)
  const domainMin = mid - span / 2

  // 'cell' 取 lead = 100/(2n)，于是 step = 100/n、第 i 点落在 (2i+1)·100/(2n)——
  // 正好是 n 等分格的中心。刻度行用等分 grid 时（保证相邻标签不可能重叠），
  // 圆点才和它下面的日期/数值同列。'edge' 保持原来的内缩语义。
  const lead = align === 'cell' ? 100 / (2 * rows.length) : inset
  const step = rows.length > 1 ? (100 - 2 * lead) / (rows.length - 1) : 0
  const points: WeeklyCurvePoint[] = rows.map((w, i) => ({
    week_start: w.week_start,
    followers: w.followers,
    xPct: rows.length > 1 ? round2(lead + i * step) : 50,
    // span 为 0 只可能是所有值都是 0，此时落中线避免除零
    yPct:
      w.followers === null ? null : span > 0 ? round2(100 - ((w.followers - domainMin) / span) * 100) : 50,
    tick: weekTick(w.week_start),
  }))

  // 按缺采周切段：只有连续 ≥2 个真点才成线。
  const segments: string[] = []
  let run: string[] = []
  for (const p of points) {
    if (p.yPct === null) {
      if (run.length > 1) segments.push(run.join(' '))
      run = []
      continue
    }
    run.push(`${p.xPct},${p.yPct}`)
  }
  if (run.length > 1) segments.push(run.join(' '))

  return { points, segments }
}
