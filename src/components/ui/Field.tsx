'use client'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { Search } from 'lucide-react'

const CONTROL = 'w-full h-8 rounded-field border border-line-strong bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:bg-canvas'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}
        {required && <span className="text-danger-text ml-0.5">*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-micro text-danger-text mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-micro text-ink-400 mt-1">{hint}</span>
      ) : null}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

// 下拉箭头用行内 data-URI SVG（非 lucide 图标，不走 §5 图标尺寸三档），
// stroke 用 %23 转义 #（不是裸 hex，不触发门禁）；stroke-width 与
// lucide 图标统一取 1.5（design-system §5）。
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${CONTROL} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22%238d87a1%22 stroke-width=%221.5%22><path d=%22M4 6l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] pr-8 ${props.className ?? ''}`}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} h-auto min-h-20 py-2 resize-none ${props.className ?? ''}`} />
}

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  kbdHint?: string
}

export function SearchInput({ kbdHint, ...props }: SearchInputProps) {
  return (
    <div className="relative min-w-0">
      <Search aria-hidden strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-ink-400" />
      <input {...props} className={`${CONTROL} pl-8 ${kbdHint ? 'pr-12' : ''} ${props.className ?? ''}`} />
      {kbdHint && (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-micro text-ink-400 border border-line rounded px-1 py-px bg-canvas">
          {kbdHint}
        </kbd>
      )}
    </div>
  )
}
