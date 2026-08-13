import type { ReactNode } from 'react'

interface HeaderProps { title: ReactNode; subtitle?: string; actions?: ReactNode; tabs?: ReactNode; search?: ReactNode }

export default function Header({ title, subtitle, actions, tabs, search }: HeaderProps) {
  return (
    <div className="mb-4 sm:mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-title text-ink-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-ink-500 mt-1">{subtitle}</p>}
        </div>
        {(actions || search) && (
          <div className="flex items-center gap-2.5 flex-wrap">{search}{actions}</div>
        )}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  )
}
