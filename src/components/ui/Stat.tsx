import { ReactNode } from 'react'
import type { Tone } from '@/lib/ui/status-tone'

interface StatProps { label: string; value: ReactNode; delta?: { text: string; tone?: Tone }; note?: string; tone?: 'default' | 'danger' }

export function Stat({ label, value, delta, note, tone = 'default' }: StatProps) {
  return (
    <div className="flex-1 min-w-0 px-5 py-4 border-r border-line-soft last:border-r-0">
      <div className="text-xs text-ink-500 mb-1.5">{label}</div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums truncate ${tone === 'danger' ? 'text-danger-text' : 'text-ink-900'}`}>{value}</div>
      {(delta || note) && (
        <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
          {delta && <span className={`text-micro font-semibold px-1.5 py-px rounded-btn ${delta.tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-success-soft text-success-text'}`}>{delta.text}</span>}
          {note && <span className="text-micro text-ink-400 truncate">{note}</span>}
        </div>
      )}
    </div>
  )
}

export function StatBand({ children }: { children: ReactNode }) {
  return <div className="flex bg-surface border border-line rounded-card shadow-card overflow-x-auto">{children}</div>
}
