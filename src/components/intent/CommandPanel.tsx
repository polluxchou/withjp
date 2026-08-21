'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'
import Tag from '@/components/ui/Tag'
import Transcript from './Transcript'
import Composer from './Composer'
import { notifyIntentApplied } from '@/lib/intent/events'
import { markSettled, priorContextOf, type ServerResult, type Turn } from '@/lib/intent/conversation'
import { FOCUS_RING } from '@/lib/ui/recipes'
import type { VenueAction } from '@/venue/layoutData'

// ── Venue scope registry ──────────────────────────────────────
// The venue editor registers a provider while mounted. When present, the command
// panel scopes intents to the current canvas and applies the parsed action
// client-side on confirm — it never touches other domains.
export type VenueIntentProvider = {
  getItems: () => { id: string; name: string; type: string }[]
  apply: (action: VenueAction) => void
}
let venueProvider: VenueIntentProvider | null = null
const VENUE_PROVIDER_EVENT = 'intent:venue-provider'
export function registerVenueIntent(provider: VenueIntentProvider | null) {
  venueProvider = provider
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(VENUE_PROVIDER_EVENT))
}

// ── Custom event to open from elsewhere ───────────────────────

const OPEN_EVENT = 'intent:open'

export function openCommandBar(initialText?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { initialText } }))
}

// ── Component ─────────────────────────────────────────────────

export default function CommandPanel() {
  const t = useTranslations('intent')
  const [mounted, setMounted] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [draft,   setDraft]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [turns,   setTurns]   = useState<Turn[]>([])
  const [venueScoped, setVenueScoped] = useState(false)

  const bubbleRef = useRef<HTMLButtonElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  // 单调递增计数器而不是 Date.now()：同一毫秒内 push 两条会撞 React key。
  const seq = useRef(0)
  const nextId = () => `t${++seq.current}`

  useEffect(() => { setMounted(true) }, [])

  // Track whether a venue provider is registered (set by the venue page).
  useEffect(() => {
    const sync = () => setVenueScoped(venueProvider !== null)
    sync()
    window.addEventListener(VENUE_PROVIDER_EVENT, sync)
    return () => window.removeEventListener(VENUE_PROVIDER_EVENT, sync)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl + K toggles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Escape 收起，焦点还给气泡。不做焦点圈定——这不是 modal，圈定焦点会把
  // 用户锁在一个非阻断的面板里，反而是错的。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); bubbleRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // External open event (the expenses page's empty-state button).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ initialText?: string }>).detail
      if (detail?.initialText) setDraft(detail.initialText)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // 打开后聚焦输入框。
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const pushTurn = useCallback((turn: Turn) => {
    setTurns((ts) => [...ts, turn])
  }, [])

  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || busy) return

    // prior 从**追加本轮之前**的消息流里派生。
    const prior = priorContextOf(turns)

    setDraft('')
    pushTurn({ id: nextId(), role: 'user', text })
    setBusy(true)
    try {
      const body = {
        text,
        ...(prior ? { prior } : {}),
        ...(venueProvider ? { scope: 'venue', venueItems: venueProvider.getItems() } : {}),
      }
      const res  = await fetch('/api/intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = (await res.json()) as ServerResult
      pushTurn({ id: nextId(), role: 'agent', result: json })
    } catch (err) {
      pushTurn({
        id:     nextId(),
        role:   'agent',
        result: { kind: 'error', message: err instanceof Error ? err.message : String(err) },
      })
    } finally {
      setBusy(false)
    }
  }, [draft, busy, turns, pushTurn])

  // 应用成功：标记该卡已结算 + 追加 system 气泡 + 通知列表页刷新。
  // **不关面板**——原来 applied() 里的 setOpen(false) 是「最不像对话」的一处：
  // 确认完一笔就把窗口关掉，接着要改第二笔得从头点开。
  const onApplied = useCallback((turnId: string) => {
    notifyIntentApplied()
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'applied' }])
  }, [])

  const onCancelled = useCallback((turnId: string) => {
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'cancelled' }])
  }, [])

  const onVenueApply = useCallback((turnId: string, action: VenueAction) => {
    venueProvider?.apply(action)
    notifyIntentApplied()
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'applied' }])
  }, [])

  const pickExample = useCallback((text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }, [])

  if (!mounted) return null

  const bubble = (
    <button
      ref={bubbleRef}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={open ? t('panelCollapse') : t('bubbleLabel')}
      title={open ? t('panelCollapse') : t('bubbleLabel')}
      className={`fixed right-5 z-30 w-12 h-12 rounded-full bg-primary text-white place-items-center shadow-pop hover:bg-primary-hover transition-colors ${FOCUS_RING} ${open ? 'hidden md:grid' : 'grid'}`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
    >
      {open
        ? <X aria-hidden className="w-[22px] h-[22px]" strokeWidth={1.5} />
        : <Sparkles aria-hidden className="w-[22px] h-[22px]" strokeWidth={1.5} />}
    </button>
  )

  // z-40（下拉/popover 层，见 design-system.md §3）。取保留位 70 会让
  // PendingActionCard 的「编辑并保存」嵌套 Modal（Modal.tsx 里硬编码 z-60）
  // 被盖在面板不透明的体下面、直接不可用；取 40 后所有该压住面板的层——
  // 移动端抽屉 50、Modal 60、Toast 80——都自然压住。与页面内 popover 同层，
  // 靠 portal 挂载顺序压对（本组件挂在 body 末尾）。
  const panel = open && (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('panelTitle')}
      className="fixed z-40 flex flex-col bg-surface border border-line shadow-pop
                 inset-x-0 bottom-0 h-[85vh] rounded-t-card
                 md:inset-x-auto md:right-5 md:bottom-[5.5rem] md:w-[420px] md:h-[560px] md:max-h-[calc(100vh-7rem)] md:rounded-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex-none flex items-center gap-2 px-4 py-3 border-b border-line-soft">
        <h2 className="text-sm font-semibold text-ink-900">{t('panelTitle')}</h2>
        {venueScoped && <Tag label={t('venueScopeTag')} tone="violet" size="sm" />}
        <button
          type="button"
          onClick={() => { setOpen(false); bubbleRef.current?.focus() }}
          aria-label={t('panelCollapse')}
          title={t('panelCollapse')}
          className={`ml-auto flex-none w-8 h-8 rounded-icon grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-canvas transition-colors ${FOCUS_RING}`}
        >
          <X aria-hidden className="w-[15px] h-[15px]" strokeWidth={1.5} />
        </button>
      </div>

      <Transcript
        turns={turns}
        busy={busy}
        onApplied={onApplied}
        onCancelled={onCancelled}
        onVenueApply={onVenueApply}
        onPickExample={pickExample}
      />

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        busy={busy}
        placeholder={venueScoped ? t('venuePlaceholder') : t('composerPlaceholder')}
        inputRef={inputRef}
      />
    </div>
  )

  return createPortal(<>{bubble}{panel}</>, document.body)
}
