'use client'
import { X } from 'lucide-react'
import type { Tone } from '@/lib/ui/status-tone'

// dot 系 token 是固定透明度的 hex/var()，不支持 `/N` 修饰符（Task 1 审查
// 结论：alpha-on-fixed 门禁会拦截且 Tailwind 静默不生成类）。35% 透明描边
// 改走 globals.css 里单独登记的 *-border rgba 变量（tailwind.config.ts 同步
// 映射 success/warning/danger/info 的 `border` 档），而不是 `border-*-dot/35`。
//
// text/bg 与 border 分开存放（而非拼成一整条 chip 字符串）：active 态要把
// tone 的 border 整体替换成 border-primary-border，如果两条 border-*-border
// 类同时出现在同一元素上，谁赢由 Tailwind 内部生成顺序决定、不受 className
// 书写顺序影响——上一轮 font-semibold/font-bold 同时存在时出现的"实测仍是
// 旧值"就是这个坑。这里用互斥选择（每次只输出一个 border-*-border 类）从
// 结构上杜绝同一属性有两个候选类共存。
const COUNT_TONE: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  success: { text: 'text-success-text', bg: 'bg-success-soft', border: 'border-success-border', dot: 'bg-success-dot' },
  warning: { text: 'text-warning-text', bg: 'bg-warning-soft', border: 'border-warning-border', dot: 'bg-warning-dot' },
  danger:  { text: 'text-danger-text',  bg: 'bg-danger-soft',  border: 'border-danger-border',  dot: 'bg-danger-dot' },
  info:    { text: 'text-info-text',    bg: 'bg-info-soft',    border: 'border-info-border',    dot: 'bg-info-dot' },
  neutral: { text: 'text-ink-700',      bg: 'bg-surface',      border: 'border-line-strong',     dot: 'bg-muted-dot' },
  violet:  { text: 'text-primary-hover', bg: 'bg-primary-soft', border: 'border-primary-border', dot: 'bg-primary' },
}

interface FilterChipProps {
  label: string
  set?: boolean
  onClick?: () => void
  onClear?: () => void
}

// 外层是纯视觉容器（非交互 span）：内部主按钮与清除按钮是两个真正的兄弟
// <button>，各自拥有原生键盘行为（Tab 可达、Enter/Space 激活），不再靠外层
// onKeyDown 手工模拟——此前外层 preventDefault 会吞掉内层清除按钮的 Enter，
// 导致键盘用户按 Enter 只能触发外层 onClick、无法清除。
//
// 点击热区：h-8/px-3 是"视觉"尺寸，留在这层不代表可点击——span 本身不是
// 交互元素。真正的命中区必须由内部两个 button 自己撑满：主按钮 self-stretch
// 撑满 span 的 32px 高度（span 仍是 items-center，self-stretch 只覆盖这一个
// 子项），并把 span 原来的左侧 px-3 挪到主按钮的 pl-3 上，让这段留白也在
// 按钮命中区内；右侧同理挪给清除按钮的 pr-2（没有清除按钮时退回给主按钮
// pr-3，保持视觉留白不丢）。
//
// span 的描边改用 outline（而非 border）：border-width 会占用 2px 布局空间，
// 把 h-8 的内容高度从 32px 挤到 30px，self-stretch 的按钮也就只能撑到
// 30px——实测验证过这个坑。outline 是纯绘制层，不参与盒模型计算，
// `outline-offset-[-1px]` 把它拉到贴着盒子边缘画，视觉上和 1px border
// 没有区别，但内容高度仍是完整的 32px。dashed 变体同理用 outline-dashed。
export function FilterChip({ label, set, onClick, onClear }: FilterChipProps) {
  const hasClear = Boolean(set && onClear)
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-8 rounded-field text-xs text-ink-700 transition-colors outline-1 outline-offset-[-1px] outline-line-strong ${
        set ? 'outline bg-surface shadow-card' : 'outline-dashed hover:bg-line-soft'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 self-stretch flex items-center pl-3 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${hasClear ? '' : 'pr-3'}`}
      >
        {label}
      </button>
      {hasClear && (
        <button
          type="button"
          aria-label="clear"
          onClick={onClear}
          className="self-stretch -m-1 py-1 pl-1 pr-2 rounded-full text-ink-400 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
        >
          <X className="w-[13px] h-[13px]" strokeWidth={1.5} />
        </button>
      )}
    </span>
  )
}

interface CountChipProps {
  label: string
  count: number
  tone?: Tone
  active?: boolean
  onClick?: () => void
}

export function CountChip({ label, count, tone = 'neutral', active, onClick }: CountChipProps) {
  const c = COUNT_TONE[tone]
  // 互斥三元，而非"基类 font-semibold + active 追加 font-bold"：两个
  // font-weight 类同时挂在一个元素上时，谁生效由 Tailwind 内部生成顺序决定、
  // 不是 className 里的书写顺序——实测 active 态下 fontWeight 计算仍是
  // font-semibold 的 600，选中态视觉通道完全失效。永远只输出一个
  // font-weight 类，就没有"谁压过谁"的问题。border 同理：active 态整体换成
  // border-primary-border（第二通道），而不是在 tone 的 border 类之外再叠一个。
  const weight = active ? 'font-bold' : 'font-semibold'
  const border = active ? 'border-primary-border' : c.border
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`inline-flex items-center gap-2 h-8 px-3 rounded-btn text-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${c.text} ${c.bg} ${border} ${weight}`}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
      <span className="font-bold tabular-nums">{count}</span>
    </button>
  )
}
