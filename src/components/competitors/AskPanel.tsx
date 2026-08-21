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

// "接近底部也算贴底"的容差：滚动条到底部误差在这个像素范围内，仍视为
// "用户就停在底部"，抵消小数像素/滚动惯性带来的抖动。
const LIST_BOTTOM_THRESHOLD_PX = 32

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
  const panelRef = useRef<HTMLElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // 是否贴底：只在用户此刻就停在（或接近）列表底部时，新内容到达才把视图
  // 带下去；往上翻看更早的回答时，新一条回复或"正在查…"状态的出现不该把
  // 视图拽回底部。用 ref 而不是 state——这个值只喂给下面的滚动 effect，
  // 不参与渲染，没必要为它多触发一轮 re-render。
  const stickToBottomRef = useRef(true)

  // 记下"打开前聚焦的是谁"，供 handleClose 决定关闭时要不要归还焦点。
  // 必须在渲染阶段同步做，不能放进 useEffect：下面 <Input autoFocus> 的
  // 原生聚焦发生在 React 提交本次更新的过程中（早于任何 passive effect
  // 执行），等 useEffect 跑起来时焦点已经被 autoFocus 抢先移进了输入框,
  // "打开前到底聚焦的是谁"这条信息就已经丢了、来不及再补。这里用的是
  // React 文档认可的"记录上一次渲染信息"模式：拿一个 ref 存上一次的 open
  // 值,只在真正发生 false→true 跳变的那次渲染里写。StrictMode/并发渲染
  // 下同一次跳变可能被多渲染几遍而不提交，但期间 document.activeElement
  // 不会变（没有真正的 commit 发生），重复赋同一个值是幂等的、无害。
  const prevOpenRef = useRef(open)
  if (open && !prevOpenRef.current) {
    previouslyFocused.current = document.activeElement as HTMLElement | null
  }
  prevOpenRef.current = open

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

  // Escape 关闭——但只处理在面板子树内触发的按键（挂在下面 <aside
  // onKeyDown>，靠 React 事件冒泡），不再挂 window 全局监听。全局监听是
  // 这里最初的实现，评审用一个可复现场景否掉了它：ShotLightbox.tsx 的
  // Escape 处理器也是全局的，而它在本面板打开期间完全可达——开着 Ask
  // 面板去点开一张竞品截图缩略图、按 Escape 关灯箱，两个全局处理器会同时
  // 触发，本面板的 handleClose() 紧接着触发下面"关闭即清空会话"的 effect，
  // 整段对话无声无息被吞掉。CompetitorCard.tsx 的行内改名输入框、
  // RegionLiveRuler.tsx 的悬浮标尺是同一页面上另外两个独立的全局 Escape
  // 消费者。RegionLiveRuler.tsx 自己正是用 onKeyDown + stopPropagation
  // 处理的同一类问题——非模态、背后内容仍可交互的场景，本来就不该抢
  // window 级别的按键。
  //
  // 副作用：焦点必须真的落在面板子树内，Escape 才能被这里收到——见下面
  // "提交进行中把焦点找补回面板"那个 effect，专门补这条子树内 onKeyDown
  // 相对全局监听新引入的缺口。

  // 关闭时"尽量"归还焦点给打开前聚焦的元素（同 Modal.tsx 的意图），但只
  // 在关闭那一刻焦点确实还停在面板子树内时才归还——面板非模态，用户可以
  // 把焦点移到看板内容上（比如 CompetitorCard 的行内改名输入框）之后仍不
  // 关闭面板；这时候关闭面板不该把用户正在操作的焦点从他们手里拽走，去
  // 追一个他们早就不在意的触发按钮。不做 Tab 循环/焦点圈定——用户要能
  // 继续 Tab 到看板里，圈定焦点在这里是错的（这正是本组件不用 Modal.tsx
  // 的原因之一）。初始聚焦交给下面 <Input autoFocus>：Field.tsx 的 Input
  // 是普通函数组件、没有 forwardRef，ref 传不进去，只能靠原生 autoFocus
  // 属性。
  //
  // 这个检查必须放在"请求关闭"这一步同步做，不能放进 useEffect 的清理
  // 函数：面板一旦真的关闭（open 变 false），本组件会在同一次渲染里
  // return null，React 随即把整棵 <aside> 子树从文档里摘掉——而这个摘除
  // 动作本身，会先把子树内任何聚焦元素自动失焦到 document.body（同下面
  // Input 注释里"控件消失/被禁用即失焦"的规则）。passive effect 的清理
  // 函数要等浏览器完成这次 DOM 变更之后才异步执行，届时 document.activeElement
  // 早就已经变成 document.body 了——用 panelRef.current?.contains(...)
  // 去判断"关闭前焦点在不在面板里"，测的其实永远是"面板已经被摘掉之后
  // body 在不在面板里"，答案恒为否，整个归还逻辑会变成永远不生效的死码。
  // 唯一还没被这个"先斩后奏"污染的时机，是用户发起关闭动作的那一刻——
  // 面板此时仍完整挂载、焦点还没被谁碰过——所以把检查内联进 handleClose，
  // 在通知父组件"可以关了"之前，同步读一次真实焦点位置。
  function handleClose() {
    if (panelRef.current?.contains(document.activeElement)) {
      previouslyFocused.current?.focus?.()
    }
    onClose()
  }

  // 提交进行中，把焦点找补回面板容器（tabIndex={-1}，不进 Tab 序，同
  // Modal.tsx 的用法），仅当它已经被甩到 document.body 时。根因：下面的
  // 「发送」Button 在 busy 时会被自身禁用（loading → disabled），浏览器
  // 规范要求"聚焦的控件一旦变禁用就必须失焦"，默认落点是 document.body——
  // 而焦点一旦离开面板子树，上面挂在 <aside onKeyDown> 的 Escape 处理器
  // 就再也收不到事件。这正是把 Escape 从全局监听改成子树内 onKeyDown 后
  // 新引入的边界情况。只在焦点真的已经掉到 body 时才出手：Enter 提交这条
  // 路径下 Input 本身没有被禁用（见下方 Input 的注释），焦点从未离开过,
  // 不需要这次找补，也就不会打断用户正在打字。
  useEffect(() => {
    if (busy && panelRef.current && document.activeElement === document.body) {
      panelRef.current.focus()
    }
  }, [busy])

  // 记录列表是否贴底：滚动条自身触发，包括本 effect 下面那次程序化滚动
  // 触发的原生 scroll 事件——两者用同一套判断，行为自洽。
  function handleListScroll() {
    const el = listRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop <= el.clientHeight + LIST_BOTTOM_THRESHOLD_PX
  }

  // 新消息/加载态出现后，仅在用户当前贴底时才把消息列表滚到底——往上翻看
  // 早前回答时不该被拽回去（见 stickToBottomRef 声明处的注释）。直接改
  // 这一个容器的 scrollTop，不对某个哨兵元素调 scrollIntoView：面板整体
  // 是 portal 到 document.body 的 fixed 元素，scrollIntoView 默认会沿
  // 祖先滚动容器链判断"是否已可见"、需要时连带滚动它们——万一判断有误
  // 就可能带着把看板所在的 body 一起滚走，正好违反本面板"非模态、看板要
  // 能继续滚"的核心承诺。只写这一个容器的 scrollTop 没有这层歧义。
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
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
        // `||` 而不是 `??`：空字符串 code 也要兜底成 'upstream'，否则空
        // 串是 truthy 检查里的假值,会让下面 {error && (...)} 直接不渲染
        // 任何东西——服务端明明失败了，面板却像什么都没发生一样安静。
        const code = json.error || 'upstream'
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

  // 'Unauthorized' 是 authGuard 的字面量 code（src/lib/auth/guard.ts）,
  // 'board' 是看板取数失败时 route.ts 透传的 code（getCompetitorBoard 失败）
  // ——两者都不在 §11 最初列出的三个错误码里，是后续审查在实际接线
  // route.ts 后补的。'upstream' 及任何其余未知 code 一律兜底成同一句
  // "可以再试一次"：既不假装认识它，也不会把真正的诊断信息（errorDetail）
  // 藏起来，用户仍能靠"复制报错"按钮拿到原始 code/message。
  const errorText =
    error === 'not_configured' ? t('ask.errorNotConfigured') :
    error === 'bad_request'    ? t('ask.errorBadRequest') :
    error === 'Unauthorized'   ? t('ask.errorUnauthorized') :
    error === 'board'          ? t('ask.errorBoard') :
                                  t('ask.errorUpstream') // 'upstream' 及任何未知 code 的兜底

  return createPortal(
    <aside
      ref={panelRef}
      role="dialog"
      aria-label={t('ask.title')}
      // tabIndex={-1}：仅作程序化聚焦落点（见上面"提交进行中把焦点找补
      // 回面板"的 effect），不进 Tab 序，用户 Tab 不会停在它上面——同
      // Modal.tsx 的用法。focus:outline-none 不配 ring 同样是抄 Modal.tsx
      // 那处唯一的合法例外：真被程序化聚焦时画一圈环反而是噪音,面板内
      // 真正的可交互控件各自带标准 focus 环。
      // onKeyDown 处理 Escape：见上面那段解释"为什么不用 window 全局监听"
      // 的注释。
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          handleClose()
        }
      }}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface shadow-pop
        focus:outline-none sm:w-[460px]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{t('ask.title')}</h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('ask.close')}
          className={`rounded-field p-1.5 text-ink-400 transition-colors hover:bg-line-soft hover:text-ink-700 ${FOCUS_RING}`}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      <div
        ref={listRef}
        onScroll={handleListScroll}
        // aria-live="polite"：答案是异步到达的（"正在查…"之后隔几秒才出现），
        // 屏幕阅读器用户没有理由一直守着这块区域等内容出现——polite 会在
        // 用户当前朗读告一段落后自动播报新增的文字节点。不用 assertive:
        // 这不是需要打断用户的紧急信息。spec 没有明确要求这个,是本组件
        // 自己补的可访问性增强。
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
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
          // 故意不在 busy 时禁用：双重提交已经由 send() 里的 `busy` 检查
          // 挡住了，这里禁用纯属视觉修饰——而修饰是有代价的：一旦禁用,
          // 浏览器规范会把焦点从这个正聚焦的输入框甩到 document.body,
          // 焦点就此离开面板子树，上面 <aside onKeyDown> 的 Escape 处理器
          // 也就再收不到事件了。Enter 提交这条路径因此保持"焦点全程不离开
          // Input"，不需要靠"提交进行中把焦点找补回面板"那个 effect 补救
          // ——那个 effect 是为鼠标点「发送」按钮（Button 自身会在 loading
          // 时禁用，无法避免）这条路径准备的。
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
