'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { nextZone } from '@/lib/org/dragZones'
import type { Direction, ZoneRect } from '@/lib/org/dragZones'
import type { Bucket, Quadrant, QuadrantRow } from '@/lib/org/quadrant'

// 拖拽数据约定：可拖元素 data = { itemId }，可放区 data = { target }。
// 同一事项在桌面树（d:）与手机树（m:）各渲染一次，dnd-kit 的 id 必须唯一，所以加前缀。

/** 可拖的事项按钮。不可编辑时退化为普通按钮（不挂拖拽属性，读屏不会读成「可拖动」）。 */
export function DraggableButton({ dragId, itemId, disabled, className, onClick, title, children }: {
  dragId: string
  itemId: string
  disabled: boolean
  className: string
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { itemId }, disabled })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      onClick={onClick}
      title={title}
      className={`touch-manipulation ${isDragging ? 'opacity-40' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

/** 可放区。事项当前所在的区禁用（放回原处 = 不算落点），悬停时描边高亮。 */
export function DropZone({ id, target, current, label, className, children }: {
  id: string
  target: Bucket
  current: Bucket | null
  label: string
  className: string
  children: ReactNode
}) {
  const disabled = current === target
  const { setNodeRef, isOver } = useDroppable({ id, data: { target }, disabled })
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`${className} ${isOver && !disabled ? 'ring-2 ring-primary-ring ring-offset-2' : ''}`}
    >
      {children}
    </section>
  )
}

/** 跟手的精简卡片（DragOverlay 里渲染）。 */
export function DragPreview({ row, ownerLabel }: { row: QuadrantRow; ownerLabel: string }) {
  return (
    <div className="flex max-w-[18rem] items-center gap-2 rounded-field border border-primary-border bg-surface px-3 py-2 text-sm text-ink-900 shadow-pop">
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      <span className="flex-none text-xs text-ink-500">{ownerLabel}</span>
    </div>
  )
}

/** 手机列表层起拖后从底部滑出的放置区（spec 3.3）。桌面隐藏。 */
export function DropDock({ current, titleOf, tone }: {
  current: Bucket
  titleOf: (b: Bucket) => string
  tone: Record<Quadrant, { dot: string; text: string; tile: string }>
}) {
  const t = useTranslations('team')
  const quads: Quadrant[] = ['q1', 'q2', 'q3', 'q4']
  const others: Bucket[] = ['unrated', 'done']
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-card bg-surface px-3 pt-3 shadow-pop md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <p className="mb-2 text-center text-xs text-ink-500">{t('org.dockTitle')}</p>
      <div className="grid grid-cols-2 gap-2">
        {quads.map((q) => (
          <DropZone
            key={q}
            id={`dock:${q}`}
            target={q}
            current={current}
            label={titleOf(q)}
            className={`flex min-h-16 items-center justify-center gap-1.5 rounded-field border text-md font-semibold ${tone[q].tile} ${tone[q].text} ${current === q ? 'opacity-40' : ''}`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${tone[q].dot}`} />
            {titleOf(q)}
          </DropZone>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {others.map((b) => (
          <DropZone
            key={b}
            id={`dock:${b}`}
            target={b}
            current={current}
            label={titleOf(b)}
            className={`flex min-h-11 items-center justify-center rounded-field border border-dashed border-line-strong text-sm text-ink-700 ${current === b ? 'opacity-40' : ''}`}
          >
            {titleOf(b)}
          </DropZone>
        ))}
      </div>
    </div>
  )
}

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/** 键盘方向键：跳到该方向最近的可放区中心（spec 3.5）。非方向键或没有目标时不移动。 */
export const zoneKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const dir = ARROWS[event.code]
  if (!dir) return undefined
  const { collisionRect, droppableRects } = context
  if (!collisionRect) return undefined
  event.preventDefault()
  const zones: ZoneRect[] = []
  droppableRects.forEach((r, id) => {
    zones.push({ id: String(id), left: r.left, top: r.top, width: r.width, height: r.height })
  })
  const zone = nextZone(
    zones,
    { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 },
    dir,
  )
  if (!zone) return undefined
  return {
    x: zone.left + (zone.width - collisionRect.width) / 2,
    y: zone.top + (zone.height - collisionRect.height) / 2,
  }
}
