'use client'
import AdminRouteError from '@/components/layout/AdminRouteError'

// 后台页面渲染出错时的兜底：侧栏还在，只有内容区换成这块。
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AdminRouteError error={error} retry={retry} />
}
