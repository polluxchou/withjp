'use client'

import { useCallback } from 'react'

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
  { iso: RANGE_START,  label: '2026/01', pos: 'l' as const },
  { iso: '2026-07-01', label: '2026/07', pos: 'c' as const },
  { iso: '2027-01-01', label: '2027/01', pos: 'c' as const },
  { iso: '2027-07-01', label: '2027/07', pos: 'c' as const },
  { iso: RANGE_END,    label: '2027/12', pos: 'r' as const },
]

const THUMB_CLS = [
  'absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer',
  '[&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px]',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500',
  '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab',
  '[&::-moz-range-thumb]:appearance-none',
  '[&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:h-[18px]',
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white',
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-indigo-500',
  '[&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab',
  '[&::-moz-range-track]:bg-transparent',
].join(' ')

interface Props {
  from: string
  to:   string
  onChange: (from: string, to: string) => void
}

export default function DateRangeSlider({ from, to, onChange }: Props) {
  const aOrd = from ? dateToOrd(from) : ORD_MIN
  const bOrd = to   ? dateToOrd(to)   : ORD_MAX

  const aPct = ((aOrd - ORD_MIN) / SPAN) * 100
  const bPct = ((bOrd - ORD_MIN) / SPAN) * 100

  const onA = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value
    onChange(ordToDate(v), ordToDate(Math.max(bOrd, v + 1)))
  }, [bOrd, onChange])

  const onB = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value
    onChange(ordToDate(Math.min(aOrd, v - 1)), ordToDate(v))
  }, [aOrd, onChange])

  // When the left thumb reaches the far right, bring it forward so it stays grabbable
  const aZ = aOrd >= ORD_MAX - 1 ? 20 : 10
  const bZ = aOrd >= ORD_MAX - 1 ? 10 : 20

  return (
    <div className="flex-1 min-w-[300px] max-w-md select-none">
      {/* Labels */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-indigo-600">
          {fmtDate(from || RANGE_START)}
        </span>
        <span className="text-[10px] text-slate-400">{bOrd - aOrd} 天</span>
        <span className="text-xs font-medium text-indigo-600">
          {fmtDate(to || RANGE_END)}
        </span>
      </div>

      {/* Track */}
      <div className="relative h-5">
        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1.5 bg-slate-200 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-indigo-400 rounded-full pointer-events-none"
          style={{ left: `${aPct}%`, width: `${bPct - aPct}%` }}
        />
        <input
          type="range" min={ORD_MIN} max={ORD_MAX} step={1}
          value={aOrd} onChange={onA}
          className={THUMB_CLS}
          style={{ zIndex: aZ }}
        />
        <input
          type="range" min={ORD_MIN} max={ORD_MAX} step={1}
          value={bOrd} onChange={onB}
          className={THUMB_CLS}
          style={{ zIndex: bZ }}
        />
      </div>

      {/* Month marks */}
      <div className="relative h-4 mt-0.5">
        {MARKS.map(({ iso, label, pos }) => {
          const pct = ((dateToOrd(iso) - ORD_MIN) / SPAN) * 100
          const style =
            pos === 'l' ? { left: 0 } :
            pos === 'r' ? { right: 0 } :
            { left: `${pct}%`, transform: 'translateX(-50%)' }
          return (
            <span key={iso} className="absolute text-[10px] text-slate-300" style={style}>
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
