'use client'

import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Edit2, Plus } from 'lucide-react'
import { Input } from '@/components/ui/Field'
import type { VenueFloor } from '@/venue/layoutData'
import type { VenueSummary } from './types'

// 浮动面板「当前场地」下拉的内容:场馆列表(当前场馆可就地改名)+ 当前场馆的
// 楼层 + 新建场馆。开合与改名草稿的状态由 FloatingPanel 持有。
export default function VenueSwitcherList({
  venues,
  activeVenueId,
  floors,
  selectedFloorId,
  renameDraft,
  onRenameDraftChange,
  onSwitchVenue,
  onSelectFloor,
  onCreateVenue,
  onRenameActiveVenue,
  onClose,
}: {
  venues: VenueSummary[]
  activeVenueId: string
  floors: VenueFloor[]
  selectedFloorId: string
  // When non-null, the active venue row is swapped for an inline input
  // prefilled with this value — Enter saves, Escape / blur cancels.
  renameDraft: string | null
  onRenameDraftChange: (draft: string | null) => void
  onSwitchVenue: (id: string) => void
  onSelectFloor: (id: string) => void
  onCreateVenue: () => void
  onRenameActiveVenue: (name: string) => void
  onClose: () => void
}) {
  const t = useTranslations('venue')

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-card border border-line bg-surface py-1 shadow-pop">
      {venues.map((venue) => {
        const isActiveVenue = venue.id === activeVenueId
        const isEditing = isActiveVenue && renameDraft !== null
        return (
          <div key={venue.id}>
            {isEditing ? (
              // Inline rename: Enter commits, Escape / blur cancels.
              // We keep the row in place (no layout shift) and swap
              // only the label for an input.
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-ink-400" strokeWidth={1.5} />
                <Input
                  size="sm"
                  autoFocus
                  value={renameDraft ?? ''}
                  onChange={(e) => onRenameDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenameActiveVenue(renameDraft ?? '')
                      onRenameDraftChange(null)
                    } else if (e.key === 'Escape') {
                      onRenameDraftChange(null)
                    }
                  }}
                  onBlur={() => onRenameDraftChange(null)}
                  aria-label={t('renameVenue')}
                  className="flex-1 min-w-0"
                />
              </div>
            ) : (
              <div className="group flex items-center gap-1 pr-1">
                <button
                  type="button"
                  // Keep the dropdown open after a venue switch so the
                  // user can drill down into the freshly-loaded floors
                  // without re-opening the menu. The menu closes only
                  // when a floor is picked.
                  onClick={() => onSwitchVenue(venue.id)}
                  className={`flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                    isActiveVenue ? 'font-semibold text-ink-900' : 'text-ink-700 hover:bg-line-soft'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-ink-400" strokeWidth={1.5} />
                  <span className="truncate flex-1">{venue.name}</span>
                  {/* Chevron telegraphs "click to drill down" — points
                      down when this venue's floors are showing below,
                      right when collapsed. */}
                  <ChevronDown
                    strokeWidth={1.5}
                    className={`w-3 h-3 flex-shrink-0 text-ink-400 transition-transform ${
                      isActiveVenue ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {isActiveVenue && (
                  <button
                    type="button"
                    onClick={() => onRenameDraftChange(venue.name)}
                    title={t('renameVenue')}
                    aria-label={t('renameVenue')}
                    // Hover-visible edit affordance: invisible until the
                    // row (or the icon itself) is hovered, so the menu
                    // looks calm by default.
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-field text-ink-400 hover:text-primary-hover hover:bg-line-soft transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
                  >
                    <Edit2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}
            {/* Floors of the active venue (the only one whose floors are loaded). */}
            {isActiveVenue && floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                onClick={() => { onSelectFloor(floor.id); onClose() }}
                className={`flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                  floor.id === selectedFloorId ? 'bg-primary-soft font-medium text-primary-hover' : 'text-ink-700 hover:bg-line-soft'
                }`}
              >
                <span className="truncate">{floor.name}</span>
              </button>
            ))}
          </div>
        )
      })}
      <div className="my-1 h-px bg-line-soft" />
      <button
        type="button"
        onClick={() => { onCreateVenue(); onClose() }}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('newVenue')}
      </button>
    </div>
  )
}
