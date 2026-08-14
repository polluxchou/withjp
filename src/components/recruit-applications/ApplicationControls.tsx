'use client'

// recruit-applications/page.tsx 是 Server Component（直接查库，force-dynamic），
// 但 Tabs 的 onChange 与 ErrorState 的 onRetry 都要求可执行的函数 —— 函数不能
// 从 Server Component 传给 Client Component。这里用两个薄客户端壳承接交互，
// 而不是把整页改成 'use client' + 客户端 fetch（会偏离本页现有的直连数据库
// 读取方式，属于超出本任务范围的架构改动）。
// 均为对已登记 UI 组件（Tabs / ErrorState）的组合调用，不是新的设计系统原语，
// 不需要进 docs/design-system.md §6.2 登记。
import { useRouter, usePathname } from '@/i18n/navigation'
import Tabs from '@/components/ui/Tabs'
import ErrorState from '@/components/ui/ErrorState'

interface ApplicationTabsProps {
  value: string
  label: string
  items: { value: string; label: string }[]
}

/** tab 切换即导航：'creator' 是默认落地 tab，省略查询参数保持链接干净
 *  （与 expenses/page.tsx 'list' 默认 tab 的处理同一约定）。 */
export function ApplicationTabs({ value, label, items }: ApplicationTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <Tabs
      items={items}
      value={value}
      label={label}
      onChange={(next) => router.push(next === 'creator' ? pathname : `${pathname}?tab=${next}`)}
    />
  )
}

interface ApplicationErrorStateProps {
  detail?: string
}

/** 重试 = router.refresh()：重新触发 Server Component 的数据请求，
 *  与 login/page.tsx、ProfileEditor.tsx 里已有的 refresh 用法一致。 */
export function ApplicationErrorState({ detail }: ApplicationErrorStateProps) {
  const router = useRouter()
  return <ErrorState detail={detail} onRetry={() => router.refresh()} />
}
