'use client'

import { CheckCircle2, MessageSquare, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Thread } from '@/lib/discussions/types'

interface Props {
  threads:        Thread[]
  onPick:         (thread: Thread) => void
  onStartNew:     () => void
  onClose:        () => void
  subjectLabel?:  string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Open threads first, then by updated_at desc.
function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export default function ThreadList({ threads, onPick, onStartNew, onClose, subjectLabel }: Props) {
  const tPanel  = useTranslations('discussions.panel')
  const tThread = useTranslations('discussions.thread')
  const sorted = sortThreads(threads)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{tPanel('listTitle')}</h2>
          {subjectLabel && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {tPanel('subjectLine', { label: subjectLabel })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tPanel('close')}
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">{tPanel('empty')}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map(t => {
              const isResolved = t.status === 'resolved'
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-slate-500">{t.topicCode}</span>
                      {isResolved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> {tThread('resolved')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          <MessageSquare className="w-3 h-3" /> {tThread('open')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-900 truncate">{t.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {tThread('lastActivity', { date: fmtDate(t.updatedAt) })}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onStartNew}
          className="w-full inline-flex items-center justify-center gap-1 text-xs font-medium px-3 py-2 rounded-md border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" />
          {tPanel('startNew')}
        </button>
      </div>
    </div>
  )
}
