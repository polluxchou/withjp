// src/components/competitors/AskPanel.tsx
//
// 右侧非模态抽屉：多轮对话查询竞品数据（design spec
// docs/superpowers/specs/2026-08-20-competitor-ask-design.md §8/§11）。
//
// 与 Modal.tsx / DiscussionPanel.tsx 的关键差异——不是漏做，是故意的：
// 本面板不加遮罩、不锁视口滚动、不做 Tab 焦点圈定。用户要能一边看板一边问,
// 这正是"侧边抽屉"而不是居中 Modal 的理由本身。role="dialog" 但不设
// aria-modal，对应 ARIA APG 的 "Dialog (Non-Modal)" 模式：既有语义化的
// 朗读入口，又不向读屏工具谎称"背后已被屏蔽"。
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy, Loader2, Send, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'

interface AskPanelProps {
  open: boolean
  onClose: () => void
}

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 空态示例问句按钮。文案由调用方传入已解析好的字符串，而不是把 key 数组
 * map 一遍再调用 t(key)：check-i18n.mjs 只认 t('字面量') 这种静态调用形式,
 * 动态拼出来的 key 会被判成"消息未被引用"（见 scripts/check-i18n.mjs 的
 * 源码引用扫描）。三条例句因此在下方分别写一行 t('ask.exampleN') 字面量。
 */
function ExampleButton({
  text, disabled, onPick,
}: {
  text: string
  disabled: boolean
  onPick: (question: string) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(text)}
      // ring-inset：本按钮活在下面 overflow-y-auto 的消息列表容器内，offset
      // 环在这类容器里会被裁切（design-system.md §4 第二配方 / recipes.ts
      // 顶部注释）。
      className="block w-full rounded-field border border-line-strong px-3 py-2 text-left text-xs text-ink-700
        transition-colors hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-50
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
    >
      {text}
    </button>
  )
}

/**
 * 复制到剪贴板的诊断文本：把 code/message/question 都带上，贴进工单才有用。
 * 沿用 CommandBar.tsx ErrorView 的 report 字段顺序（time/code/输入/url/error）。
 */
function buildErrorDetail(code: string, message: string, question: string): string {
  return [
    '[competitors ask error]',
    `time:     ${new Date().toISOString()}`,
    `code:     ${code}`,
    `question: ${question}`,
    `url:      ${typeof window !== 'undefined' ? window.location.href : ''}`,
    `error:    ${message}`,
  ].join('\n')
}

export default function AskPanel({ open, onClose }: AskPanelProps) {
  const t = useTranslations('competitors')
  const locale = useLocale()

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // 服务端可能吐出未在契约里列出的 code（route.ts 与本组件并行开发）,所以
  // 存的是原始字符串而不是窄化的字面量联合——渲染时按"认识的三个 + 其余
  // 一律兜底成 upstream 文案"处理，不能假装类型系统已经替我们挡掉了脏值。
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState('')
  const [copied, setCopied] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // 关闭即清空会话——spec §8 的既定决定：v1 不做持久化。面板 props 是
  // open/onClose（同 Modal.tsx），意味着调用方会一直挂载这个组件、只切
  // open，所以清空要靠这个 effect，不能指望组件卸载重挂。
  useEffect(() => {
    if (open) return
    setTurns([])
    setText('')
    setBusy(false)
    setError(null)
    setErrorDetail('')
    setCopied(false)
  }, [open])

  // Escape 关闭。全局监听、不判断当前焦点是否在面板内——同 Modal.tsx /
  // DiscussionPanel.tsx 的既有约定（面板打开期间 Escape 即关闭）。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 焦点管理：记下打开前的焦点元素，关闭时还给它（同 Modal.tsx）。不做
  // Tab 循环/焦点圈定——面板非模态，用户要能继续 Tab 到看板里，圈定焦点在
  // 这里是错的（这正是本组件不用 Modal.tsx 的原因之一）。初始聚焦交给下面
  // <Input autoFocus>：Field.tsx 的 Input 是普通函数组件、没有 forwardRef,
  // ref 传不进去，只能靠原生 autoFocus 属性，不依赖这个 effect 去手动
  // .focus() 某个 ref（因此也不需要 Modal.tsx 那个 mounted 依赖的规避）。
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    return () => { previouslyFocused.current?.focus?.() }
  }, [open])

  // 新消息/加载态出现后把消息列表滚到底。直接改这一个容器的 scrollTop,
  // 不对某个哨兵元素调 scrollIntoView：面板整体是 portal 到 document.body
  // 的 fixed 元素，scrollIntoView 默认会沿祖先滚动容器链判断"是否已可见"、
  // 需要时连带滚动它们——万一判断有误就可能带着把看板所在的 body 一起
  // 滚走，正好违反本面板"非模态、看板要能继续滚"的核心承诺。只写这一个
  // 容器的 scrollTop 没有这层歧义。
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const next = [...turns, { role: 'user' as const, content: q }]
    setTurns(next)
    setText('')
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch('/api/competitors/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, locale }),
      })
      const json = await res.json() as { answer?: string; error?: string; message?: string }
      if (json.answer) {
        setTurns([...next, { role: 'assistant', content: json.answer }])
      } else {
        const code = json.error ?? 'upstream'
        setError(code)
        setErrorDetail(buildErrorDetail(code, json.message ?? '', q))
      }
    } catch (err) {
      setError('upstream')
      setErrorDetail(buildErrorDetail('fetch', err instanceof Error ? err.message : String(err), q))
    } finally {
      setBusy(false)
    }
  }

  async function copyError() {
    try {
      await navigator.clipboard.writeText(errorDetail)
      setCopied(true)
    } catch {
      // 剪贴板 API 可能因权限/非安全上下文失败；错误文案已经显示在页面上,
      // 用户仍可手动选中复制，这里不做进一步处理。
    }
  }

  if (!mounted || !open) return null

  const errorText =
    error === 'not_configured' ? t('ask.errorNotConfigured') :
    error === 'bad_request'    ? t('ask.errorBadRequest') :
                                  t('ask.errorUpstream') // 'upstream' 及任何未知 code 的兜底

  return createPortal(
    <aside
      role="dialog"
      aria-label={t('ask.title')}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface shadow-pop sm:w-[460px]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{t('ask.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ask.close')}
          className={`rounded-field p-1.5 text-ink-400 transition-colors hover:bg-line-soft hover:text-ink-700 ${FOCUS_RING}`}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-ink-500">{t('ask.emptyHint')}</p>
            <ExampleButton text={t('ask.example1')} disabled={busy} onPick={send} />
            <ExampleButton text={t('ask.example2')} disabled={busy} onPick={send} />
            <ExampleButton text={t('ask.example3')} disabled={busy} onPick={send} />
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={`${turn.role}-${i}`}
            className={turn.role === 'user'
              ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-btn bg-primary-soft px-3 py-2 text-sm text-primary-hover'
              : 'max-w-[95%] whitespace-pre-wrap text-sm text-ink-900'}
          >
            {turn.content}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            {t('ask.thinking')}
          </p>
        )}

        {error && (
          <div className="flex items-start justify-between gap-2 rounded-card border border-danger-border bg-danger-soft p-3">
            <p className="text-xs text-danger-text">{errorText}</p>
            <button
              type="button"
              onClick={() => void copyError()}
              title={t('ask.copyTooltip')}
              // ring-inset：这个 error 卡片活在上面 overflow-y-auto 的消息
              // 列表容器内，理由同 ExampleButton。
              className="flex shrink-0 items-center gap-1 rounded-field border border-danger-border bg-surface px-2 py-1
                text-micro font-medium text-danger-text transition-colors hover:bg-canvas focus:outline-none
                focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
            >
              {copied ? <Check className="h-3 w-3" strokeWidth={1.5} /> : <Copy className="h-3 w-3" strokeWidth={1.5} />}
              {copied ? t('ask.copied') : t('ask.copyError')}
            </button>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-line px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); void send(text) }}
      >
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('ask.placeholder')}
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t('ask.send')}
        </Button>
      </form>
    </aside>,
    document.body,
  )
}
