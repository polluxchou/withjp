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
      <div role="status" aria-label={t('loading')} className="animate-pulse">
        {Array.from({ length: rows }).map((_, i) => (
          // py-3 对齐 RecordRow 的真实行高（px-5 py-3），骨架和加载完成后的
          // 实际内容切换时高度一致，不会有布局跳动。标题/meta 色块高度和
          // 间距/断点行为直接照抄 RecordRow 真实结构（h-5 对应 text-md 标题
          // 20px 行盒、mt-0.5 h-4 对应 text-xs meta 行，且 meta 同样
          // hidden sm:block——真实 meta 行在 640px 以下隐藏，骨架不隐藏的
          // 话窄屏下两者高度就对不上），而不是用 space-y 随便估一个间距——
          // 实测过两个断点下整行高度都要对上真实 RecordRow，光对齐 py 不
          // 够，内容色块自己的高度和显隐也得跟着改。
          <div key={i} className="flex items-center gap-3.5 px-5 py-3 border-t border-line-soft first:border-t-0">
            <span className="w-2 h-2 rounded-full bg-line-soft" />
            <div className="flex-1">
              <div className="h-5 w-1/3 rounded-[4px] bg-line-soft" />
              <div className="hidden sm:block mt-0.5 h-4 w-1/2 rounded-[4px] bg-line-soft" />
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
      <div role="status" aria-label={t('loading')} className="overflow-x-auto flex animate-pulse bg-surface border border-line rounded-card shadow-card">
        {Array.from({ length: 4 }).map((_, i) => (
          // py-4 对齐 Stat.tsx 真实单元格（px-5 py-4）。value 色块 h-[30px]
          // 对应 Stat 真实的 text-2xl（24px/30px 行高）——用行高而不是字号，
          // 骨架块的视觉重量才和真实数字一致；label 色块 h-3 对应 text-xs。
          <div key={i} className="flex-1 px-5 py-4 border-r border-line-soft last:border-r-0 space-y-2.5">
            <div className="h-3 w-14 rounded-[4px] bg-line-soft" />
            <div className="h-[30px] w-24 rounded-[4px] bg-line-soft" />
          </div>
        ))}
      </div>
    )
  }
  return <div role="status" className="py-12 text-center text-sm text-ink-400">{t('loading')}</div>
}
