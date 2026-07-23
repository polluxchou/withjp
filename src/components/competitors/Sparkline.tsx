import { buildSparklinePoints } from '@/lib/competitors/chart'

export default function Sparkline({
  values,
  width = 120,
  height = 28,
  className,
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
}) {
  const points = buildSparklinePoints(values, width, height)
  if (!points) return null
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
