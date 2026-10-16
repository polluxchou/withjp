'use client'

import { useTranslations } from 'next-intl'
import { Ruler } from 'lucide-react'
import type { VenueRulerOptions } from '@/venue/VenueCanvas'
import { formatVenueMeasurement } from '@/venue/layoutData'
import { useAnchoredMenu } from './useAnchoredMenu'

export default function RulerMenu({
  options,
  onChange,
  autoDepth,
}: {
  options: VenueRulerOptions
  onChange: (next: VenueRulerOptions) => void
  // 自动带深(cm),仅用于滑杆处于自动模式时的显示与滑块位置
  autoDepth: number
}) {
  const t = useTranslations('venue')
  const { open, menuPos, ref, buttonRef, toggleOpen } = useAnchoredMenu()

  const entries: { key: 'items' | 'totalBounds' | 'chain'; label: string }[] = [
    { key: 'items', label: t('rulerMenu.items') },
    { key: 'totalBounds', label: t('rulerMenu.totalBounds') },
    { key: 'chain', label: t('rulerMenu.chain') },
  ]
  const anyOn = options.items || options.totalBounds || options.chain

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={t('dimensionRulers')}
        aria-label={t('dimensionRulers')}
        aria-expanded={open}
        onClick={toggleOpen}
        className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-field border text-xs font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
          anyOn
            ? 'border-primary-border bg-primary-soft text-primary-hover'
            : 'border-line-strong bg-surface text-ink-700 hover:border-primary-border hover:text-primary-hover'
        }`}
      >
        <Ruler className="w-4 h-4 shrink-0" strokeWidth={1.5} />
      </button>
      {open && menuPos && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-40 min-w-48 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {entries.map((entry) => (
            <label
              key={entry.key}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-line-soft transition-colors"
            >
              <input
                type="checkbox"
                checked={options[entry.key]}
                onChange={(event) => onChange({ ...options, [entry.key]: event.target.checked })}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>{entry.label}</span>
            </label>
          ))}
          {options.chain && (
            <div className="mt-1 border-t border-line-soft px-3 pb-1.5 pt-2">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-700">
                <span>{t('rulerMenu.bandDepth')}</span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {options.chainBandDepth === null
                    ? `${t('rulerMenu.bandAuto')} ${formatVenueMeasurement(autoDepth)}`
                    : formatVenueMeasurement(options.chainBandDepth)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="venue-chain-band-depth"
                  type="range"
                  min={30}
                  max={400}
                  step={10}
                  value={options.chainBandDepth ?? Math.round(autoDepth)}
                  aria-label={t('rulerMenu.bandDepth')}
                  // 拨滑杆就等于「我要自己定」,顺手退出自动模式。别做成必须先点
                  // 「自动」才能拨——那样会让人以为滑杆是坏的。
                  onChange={(event) => onChange({ ...options, chainBandDepth: Number(event.target.value) })}
                  className="h-1 flex-1 accent-primary"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...options, chainBandDepth: null })}
                  disabled={options.chainBandDepth === null}
                  className="shrink-0 rounded-field border border-line-strong px-2 py-0.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-primary-border hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('rulerMenu.bandAuto')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
