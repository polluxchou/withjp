'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import ResultView from './ResultView'
import type { ServerResult } from '@/lib/intent/conversation'
import type { VenueAction } from '@/venue/layoutData'
import { notifyIntentApplied } from '@/lib/intent/events'
// design-system.md §4 的唯一 focus 配方，供本文件三处手写交互元素（触发药丸、
// 复制报错按钮、details summary）复用——它们不走 Button/Field，拿不到默认
// focus 环。字符串唯一登记处在 recipes.ts，此处只 import 不再抄本地副本。
import { FOCUS_RING } from '@/lib/ui/recipes'

// ── Venue scope registry ──────────────────────────────────────
// The venue editor registers a provider while mounted. When present, the command
// bar scopes intents to the current canvas and applies the parsed action
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

export default function CommandBar() {
  const t = useTranslations('intent')
  const [open,   setOpen]   = useState(false)
  const [text,   setText]   = useState('')
  const [busy,   setBusy]   = useState(false)
  const [result, setResult] = useState<ServerResult | null>(null)
  const [venueScoped, setVenueScoped] = useState(false)

  // Track whether a venue provider is registered (set by the venue page).
  useEffect(() => {
    const sync = () => setVenueScoped(venueProvider !== null)
    sync()
    window.addEventListener(VENUE_PROVIDER_EVENT, sync)
    return () => window.removeEventListener(VENUE_PROVIDER_EVENT, sync)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // External open event
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ initialText?: string }>).detail
      if (detail?.initialText) setText(detail.initialText)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const reset = useCallback(() => {
    setText(''); setResult(null); setBusy(false)
  }, [])

  const applied = useCallback(() => {
    notifyIntentApplied()
    reset()
    setOpen(false)
  }, [reset])

  function close() {
    setOpen(false)
    // Keep last result around briefly in case the user reopens — clear on next open.
    setTimeout(reset, 250)
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true); setResult(null)
    try {
      const scopedBody = venueProvider
        ? { text: text.trim(), scope: 'venue', venueItems: venueProvider.getItems() }
        : { text: text.trim() }
      const res = await fetch('/api/intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(scopedBody),
      })
      const json = (await res.json()) as ServerResult
      setResult(json)
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed right-5 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface border border-line shadow-pop hover:bg-canvas transition-colors text-sm text-ink-700 ${FOCUS_RING}`}
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        title={t('openButtonTooltip')}
      >
        <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <span className="text-xs font-medium">{t('openButtonLabel')}</span>
        <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-micro rounded-icon bg-canvas text-ink-400 border border-line">⌘K</kbd>
      </button>

      {/* Stays on the shared <Modal> (z-60), not the layer-table's nominal
          "CommandBar 70": PendingActionCard (rendered inside ResultView
          below for pending intents) opens its own nested <Modal> for the
          "edit and save" flow, and Modal.tsx hardcodes z-[60] internally.
          Two same-z Modals resolve correctly today via DOM/mount order (the
          later-opened edit modal paints on top); bumping just this outer
          panel to z-70 would flip that — the edit modal would render behind
          this panel's opaque body and become unusable. The trigger pill
          above also stays at its original z-30 (a global FAB — z-70 would
          sit above every Modal app-wide, including footers with primary
          buttons pinned to the bottom on mobile). 70 stays reserved/unused;
          see design-system.md §3. */}
      <Modal open={open} onClose={close} title={t('modalTitle')} width="max-w-2xl">
        <div className="space-y-4">
          <form onSubmit={submit} className="flex gap-2">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={venueScoped ? t('venuePlaceholder') : t('placeholder')}
              disabled={busy}
              className="flex-1"
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!text.trim() || busy} aria-label={t('sendButtonLabel')}>
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          </form>

          {result && (
            <div className="border-t border-line-soft pt-4">
              <ResultView
                result={result}
                inputText={text}
                settled={false}
                onApplied={applied}
                onCancel={() => { reset() }}
                onVenueApply={(action) => { venueProvider?.apply(action); applied() }}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
