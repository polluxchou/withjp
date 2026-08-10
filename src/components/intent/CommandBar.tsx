'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, Send, Copy, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import PendingActionCard, { type PendingActionState } from './PendingActionCard'
import type { Expense } from '@/lib/types'
import type { VenueAction } from '@/venue/layoutData'
import { notifyIntentApplied } from '@/lib/intent/events'

// design-system.md §4's one focus recipe, deduped across the three hand-rolled
// interactive elements in this file (trigger pill, copy-error button, details
// summary) that don't go through Button/Field and so don't get it for free —
// same CARD_BTN-constant idiom as pipeline/page.tsx.
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1'

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

// ── Result types (mirror server's ExecuteResult) ───────────────

type ServerResult =
  | (PendingActionState & { kind: 'pending' })
  | {
      kind:        'query_result'
      breadcrumbs: string
      aggregate:   'sum_total' | 'count' | 'avg_total' | 'list'
      numerator:   { value: number; count: number }
      denominator?: { value: number; count: number; ratio: number }
      groups?:     { key: string; value: number; count: number }[]
      sample?:     Expense[]
    }
  | { kind: 'clarification'; message: string; candidates?: Expense[] }
  | { kind: 'venue_preview'; action: VenueAction }
  | { kind: 'error'; code?: 'parser_failed' | 'executor_failed' | 'bad_request' | 'unknown'; message: string }


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

// ── Result dispatcher ─────────────────────────────────────────

function ResultView({
  result, inputText, onApplied, onCancel, onVenueApply,
}: {
  result:    ServerResult
  inputText: string
  onApplied: () => void
  onCancel:  () => void
  onVenueApply: (action: VenueAction) => void
}) {
  if (result.kind === 'pending') {
    return <PendingActionCard state={result} onApplied={onApplied} onCancel={onCancel} />
  }
  if (result.kind === 'venue_preview') {
    return <VenuePreviewView action={result.action} onConfirm={() => onVenueApply(result.action)} onCancel={onCancel} />
  }
  if (result.kind === 'query_result')   return <QueryResultView r={result} />
  if (result.kind === 'clarification')  return <ClarificationView r={result} />
  return <ErrorView code={result.code} message={result.message} inputText={inputText} />
}

// ── Venue action preview ──────────────────────────────────────

function VenuePreviewView({
  action, onConfirm, onCancel,
}: {
  action:   VenueAction
  onConfirm: () => void
  onCancel:  () => void
}) {
  const t = useTranslations('intent')
  return (
    <div className="space-y-3">
      <div className="bg-canvas border border-line rounded-field p-3 text-sm text-ink-700">
        {action.summary}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>{t('venueCancel')}</Button>
        <Button variant="primary" onClick={onConfirm}>{t('venueConfirm')}</Button>
      </div>
    </div>
  )
}

// ── Query result ──────────────────────────────────────────────

function QueryResultView({ r }: { r: Extract<ServerResult, { kind: 'query_result' }> }) {
  const t = useTranslations('intent')
  const isRatio        = !!r.denominator
  const denomEmpty     = isRatio && r.denominator!.count === 0
  const numeratorEmpty = r.numerator.count === 0
  const formatValue = (v: number, kind: 'sum_total' | 'count' | 'avg_total' | 'list'): string => {
    if (kind === 'count') return t('query.countShort', { count: v })
    return `¥${v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-ink-500">{r.breadcrumbs}</div>

      {/* Empty-state branches come first so a 0 doesn't masquerade as a real answer. */}
      {denomEmpty ? (
        <EmptyHint
          title={t('query.emptyDenom.title')}
          body={t('query.emptyDenom.body')}
          suggestions={t.raw('query.emptyDenom.suggestions') as string[]}
        />
      ) : numeratorEmpty ? (
        <EmptyHint
          title={t('query.emptyNumerator.title')}
          body={t('query.emptyNumerator.body')}
          suggestions={t.raw('query.emptyNumerator.suggestions') as string[]}
        />
      ) : isRatio ? (
        <div className="bg-canvas border border-line rounded-card p-4 space-y-1">
          <div className="text-2xl font-bold tracking-kpi tabular-nums text-ink-900">
            {(r.denominator!.ratio * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-ink-500 tabular-nums">
            {formatValue(r.numerator.value, r.aggregate)} <span className="text-ink-400">/</span>{' '}
            {formatValue(r.denominator!.value, r.aggregate)}
          </div>
          <div className="text-xs text-ink-500">
            {t('query.ratioCounts', { num: r.numerator.count, denom: r.denominator!.count })}
          </div>
        </div>
      ) : (
        <div className="bg-canvas border border-line rounded-card p-4 space-y-1">
          <div className="text-2xl font-bold tracking-kpi tabular-nums text-ink-900">
            {formatValue(r.numerator.value, r.aggregate)}
          </div>
          <div className="text-xs text-ink-500">{t('query.countShort', { count: r.numerator.count })}</div>
        </div>
      )}

      {r.groups && r.groups.length > 0 && (
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          <Table label={r.breadcrumbs}>
            <THead>
              <Th>{t('query.groupCol')}</Th>
              <Th align="right">{t('query.groupValueCol')}</Th>
              <Th align="right">{t('query.groupCountCol')}</Th>
            </THead>
            <TBody>
              {r.groups.map((g) => (
                <Tr key={g.key}>
                  <Td className="text-xs">{g.key}</Td>
                  <Td align="right" numeric className="text-xs">{formatValue(g.value, r.aggregate)}</Td>
                  {/* Td 基底色不可 className 覆盖（生成序），弱化需等 Td tone prop（递延） */}
                  <Td align="right" className="text-xs tabular-nums">{g.count}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {r.sample && r.sample.length > 0 && (
        <div className="text-xs text-ink-500">
          {t('query.sampleHint', { count: r.sample.length })}
        </div>
      )}
    </div>
  )
}

// ── Clarification ─────────────────────────────────────────────

function ClarificationView({ r }: { r: Extract<ServerResult, { kind: 'clarification' }> }) {
  const t = useTranslations('intent.clarification')
  return (
    <div className="space-y-3">
      <div className="text-sm text-warning-text bg-warning-soft border border-warning-border rounded-field px-3 py-2">
        {r.message}
      </div>
      {r.candidates && r.candidates.length > 0 && (
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          <Table label={t('tableLabel')} minWidth={480}>
            <THead>
              <Th>{t('dateCol')}</Th>
              <Th>{t('nameCol')}</Th>
              <Th align="right">{t('amountCol')}</Th>
              <Th>{t('buyerCol')}</Th>
            </THead>
            <TBody>
              {r.candidates.slice(0, 10).map((c) => (
                <Tr key={c.id}>
                  <Td className="text-xs tabular-nums">{c.expense_date}</Td>
                  <Td className="text-xs">{c.item_name}</Td>
                  <Td align="right" numeric className="text-xs">¥{Number(c.total_price).toLocaleString('zh-CN')}</Td>
                  <Td className="text-xs">{c.buyer_name || '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ── Empty-state hint (reused by QueryResultView) ──────────────

function EmptyHint({
  title, body, suggestions,
}: {
  title:       string
  body:        string
  suggestions: string[]
}) {
  const t = useTranslations('intent.emptyHint')
  return (
    <div className="bg-warning-soft border border-warning-border rounded-card p-4 space-y-2">
      <div className="text-sm font-medium text-warning-text">{title}</div>
      <div className="text-sm text-warning-text">{body}</div>
      <div className="text-xs font-medium text-warning-text pt-1">{t('suggestionsHeader')}</div>
      <ul className="text-xs text-warning-text list-disc list-inside space-y-1">
        {suggestions.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  )
}

// ── Error ─────────────────────────────────────────────────────

function ErrorView({
  code, message, inputText,
}: {
  code?:     string
  message:   string
  inputText: string
}) {
  const t = useTranslations('intent.error')
  // Map error code → which sub-key under intent.error.* to read. 'bad_request'
  // is the only one that hides the raw report (it's a user input problem, not
  // a backend failure).
  const subKey =
    code === 'parser_failed'   ? 'parserFailed'   :
    code === 'executor_failed' ? 'executorFailed' :
    code === 'bad_request'     ? 'badRequest'     :
                                 'unknown'
  const friendly = {
    title:       t(`${subKey}.title`),
    body:        t(`${subKey}.body`),
    suggestions: t.raw(`${subKey}.suggestions`) as string[],
    showRaw:     subKey !== 'badRequest',
  }
  const [copied, setCopied] = useState(false)

  const report =
    `[intent error]\n` +
    `time:  ${new Date().toISOString()}\n` +
    `code:  ${code ?? 'unknown'}\n` +
    `input: ${inputText}\n` +
    `url:   ${typeof window !== 'undefined' ? window.location.href : ''}\n` +
    `error: ${message}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fall back: select-and-copy below the pre block — most browsers allow clipboard via secure context only
    }
  }

  return (
    <div className="bg-danger-soft border border-danger-border rounded-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-danger-text">{friendly.title}</div>
        <button
          type="button"
          onClick={copy}
          title={t('copyTooltip')}
          className={`flex-none flex items-center gap-1 text-micro font-medium px-2 py-1 rounded-field border border-danger-border bg-surface text-danger-text hover:bg-canvas transition-colors ${FOCUS_RING}`}
        >
          {copied ? <Check className="w-3 h-3" strokeWidth={1.5} /> : <Copy className="w-3 h-3" strokeWidth={1.5} />}
          {copied ? t('copied') : t('copyButton')}
        </button>
      </div>
      <div className="text-sm text-danger-text">{friendly.body}</div>
      {friendly.suggestions.length > 0 && (
        <>
          <div className="text-xs font-medium text-danger-text pt-1">{t('suggestionsHeader')}</div>
          <ul className="text-xs text-danger-text list-disc list-inside space-y-1">
            {friendly.suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </>
      )}
      {friendly.showRaw && (
        // No w-fit on <details> itself — it made the block size to its
        // content's natural width instead of the modal's, so the multi-line
        // <pre> below pushed the whole thing past the modal's edge (measured
        // overflow on a 343px mobile column). <summary> keeps its own w-fit
        // so the focus ring still hugs just the label, not the full row.
        <details className="text-xs text-danger-text pt-1">
          <summary className={`w-fit cursor-pointer select-none rounded-field ${FOCUS_RING}`}>
            {t('techDetails')}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-micro text-ink-700 bg-canvas border border-line rounded-field p-2">{report}</pre>
        </details>
      )}
    </div>
  )
}
