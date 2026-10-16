export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'
import CommandPanel from '@/components/intent/CommandPanel'
import { CurrencyProvider } from '@/lib/currency'
import { requirePageUser } from '@/lib/auth/require-page-user'

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  // 服务端登录检查：middleware 之外的第二道门，见 src/lib/auth/page-session.ts。
  await requirePageUser(params.locale)

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
