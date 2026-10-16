'use client'

import { useEffect, useState } from 'react'
import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/Field'
import { READONLY_INPUT } from './dashboard-styles'

// 数字输入：取值/钳位/草稿态行为原样保留，只把裸 input 换成共享 Input。
// `...rest` 必须整体透传：共享 Field 通过 cloneElement 往子元素上注入
// id / aria-describedby / aria-invalid / required，中间隔着这个包装组件时
// 不透传就会被整组吞掉——label 点击对不上焦点、hint 与错误也读不出来。
export default function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  disabled,
  ...rest
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min' | 'max' | 'disabled' | 'size'>) {
  const format = (v: number) => (Number.isFinite(v) ? String(v) : '')
  const [draft, setDraft] = useState(() => format(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(format(value))
  }, [value, focused])

  const clamp = (n: number) => {
    let r = n
    if (r < min) r = min
    if (max !== undefined && r > max) r = max
    return r
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setDraft(raw)
    if (raw === '' || raw === '.') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = clamp(n)
    if (clamped !== value) onChange(clamped)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    const raw = event.target.value
    const parsed = raw === '' || raw === '.' ? min : Number(raw)
    const next = Number.isFinite(parsed) ? clamp(parsed) : min
    if (next !== value) onChange(next)
    setDraft(format(next))
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      pattern="[0-9]*\.?[0-9]*"
      value={draft}
      onChange={handleChange}
      onFocus={(event) => { setFocused(true); event.currentTarget.select() }}
      onBlur={handleBlur}
      onWheel={(event) => event.currentTarget.blur()}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      readOnly={disabled}
      className={`tabular-nums ${READONLY_INPUT}`}
    />
  )
}
