import type { ForecastAccountType } from '@/lib/finance-forecast/calculations'
import { seriesColor, areaFill } from '@/lib/chart-theme'

// ForecastAccountType（重点号/成熟号/成长期/新号/测试号/其他）不是 design-system
// §1.3 已登记的"创作者生命周期"枚举（那组是 潜在客户/已联系/已互动/已入驻/准备
// 直播/直播中/已变现/已解约，站点、数量都不同），二者不是同一枚举，不能直接照搬
// 语义 tone——这里按纯系列色处理，取值沿用各类型原有色相位（key 紫 · growing 蓝 ·
// mature 绿 · newbie 橙 · test 粉 · other 灰）映射到 CHART_SERIES 对应位。
const ACCOUNT_TYPE_INDEX = {
  key:     0,
  growing: 1,
  mature:  2,
  newbie:  3,
  test:    4,
  other:   5,
} satisfies Record<ForecastAccountType, number>

export const accountTypeColor = (type: ForecastAccountType): string => seriesColor(ACCOUNT_TYPE_INDEX[type])

// 累计利润面积图的渐变（§1.5 areaFill 14%→0 工厂）；只依赖静态系列色，模块级算一次即可。
export const CUM_PROFIT_FILL = areaFill('ffd-cum-profit', seriesColor(0))

// 财务预测看板复用的裸样式组合：都写成完整类名字面量（不做 `text-${x}` 式拼接），
// Tailwind JIT 才能从源码里静态提取到——拼接出来的类名扫不到会静默失效。
// focus 环走 @/lib/ui/recipes 的 FOCUS_RING（§4 唯一登记处）。
// 月份/全年/视角这类互斥药丸：条目数远超 SegmentedControl 适用的「小范围互斥」
// （12 个月 + 全年），保留药丸行形态，只把配色换成 token。
export const PILL_BASE = 'rounded-field border text-xs font-semibold transition-colors'
export const PILL_ACTIVE = 'bg-primary text-white border-primary shadow-card'
export const PILL_IDLE = 'bg-surface text-ink-700 border-line-strong hover:border-primary-border hover:text-primary'
// 表格上方的行级动作按钮（复制上月/顺延/清空）
export const TOOL_BTN = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-field border border-line-strong bg-surface text-xs font-medium text-ink-700 hover:border-primary-border hover:text-primary transition-colors'
// 只读输入：Input 自带的 disabled: 样式对 readOnly 不生效，而 readOnly 又必须
// 保留（用户仍要能选中复制月度备注/账号名）。用 `read-only:` 变体补灰底与弱化
// 文字——伪类选择器特异性高于基础类，不受 Tailwind 生成顺序影响（同
// VenueInspector 的既有做法）。
export const READONLY_INPUT = 'read-only:bg-canvas read-only:text-ink-500 read-only:cursor-not-allowed'
// 表头（design-system §6.2：表头 xs / ink-400）
export const TH_LEFT = 'text-left px-4 py-3 text-xs font-medium text-ink-400'
export const TH_RIGHT = 'text-right px-4 py-3 text-xs font-medium text-ink-400'
