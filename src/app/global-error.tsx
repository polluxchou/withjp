'use client'
import { useEffect, useState } from 'react'
import './globals.css'
import {
  ADMIN_DEFAULT_LOCALE,
  GLOBAL_ERROR_COPY,
  resolveBoundaryLocale,
  type BoundaryLocale,
} from '@/lib/observability/global-error-copy'
import { useReportBoundaryError } from '@/lib/observability/useReportBoundaryError'

// 最后一道兜底：根 layout 自身出错、或错误一路冒到最顶时渲染。它顶替整个根 layout，
// 所以自带 <html>/<body>，也拿不到 NextIntlClientProvider —— 文案走
// global-error-copy.ts（messages 的镜像），语言从地址推。
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // 服务端渲染时没有 window，先用默认语言，挂上后再按地址校正。
  const [locale, setLocale] = useState<BoundaryLocale>(ADMIN_DEFAULT_LOCALE)
  useEffect(() => {
    setLocale(resolveBoundaryLocale(window.location.hostname, window.location.pathname))
  }, [])
  useReportBoundaryError('global', error)
  const copy = GLOBAL_ERROR_COPY[locale]

  return (
    <html lang={locale}>
      <body className="font-sans">
        <title>{copy.title}</title>
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md rounded-card border border-line bg-surface px-5 py-10 text-center shadow-card">
            <div role="alert" className="space-y-1">
              <h1 className="text-sm font-medium text-ink-700">{copy.title}</h1>
              <p className="text-xs text-ink-400">{copy.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => retry()}
              className="mt-4 inline-flex h-7 items-center rounded-btn bg-primary-soft px-3 text-xs font-medium text-primary-hover transition-colors hover:bg-primary-soft-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              {copy.retry}
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
