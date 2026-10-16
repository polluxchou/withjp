'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, ListFilter } from 'lucide-react'
import { VENUE_ITEM_TYPE_OPTIONS, type VenueItemType } from '@/venue/layoutData'
import { toggleVisibleType } from '@/lib/venue/editor'
import { ALL_VENUE_TYPES, TOOL_ICON } from './toolCatalog'
import { useAnchoredMenu } from './useAnchoredMenu'

export default function TypeFilter({
  visibleTypes,
  onChange,
  fullWidth = false,
}: {
  visibleTypes: VenueItemType[]
  onChange: (next: VenueItemType[]) => void
  fullWidth?: boolean
}) {
  const t = useTranslations('venue')
  const { open, menuPos, ref, buttonRef, toggleOpen } = useAnchoredMenu()

  const visibleSet = new Set(visibleTypes)
  const allSelected = VENUE_ITEM_TYPE_OPTIONS.every((option) => visibleSet.has(option.value))
  const summary = allSelected
    ? t('filterAllComponents')
    : t('filterCount', { count: visibleTypes.length })

  // Always keep at least one type visible (toggleVisibleType returns null then).
  const toggle = (value: VenueItemType) => {
    const next = toggleVisibleType(visibleTypes, value)
    if (next) onChange(next)
  }

  return (
    <div ref={ref} className={fullWidth ? 'w-full' : 'flex-shrink-0'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`h-8 inline-flex items-center gap-1.5 rounded-field border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          allSelected
            ? 'border-line-strong bg-surface text-ink-700 hover:border-primary-border hover:text-primary-hover'
            : 'border-primary-border bg-primary-soft text-primary-hover'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ListFilter className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <span className="whitespace-nowrap">{summary}</span>
        </span>
        <ChevronDown strokeWidth={1.5} className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && (
        <div
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            // Cap height to the remaining viewport so the 10-type list never
            // clips off-screen when the trigger sits low on the canvas.
            maxHeight: `calc(100vh - ${menuPos.top + 16}px)`,
            overflowY: 'auto',
          }}
          className="z-40 min-w-44 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          <button
            type="button"
            onClick={() => onChange(ALL_VENUE_TYPES)}
            disabled={allSelected}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-line-soft transition-colors disabled:text-ink-400 disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
          >
            {t('filterShowAll')}
          </button>
          <div className="my-1 h-px bg-line-soft" />
          {VENUE_ITEM_TYPE_OPTIONS.map((option) => {
            const Icon = TOOL_ICON[option.value]
            const checked = visibleSet.has(option.value)
            const lockedLast = checked && visibleTypes.length <= 1
            return (
              <label
                key={option.value}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-line-soft transition-colors ${lockedLast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lockedLast}
                  onChange={() => toggle(option.value)}
                  className="accent-primary"
                />
                <Icon className="w-3.5 h-3.5 text-ink-400" strokeWidth={1.5} />
                <span>{t(`types.${option.value}`)}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
