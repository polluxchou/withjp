// 纯函数：把一串带日期的粉丝数映射为折线几何。
//
// buildWeeklyCurve 的坐标一律归一化到 0–100 百分比，折线走 viewBox="0 0 100 100"，
// 圆点与日期刻度用同一组百分比做 CSS 绝对定位。
// 这样文字不随 viewBox 缩放（11px 恒为 11px），而圆点也不会被非等比拉成椭圆。

export interface WeeklyCurvePoint {
  week_start: string
  followers: number
  /** 横向位置（0–100），含左右内缩 */
  xPct: number
  /** 纵向位置（0–100，0 = 顶部） */
  yPct: number
  /** 日期刻度文案 M/D */
  tick: string
}

export interface WeeklyCurve {
  points: WeeklyCurvePoint[]
  /** <polyline points>；不足 2 点时为空串 */
  polyline: string
}

interface WeeklyCurveInput {
  week_start: string
  followers: number
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
  const rows = (Array.isArray(weekly) ? weekly : []).filter((w) => w && Number.isFinite(w.followers))
  if (rows.length === 0) return { points: [], polyline: '' }

  const values = rows.map((w) => w.followers)
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
    yPct: span > 0 ? round2(100 - ((w.followers - domainMin) / span) * 100) : 50,
    tick: weekTick(w.week_start),
  }))

  return {
    points,
    polyline: points.length > 1 ? points.map((p) => `${p.xPct},${p.yPct}`).join(' ') : '',
  }
}
