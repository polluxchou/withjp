export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'
import CommandBar from '@/components/intent/CommandBar'
import { CurrencyProvider } from '@/lib/currency'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <Sidebar />
      <main
        className="min-h-screen p-8 transition-[margin-left] duration-200"
        style={{ marginLeft: 'var(--sidebar-width, 240px)' }}
      >
        {children}
      </main>
      <CommandBar />
    </CurrencyProvider>
  )
}
