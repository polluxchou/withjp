// 纯函数，零 import：供采集脚本（--experimental-strip-types）与视图共用。

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

/** "1.2M" / "34K" / "1,234" / 1200000 → number；无法解析返回 null。 */
export function parseCount(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (input == null) return null
  const s = String(input).trim().replace(/,/g, '')
  if (s === '') return null
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  const suf = m[2]?.toLowerCase()
  return suf ? Math.round(n * SUFFIX[suf]) : n
}

/** number → 紧凑显示 "1.2M"；null → "—"。 */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const fmt = (v: number, suf: string) => {
    const r = Math.round(v * 10) / 10
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + suf
  }
  if (abs >= 1e9) return fmt(n / 1e9, 'B')
  if (abs >= 1e6) return fmt(n / 1e6, 'M')
  if (abs >= 1e3) return fmt(n / 1e3, 'K')
  return String(n)
}
