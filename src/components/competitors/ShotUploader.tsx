// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { todayLocal } from '@/lib/competitors/localDate'
import { imageFromClipboard, uploadShot } from '@/lib/competitors/uploadShot'
import { FOCUS_RING } from '@/lib/ui/recipes'

/**
 * 相册标题行的上传控件：默认今天，日期可改。
 *
 * 默认值刻意固定为今天而不是当前选中的那一列——每天例行截图上传是主流程,
 * 而选中列默认是"轴上最新有图的那天",往往是昨天或更早,跟着它会把今天的图
 * 悄悄放进旧列。要补某一天的图,走日期网格里那一天空格子上的 + 入口,
 * 日期由所在列决定,不会填错。
 */
export default function ShotUploader({ competitorId, onDone }: { competitorId: string; onDone: () => void }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shotOn, setShotOn] = useState(todayLocal)

  const send = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const failed = await uploadShot(competitorId, file, shotOn || null)
      if (failed) { setError(t('uploadFailed')); return }
      onDone()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        if (busy) return
        const file = imageFromClipboard(e.clipboardData?.items)
        if (file) { e.preventDefault(); send(file) }
      }}
      aria-label={t('upload')}
      // focus-within 提示"可以往这儿粘"(粘贴事件从内部控件冒泡上来);
      // FOCUS_RING 负责整块自身获得焦点时的可见环。
      className={`flex shrink-0 items-center gap-1.5 rounded-field border border-dashed border-line-strong px-1.5 py-1 focus-within:border-primary-border ${FOCUS_RING}`}
    >
      <input
        type="date"
        value={shotOn}
        max={todayLocal()}
        onChange={(e) => setShotOn(e.target.value)}
        aria-label={t('shotDate')}
        className="rounded-field border border-line px-1 py-0.5 text-[11px] text-ink-700"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex items-center gap-1 rounded-field text-[11px] text-ink-500 hover:text-ink-900 disabled:opacity-50 ${FOCUS_RING}`}
      >
        <Upload size={13} strokeWidth={1.5} />
        {t('upload')}
      </button>
      {/* 可见的粘贴提示:上一版只留在 title 里,等于把这个入口做没了 */}
      <span className="text-[10px] text-ink-400">{t('orPaste')}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = '' }}
      />
      {error && <span className="text-[10px] text-danger-text">{error}</span>}
    </div>
  )
}
