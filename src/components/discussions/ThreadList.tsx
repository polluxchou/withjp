'use client'

import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Thread } from '@/lib/discussions/types'
import { toneOf } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{tPanel('listTitle')}</h2>
          {subjectLabel && (
            <p className="text-xs text-ink-500 truncate mt-0.5">
              {tPanel('subjectLine', { label: subjectLabel })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tPanel('close')}
          className={`w-8 h-8 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <EmptyState title={tPanel('empty')} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {sorted.map(t => {
              const tone = toneOf('thread', t.status)
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t)}
                    // 滚动容器内的项（列表 overflow-y-auto）：offset 变体会被裁切，
                    // 改用 ring-inset（§4 第二配方，就地书写不复用 FOCUS_RING）。
                    className="w-full text-left px-4 py-3 hover:bg-canvas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-ink-500">{t.topicCode}</span>
                      <Tag
                        label={t.status === 'resolved' ? tThread('resolved') : tThread('open')}
                        tone={tone}
                        variant="dot"
                        size="sm"
                      />
                    </div>
                    <div className="text-sm text-ink-900 truncate">{t.title}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">
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
      <div className="px-3 py-2 border-t border-line-soft">
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={onStartNew}>
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          {tPanel('startNew')}
        </Button>
      </div>
    </div>
  )
}
