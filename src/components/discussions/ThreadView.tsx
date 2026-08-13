'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Send, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import type { Message, Thread } from '@/lib/discussions/types'
import { toneOf } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'

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

  const deleteMessageAction = useCallback(async (messageId: string) => {
    if (!confirm(tThread('deleteConfirm'))) return
    setError(null)
    try {
      const res = await fetch(`/api/discussions/threads/${thread.id}/messages/${messageId}`, {
        method: 'DELETE',
      })
      const json = await res.json() as { data: unknown; error: string | null }
      if (!res.ok || json.error) {
        setError(json.error ?? tThread('deleteFailed'))
        return
      }
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (e) {
      setError(e instanceof Error ? e.message : tThread('deleteFailed'))
    }
  }, [thread.id, tThread])

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={tPanel('back')}
              className={`w-8 h-8 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-ink-500">{thread.topicCode}</span>
              {isResolved && (
                <Tag label={tThread('resolved')} tone={toneOf('thread', thread.status)} size="sm" />
              )}
            </div>
            <h2 className="text-sm font-semibold text-ink-900 truncate">{thread.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onStartNew && (
            <button
              type="button"
              onClick={onStartNew}
              aria-label={tThread('startAnother')}
              title={tThread('startAnother')}
              className={`w-8 h-8 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          {canResolve && (
            <Button variant="secondary" size="sm" onClick={() => void resolve()} disabled={resolving} loading={resolving}>
              {tThread('resolveAction')}
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tPanel('close')}
            className={`w-8 h-8 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Subject summary */}
      {label && (
        <div className="px-4 py-2 text-xs text-ink-500 border-b border-line-soft bg-canvas">
          {tPanel('subjectLine', { label })}
        </div>
      )}

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <LoadingState variant="plain" />
        ) : messages.length === 0 ? (
          <EmptyState title={tThread('emptyMessages')} />
        ) : (
          messages.map(msg => {
            const isMine = me?.id === msg.senderUserId
            const senderLabel =
              msg.senderType === 'agent'    ? tThread('senderAgent') :
              msg.senderType === 'external' ? tThread('senderExternal') :
              isMine                        ? tThread('senderYou')    :
                                              tThread('senderOther')
            const canDelete = isMine && msg.senderType === 'user'
            return (
              <div key={msg.id} className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 text-[11px] text-ink-400 mb-0.5">
                  <span>{senderLabel}</span>
                  <span>·</span>
                  <span>{fmtDateTime(msg.createdAt)}</span>
                </div>
                <div className={`flex items-center gap-1.5 max-w-[85%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`px-3 py-2 rounded-field text-sm whitespace-pre-wrap break-words ${
                    isMine
                      ? 'bg-primary-soft text-ink-900'
                      : 'bg-line-soft text-ink-900'
                  }`}>
                    {msg.body}
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void deleteMessageAction(msg.id)}
                      aria-label={tThread('deleteMessage')}
                      title={tThread('deleteMessage')}
                      // 滚动容器内的项（消息流 overflow-y-auto）：offset 变体会被裁切，
                      // 改用 ring-inset（§4 第二配方，就地书写不复用 FOCUS_RING）。
                      className="w-6 h-6 rounded-field flex items-center justify-center text-ink-400 hover:text-danger-text hover:bg-danger-soft opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-xs text-danger-text bg-danger-soft border-t border-danger-border">{error}</div>
      )}

      {/* Composer or resolved-notice */}
      {isResolved ? (
        <div className="px-4 py-3 border-t border-line-soft text-xs text-ink-500 bg-canvas">
          {thread.resolvedAt
            ? tThread('resolvedNoticeAt', { time: fmtDateTime(thread.resolvedAt) })
            : tThread('resolvedNotice')}
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-line-soft">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              size="sm"
              placeholder={tThread('draftPlaceholder')}
              className="flex-1"
            />
            <Button size="sm" onClick={() => void send()} disabled={draft.trim().length === 0} loading={posting}>
              {posting
                ? tThread('send')
                : <><Send className="w-3.5 h-3.5" strokeWidth={1.5} /> {tThread('send')}</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
