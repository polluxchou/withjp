'use client'
import { cloneElement, forwardRef, isValidElement, useId } from 'react'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react'
import { ChevronDown, Search } from 'lucide-react'

type ControlSize = 'sm' | 'md' | 'lg'

// 控件高度三档（design-system §3）：28 紧凑 chip/表内控件 / 32 默认 / 38 页头 CTA·搜索框。
// Textarea 不设固定高度（多行内容会被裁切），只按同档位调 min-h，见 TEXTAREA_MIN_H。
const CONTROL_HEIGHT: Record<ControlSize, string> = {
  sm: 'h-7',
  md: 'h-8',
  lg: 'h-[38px]',
}

const TEXTAREA_MIN_H: Record<ControlSize, string> = {
  sm: 'min-h-16',
  md: 'min-h-20',
  lg: 'min-h-28',
}

const CONTROL_BASE =
  'w-full rounded-field border border-line-strong bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:bg-canvas'

function controlClass(size: ControlSize) {
  return `${CONTROL_BASE} ${CONTROL_HEIGHT[size]}`
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  // 尊重调用方已经显式传给控件的 id（例如控件本身要被表单库/E2E 测试按 id
  // 定位）：有就用它，没有才用 Field 自己生成的 id。htmlFor 和注入的 id
  // 必须用同一个值，否则调用方的 id 生效但 label 关联的还是 Field 生成的
  // 那个，点 label 对不上焦点。
  const providedId = isValidElement(children) ? (children.props as { id?: string }).id : undefined
  const childId = providedId || id
  const descId = `${id}-desc`
  const hasDesc = Boolean(error || hint)

  // 不无条件注入 undefined 值：cloneElement 用 Object.assign 合并 props，
  // 显式的 undefined 会覆盖子元素自身可能已设置的同名 prop。只在真正需要时才带上该 key。
  const injected: Record<string, unknown> = { id: childId }
  if (hasDesc) injected['aria-describedby'] = descId
  if (error) injected['aria-invalid'] = true
  if (required) injected.required = true
  const child = isValidElement(children) ? cloneElement(children, injected) : children

  return (
    <div className="min-w-0">
      <label htmlFor={childId} className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger-text ml-0.5">
            *
          </span>
        )}
      </label>
      {child}
      {hasDesc && (
        <span id={descId} className={`block text-micro mt-1 ${error ? 'text-danger-text' : 'text-ink-400'}`}>
          {error || hint}
        </span>
      )}
    </div>
  )
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize
}

export function Input({ size = 'md', className, ...props }: InputProps) {
  return <input {...props} className={`${controlClass(size)} ${className ?? ''}`} />
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize
}

// 下拉箭头用 lucide ChevronDown（非行内 data-URI SVG）：绝对定位叠在 select 右侧，
// select 本身 appearance-none 去掉原生箭头 + pr-8 让文字不压到图标。
// 尺寸 13px 落在 §5 图标三档（13/15/16）内，stroke-width 1.5 与全站图标统一。
export function Select({ size = 'md', className, ...props }: SelectProps) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={`${controlClass(size)} appearance-none pr-8 ${className ?? ''}`} />
      <ChevronDown
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] text-ink-400 pointer-events-none"
        strokeWidth={1.5}
        aria-hidden
      />
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: ControlSize
}

// 唯一走 forwardRef 的 Field 控件。React 18 的函数组件收不到 ref 作为普通
// prop，而命令面板的 composer 需要在「点击示例 chip」「打开面板」后把焦点
// 送进输入框——这个能力只能由调用方持有 ref 来做。其余 Field 控件没有这
// 个需求，保持原样，不做无用的 forwardRef 包裹。
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ size = 'md', className, ...props }, ref) {
    return (
      <textarea
        {...props}
        ref={ref}
        className={`${CONTROL_BASE} h-auto ${TEXTAREA_MIN_H[size]} py-2 resize-none ${className ?? ''}`}
      />
    )
  },
)

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  kbdHint?: string
  size?: ControlSize
}

export function SearchInput({ kbdHint, size = 'md', className, ...props }: SearchInputProps) {
  return (
    <div className="relative min-w-0">
      <Search aria-hidden strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-ink-400" />
      <input {...props} className={`${controlClass(size)} pl-8 ${kbdHint ? 'pr-12' : ''} ${className ?? ''}`} />
      {kbdHint && (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-micro text-ink-400 border border-line rounded px-1 py-px bg-canvas">
          {kbdHint}
        </kbd>
      )}
    </div>
  )
}
