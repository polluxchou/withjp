import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

// `text-${align}` 模板拼接类名 Tailwind JIT 静态提取不到（Task 5 审查已确立
// 的地雷——只有源码里出现的完整类名字面量才会被扫描进产物），必须用完整字
// 面量映射。
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

interface TableProps {
  children: ReactNode
  minWidth?: number
  label?: string
}

export function Table({ children, minWidth, label }: TableProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table aria-label={label} className="w-full text-sm border-collapse" style={minWidth ? { minWidth } : undefined}>
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

interface TBodyProps {
  children: ReactNode
}

export function TBody({ children }: TBodyProps) {
  return <tbody>{children}</tbody>
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center'
}

// className 走追加模式：先从 rest 解构出 className 单独处理，再拼进自己算
// 出来的类名末尾——如果让 {...rest} 里的 className 和显式 className= 同时
// 出现在同一个 JSX 标签上，后写的（我们自己算的那个）会整体覆盖前者，调用方
// 传入的 className 会被无声吞掉。
export function Th({ align = 'left', children, className, ...rest }: ThProps) {
  return (
    <th {...rest} className={`px-3 py-2 text-xs font-medium text-ink-400 whitespace-nowrap ${ALIGN[align]} ${className ?? ''}`}>
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

export function Td({ align = 'left', numeric, children, className, ...rest }: TdProps) {
  return (
    <td
      {...rest}
      className={`px-3 py-2.5 text-ink-700 ${ALIGN[align]} ${numeric ? 'tabular-nums font-medium text-ink-900' : ''} ${className ?? ''}`}
    >
      {children}
    </td>
  )
}
