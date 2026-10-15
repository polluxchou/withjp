'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { KeyboardSensor, useDraggable, useDroppable } from '@dnd-kit/core'
import type { ClientRect, KeyboardCoordinateGetter, KeyboardSensorProps, Modifier } from '@dnd-kit/core'
import { centerOnPointer, nextZone, pointerOf } from '@/lib/org/dragZones'
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
  const t = useTranslations('team')
  // dnd-kit 默认把 aria-roledescription 写成英文 draggable，读屏会照读；换成当前语言。
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { itemId },
    disabled,
    attributes: { roleDescription: t('org.dragRoleDescription') },
  })
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

// 悬停高亮（spec 3.2：primary 色描边 + 浅底）。浅底画在 ::before 上、压在内容之下：
// 可放区自己已带 bg-surface / bg-danger-soft 等底色，同一元素再叠一个 bg-* 谁赢取决于 CSS 生成顺序。
// isolate 让 -z-10 的伪元素停在本区的层叠上下文里（盖住本区底色、不跑到页面底下）。
const OVER_HIGHLIGHT =
  'ring-2 ring-primary-ring ring-offset-2 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-primary-soft'

/** 可放区。事项当前所在的区禁用（放回原处 = 不算落点），悬停时描边 + 浅底高亮。 */
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
      data-drop-zone=""
      className={`relative isolate ${className} ${isOver && !disabled ? OVER_HIGHLIGHT : ''}`}
    >
      {children}
    </section>
  )
}

/**
 * 跟手的精简卡片（DragOverlay 里渲染）。覆盖层与来源行等宽：
 * 指针拖时卡片居中摆放，配合 centerOverlayOnPointer 让卡片中心落在指针上；键盘拖保持靠左（原样）。
 */
export function DragPreview({ row, ownerLabel, centered }: { row: QuadrantRow; ownerLabel: string; centered: boolean }) {
  const card = (
    <div className="flex max-w-[18rem] items-center gap-2 rounded-field border border-primary-border bg-surface px-3 py-2 text-sm text-ink-900 shadow-pop">
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      <span className="flex-none text-xs text-ink-500">{ownerLabel}</span>
    </div>
  )
  // 来源比卡片窄（待评估区的小标签）时，justify-center 让卡片向两侧等量溢出，中心仍在覆盖层中心。
  return centered ? <div className="flex h-full w-full items-center justify-center">{card}</div> : card
}

// 每次拖动锁定起拖时来源行的矩形（覆盖层就摆在那里）。不用 draggingNodeRect：它是覆盖层挂载时量的，
// 已经带上了本 modifier 第一帧加的偏移，拿它再算一遍会把偏移抵消掉。以起拖事件为键，拖完自动回收。
const startRects = new WeakMap<Event, ClientRect>()

/** DragOverlay 的 modifier：指针拖时把覆盖层中心对齐到指针（spec 3.2 跟手）。键盘拖没有指针，原样不动。 */
export const centerOverlayOnPointer: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  if (!activatorEvent || !activeNodeRect) return transform
  let rect = startRects.get(activatorEvent)
  if (!rect) {
    rect = activeNodeRect
    startRects.set(activatorEvent, rect)
  }
  return centerOnPointer(transform, pointerOf(activatorEvent), rect)
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

/**
 * 键盘拖用的传感器：方向键直接跳区（spec 3.5）。
 * dnd-kit 的 KeyboardSensor 移动前会先看「可滚动祖先」：某个祖先还能朝该方向滚，就先滚它、覆盖层不动。
 * 起拖时祖先里有来源格自己的 <ul overflow-y-auto>，同一列上下跳（x 位移为 0）会先把格内清单一路滚到头，
 * 要多按几次才跳出去。这里只把可放区外面的滚动容器（页面本身）交给它：目标区在视口外时照样滚页面，
 * 格内清单不再参与。
 */
export class ZoneKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    const { context } = props
    super({
      ...props,
      context: {
        get current() {
          const c = context.current
          return { ...c, scrollableAncestors: c.scrollableAncestors.filter((el) => !el.closest('[data-drop-zone]')) }
        },
        set current(value) {
          context.current = value
        },
      },
    })
  }
}
