'use client'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import Button from './Button'

interface ErrorStateProps {
  title?: string
  detail?: string
  onRetry?: () => void
}

export default function ErrorState({ title, detail, onRetry }: ErrorStateProps) {
  const t = useTranslations('common')
  const message = title ?? t('errorTitle')
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      {/* 图标容器模式（与 EmptyState 同 idiom）：尺寸挂在容器的 [&>svg] 选择器
          上，图标本身不重复传 className。 */}
      <div aria-hidden className="w-11 h-11 rounded-full bg-danger-soft text-danger-text flex items-center justify-center [&>svg]:w-[15px] [&>svg]:h-[15px]">
        <AlertTriangle strokeWidth={1.5} />
      </div>
      {/* role="alert" 只圈定实际要播报的错误信息（标题 + 可选详情），不含
          下面的重试按钮——按钮不是要播报的内容，混进 alert 容器里会让屏幕
          阅读器把按钮文字也当成播报的一部分。 */}
      {detail ? (
        <div role="alert">
          <p className="text-sm font-medium text-ink-700">{message}</p>
          <p className="text-xs text-ink-400 max-w-72">{detail}</p>
        </div>
      ) : (
        <p role="alert" className="text-sm font-medium text-ink-700">{message}</p>
      )}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  )
}
