'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'

const MS = 86_400_000
const dateToOrd = (s: string) => Math.round(new Date(s).getTime() / MS)
const ordToDate = (n: number) => new Date(n * MS).toISOString().slice(0, 10)
const fmtDate   = (s: string) => s.replace(/-/g, '/')

const FALLBACK_START = '2026-01-01'
const FALLBACK_END   = '2026-12-31'

function generateMarks(minIso: string, maxIso: string): { iso: string; label: string }[] {
  const startYear = parseInt(minIso.slice(0, 4), 10)
  const endYear   = parseInt(maxIso.slice(0, 4), 10)
  const marks: { iso: string; label: string }[] = []
  for (let y = startYear; y <= endYear; y++) {
    for (let q = 1; q <= 4; q++) {
      const mm  = String((q - 1) * 3 + 1).padStart(2, '0')
      const iso = `${y}-${mm}-01`
      if (iso >= minIso && iso <= maxIso) {
        marks.push({ iso, label: q === 1 ? `${y} Q1` : `Q${q}` })
      }
    }
  }
  return marks
}

const THUMB_CLS = [
  'absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none',
  '[&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:pointer-events-auto',
  '[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
  '[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-violet-600',
  '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab',
  '[&::-moz-range-thumb]:pointer-events-auto',
  '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5',
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white',
  '[&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-violet-600',
  '[&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab',
  '[&::-moz-range-track]:bg-transparent',
].join(' ')

function badgeStyle(pct: number): React.CSSProperties {
  if (pct <= 5)  return { left: 0 }
  if (pct >= 95) return { right: 0 }
  return { left: `${pct}%`, transform: 'translateX(-50%)' }
}

interface Props {
  from: string
  to:   string
  onChange: (from: string, to: string) => void
  /** Optional bounds. Default: 2026-01-01 ~ 2026-12-31. */
  minDate?: string
  maxDate?: string
}

export default function DateRangeSlider({ from, to, onChange, minDate, maxDate }: Props) {
  const tCommon = useTranslations('common')
  const rangeStart = minDate || FALLBACK_START
  const rangeEnd   = maxDate || FALLBACK_END
  const ORD_MIN = useMemo(() => dateToOrd(rangeStart), [rangeStart])
  const ORD_MAX = useMemo(() => dateToOrd(rangeEnd),   [rangeEnd])
  const SPAN    = Math.max(1, ORD_MAX - ORD_MIN)
  const MARKS   = useMemo(() => generateMarks(rangeStart, rangeEnd), [rangeStart, rangeEnd])

  const extA = useMemo(() => from ? Math.max(ORD_MIN, dateToOrd(from)) : ORD_MIN, [from, ORD_MIN])
  const extB = useMemo(() => to   ? Math.min(ORD_MAX, dateToOrd(to))   : ORD_MAX, [to, ORD_MAX])

  const [draft, setDraft] = useState({ a: extA, b: extB })

  useEffect(() => { setDraft({ a: extA, b: extB }) }, [extA, extB])

  const aPct = ((draft.a - ORD_MIN) / SPAN) * 100
  const bPct = ((draft.b - ORD_MIN) / SPAN) * 100
  const isSingleDay = draft.a === draft.b

  // Track which thumb is closest to the cursor; bring that one to the top.
  // Without this both <input type="range"> overlap and the right one always
  // wins clicks — making the left thumb appear unselectable.
  const [activeThumb, setActiveThumb] = useState<'a' | 'b'>('a')

  const onA = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value
    setDraft(d => ({ a: v, b: Math.max(d.b, v) }))
  }, [])

  const onB = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value
    setDraft(d => ({ a: Math.min(d.a, v), b: v }))
  }, [])

  const commit = useCallback(() => {
    onChange(ordToDate(draft.a), ordToDate(draft.b))
  }, [draft, onChange])

  const trackRef = useRef<HTMLDivElement>(null)

  const updateActiveByCursor = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const cursorPct = ((clientX - rect.left) / rect.width) * 100
    const distA = Math.abs(cursorPct - aPct)
    const distB = Math.abs(cursorPct - bPct)
    setActiveThumb(distA <= distB ? 'a' : 'b')
  }, [aPct, bPct])

  const aZ = activeThumb === 'a' ? 20 : 10
  const bZ = activeThumb === 'b' ? 20 : 10

  return (
    <div className="w-full select-none px-1">
      {/* Floating date badges + track */}
      <div className="relative pt-7 pb-1">
        {isSingleDay ? (
          <div
            className="absolute top-0 bg-primary text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
            style={badgeStyle(aPct)}
          >
            {fmtDate(ordToDate(draft.a))} · {tCommon('singleDay')}
          </div>
        ) : (
          <>
            <div
              className="absolute top-0 bg-primary text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
              style={badgeStyle(aPct)}
            >
              {fmtDate(ordToDate(draft.a))}
            </div>
            {bPct - aPct > 12 && (
              <div
                className="absolute top-0.5 -translate-x-1/2 text-[10px] font-medium text-violet-500 pointer-events-none"
                style={{ left: `${(aPct + bPct) / 2}%` }}
              >
                {tCommon('days', { count: draft.b - draft.a })}
              </div>
            )}
            <div
              className="absolute top-0 bg-primary text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
              style={badgeStyle(bPct)}
            >
              {fmtDate(ordToDate(draft.b))}
            </div>
          </>
        )}

        {/* Track */}
        <div
          ref={trackRef}
          className="relative h-6 flex items-center"
          onMouseMove={(e) => updateActiveByCursor(e.clientX)}
          onTouchStart={(e) => updateActiveByCursor(e.touches[0]?.clientX ?? 0)}
          onTouchMove={(e) => updateActiveByCursor(e.touches[0]?.clientX ?? 0)}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-zinc-200 rounded-full" />

          {isSingleDay ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-violet-500 rounded-full pointer-events-none ring-2 ring-violet-200"
              style={{ left: `calc(${aPct}% - 5px)` }}
            />
          ) : (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 bg-violet-500 rounded-full pointer-events-none"
              style={{ left: `${aPct}%`, width: `${bPct - aPct}%` }}
            />
          )}

          <input
            type="range" min={ORD_MIN} max={ORD_MAX} step={1}
            value={draft.a}
            onChange={onA}
            onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit}
            className={THUMB_CLS}
            style={{ zIndex: aZ }}
          />
          <input
            type="range" min={ORD_MIN} max={ORD_MAX} step={1}
            value={draft.b}
            onChange={onB}
            onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit}
            className={THUMB_CLS}
            style={{ zIndex: bZ }}
          />
        </div>
      </div>

      {/* Quarter tick marks */}
      <div className="relative h-5 mt-0.5">
        {MARKS.map(({ iso, label }) => {
          const pct = ((dateToOrd(iso) - ORD_MIN) / SPAN) * 100
          return (
            <div
              key={iso}
              className="absolute flex flex-col items-center pointer-events-none"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2 bg-zinc-300" />
              <span className="text-[10px] text-zinc-400 mt-0.5 whitespace-nowrap">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
