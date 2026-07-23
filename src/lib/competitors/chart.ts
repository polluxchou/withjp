// 纯函数：把一串数值映射为 <polyline points="x,y x,y ..."> 字符串。

/** 至少 2 个点才画线；y 反转（值越大越靠上）。全相等时走中线。 */
export function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (!Array.isArray(values) || values.length < 2) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min
  const stepX = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX * 100) / 100
      const norm = span === 0 ? 0.5 : (v - min) / span
      const y = Math.round((height - norm * height) * 100) / 100
      return `${x},${y}`
    })
    .join(' ')
}
