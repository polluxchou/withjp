'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Send,
  Plus,
  MessageSquare,
  Loader2,
  Search,
  Users,
  MoreHorizontal,
  Pin,
  Sparkles,
  CornerDownLeft,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Agent, Conversation, ConversationMessage } from '@/lib/types'

// ── Department display metadata ────────────────────────────────

const DEPT_META: Record<string, { color: string; initials: string }> = {
  bd:      { color: '#3b82f6', initials: 'BD' },
  ops:     { color: '#a855f7', initials: 'OP' },
  finance: { color: '#10b981', initials: 'FI' },
  content: { color: '#ec4899', initials: 'CO' },
  growth:  { color: '#f59e0b', initials: 'GR' },
  legal:   { color: '#475569', initials: 'LG' },
}

const KNOWN_ROLES = ['bd', 'ops', 'finance', 'content', 'growth', 'legal'] as const

function isKnownRole(role: string): role is typeof KNOWN_ROLES[number] {
  return (KNOWN_ROLES as readonly string[]).includes(role)
}

function AgentAvatar({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = DEPT_META[role] ?? { color: '#6366f1', initials: '??' }
  const dim  = size === 'sm' ? 28 : size === 'lg' ? 36 : 32
  const font = size === 'sm' ? 11 : size === 'lg' ? 13 : 12
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: dim, height: dim, fontSize: font, background: meta.color, letterSpacing: '-0.02em' }}
    >
      {meta.initials}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diffMs = now - d.getTime()
  // Future / clock-skew: treat as "now" rather than negative.
  if (diffMs < 0) return 'now'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 30) return 'now'
  const min = Math.floor(sec / 60)
  if (min < 1) return `${sec}s`
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  // older: M/D
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── Main page ─────────────────────────────────────────────────

export default function WorkspacePage() {
  const t = useTranslations('workspace')
  const tRoles = useTranslations('roles')
  const [agents,           setAgents]           = useState<Agent[]>([])
  const [selectedAgent,    setSelectedAgent]    = useState<Agent | null>(null)
  const [conversation,     setConversation]     = useState<Conversation | null>(null)
  const [messages,         setMessages]         = useState<ConversationMessage[]>([])
  const [input,            setInput]            = useState('')
  const [loadingAgents,    setLoadingAgents]    = useState(true)
  const [loadingMessages,  setLoadingMessages]  = useState(false)
  const [sending,          setSending]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [search,           setSearch]           = useState('')
  // Tick once a minute so relative timestamps (`5m` → `6m`) update without reload.
  const [, setTick]                              = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Load agents on mount ────────────────────────────────────
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((j) => {
        const chatAgents = (j.data ?? []).filter((a: Agent) => a.chat_enabled !== false)
        setAgents(chatAgents)
      })
      .catch((err) => console.error('Failed to load agents:', err))
      .finally(() => setLoadingAgents(false))
  }, [])

  // ── Scroll to bottom on new messages ───────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Select agent → fetch or create conversation ────────────
  const selectAgent = useCallback(async (agent: Agent) => {
    setSelectedAgent(agent)
    setMessages([])
    setConversation(null)
    setError(null)
    setLoadingMessages(true)

    try {
      const res  = await fetch(`/api/conversations?agent_id=${agent.id}`)
      const json = await res.json()
      const convList: Conversation[] = json.data ?? []

      if (convList.length > 0) {
        const latest = convList[0]
        setConversation(latest)
        const msgRes  = await fetch(`/api/conversations/${latest.id}/messages`)
        const msgJson = await msgRes.json()
        setMessages(msgJson.data ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadConversationFailed'))
    } finally {
      setLoadingMessages(false)
      inputRef.current?.focus()
    }
  }, [t])

  const roleLabel = (role: string) => isKnownRole(role) ? tRoles(role) : role

  async function startNewChat() {
    if (!selectedAgent) return
    setMessages([])
    setConversation(null)
    setError(null)
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selectedAgent || !input.trim() || sending) return

    const content = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    const tempUserMsg: ConversationMessage = {
      id:              `temp-${Date.now()}`,
      conversation_id: conversation?.id ?? '',
      sender_type:     'user',
      agent_id:        null,
      content,
      created_at:      new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      let convId = conversation?.id

      if (!convId) {
        const createRes  = await fetch('/api/conversations', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ agent_id: selectedAgent.id }),
        })
        const createJson = await createRes.json()
        if (createJson.error) throw new Error(createJson.error)
        convId = createJson.data.id
        setConversation(createJson.data)
      }

      const msgRes  = await fetch(`/api/conversations/${convId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      const msgJson = await msgRes.json()
      if (msgJson.error) throw new Error(msgJson.error)

      const histRes  = await fetch(`/api/conversations/${convId}/messages`)
      const histJson = await histRes.json()
      setMessages(histJson.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return agents
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        roleLabel(a.role).toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, search, tRoles])

  // Decide whether to show avatar + author head for each message:
  // only on speaker change.
  const renderedMessages = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1]
      const showHead =
        !prev ||
        prev.sender_type !== m.sender_type ||
        (m.sender_type === 'agent' && prev.agent_id !== m.agent_id)
      return { m, showHead }
    })
  }, [messages])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="flex h-[calc(100vh-64px)] -my-8 -mx-8"
      style={{ background: '#fbfbfb', color: '#18181b', fontFamily: "'Geist', system-ui, -apple-system, sans-serif" }}
    >
      {/* ── ThreadList (agent inbox) ── */}
      <aside
        className="w-72 flex flex-col flex-shrink-0 bg-white"
        style={{ borderRight: '1px solid #ececec' }}
      >
        {/* Inbox header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900">{t('title')}</span>
          <button
            disabled={!selectedAgent}
            onClick={startNewChat}
            title={t('newChat')}
            className="w-6 h-6 grid place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="mx-3 mb-2">
          <div
            className="flex items-center gap-2 px-2.5 h-7 rounded-md text-[11px] text-zinc-500"
            style={{ background: '#fafafa', border: '1px solid #ececec' }}
          >
            <Search className="w-3 h-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('subtitle')}
              className="flex-1 bg-transparent outline-none text-[11px] placeholder-zinc-400 text-zinc-900"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pb-2 text-[11px]">
          <span
            className="px-2 py-1 rounded-md text-zinc-900 font-medium flex items-center gap-1.5"
            style={{ background: '#f4f4f5' }}
          >
            All
            <span
              className="px-1 rounded text-[10px] text-zinc-500"
              style={{ background: '#ffffff', border: '1px solid #ececec', fontFamily: "'Geist Mono', ui-monospace, monospace" }}
            >
              {agents.length}
            </span>
          </span>
          <span className="px-2 py-1 rounded-md text-zinc-500">Chats</span>
          <span className="px-2 py-1 rounded-md text-zinc-500">Mentions</span>
        </div>

        {/* Thread list */}
        <nav className="flex-1 overflow-y-auto px-1.5 pb-4">
          {loadingAgents ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
            </div>
          ) : (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-2.5 h-2.5" />
                <span>AI Agents · {filteredAgents.length}</span>
              </div>
              {filteredAgents.map((agent) => {
                const isActive = selectedAgent?.id === agent.id
                return (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent)}
                    className={`relative w-full flex items-start gap-2.5 px-3 py-2 text-left rounded-md transition-colors ${
                      isActive ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <AgentAvatar role={agent.role} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <div className="text-[13px] font-medium truncate text-zinc-900 leading-tight">
                          {agent.name.split(' ')[0]}
                        </div>
                        <div
                          className="ml-auto text-[10px] text-zinc-400 flex-shrink-0"
                          style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                        >
                          {roleLabel(agent.role)}
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate leading-snug">
                        <span className="text-zinc-700 font-medium">AI · </span>
                        {agent.responsibility}
                      </div>
                    </div>
                    {!agent.is_active && (
                      <span className="absolute right-3 top-2 text-[10px] text-zinc-300">{t('offline')}</span>
                    )}
                  </button>
                )
              })}
            </>
          )}
        </nav>
      </aside>

      {/* ── Chat Panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedAgent ? (
          <GroupHeader agent={selectedAgent} roleLabel={roleLabel} />
        ) : (
          <div
            className="flex items-center gap-2 px-6 h-14 bg-white"
            style={{ borderBottom: '1px solid #ececec' }}
          >
            <MessageSquare className="w-4 h-4 text-zinc-300" />
            <span className="text-[13px] text-zinc-400">{t('selectAgent')}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#fbfbfb' }}>
          <div className="max-w-3xl mx-auto px-6 py-6">
            {!selectedAgent && (
              <div className="flex flex-col items-center justify-center text-center pt-16">
                <div className="grid grid-cols-3 gap-3 mb-6 w-full max-w-md">
                  {Object.entries(DEPT_META).map(([role, { color, initials }]) => (
                    <div
                      key={role}
                      className="bg-white p-4 text-center"
                      style={{ border: '1px solid #ececec', borderRadius: 10 }}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs mx-auto mb-2"
                        style={{ background: color }}
                      >
                        {initials}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-700">{roleLabel(role)}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-zinc-400">{t('chooseAgent')}</p>
              </div>
            )}

            {selectedAgent && loadingMessages && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
              </div>
            )}

            {selectedAgent && !loadingMessages && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center pt-16">
                <AgentAvatar role={selectedAgent.role} size="lg" />
                <div className="mt-3 text-[14px] font-medium text-zinc-900">{selectedAgent.name}</div>
                <div className="text-[12px] text-zinc-500 mt-1 max-w-sm leading-relaxed">
                  {isKnownRole(selectedAgent.role) ? t(`hints.${selectedAgent.role}`) : t('hints.default')}
                </div>
              </div>
            )}

            <div className="flex flex-col">
              {renderedMessages.map(({ m, showHead }) => (
                <FCMessage
                  key={m.id}
                  message={m}
                  agent={selectedAgent}
                  showHead={showHead}
                  roleLabel={roleLabel}
                  youLabel={t('agentFallback')}
                />
              ))}

              {sending && selectedAgent && (
                <div className="flex items-start gap-3 px-2 pt-2">
                  <AgentAvatar role={selectedAgent.role} size="sm" />
                  <div className="flex items-center gap-1 py-2">
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-2 text-[11px] text-zinc-400">
                      {selectedAgent.name.split(' ')[0]} typing…
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 text-[12px] text-red-600 bg-red-50 rounded-md" style={{ border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {/* Composer */}
        <div className="flex-shrink-0 px-6 pb-5 pt-2" style={{ background: '#fbfbfb' }}>
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={sendMessage}
              className="bg-white rounded-xl transition-all focus-within:shadow-sm"
              style={{ border: '1px solid #ececec' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedAgent
                    ? t('messagePlaceholder', { agent: selectedAgent.name.split(' ')[0] })
                    : t('selectAgentFirst')
                }
                disabled={!selectedAgent || sending}
                rows={1}
                className="w-full px-4 pt-3 pb-1 text-[13px] text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto bg-transparent leading-relaxed"
                style={{ minHeight: '28px' }}
              />
              <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 grid place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Attach (coming soon)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 grid place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Mention (coming soon)"
                >
                  <span
                    className="text-[13px] font-semibold leading-none"
                    style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                  >
                    @
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 grid place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Workflow (coming soon)"
                >
                  <span
                    className="text-[13px] font-semibold leading-none"
                    style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                  >
                    /
                  </span>
                </button>
                <span className="ml-2 text-[11px] text-zinc-400 hidden sm:inline-flex items-center gap-1.5">
                  <kbd
                    className="inline-flex items-center justify-center px-1 h-4 text-[10px] text-zinc-500 rounded"
                    style={{ background: '#fafafa', border: '1px solid #ececec', fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                  >
                    <CornerDownLeft className="w-2.5 h-2.5" />
                  </kbd>
                  send
                  <kbd
                    className="inline-flex items-center justify-center px-1 h-4 text-[10px] text-zinc-500 rounded"
                    style={{ background: '#fafafa', border: '1px solid #ececec', fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                  >
                    ⇧↵
                  </kbd>
                  new line
                </span>
                <button
                  type="submit"
                  disabled={!selectedAgent || !input.trim() || sending}
                  className="ml-auto w-8 h-7 grid place-items-center rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </form>
            <p className="text-[11px] text-zinc-400 text-center mt-2 leading-snug">
              {t('footerNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Group header (chat header) ─────────────────────────────────

function GroupHeader({ agent, roleLabel }: { agent: Agent; roleLabel: (r: string) => string }) {
  const [pinned, setPinned] = useState(false)
  return (
    <div
      className="flex items-center gap-3 px-6 h-14 bg-white flex-shrink-0"
      style={{ borderBottom: '1px solid #ececec' }}
    >
      <AgentAvatar role={agent.role} size="lg" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-zinc-900 truncate">{agent.name}</span>
          {pinned && <Pin className="w-3 h-3 text-zinc-400" />}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-violet-700" />
            <span style={{ color: '#6d28d9' }}>AI · {roleLabel(agent.role)}</span>
          </span>
          <span className="text-zinc-300">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${agent.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
            <span>{agent.is_active ? 'Active' : 'Offline'}</span>
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <HeaderIconBtn
          active={pinned}
          title={pinned ? 'Unpin' : 'Pin'}
          onClick={() => setPinned((p) => !p)}
        >
          <Pin className="w-3.5 h-3.5" />
        </HeaderIconBtn>
        <HeaderIconBtn title="Search">
          <Search className="w-3.5 h-3.5" />
        </HeaderIconBtn>
        <HeaderIconBtn title="Members">
          <Users className="w-3.5 h-3.5" />
        </HeaderIconBtn>
        <HeaderIconBtn title="More">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </HeaderIconBtn>
      </div>
    </div>
  )
}

function HeaderIconBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode
  title: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${
        active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  )
}

// ── Flat message (Slack/Cursor-style) ──────────────────────────

function FCMessage({
  message,
  agent,
  showHead,
  roleLabel,
  youLabel,
}: {
  message: ConversationMessage
  agent: Agent | null
  showHead: boolean
  roleLabel: (r: string) => string
  youLabel: string
}) {
  const isUser = message.sender_type === 'user'
  const author = isUser
    ? { name: 'You', role: 'me' }
    : { name: agent?.name ?? youLabel, role: agent?.role ?? '' }

  const avatar = isUser ? (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: 28, height: 28, fontSize: 11, background: '#18181b' }}
    >
      ME
    </div>
  ) : (
    <AgentAvatar role={author.role} size="sm" />
  )

  return (
    <div
      className={`flex items-start gap-3 px-2 ${showHead ? 'pt-4' : 'pt-0.5'} pb-0.5 hover:bg-zinc-50/60 rounded`}
    >
      {showHead ? (
        avatar
      ) : (
        <div style={{ width: 28, height: 28, flexShrink: 0 }} />
      )}
      <div className="min-w-0 flex-1">
        {showHead && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`text-[13px] font-semibold ${isUser ? 'text-zinc-900' : ''}`} style={isUser ? undefined : { color: '#6d28d9' }}>
              {author.name}
            </span>
            {!isUser && agent && (
              <span
                className="text-[10px] text-zinc-400"
                style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
              >
                AI · {roleLabel(agent.role)}
              </span>
            )}
            <span
              className="text-[10px] text-zinc-400"
              style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
            >
              {formatTime(message.created_at)}
            </span>
          </div>
        )}
        <div className="text-[13px] text-zinc-800 leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  )
}
