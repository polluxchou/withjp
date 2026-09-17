import type { ReactNode } from 'react'
import type { Tone } from '@/lib/ui/status-tone'
import { Link } from '@/i18n/navigation'

// arbitrary shadow 里的 var() 引用合法且会被 JIT 生成（已用生产构建产物核
// 实：`shadow-[0_0_0_3px_var(--success-soft)]` 等六个类均出现在编译后的
// CSS 里）。这条路径和 alpha-on-fixed 门禁拦截的模式不是一回事——门禁禁的
// 是"固定透明度 token 类名直接拼接分数透明度修饰符"，这里是把 var() 整体
// 作为任意值传给 shadow，没有修饰符语法，门禁正则也不匹配这个模式。
const DOT: Record<Tone, string> = {
  success: 'bg-success-dot shadow-[0_0_0_3px_var(--success-soft)]',
  warning: 'bg-warning-dot shadow-[0_0_0_3px_var(--warning-soft)]',
  danger:  'bg-danger-dot shadow-[0_0_0_3px_var(--danger-soft)]',
  info:    'bg-info-dot shadow-[0_0_0_3px_var(--info-soft)]',
  neutral: 'bg-muted-dot shadow-[0_0_0_3px_var(--muted-soft)]',
  violet:  'bg-primary shadow-[0_0_0_3px_var(--primary-soft)]',
}

interface RecordMeta {
  icon?: ReactNode
  text: string
  mono?: boolean
}

interface RecordRowProps {
  status?: Tone
  title: string
  /** 标题前的小图标——分类这类"一眼认形状"的信息，不值得占一整段文字。 */
  titleIcon?: ReactNode
  /** 金额本身越线时改用 danger 色。组头小计不显示的场合（单条成组）用得上。 */
  amountAlert?: boolean
  meta?: RecordMeta[]
  amount?: string
  tags?: ReactNode
  who?: ReactNode
  actions?: ReactNode
  href?: string
  /**
   * 行内操作按钮退到 hover 才出现（sm 及以上）。触屏没有 hover，所以 sm 以下
   * 一律常驻，靠 stackOnNarrow 换行腾地方。键盘走 tab 进来时 focus-within 会
   * 把它们拉回来，不然按钮就成了鼠标专属。
   */
  hoverActions?: boolean
  /**
   * sm 以下把标题单独占一行，金额/标签/操作落到第二行。常驻的操作按钮在
   * 375px 上会把 flex-1 的标题一路压到 0 宽——不是截断，是整个名字消失——
   * 换行是唯一能同时保住名称和按钮的排法。
   *
   * 注意：目前没有调用方同时用 status 和它；真要一起用，状态点会被 basis-full
   * 的标题挤到单独一行，需要先把点挪进标题块内部。
   */
  stackOnNarrow?: boolean
}

const ACTIONS_HOVER = 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity'

const ROW_CLASS = 'flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0 transition-colors hover:bg-row-hover'
// stackOnNarrow 版：sm 以下允许换行，行距收窄；sm 起恢复成单行。
const ROW_CLASS_STACKED = 'flex flex-wrap sm:flex-nowrap items-center gap-x-3.5 gap-y-1 px-5 py-3 border-t border-line-soft first:border-t-0 transition-colors hover:bg-row-hover'
// href 分支专用：py-3 不放在这层，改放到 Link 和 actions 容器身上（见下方
// 用法），外层只留水平内边距 px-5 和行级视觉（分隔线/hover）。
const ROW_CLASS_LINKED = 'flex items-center gap-3.5 px-5 border-t border-line-soft first:border-t-0 transition-colors hover:bg-row-hover'

export default function RecordRow({ status, title, titleIcon, amountAlert, meta = [], amount, tags, who, actions, href, hoverActions, stackOnNarrow }: RecordRowProps) {
  // 主内容（status dot + title/meta + amount + tags + who）——href 存在时
  // 整体包进 Link，actions 留在 Link 外面。之前把 actions 也塞进 Link 内部
  // 会导致行内操作按钮的点击事件冒泡到 <a>，触发导航——即使按钮自己
  // preventDefault/stopPropagation，嵌套交互元素本身在语义上就是不允许的
  // （a 内部不能再放 button 语义），这里改成结构性地分离，从根上避免。
  const content = (
    <>
      {status && <span aria-hidden className={`w-2 h-2 rounded-full flex-none ${DOT[status]}`} />}
      <div className={`flex-1 min-w-0 ${stackOnNarrow ? 'basis-full sm:basis-auto' : ''}`}>
        {/* 有图标时才换成 flex：truncate 在 flex 容器上不生效，得落到文字自己
            的 span 上（和下面 meta 行同一个坑）。没图标的调用方保持原结构。 */}
        {titleIcon || stackOnNarrow ? (
          <div className="flex items-center gap-2 min-w-0">
            {titleIcon && <span className="flex-none text-ink-400 [&>svg]:w-4 [&>svg]:h-4">{titleIcon}</span>}
            <span className="text-md font-semibold text-ink-900 truncate min-w-0">{title}</span>
            {/* 窄屏把标签挪到标题右边：留在第二行的话，金额 + 标签 + 常驻操作
                三者加起来超过 375px，会再挤出第三行。宽屏保持原位。 */}
            {stackOnNarrow && tags && <span className="sm:hidden flex-none">{tags}</span>}
          </div>
        ) : (
          <div className="text-md font-semibold text-ink-900 truncate">{title}</div>
        )}
        {meta.length > 0 && (
          // 375px 窄屏只保留 status/title/amount：meta 行在 sm 以下隐藏，
          // 避免和 title/amount 挤压导致三者都读不全。
          <div className="hidden sm:flex items-center gap-3.5 mt-0.5 text-xs text-ink-400 min-w-0">
            {meta.map((m, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 min-w-0 ${m.mono ? 'font-mono' : ''} [&>svg]:w-[13px] [&>svg]:h-[13px] [&>svg]:flex-none [&>svg]:opacity-75`}
              >
                {m.icon}
                {/* inline-flex 容器本身套 truncate 不生效（文字和图标一起被截，
                    还可能整体消失）——截断必须落在文字自己的 span 上，且这个
                    span 也要 min-w-0 才能真正缩到比文字本身还窄（SectionCard
                    标题同款修法）。 */}
                <span className="truncate min-w-0">{m.text}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {amount && <span className={`text-md font-semibold tabular-nums font-mono flex-none ${amountAlert ? 'text-danger-text' : 'text-ink-900'}`}>{amount}</span>}
      {tags && (stackOnNarrow ? <span className="hidden sm:block flex-none">{tags}</span> : tags)}
      {who && <span className="hidden sm:block w-24 flex-none text-xs text-ink-700 truncate">{who}</span>}
    </>
  )

  // hover 态要靠父级 group 传导，所以 group 只在 hoverActions 打开时加——其余
  // 调用方的行为一个像素都不变。
  const rowClass = (base: string) => (hoverActions ? `group ${base}` : base)
  // 换行后第二行靠 ml-auto 把操作推到右缘，和上一行的标题对齐成一个矩形。
  const wrappedActions = actions && (hoverActions || stackOnNarrow)
    ? <span className={`flex-none ${stackOnNarrow ? 'ml-auto sm:ml-0' : ''} ${hoverActions ? ACTIONS_HOVER : ''}`}>{actions}</span>
    : actions

  if (href) {
    return (
      <div className={rowClass(ROW_CLASS_LINKED)}>
        {/* self-stretch 撑满整行高度而不是跟着自己内容的行高走——py-3 从外层
            div 挪到这里正是为此：外层不再自带高度，行高完全由 Link（和
            actions 容器）自己的 padding 撑出来，self-stretch 才有意义。
            这样链接的可点击区域覆盖整行，focus ring 也围住整行，而不是
            只贴着文字那一小圈。 */}
        <Link
          href={href}
          className="self-stretch flex-1 min-w-0 flex items-center gap-3.5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
        >
          {content}
        </Link>
        {actions && <div className={`flex-none py-3 ${hoverActions ? ACTIONS_HOVER : ''}`}>{actions}</div>}
      </div>
    )
  }

  return (
    <div className={rowClass(stackOnNarrow ? ROW_CLASS_STACKED : ROW_CLASS)}>
      {content}
      {wrappedActions}
    </div>
  )
}
