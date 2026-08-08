// src/lib/chart-theme.ts — 全站 recharts 唯一取色处（docs/design-system.md §1.5）
export const CHART_SERIES = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8d87a1'] as const
export const seriesColor = (i: number): string => CHART_SERIES[i % CHART_SERIES.length]
export const AXIS = { tick: { fill: '#8d87a1', fontSize: 11 }, axisLine: false, tickLine: false } as const
export const GRID = { stroke: 'rgba(33,28,51,0.05)', strokeDasharray: '0' } as const
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(33,28,51,0.07)',
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
  fontSize: '12px', color: '#211c33',
} as const
export const AREA_FILL = { id: 'chartAreaFill', from: 'rgba(124,58,237,0.14)', to: 'rgba(124,58,237,0)' } as const
