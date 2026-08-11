// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { compressImage } from './compressImage'
import { todayLocal } from '@/lib/competitors/localDate'
import { UNDATED_KEY } from '@/lib/competitors/shotGrid'
import { FOCUS_RING } from '@/lib/ui/recipes'

export default function ShotUploader({ competitorId, onDone, defaultDate }: { competitorId: string; onDone: () => void; defaultDate?: string | null }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 落在用户当前正在看的那一天,否则显式选了旧日期再上传会像是没反应
  const [shotOn, setShotOn] = useState(
    () => (defaultDate && defaultDate !== UNDATED_KEY ? defaultDate : todayLocal()),
  )

  const onPick = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      const up = await fetch('/api/competitors/upload', { method: 'POST', body: form })
      const upJson = await up.json().catch(() => ({ error: 'parse' }))
      if (!up.ok || upJson.error) { setError(t('uploadFailed')); return }
      const res = await fetch(`/api/competitors/${competitorId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: upJson.data.url, shot_on: shotOn || null }),
      })
      if (!res.ok) { setError(t('uploadFailed')); return }
      onDone()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (busy) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) { e.preventDefault(); onPick(file); return }
      }
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      aria-label={t('upload')}
      title={t('orPaste')}
      // focus-within 是"可以往这儿粘"的提示(粘贴事件会从内部控件冒泡上来);
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
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {error && <span className="text-[10px] text-danger-text">{error}</span>}
    </div>
  )
}
