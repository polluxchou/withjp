interface ProgressBarProps { value: number; max: number; label: string; tone?: 'default' | 'warning' }

export default function ProgressBar({ value, max, label, tone }: ProgressBarProps) {
  const pct = Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.min(100, Math.max(0, (value / max) * 100))
    : 0
  const resolved = tone ?? (pct > 90 ? 'warning' : 'default')
  const safeMax = max > 0 ? max : 0
  // 用 safeMax（而非原始 max）夹上界：max 非正/非有限时 safeMax 已归零，
  // 避免 valuenow 落在 valuemin(0) 之外或与非有限 max 一起产出 NaN。
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(0, value), safeMax) : 0
  return (
    <div
      className="h-1.5 rounded-btn bg-line-soft overflow-hidden"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      aria-valuemax={safeMax}
    >
      <div className={`h-full rounded-btn ${resolved === 'warning' ? 'bg-warning-dot' : 'bg-primary-gradient'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
