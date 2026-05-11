'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

interface Props {
  text:       string
  lines?:     number
  title?:     string
  className?: string
  emptyText?: string
}

/**
 * Renders text clamped to a max number of lines. If the content overflows
 * the clamp, the text becomes clickable and opens a read-only modal with
 * the full content.
 */
export default function ClampedText({ text, lines = 2, title, className, emptyText = '—' }: Props) {
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

  return (
    <>
      <span
        ref={ref}
        className={`${className ?? ''} ${overflowing ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''}`}
        style={clampStyle}
        onClick={overflowing ? () => setOpen(true) : undefined}
        title={overflowing ? text : undefined}
      >
        {text}
      </span>
      {overflowing && (
        <Modal open={open} onClose={() => setOpen(false)} title={title ?? '详情'}>
          <div className="whitespace-pre-wrap break-words text-sm text-slate-700 max-h-[60vh] overflow-y-auto">
            {text}
          </div>
        </Modal>
      )}
    </>
  )
}
