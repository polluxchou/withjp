export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'
import CommandBar from '@/components/intent/CommandBar'
import { CurrencyProvider } from '@/lib/currency'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <Sidebar />
      <main
        className="main-content min-h-screen px-4 pb-4 sm:p-6 md:p-8 transition-[margin-left] duration-200"
        style={{ marginLeft: 'var(--sidebar-width, 0px)' }}
      >
        {children}
      </main>
      <CommandBar />
    </CurrencyProvider>
  )
}
