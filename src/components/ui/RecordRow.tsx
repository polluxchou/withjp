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
  meta?: RecordMeta[]
  amount?: string
  tags?: ReactNode
  who?: ReactNode
  actions?: ReactNode
  href?: string
}

const ROW_CLASS = 'flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0 transition-colors hover:bg-row-hover'

export default function RecordRow({ status, title, meta = [], amount, tags, who, actions, href }: RecordRowProps) {
  // 主内容（status dot + title/meta + amount + tags + who）——href 存在时
  // 整体包进 Link，actions 留在 Link 外面。之前把 actions 也塞进 Link 内部
  // 会导致行内操作按钮的点击事件冒泡到 <a>，触发导航——即使按钮自己
  // preventDefault/stopPropagation，嵌套交互元素本身在语义上就是不允许的
  // （a 内部不能再放 button 语义），这里改成结构性地分离，从根上避免。
  const content = (
    <>
      {status && <span aria-hidden className={`w-2 h-2 rounded-full flex-none ${DOT[status]}`} />}
      <div className="flex-1 min-w-0">
        <div className="text-md font-semibold text-ink-900 truncate">{title}</div>
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
      {amount && <span className="text-md font-semibold tabular-nums font-mono text-ink-900 flex-none">{amount}</span>}
      {tags}
      {who && <span className="hidden sm:block w-24 flex-none text-xs text-ink-700 truncate">{who}</span>}
    </>
  )

  if (href) {
    return (
      <div className={ROW_CLASS}>
        <Link
          href={href}
          className="flex-1 min-w-0 flex items-center gap-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
        >
          {content}
        </Link>
        {actions && <div className="flex-none">{actions}</div>}
      </div>
    )
  }

  return (
    <div className={ROW_CLASS}>
      {content}
      {actions}
    </div>
  )
}
