import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

// `text-${align}` 模板拼接类名 Tailwind JIT 静态提取不到（Task 5 审查已确立
// 的地雷——只有源码里出现的完整类名字面量才会被扫描进产物），必须用完整字
// 面量映射。
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

interface TableProps {
  children: ReactNode
  minWidth?: number
}

export function Table({ children, minWidth }: TableProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  )
}

interface THeadProps {
  children: ReactNode
}

export function THead({ children }: THeadProps) {
  return (
    <thead>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  )
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center'
}

export function Th({ align = 'left', children, ...rest }: ThProps) {
  return (
    <th {...rest} className={`px-3 py-2 text-xs font-medium text-ink-400 whitespace-nowrap ${ALIGN[align]}`}>
      {children}
    </th>
  )
}

interface TrProps {
  children: ReactNode
}

// Tr 不提供 onClick：<tr onClick> 没有原生键盘可达性，而给 tr 补 tabIndex +
// onKeyDown(Enter/Space) 又需要一个 role 撒谎（tr 的语义是表格行，不是
// button，role="button" 会破坏屏幕阅读器的表格导航）。行级点击交互改由
// RecordRow（列表场景）或行内 Link/button（Table 场景，如需要）承载——
// Table 原语定位是多列数值对比，本就不以整行可点为主要交互。hover 底色常
// 开，仅作弱可读性提示，不再暗示"这一行可点"。
export function Tr({ children }: TrProps) {
  return (
    <tr className="border-b border-line-soft last:border-b-0 transition-colors hover:bg-row-hover">
      {children}
    </tr>
  )
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
}

export function Td({ align = 'left', numeric, children, ...rest }: TdProps) {
  return (
    <td
      {...rest}
      className={`px-3 py-2.5 text-ink-700 ${ALIGN[align]} ${numeric ? 'tabular-nums font-medium text-ink-900' : ''}`}
    >
      {children}
    </td>
  )
}
