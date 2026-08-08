// src/lib/chart-theme.ts — 全站 recharts 唯一取色处（docs/design-system.md §1.5）
export const CHART_SERIES = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8d87a1'] as const

// 安全取模：负数 / 非整数索引不越界（Math.trunc 去小数，双重 % 消负号）。
export const seriesColor = (i: number): string =>
  CHART_SERIES[((Math.trunc(i) % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length]

export const AXIS = { tick: { fill: '#8d87a1', fontSize: 11 }, axisLine: false, tickLine: false } as const
export const GRID = { stroke: 'rgba(33,28,51,0.05)', strokeDasharray: '0', vertical: false } as const
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(33,28,51,0.07)',
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
  fontSize: '12px', color: '#211c33',
} as const
export const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: '#211c33' } as const

/**
 * 面积图渐变工厂：每个系列独立渐变 id，避免同页多图共用一个
 * <linearGradient> id 相互覆盖。
 *
 * @param id 渐变元素 id（同一页面内需唯一，如 `area-${seriesKey}`）
 * @param color 系列主色，**须为 6 位 hex**（如 `'#7c3aed'`）——本函数直接
 *   拼接 8 位 hex 透明度后缀，传入非 6 位 hex（3 位简写 / rgba() 等）会
 *   产出非法颜色值。`'24'` ≈ 14% 透明度、`'00'` = 0%，对应
 *   design-system §1.5「主色 14% → 0 垂直渐变」。
 */
export const areaFill = (id: string, color: string) => ({ id, from: color + '24', to: color + '00' })
