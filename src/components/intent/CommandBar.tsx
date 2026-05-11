'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import PendingActionCard, { type PendingActionState } from './PendingActionCard'
import type { Expense } from '@/lib/types'

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
  | { kind: 'error'; message: string }

const PLACEHOLDER = '用一句话操作（v1 仅支持支出管理）。例：Q3 薪资中 MC 占了多少 / 新增差旅费 5月10日打车 320 元'

// ── Custom event to open from elsewhere ───────────────────────

const OPEN_EVENT = 'intent:open'

export function openCommandBar(initialText?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { initialText } }))
}

// ── Component ─────────────────────────────────────────────────

export default function CommandBar() {
  const [open,   setOpen]   = useState(false)
  const [text,   setText]   = useState('')
  const [busy,   setBusy]   = useState(false)
  const [result, setResult] = useState<ServerResult | null>(null)

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
      const res = await fetch('/api/intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: text.trim() }),
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
        className="fixed top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors text-sm text-slate-700"
        title="自然语言操作 (⌘K)"
      >
        <Sparkles className="w-4 h-4 text-indigo-500" />
        <span className="text-xs font-medium">用文字操作</span>
        <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-500 border border-slate-200">⌘K</kbd>
      </button>

      <Modal open={open} onClose={close} title="用一句话操作" width="max-w-2xl">
        <div className="space-y-4">
          <form onSubmit={submit} className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={busy}
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!text.trim() || busy}>
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {result && (
            <div className="border-t border-slate-100 pt-4">
              <ResultView
                result={result}
                onApplied={() => { reset(); /* close happens by user */ setOpen(false) }}
                onCancel={() => { reset() }}
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
  result, onApplied, onCancel,
}: {
  result:    ServerResult
  onApplied: () => void
  onCancel:  () => void
}) {
  if (result.kind === 'pending') {
    return <PendingActionCard state={result} onApplied={onApplied} onCancel={onCancel} />
  }
  if (result.kind === 'query_result')   return <QueryResultView r={result} />
  if (result.kind === 'clarification')  return <ClarificationView r={result} />
  return <ErrorView message={result.message} />
}

// ── Query result ──────────────────────────────────────────────

function QueryResultView({ r }: { r: Extract<ServerResult, { kind: 'query_result' }> }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">{r.breadcrumbs}</div>

      {r.denominator ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="text-2xl font-semibold text-slate-900">
            {(r.denominator.ratio * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-slate-600">
            {formatValue(r.numerator.value, r.aggregate)} <span className="text-slate-400">/</span>{' '}
            {formatValue(r.denominator.value, r.aggregate)}
          </div>
          <div className="text-xs text-slate-500">
            分子 {r.numerator.count} 条 · 分母 {r.denominator.count} 条
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="text-2xl font-semibold text-slate-900">
            {formatValue(r.numerator.value, r.aggregate)}
          </div>
          <div className="text-xs text-slate-500">{r.numerator.count} 条</div>
        </div>
      )}

      {r.groups && r.groups.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr><th className="text-left px-3 py-2">分组</th><th className="text-right px-3 py-2">值</th><th className="text-right px-3 py-2">条数</th></tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.key} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{g.key}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(g.value, r.aggregate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.sample && r.sample.length > 0 && (
        <div className="text-xs text-slate-500">
          已返回 {r.sample.length} 条样例。完整筛选请到支出列表页操作。
        </div>
      )}
    </div>
  )
}

function formatValue(v: number, kind: 'sum_total' | 'count' | 'avg_total' | 'list'): string {
  if (kind === 'count') return `${v} 条`
  return `¥${v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

// ── Clarification ─────────────────────────────────────────────

function ClarificationView({ r }: { r: Extract<ServerResult, { kind: 'clarification' }> }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {r.message}
      </div>
      {r.candidates && r.candidates.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left px-3 py-2">日期</th>
                <th className="text-left px-3 py-2">名称</th>
                <th className="text-right px-3 py-2">金额</th>
                <th className="text-left px-3 py-2">经办人</th>
              </tr>
            </thead>
            <tbody>
              {r.candidates.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 tabular-nums text-slate-600">{c.expense_date}</td>
                  <td className="px-3 py-1.5">{c.item_name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">¥{Number(c.total_price).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-1.5 text-slate-600">{c.buyer_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Error ─────────────────────────────────────────────────────

function ErrorView({ message }: { message: string }) {
  return (
    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
      {message}
    </div>
  )
}
