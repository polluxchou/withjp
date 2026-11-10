'use client'
import AdminRouteError from '@/components/layout/AdminRouteError'

// 登录/找回密码页，以及后台 layout 自身（登录检查、侧栏）出错时的兜底。
// 官网有自己的边界（site/error.tsx），到不了这里。
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AdminRouteError error={error} retry={retry} fullPage />
}
