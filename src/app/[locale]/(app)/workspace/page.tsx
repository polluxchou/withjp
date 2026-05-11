'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, MessageSquare, Loader2 } from 'lucide-react'
import type { Agent, Conversation, ConversationMessage } from '@/lib/types'

// ── Department display metadata ────────────────────────────────

const DEPT_META: Record<string, { label: string; color: string; initials: string }> = {
  bd:      { label: 'Business Dev',   color: 'bg-blue-500',    initials: 'BD' },
  ops:     { label: 'Operations',     color: 'bg-purple-500',  initials: 'OP' },
  finance: { label: 'Finance',        color: 'bg-emerald-500', initials: 'FI' },
  content: { label: 'Content',        color: 'bg-pink-500',    initials: 'CO' },
  growth:  { label: 'Growth',         color: 'bg-orange-500',  initials: 'GR' },
  legal:   { label: 'Legal',          color: 'bg-slate-600',   initials: 'LG' },
}

function AgentAvatar({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = DEPT_META[role] ?? { color: 'bg-indigo-500', initials: '??' }
  const cls  = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return (
    <div className={`${cls} ${meta.color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {meta.initials}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function WorkspacePage() {
  const [agents,           setAgents]           = useState<Agent[]>([])
  const [selectedAgent,    setSelectedAgent]     = useState<Agent | null>(null)
  const [conversation,     setConversation]      = useState<Conversation | null>(null)
  const [messages,         setMessages]          = useState<ConversationMessage[]>([])
  const [input,            setInput]             = useState('')
  const [loadingAgents,    setLoadingAgents]     = useState(true)
  const [loadingMessages,  setLoadingMessages]   = useState(false)
  const [sending,          setSending]           = useState(false)
  const [error,            setError]             = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

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
      // Fetch most recent conversation for this agent
      const res  = await fetch(`/api/conversations?agent_id=${agent.id}`)
      const json = await res.json()
      const convList: Conversation[] = json.data ?? []

      if (convList.length > 0) {
        const latest = convList[0]
        setConversation(latest)
        // Load messages
        const msgRes  = await fetch(`/api/conversations/${latest.id}/messages`)
        const msgJson = await msgRes.json()
        setMessages(msgJson.data ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话失败')
    } finally {
      setLoadingMessages(false)
      inputRef.current?.focus()
    }
  }, [])

  // ── New chat ───────────────────────────────────────────────
  async function startNewChat() {
    if (!selectedAgent) return
    setMessages([])
    setConversation(null)
    setError(null)
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selectedAgent || !input.trim() || sending) return

    const content = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    // Optimistically add user message to UI
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

      // Create conversation on first message
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

      // Send message and get agent reply
      const msgRes  = await fetch(`/api/conversations/${convId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      const msgJson = await msgRes.json()
      if (msgJson.error) throw new Error(msgJson.error)

      // Reload full messages (removes optimistic msg, adds real ones with IDs)
      const histRes  = await fetch(`/api/conversations/${convId}/messages`)
      const histJson = await histRes.json()
      setMessages(histJson.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // Remove optimistic message on error
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

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] -my-8 -mx-8">

      {/* ── Agent Sidebar ── */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Workspace</h2>
          <p className="text-xs text-slate-400 mt-0.5">Select a department agent to chat</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {loadingAgents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : (
            agents.map((agent) => {
              const meta    = DEPT_META[agent.role] ?? { label: agent.role, color: 'bg-indigo-500' }
              const isActive = selectedAgent?.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => selectAgent(agent)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-50 border-r-2 border-indigo-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <AgentAvatar role={agent.role} size="sm" />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700' : 'text-slate-900'}`}>
                      {agent.name.split(' ')[0]}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{meta.label}</div>
                  </div>
                  {!agent.is_active && (
                    <span className="ml-auto text-xs text-slate-300">off</span>
                  )}
                </button>
              )
            })
          )}
        </nav>

        {selectedAgent && (
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Chat
            </button>
          </div>
        )}
      </aside>

      {/* ── Chat Panel ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        {selectedAgent ? (
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
            <AgentAvatar role={selectedAgent.role} size="lg" />
            <div>
              <div className="font-semibold text-slate-900">{selectedAgent.name}</div>
              <div className="text-xs text-slate-400 truncate max-w-md">{selectedAgent.responsibility}</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-slate-400">
                {DEPT_META[selectedAgent.role]?.label ?? selectedAgent.role}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200 bg-white">
            <MessageSquare className="w-4 h-4 text-slate-300" />
            <span className="text-sm text-slate-400">Select an agent to start chatting</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {!selectedAgent && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="grid grid-cols-3 gap-3 mb-6">
                {Object.entries(DEPT_META).map(([role, { label, color, initials }]) => (
                  <div key={role} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                    <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto mb-2`}>
                      {initials}
                    </div>
                    <div className="text-xs font-medium text-slate-700">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-400">Choose a department agent from the left to start a conversation.</p>
            </div>
          )}

          {selectedAgent && loadingMessages && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          )}

          {selectedAgent && !loadingMessages && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AgentAvatar role={selectedAgent.role} size="lg" />
              <div className="mt-3 font-medium text-slate-900">{selectedAgent.name}</div>
              <div className="text-sm text-slate-400 mt-1 max-w-sm">
                {getOpeningHint(selectedAgent.role)}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} agent={selectedAgent} />
          ))}

          {sending && (
            <div className="flex items-start gap-3">
              <AgentAvatar role={selectedAgent?.role ?? 'bd'} size="sm" />
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 px-4 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0 px-6 pb-6 pt-2">
          <form onSubmit={sendMessage} className="flex items-end gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-300 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedAgent ? `Message ${selectedAgent.name.split(' ')[0]}… (Enter to send, Shift+Enter for new line)` : 'Select an agent first…'}
              disabled={!selectedAgent || sending}
              rows={1}
              className="flex-1 text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
              style={{ minHeight: '24px' }}
            />
            <button
              type="submit"
              disabled={!selectedAgent || !input.trim() || sending}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          <p className="text-xs text-slate-400 text-center mt-2">
            Responses come from the selected agent&apos;s department persona. For binding decisions, always involve the relevant human team member.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────

function MessageBubble({ message, agent }: { message: ConversationMessage; agent: Agent | null }) {
  const isUser = message.sender_type === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      {agent && <AgentAvatar role={agent.role} size="sm" />}
      <div className="max-w-[72%]">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="text-xs text-slate-400 mt-1 ml-1">
          {agent?.name.split(' ')[0] ?? 'Agent'}
        </div>
      </div>
    </div>
  )
}

// ── Opening hint per department ───────────────────────────────

function getOpeningHint(role: string): string {
  const hints: Record<string, string> = {
    bd:      'Ask about outreach strategies, creator pipeline, negotiation tactics, or how to approach a specific prospect.',
    ops:     'Ask about onboarding checklists, live stream setup, scheduling, or go-live coordination.',
    finance: 'Ask about revenue calculations, ROI analysis, cost breakdowns, or settlement schedules.',
    content: 'Ask for content ideas, hook writing, script outlines, or viral content strategies.',
    growth:  'Ask about platform algorithms, audience growth tactics, or cross-promotion strategies.',
    legal:   'Ask about contract terms, platform policies, IP questions, or compliance considerations.',
  }
  return hints[role] ?? 'Start a conversation to get department-specific guidance.'
}
