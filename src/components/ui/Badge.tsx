interface BadgeProps {
  label: string
  color?: 'slate' | 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'indigo'
  size?: 'sm' | 'md'
}

const COLORS = {
  slate:  'bg-slate-100 text-slate-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

export default function Badge({ label, color = 'slate', size = 'md' }: BadgeProps) {
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${COLORS[color]} ${px}`}>
      {label}
    </span>
  )
}
