'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Plus, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import type { Message, Thread } from '@/lib/discussions/types'

interface Props {
  thread:     Thread
  onClose:    () => void
  onBack?:    () => void
  // Always available: lets the user start a fresh discussion on the
  // same subject without backtracking through the list. Especially
  // important when this ThreadView was auto-routed (single thread) and
  // there's no list to return to.
  onStartNew?: () => void
  // Fired after a successful resolve so the parent can refresh counts.
  onResolved?: (thread: Thread) => void
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

export default function ThreadView({ thread: initialThread, onClose, onBack, onStartNew, onResolved }: Props) {
  const tThread = useTranslations('discussions.thread')
  const tPanel  = useTranslations('discussions.panel')
  const me = useCurrentUser()
  const [thread, setThread]     = useState<Thread>(initialThread)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)
  const [draft, setDraft]       = useState('')
  const [posting, setPosting]   = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { setThread(initialThread) }, [initialThread])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/discussions/threads/${thread.id}/messages`)
      const json = await res.json() as { data: Message[] | null; error: string | null }
      if (!res.ok || json.error || !json.data) {
        setError(json.error ?? tThread('loadMessagesFailed'))
        return
      }
      setMessages(json.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : tThread('loadMessagesFailed'))
    } finally {
      setLoading(false)
    }
  }, [thread.id, tThread])

  useEffect(() => { void loadMessages() }, [loadMessages])

  const send = useCallback(async () => {
    const body = draft.trim()
    if (body.length === 0 || posting) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/discussions/threads/${thread.id}/messages`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ body }),
      })
      const json = await res.json() as { data: Message | null; error: string | null }
      if (!res.ok || json.error || !json.data) {
        setError(json.error ?? tThread('sendFailed'))
        return
      }
      setMessages(prev => [...prev, json.data!])
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : tThread('sendFailed'))
    } finally {
      setPosting(false)
    }
  }, [draft, posting, thread.id, tThread])

  const resolve = useCallback(async () => {
    if (resolving || thread.status === 'resolved') return
    setResolving(true)
    setError(null)
    try {
      const res = await fetch(`/api/discussions/threads/${thread.id}/resolve`, { method: 'PATCH' })
      const json = await res.json() as { data: Thread | null; error: string | null }
      if (!res.ok || json.error || !json.data) {
        setError(json.error ?? tThread('resolveFailed'))
        return
      }
      setThread(json.data)
      onResolved?.(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : tThread('resolveFailed'))
    } finally {
      setResolving(false)
    }
  }, [resolving, thread.id, thread.status, onResolved, tThread])

  const isResolved = thread.status === 'resolved'
  const canResolve = !isResolved && (me?.is_admin || me?.id === thread.createdByUserId)
  const label = String((thread.subjectPayload as { label?: string }).label ?? '')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={tPanel('back')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500">{thread.topicCode}</span>
              {isResolved && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="w-3 h-3" /> {tThread('resolved')}
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-slate-900 truncate">{thread.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onStartNew && (
            <button
              type="button"
              onClick={onStartNew}
              aria-label={tThread('startAnother')}
              title={tThread('startAnother')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              onClick={resolve}
              disabled={resolving}
              className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {resolving ? '…' : tThread('resolveAction')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tPanel('close')}
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subject summary */}
      {label && (
        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
          {tPanel('subjectLine', { label })}
        </div>
      )}

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> {tThread('loading')}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">{tThread('emptyMessages')}</div>
        ) : (
          messages.map(msg => {
            const isMine = me?.id === msg.senderUserId
            const senderLabel =
              msg.senderType === 'agent'    ? tThread('senderAgent') :
              msg.senderType === 'external' ? tThread('senderExternal') :
              isMine                        ? tThread('senderYou')    :
                                              tThread('senderOther')
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-0.5">
                  <span>{senderLabel}</span>
                  <span>·</span>
                  <span>{fmtDateTime(msg.createdAt)}</span>
                </div>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
                  isMine
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-900'
                }`}>
                  {msg.body}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</div>
      )}

      {/* Composer or resolved-notice */}
      {isResolved ? (
        <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 bg-slate-50">
          {thread.resolvedAt
            ? tThread('resolvedNoticeAt', { time: fmtDateTime(thread.resolvedAt) })
            : tThread('resolvedNotice')}
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-slate-100">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              placeholder={tThread('draftPlaceholder')}
              className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={posting || draft.trim().length === 0}
              className="h-9 px-3 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {tThread('send')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
