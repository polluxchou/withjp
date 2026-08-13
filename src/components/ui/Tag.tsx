import type { Tone } from '@/lib/ui/status-tone'

interface TagProps { label: string; tone?: Tone; variant?: 'soft' | 'dot'; size?: 'sm' | 'md' }

const SOFT: Record<Tone, string> = {
  success: 'bg-success-soft text-success-text', warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',    info: 'bg-info-soft text-info-text',
  neutral: 'bg-muted-soft text-muted-text',     violet: 'bg-primary-soft text-primary-hover',
}
const DOT: Record<Tone, string> = {
  success: 'bg-success-dot', warning: 'bg-warning-dot', danger: 'bg-danger-dot',
  info: 'bg-info-dot', neutral: 'bg-muted-dot', violet: 'bg-primary',
}
const TEXT: Record<Tone, string> = {
  success: 'text-success-text', warning: 'text-warning-text', danger: 'text-danger-text',
  info: 'text-info-text', neutral: 'text-muted-text', violet: 'text-primary-hover',
}

export default function Tag({ label, tone = 'neutral', variant = 'soft', size = 'md' }: TagProps) {
  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium ${size === 'sm' ? 'text-micro' : 'text-xs'} ${TEXT[tone]}`}>
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} />
        {label}
      </span>
    )
  }
  const pad = size === 'sm' ? 'px-2 py-0.5 text-micro' : 'px-2.5 py-1 text-xs'
  return <span className={`inline-flex items-center rounded-btn font-medium ${SOFT[tone]} ${pad}`}>{label}</span>
}
