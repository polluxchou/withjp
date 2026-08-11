// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { compressImage } from './compressImage'
import { FOCUS_RING } from '@/lib/ui/recipes'

export default function ShotUploader({ competitorId, onDone, compact = false }: { competitorId: string; onDone: () => void; compact?: boolean }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/competitors/${competitorId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: upJson.data.url, shot_on: today }),
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
      className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-field border border-dashed border-line-strong text-ink-400 ${FOCUS_RING} ${compact ? 'h-32 w-[72px]' : 'h-[46vh] w-[26vh] min-h-[300px] min-w-[169px]'}`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex flex-col items-center gap-1 rounded-field text-[11px] disabled:opacity-50 ${FOCUS_RING}`}
      >
        <Upload size={compact ? 14 : 18} strokeWidth={1.5} />
        {t('upload')}
      </button>
      {!compact && <span className="text-[9px] text-ink-400">{t('orPaste')}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {error && <span className="px-1 text-center text-[9px] text-danger-text">{error}</span>}
    </div>
  )
}
