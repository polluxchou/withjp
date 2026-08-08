// 彩色图标 chip 色板（docs/design-system.md §1.4）——侧栏与区块卡头图标专用
export type Accent = 'violet' | 'pink' | 'blue' | 'green' | 'amber' | 'mauve'
export const ACCENT_CHIP: Record<Accent, string> = {
  violet: 'bg-primary-soft text-primary',
  pink:   'bg-[rgba(236,72,153,0.10)] text-[#db2777]', // style-tokens-ignore
  blue:   'bg-info-soft text-info-dot',
  green:  'bg-success-soft text-[#059669]', // style-tokens-ignore
  amber:  'bg-[rgba(245,158,11,0.12)] text-[#d97706]', // style-tokens-ignore
  mauve:  'bg-muted-soft text-muted-text',
}
