import { useTranslations } from 'next-intl'

interface LoadingStateProps {
  variant?: 'plain' | 'list' | 'stats'
  rows?: number
}

// 骨架色块圆角用 rounded-[4px]（任意值），不用裸 `rounded`：design-system §3
// 只登记了 card/field/icon/btn 四个圆角 token，未覆盖骨架屏这类纯装饰性色
// 块——与其留一个不在登记表里的裸 utility 类，不如显式任意值 + 注释说明它
// 就是 Tailwind 默认的 4px，不是新引入的尺寸。
export default function LoadingState({ variant = 'plain', rows = 4 }: LoadingStateProps) {
  const t = useTranslations('common')
  if (variant === 'list') {
    return (
      <div aria-busy="true" role="status" aria-label={t('loading')} className="animate-pulse">
        {Array.from({ length: rows }).map((_, i) => (
          // py-3 对齐 RecordRow 的真实行高（px-5 py-3），骨架和加载完成后的
          // 实际内容切换时高度一致，不会有布局跳动。
          <div key={i} className="flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0">
            <span className="w-2 h-2 rounded-full bg-line-soft" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded-[4px] bg-line-soft" />
              <div className="h-2.5 w-1/2 rounded-[4px] bg-line-soft" />
            </div>
            <div className="h-3 w-16 rounded-[4px] bg-line-soft" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'stats') {
    return (
      // overflow-x-auto：4 栏骨架在窄屏可能比视口宽，容器自己滚动而不是把
      // 页面撑宽出现整页横向滚动条。
      <div aria-busy="true" role="status" aria-label={t('loading')} className="overflow-x-auto flex animate-pulse bg-surface border border-line rounded-card shadow-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 px-5 py-3 border-r border-line-soft last:border-r-0 space-y-2.5">
            <div className="h-2.5 w-14 rounded-[4px] bg-line-soft" />
            <div className="h-6 w-24 rounded-[4px] bg-line-soft" />
          </div>
        ))}
      </div>
    )
  }
  return <div aria-busy="true" role="status" className="py-12 text-center text-sm text-ink-400">{t('loading')}</div>
}
