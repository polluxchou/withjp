'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import RecordRow from '@/components/ui/RecordRow'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import PendingActionCard from './PendingActionCard'
import { toneOf } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'
import type { ServerResult } from '@/lib/intent/conversation'
import type { VenueAction } from '@/venue/layoutData'

// ── Result dispatcher ─────────────────────────────────────────

export default function ResultView({
  result, inputText, settled, onApplied, onCancel, onVenueApply,
}: {
  result:    ServerResult
  inputText: string
  // 已结算（已应用/已取消）的卡留在消息流里，但不再提供操作入口。
  settled:   boolean
  onApplied: () => void
  onCancel:  () => void
  onVenueApply: (action: VenueAction) => void
}) {
  if (result.kind === 'pending') {
    return <PendingActionCard state={result} settled={settled} onApplied={onApplied} onCancel={onCancel} />
  }
  if (result.kind === 'venue_preview') {
    return <VenuePreviewView action={result.action} settled={settled} onConfirm={() => onVenueApply(result.action)} onCancel={onCancel} />
  }
  if (result.kind === 'query_result')   return <QueryResultView r={result} />
  if (result.kind === 'clarification')  return <ClarificationView r={result} />
  return <ErrorView code={result.code} message={result.message} inputText={inputText} />
}

// ── Venue action preview ──────────────────────────────────────

function VenuePreviewView({
  action, settled, onConfirm, onCancel,
}: {
  action:    VenueAction
  settled:   boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  const t = useTranslations('intent')
  return (
    <div className="space-y-3">
      <div className="bg-canvas border border-line rounded-field p-3 text-sm text-ink-700">
        {action.summary}
      </div>
      {!settled && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('venueCancel')}</Button>
          <Button variant="primary" onClick={onConfirm}>{t('venueConfirm')}</Button>
        </div>
      )}
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
  return (
    <div className="space-y-3">
      <div className="text-sm text-warning-text bg-warning-soft border border-warning-border rounded-field px-3 py-2">
        {r.message}
      </div>
      {r.candidates && r.candidates.length > 0 && (
        // 面板宽 420px，四列表配 minWidth={480} 等于永远在横向滚动。
        // design-system.md §6.1：记录浏览为主、每行有身份 → RecordRow。
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          {r.candidates.slice(0, 10).map((c) => (
            <RecordRow
              key={c.id}
              status={toneOf('expense', c.payment_status)}
              title={c.item_name}
              meta={[
                { text: c.expense_date, mono: true },
                { text: c.buyer_name || '—' },
              ]}
              amount={`¥${Number(c.total_price).toLocaleString('zh-CN')}`}
            />
          ))}
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
