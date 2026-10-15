'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * 就地改名的输入框：挂载即聚焦并全选；Enter / 失焦保存，Esc 取消。
 * 何时进入编辑由父组件决定（「改名」按钮或点名称）；是否真的写入由 onSave 的调用方判断
 * （空白或未改动不写，见 lib/org/tree.ts 的 nameToSave）。
 *
 * data-inline-name：详情面板的 Esc 监听据此放行，Esc 只取消改名，不连带关掉面板。
 * 输入法组字中（中文 / 日文）按 Enter 是在选字，不当作保存。
 */
export default function InlineNameInput({ initial, onSave, onCancel, className }: {
  initial: string
  onSave: (value: string) => void
  onCancel: () => void
  className: string
}) {
  const t = useTranslations('team')
  const inputRef = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // 保存与取消只生效一次：Enter 保存后输入框卸载还会触发失焦。
  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    if (save) onSave(value)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      data-inline-name=""
      aria-label={t('org.namePlaceholder')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
      className={className}
    />
  )
}
