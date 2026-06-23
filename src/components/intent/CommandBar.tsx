'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, Send, Copy, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import PendingActionCard, { type PendingActionState } from './PendingActionCard'
import type { Expense } from '@/lib/types'
import type { VenueAction } from '@/venue/layoutData'
import { notifyIntentApplied } from '@/lib/intent/events'

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
        className="fixed right-5 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-zinc-200 shadow-sm hover:bg-zinc-50 transition-colors text-sm text-zinc-700"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        title={t('openButtonTooltip')}
      >
        <Sparkles className="w-4 h-4 text-violet-500" />
        <span className="text-xs font-medium">{t('openButtonLabel')}</span>
        <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 text-zinc-500 border border-zinc-200">⌘K</kbd>
      </button>

      <Modal open={open} onClose={close} title={t('modalTitle')} width="max-w-2xl">
        <div className="space-y-4">
          <form onSubmit={submit} className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={venueScoped ? t('venuePlaceholder') : t('placeholder')}
              className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              disabled={busy}
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!text.trim() || busy}>
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {result && (
            <div className="border-t border-zinc-100 pt-4">
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
      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-800">
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
      <div className="text-xs text-zinc-500">{r.breadcrumbs}</div>

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
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 space-y-1">
          <div className="text-2xl font-semibold text-zinc-900">
            {(r.denominator!.ratio * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-zinc-600">
            {formatValue(r.numerator.value, r.aggregate)} <span className="text-zinc-400">/</span>{' '}
            {formatValue(r.denominator!.value, r.aggregate)}
          </div>
          <div className="text-xs text-zinc-500">
            {t('query.ratioCounts', { num: r.numerator.count, denom: r.denominator!.count })}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 space-y-1">
          <div className="text-2xl font-semibold text-zinc-900">
            {formatValue(r.numerator.value, r.aggregate)}
          </div>
          <div className="text-xs text-zinc-500">{t('query.countShort', { count: r.numerator.count })}</div>
        </div>
      )}

      {r.groups && r.groups.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600 text-xs">
              <tr><th className="text-left px-3 py-2">{t('query.groupCol')}</th><th className="text-right px-3 py-2">{t('query.groupValueCol')}</th><th className="text-right px-3 py-2">{t('query.groupCountCol')}</th></tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.key} className="border-t border-zinc-100">
                  <td className="px-3 py-1.5">{g.key}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(g.value, r.aggregate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.sample && r.sample.length > 0 && (
        <div className="text-xs text-zinc-500">
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
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {r.message}
      </div>
      {r.candidates && r.candidates.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600 text-xs">
              <tr>
                <th className="text-left px-3 py-2">{t('dateCol')}</th>
                <th className="text-left px-3 py-2">{t('nameCol')}</th>
                <th className="text-right px-3 py-2">{t('amountCol')}</th>
                <th className="text-left px-3 py-2">{t('buyerCol')}</th>
              </tr>
            </thead>
            <tbody>
              {r.candidates.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t border-zinc-100">
                  <td className="px-3 py-1.5 tabular-nums text-zinc-600">{c.expense_date}</td>
                  <td className="px-3 py-1.5">{c.item_name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">¥{Number(c.total_price).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-1.5 text-zinc-600">{c.buyer_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
      <div className="text-sm font-medium text-amber-900">{title}</div>
      <div className="text-sm text-amber-800">{body}</div>
      <div className="text-xs font-medium text-amber-900 pt-1">{t('suggestionsHeader')}</div>
      <ul className="text-xs text-amber-800 list-disc list-inside space-y-1">
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
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-red-900">{friendly.title}</div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-red-200 bg-white text-red-700 hover:bg-red-100 transition-colors"
          title={t('copyTooltip')}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? t('copied') : t('copyButton')}
        </button>
      </div>
      <div className="text-sm text-red-800">{friendly.body}</div>
      {friendly.suggestions.length > 0 && (
        <>
          <div className="text-xs font-medium text-red-900 pt-1">{t('suggestionsHeader')}</div>
          <ul className="text-xs text-red-800 list-disc list-inside space-y-1">
            {friendly.suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </>
      )}
      {friendly.showRaw && (
        <details className="text-xs text-red-600 pt-1">
          <summary className="cursor-pointer select-none">{t('techDetails')}</summary>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{report}</pre>
        </details>
      )}
    </div>
  )
}

