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

export default function RecordRow({ status, title, meta = [], amount, tags, who, actions, href }: RecordRowProps) {
  const body = (
    <div className="flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0 transition-colors hover:bg-row-hover">
      {status && <span aria-hidden className={`w-2 h-2 rounded-full flex-none ${DOT[status]}`} />}
      <div className="flex-1 min-w-0">
        <div className="text-md font-semibold text-ink-900 truncate">{title}</div>
        {meta.length > 0 && (
          <div className="flex items-center gap-3.5 mt-0.5 text-xs text-ink-400 min-w-0">
            {meta.map((m, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 truncate ${m.mono ? 'font-mono' : ''} [&>svg]:w-[13px] [&>svg]:h-[13px] [&>svg]:opacity-75`}
              >
                {m.icon}{m.text}
              </span>
            ))}
          </div>
        )}
      </div>
      {amount && <span className="text-md font-semibold tabular-nums font-mono text-ink-900 flex-none">{amount}</span>}
      {tags}
      {who && <span className="w-24 flex-none text-xs text-ink-700 truncate">{who}</span>}
      {actions}
    </div>
  )
  return href ? (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset">
      {body}
    </Link>
  ) : body
}
