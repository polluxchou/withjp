'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Sparkles, X } from 'lucide-react'
import ResultView from './ResultView'
import type { Turn } from '@/lib/intent/conversation'
import type { VenueAction } from '@/venue/layoutData'

interface TranscriptProps {
  turns:         Turn[]
  busy:          boolean
  onApplied:     (turnId: string) => void
  onCancelled:   (turnId: string) => void
  onVenueApply:  (turnId: string, action: VenueAction) => void
  onPickExample: (text: string) => void
}

export default function Transcript({
  turns, busy, onApplied, onCancelled, onVenueApply, onPickExample,
}: TranscriptProps) {
  const t = useTranslations('intent')
  const endRef = useRef<HTMLDivElement>(null)

  // 新 turn 落地后滚到底。依赖 turns.length 而不是 turns：结果卡内部状态
  // 变化（比如展开技术细节、复制报错）不该把视口拽走。
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, busy])

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
      {turns.length === 0 && (
        <div className="space-y-2.5">
          <AgentRow>
            <p className="text-sm text-ink-700 leading-relaxed">{t('emptyGreeting')}</p>
          </AgentRow>
          {/* 示例 chip 的 focus ring 用 §4 第二配方 ring-inset：本容器是
              overflow-y-auto，ring-offset-1 会被裁掉。 */}
          <div className="pl-9 flex flex-col items-start gap-1.5">
            {(t.raw('examples') as string[]).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPickExample(ex)}
                className="text-left text-xs text-primary-hover bg-primary-soft hover:bg-primary-soft-hover rounded-field px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) => {
        if (turn.role === 'user') {
          return (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-card bg-primary-soft px-3 py-2 text-sm text-ink-900 whitespace-pre-wrap break-words">
                {turn.text}
              </div>
            </div>
          )
        }
        if (turn.role === 'system') {
          return (
            <div key={turn.id} className="flex items-center justify-center gap-1.5 text-micro text-ink-400">
              {turn.kind === 'applied'
                ? <Check aria-hidden className="w-3 h-3" strokeWidth={1.5} />
                : <X aria-hidden className="w-3 h-3" strokeWidth={1.5} />}
              {turn.kind === 'applied' ? t('appliedNote') : t('cancelledNote')}
            </div>
          )
        }
        return (
          <AgentRow key={turn.id}>
            <ResultView
              result={turn.result}
              inputText={lastUserTextBefore(turns, turn.id)}
              settled={turn.settled === true}
              onApplied={() => onApplied(turn.id)}
              onCancel={() => onCancelled(turn.id)}
              onVenueApply={(action) => onVenueApply(turn.id, action)}
            />
          </AgentRow>
        )
      })}

      {busy && (
        <AgentRow>
          <div className="flex items-center gap-1 py-1.5">
            <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
            <span className="ml-2 text-micro text-ink-400">{t('thinking')}</span>
          </div>
        </AgentRow>
      )}

      <div ref={endRef} />
    </div>
  )
}

// agent 侧一行：左侧品牌图标 + 内容。图标不承载语义（aria-hidden），说话人
// 身份由「靠左 + 图标」的版式表达，与右侧的用户气泡对称。
function AgentRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="flex-none w-7 h-7 rounded-icon bg-primary-soft grid place-items-center">
        <Sparkles className="w-[15px] h-[15px] text-primary" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  // prefers-reduced-motion 下关掉跳动（§4）。
  return (
    <span
      aria-hidden
      className="w-1 h-1 rounded-full bg-ink-400 animate-bounce motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  )
}

// ErrorView 的「复制报错」要带上是哪句话触发的。找这条 agent turn 前面最近
// 的 user 输入。
function lastUserTextBefore(turns: Turn[], agentTurnId: string): string {
  const idx = turns.findIndex((t) => t.id === agentTurnId)
  for (let i = idx - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'user') return t.text
  }
  return ''
}
