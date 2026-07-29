// src/components/competitors/ShotUploader.tsx
'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'

export default function ShotUploader({ competitorId, onDone }: { competitorId: string; onDone: () => void }) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
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

  return (
    <div className="flex h-[132px] w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex flex-col items-center gap-1 text-[11px] disabled:opacity-50"
      >
        <Upload size={18} />
        {t('upload')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {error && <span className="px-1 text-center text-[9px] text-red-600">{error}</span>}
    </div>
  )
}
