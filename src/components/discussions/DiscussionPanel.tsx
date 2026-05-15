'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Message, SubjectInput, Thread } from '@/lib/discussions/types'
import {
  useInvalidateDiscussion,
  useSetDiscussionCount,
} from './DiscussionContext'
import ThreadList from './ThreadList'
import ThreadView from './ThreadView'

interface Props {
  open:     boolean
  subject:  SubjectInput | null
  onClose:  () => void
}

type View =
  | { kind: 'list' }
  | { kind: 'compose' }
  | { kind: 'thread'; thread: Thread; cameFromList: boolean }

// Build a GET query string for the threads list endpoint.
function buildListQuery(subject: SubjectInput): string {
  const sp = new URLSearchParams()
  sp.set('serviceKey', subject.serviceKey)
  sp.set('entityType', subject.entityType)
  if (subject.subjectType === 'filter') {
    sp.set('filters', JSON.stringify(subject.filters))
    sp.set('label', subject.label)
    sp.set('route', subject.route)
  } else {
    sp.set('entityId', subject.entityId)
  }
  return sp.toString()
}

export default function DiscussionPanel({ open, subject, onClose }: Props) {
  const tPanel = useTranslations('discussions.panel')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const invalidate = useInvalidateDiscussion()
  const setCount   = useSetDiscussionCount()

  const [threads, setThreads]   = useState<Thread[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [view, setView]         = useState<View>({ kind: 'list' })
  const [draftTitle, setDraftTitle]     = useState('')
  const [draftMessage, setDraftMessage] = useState('')
  const [creating, setCreating] = useState(false)

  // Reset internal state when the subject changes or panel opens.
  useEffect(() => {
    if (!open || !subject) return
    setView({ kind: 'list' })
    setDraftTitle('')
    setDraftMessage('')
    setError(null)
  }, [open, subject])

  // ESC to close.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Load threads when the panel becomes visible.
  const loadThreads = useCallback(async () => {
    if (!subject) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/discussions/threads?${buildListQuery(subject)}`)
      const json = await res.json() as { data: Thread[] | null; error: string | null }
      if (!res.ok || json.error || !json.data) {
        setError(json.error ?? tPanel('loadFailed'))
        return
      }
      setThreads(json.data)
      // Auto-route: 0 → compose, 1 → thread view, >1 → list.
      // "+ 新建讨论" is reachable from inside ThreadView's header even
      // after auto-routing to a single (possibly resolved) thread.
      if (json.data.length === 0) setView({ kind: 'compose' })
      else if (json.data.length === 1) setView({ kind: 'thread', thread: json.data[0], cameFromList: false })
      else setView({ kind: 'list' })
    } catch (e) {
      setError(e instanceof Error ? e.message : tPanel('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [subject, tPanel])

  useEffect(() => { if (open && subject) void loadThreads() }, [open, subject, loadThreads])

  const submitCompose = useCallback(async () => {
    if (!subject || creating) return
    const title = draftTitle.trim()
    const body  = draftMessage.trim()
    if (title.length === 0) { setError(tPanel('titleRequired')); return }
    if (body.length === 0)  { setError(tPanel('messageRequired')); return }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/discussions/threads', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ subject, title, firstMessage: body }),
      })
      const json = await res.json() as {
        data: { thread: Thread; firstMessage: Message } | null
        error: string | null
      }
      if (!res.ok || json.error || !json.data) {
        setError(json.error ?? tPanel('createFailed'))
        return
      }
      // Update the count cache directly so the badge flips to [讨论 1]
      // without waiting on the next batch fetch.
      const all = [json.data.thread, ...threads]
      setThreads(all)
      setCount(subject, {
        openCount:     all.filter(t => t.status === 'open').length,
        resolvedCount: all.filter(t => t.status === 'resolved').length,
      })
      // After creating, the new thread lands as ThreadView. If we now have
      // ≥2 threads total, the user benefits from a "back to list" affordance
      // (the just-created thread plus the earlier one(s)).
      setView({ kind: 'thread', thread: json.data.thread, cameFromList: all.length >= 2 })
      setDraftTitle('')
      setDraftMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : tPanel('createFailed'))
    } finally {
      setCreating(false)
    }
  }, [subject, creating, draftTitle, draftMessage, threads, setCount, tPanel])

  const onResolved = useCallback((updated: Thread) => {
    if (!subject) return
    const next = threads.map(t => (t.id === updated.id ? updated : t))
    setThreads(next)
    invalidate(subject)
  }, [subject, threads, invalidate])

  if (!open || !subject || !mounted) return null

  const subjectLabel = subject.label

  const panelContent = (() => {
    if (loading) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">{tPanel('title')}</h2>
            <button onClick={onClose} aria-label={tPanel('close')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> {tPanel('loading')}
          </div>
        </div>
      )
    }

    if (view.kind === 'compose') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">{tPanel('newTitle')}</h2>
              {subjectLabel && (
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {tPanel('subjectLine', { label: subjectLabel })}
                </p>
              )}
            </div>
            <button onClick={onClose} aria-label={tPanel('close')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{tPanel('titleLabel')}</label>
              <input
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                maxLength={200}
                placeholder={tPanel('titlePlaceholder')}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{tPanel('messageLabel')}</label>
              <textarea
                value={draftMessage}
                onChange={e => setDraftMessage(e.target.value)}
                rows={5}
                placeholder={tPanel('messagePlaceholder')}
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            {error && <div className="text-xs text-red-600">{error}</div>}
          </div>
          <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2 justify-end">
            {threads.length > 0 && (
              <button
                type="button"
                onClick={() => setView({ kind: 'list' })}
                className="text-xs px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50"
              >
                {tPanel('cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void submitCompose()}
              disabled={creating}
              className="text-xs font-medium px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {tPanel('submit')}
            </button>
          </div>
        </div>
      )
    }

    if (view.kind === 'thread') {
      return (
        <ThreadView
          thread={view.thread}
          onClose={onClose}
          onBack={view.cameFromList ? () => setView({ kind: 'list' }) : undefined}
          onStartNew={() => setView({ kind: 'compose' })}
          onResolved={onResolved}
        />
      )
    }

    // view.kind === 'list'
    return (
      <ThreadList
        threads={threads}
        onPick={(t) => setView({ kind: 'thread', thread: t, cameFromList: true })}
        onStartNew={() => setView({ kind: 'compose' })}
        onClose={onClose}
        subjectLabel={subjectLabel}
      />
    )
  })()

  const content = (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white shadow-2xl w-full sm:w-[460px] h-full flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {panelContent}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
