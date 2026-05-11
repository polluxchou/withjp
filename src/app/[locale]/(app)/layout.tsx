export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen p-8">
        {children}
      </main>
    </>
  )
}
