'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bookmark, ChevronDown, Plus, X } from 'lucide-react'
import type { VenueViewBookmark } from '@/venue/layoutData'
import { nextBookmarkIndex, safeBookmarkIndex } from '@/lib/venue/editor'
import { useAnchoredMenu } from './useAnchoredMenu'

// Single-button view-bookmark control. Empty → an add button; with saved views
// → a dropdown to switch / overwrite / remove, plus add until the cap is hit.
export default function ViewBookmarks({
  bookmarks,
  max,
  onAdd,
  onRecall,
  onOverwrite,
  onRemove,
}: {
  bookmarks: VenueViewBookmark[]
  max: number
  onAdd: () => void
  onRecall: (index: number) => void
  onOverwrite: (index: number) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('venue')
  const { open, setOpen, menuPos, ref, buttonRef, toggleOpen: openMenu } = useAnchoredMenu()
  const [active, setActive] = useState(0)

  const count = bookmarks.length
  const safeActive = safeBookmarkIndex(active, count)

  const goTo = (index: number) => {
    setActive(index)
    onRecall(index)
  }

  // One-click cycle to the next saved view.
  const cycle = () => goTo(nextBookmarkIndex(safeActive, count))

  // Empty: a single add button.
  if (count === 0) {
    return (
      <div ref={ref} className="flex-shrink-0">
        <button
          ref={buttonRef}
          type="button"
          onClick={onAdd}
          title={t('viewSaveCurrent')}
          aria-label={t('viewSaveCurrent')}
          className="h-8 shrink-0 inline-flex items-center gap-1 rounded-field border border-dashed border-line-strong bg-surface px-2.5 text-xs font-semibold text-ink-400 hover:border-primary-border hover:text-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
        >
          <Bookmark className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <Plus className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="flex-shrink-0 inline-flex rounded-field border border-primary-border overflow-hidden">
      {/* Main: one-click switch to the next saved view. */}
      <button
        type="button"
        onClick={cycle}
        title={t('viewSwitchNext')}
        aria-label={t('viewSwitchNext')}
        className="h-8 inline-flex items-center gap-1.5 bg-primary-soft px-2.5 text-xs font-semibold text-primary-hover hover:bg-primary-soft-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
      >
        <Bookmark className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
        <span className="tabular-nums">{safeActive + 1}</span>
      </button>
      {/* Chevron: open the manage menu (switch to a specific view / overwrite / remove / add). */}
      <button
        ref={buttonRef}
        type="button"
        onClick={openMenu}
        title={t('viewBookmarks')}
        aria-label={t('viewBookmarks')}
        className="h-8 inline-flex items-center justify-center border-l border-primary-border bg-primary-soft px-1.5 text-primary-hover hover:bg-primary-soft-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
      >
        <ChevronDown strokeWidth={1.5} className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && count > 0 && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-40 min-w-44 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {bookmarks.map((_, index) => (
            <div key={index} className="flex items-center gap-1 px-2 py-1 rounded-field hover:bg-line-soft transition-colors">
              <button
                type="button"
                onClick={() => {
                  goTo(index)
                  setOpen(false)
                }}
                className={`flex-1 text-left text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${index === safeActive ? 'text-primary-hover' : 'text-ink-700'}`}
              >
                {t('viewBookmarkN', { n: index + 1 })}
              </button>
              <button
                type="button"
                onClick={() => onOverwrite(index)}
                title={t('viewOverwrite')}
                className="px-1.5 py-0.5 text-micro font-medium text-ink-400 hover:text-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
              >
                {t('viewOverwriteShort')}
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                title={t('viewRemove')}
                aria-label={t('viewRemove')}
                className="text-ink-400 hover:text-danger-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          {count < max && (
            <>
              <div className="my-1 h-px bg-line-soft" />
              <button
                type="button"
                onClick={() => onAdd()}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                {t('viewSaveCurrent')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
