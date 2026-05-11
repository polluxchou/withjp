'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

interface Props {
  text:             string
  lines?:           number
  title?:           string
  className?:       string
  emptyText?:       string
  /**
   * If provided, clicking on overflowing text calls this handler instead
   * of opening the built-in read-only modal. Use this when the click
   * should reveal a larger context (e.g. a full record detail view)
   * rather than just the single text field.
   */
  onOverflowClick?: () => void
}

/**
 * Renders text clamped to a max number of lines. If the content overflows
 * the clamp, the text becomes clickable. By default, clicking opens a
 * read-only modal with the full text; pass `onOverflowClick` to override.
 */
export default function ClampedText({
  text, lines = 2, title, className, emptyText = '—', onOverflowClick,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, lines])

  if (!text) return <span className={className}>{emptyText}</span>

  const clampStyle: React.CSSProperties = {
    display:         '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow:        'hidden',
    wordBreak:       'break-word',
  }

  const handleClick = onOverflowClick ?? (() => setOpen(true))

  return (
    <>
      <span
        ref={ref}
        className={`${className ?? ''} ${overflowing ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''}`}
        style={clampStyle}
        onClick={overflowing ? handleClick : undefined}
        title={overflowing ? text : undefined}
      >
        {text}
      </span>
      {/* Built-in modal only used when no custom handler is provided */}
      {overflowing && !onOverflowClick && (
        <Modal open={open} onClose={() => setOpen(false)} title={title ?? '详情'}>
          <div className="whitespace-pre-wrap break-words text-sm text-slate-700 max-h-[60vh] overflow-y-auto">
            {text}
          </div>
        </Modal>
      )}
    </>
  )
}
