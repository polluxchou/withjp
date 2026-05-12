'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

const MS = 86_400_000
const dateToOrd = (s: string) => Math.round(new Date(s).getTime() / MS)
const ordToDate = (n: number) => new Date(n * MS).toISOString().slice(0, 10)
const fmtDate   = (s: string) => s.replace(/-/g, '/')

const RANGE_START = '2026-01-01'
const RANGE_END   = '2027-12-31'
const ORD_MIN     = dateToOrd(RANGE_START)
const ORD_MAX     = dateToOrd(RANGE_END)
const SPAN        = ORD_MAX - ORD_MIN

const MARKS = [
  { iso: '2026-01-01', label: '2026 Q1' },
  { iso: '2026-04-01', label: 'Q2' },
  { iso: '2026-07-01', label: 'Q3' },
  { iso: '2026-10-01', label: 'Q4' },
  { iso: '2027-01-01', label: '2027 Q1' },
  { iso: '2027-04-01', label: 'Q2' },
  { iso: '2027-07-01', label: 'Q3' },
  { iso: '2027-10-01', label: 'Q4' },
]

const THUMB_CLS = [
  'absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer',
  '[&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
  '[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-indigo-600',
  '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab',
  '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5',
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white',
  '[&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-indigo-600',
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
}

export default function DateRangeSlider({ from, to, onChange }: Props) {
  const extA = useMemo(() => from ? dateToOrd(from) : ORD_MIN, [from])
  const extB = useMemo(() => to   ? dateToOrd(to)   : ORD_MAX, [to])

  const [draft, setDraft] = useState({ a: extA, b: extB })

  useEffect(() => { setDraft({ a: extA, b: extB }) }, [extA, extB])

  const aPct = ((draft.a - ORD_MIN) / SPAN) * 100
  const bPct = ((draft.b - ORD_MIN) / SPAN) * 100
  const isSingleDay = draft.a === draft.b

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
  const aZ = draft.a >= ORD_MAX - 1 ? 20 : 10
  const bZ = draft.a >= ORD_MAX - 1 ? 10 : 20

  return (
    <div className="w-full select-none px-1">
      {/* Floating date badges + track */}
      <div className="relative pt-7 pb-1">
        {isSingleDay ? (
          <div
            className="absolute top-0 bg-indigo-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
            style={badgeStyle(aPct)}
          >
            {fmtDate(ordToDate(draft.a))} · 单日
          </div>
        ) : (
          <>
            <div
              className="absolute top-0 bg-indigo-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
              style={badgeStyle(aPct)}
            >
              {fmtDate(ordToDate(draft.a))}
            </div>
            {bPct - aPct > 12 && (
              <div
                className="absolute top-0.5 -translate-x-1/2 text-[10px] font-medium text-indigo-500 pointer-events-none"
                style={{ left: `${(aPct + bPct) / 2}%` }}
              >
                {draft.b - draft.a}天
              </div>
            )}
            <div
              className="absolute top-0 bg-indigo-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none"
              style={badgeStyle(bPct)}
            >
              {fmtDate(ordToDate(draft.b))}
            </div>
          </>
        )}

        {/* Track */}
        <div ref={trackRef} className="relative h-6 flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200 rounded-full" />

          {isSingleDay ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-full pointer-events-none ring-2 ring-indigo-200"
              style={{ left: `calc(${aPct}% - 5px)` }}
            />
          ) : (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 bg-indigo-500 rounded-full pointer-events-none"
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
              <div className="w-px h-2 bg-slate-300" />
              <span className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
