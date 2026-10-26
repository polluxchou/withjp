export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'
import CommandPanel from '@/components/intent/CommandPanel'
import { CurrencyProvider } from '@/lib/currency'
import { requirePageUser } from '@/lib/auth/require-page-user'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'

export default async function AppLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const params = await props.params
  const { children } = props
  // 服务端登录检查：middleware 之外的第二道门，见 src/lib/auth/page-session.ts。
  // layout 是所有后台页共享的，受限帐号在这里放行，各页面（与 middleware）再各自拦。
  await requirePageUser(params.locale, { allowScope: COMPETITORS_SCOPE })

  return (
    <CurrencyProvider>
      <Sidebar />
      <main
        className="main-content min-h-screen px-4 pb-4 sm:p-6 md:p-8 transition-[margin-left] duration-200"
        style={{ marginLeft: 'var(--sidebar-width, 0px)' }}
      >
        {children}
      </main>
      <CommandPanel />
    </CurrencyProvider>
  )
}
