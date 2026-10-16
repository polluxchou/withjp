'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import type { VenueItemType } from '@/venue/layoutData'
import { TOOL_ICON } from './toolCatalog'
import { useAnchoredMenu } from './useAnchoredMenu'

// 通用「添加」下拉菜单:传入按钮图标/文案 + 一组类型,点选即添加。
// 复用给「+ 标识」(门/消防/电源/网络口)与「+ 设施」(窗户/桁架/灯)。
export default function AddMenu({
  label,
  icon: TriggerIcon,
  types,
  onAdd,
}: {
  label: string
  icon: LucideIcon
  types: VenueItemType[]
  onAdd: (type: VenueItemType) => void
}) {
  const t = useTranslations('venue')
  const { open, setOpen, menuPos, ref, buttonRef, toggleOpen } = useAnchoredMenu()

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="h-8 inline-flex items-center gap-1.5 rounded-field border border-line-strong bg-surface px-3 text-sm font-medium text-ink-700 hover:border-primary-border hover:text-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
      >
        <TriggerIcon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown strokeWidth={1.5} className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuPos && (
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-40 min-w-40 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {types.map((type) => {
            const Icon = TOOL_ICON[type]
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
              >
                <Icon className="w-3.5 h-3.5 text-ink-400" strokeWidth={1.5} />
                <span>{t(`types.${type}`)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
