interface Props { value: number; max: number; tone?: 'default' | 'warning' }

export default function ProgressBar({ value, max, tone }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const resolved = tone ?? (pct > 90 ? 'warning' : 'default')
  return (
    <div className="h-1.5 rounded-btn bg-line-soft overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-btn ${resolved === 'warning' ? 'bg-warning-dot' : 'bg-primary-gradient'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
