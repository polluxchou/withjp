import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  sub?: string
  accent?: string
}

export default function StatsCard({ label, value, icon: Icon, sub, accent = 'bg-primary-soft text-primary' }: StatsCardProps) {
  return (
    <div className="bg-white rounded-card border border-zinc-200 shadow-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-zinc-500 font-medium uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 mt-1">{value}</p>
          {sub && <p className="text-[10px] sm:text-xs text-zinc-400 mt-1 truncate">{sub}</p>}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
    </div>
  )
}
