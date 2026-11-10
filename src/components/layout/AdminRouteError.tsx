'use client'
import { useTranslations } from 'next-intl'
import ErrorState from '@/components/ui/ErrorState'
import { useReportBoundaryError } from '@/lib/observability/useReportBoundaryError'

/**
 * 后台路由级错误边界的内容（(app)/error.tsx 与 [locale]/error.tsx 共用）。
 * 不展示原始报错：只给通用说明 + 重试 + digest 编号。digest 与服务端
 * onRequestError 那条日志里的是同一个，用户报上来能直接对回日志。
 */
export default function AdminRouteError({
  error,
  retry,
  fullPage = false,
}: {
  error: Error & { digest?: string }
  retry: () => void
  /** 没有后台外壳（侧栏）时撑满整屏居中 */
  fullPage?: boolean
}) {
  const t = useTranslations('errorPages')
  useReportBoundaryError('admin', error)

  return (
    <div className={fullPage ? 'flex min-h-screen items-center justify-center px-4' : 'pt-10'}>
      <div className="mx-auto w-full max-w-md rounded-card border border-line bg-surface px-5 shadow-card">
        <ErrorState title={t('title')} detail={t('hint')} onRetry={retry} />
        {error.digest && (
          <p className="-mt-6 pb-6 text-center font-mono text-xs text-ink-400">
            {t('digest', { digest: error.digest })}
          </p>
        )}
      </div>
    </div>
  )
}
