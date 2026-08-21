'use client'

import { useTranslations } from 'next-intl'
import { Loader2, Send } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'
import { Textarea } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'

interface ComposerProps {
  value:       string
  onChange:    (v: string) => void
  onSubmit:    () => void
  busy:        boolean
  placeholder: string
  inputRef:    RefObject<HTMLTextAreaElement>
}

export default function Composer({ value, onChange, onSubmit, busy, placeholder, inputRef }: ComposerProps) {
  const t = useTranslations('intent')
  const canSend = value.trim().length > 0 && !busy

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 发送 / Shift+Enter 换行。输入法组词期间的 Enter 会带
    // isComposing=true——不挡的话中文用户按回车选词就把半截拼音发出去了。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <div className="flex-none border-t border-line-soft p-3 space-y-2">
      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          size="sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 text-sm"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={t('sendButtonLabel')}
          title={t('sendButtonLabel')}
          className={`flex-none w-8 h-8 rounded-field bg-primary text-white grid place-items-center hover:bg-primary-hover disabled:bg-muted-soft disabled:text-ink-400 transition-colors ${FOCUS_RING}`}
        >
          {busy
            ? <Loader2 className="w-[15px] h-[15px] animate-spin" strokeWidth={1.5} />
            : <Send className="w-[15px] h-[15px]" strokeWidth={1.5} />}
        </button>
      </div>
      <p className="text-micro text-ink-400">{t('composerHint')}</p>
    </div>
  )
}
