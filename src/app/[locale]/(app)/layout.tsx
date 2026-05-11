export const dynamic = 'force-dynamic'

import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main
        className="min-h-screen p-8 transition-[margin-left] duration-200"
        style={{ marginLeft: 'var(--sidebar-width, 240px)' }}
      >
        {children}
      </main>
    </>
  )
}
