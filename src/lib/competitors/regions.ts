// src/lib/competitors/regions.ts
// 竞品账号的地区（competitors.region）：可选清单、入参规整、新建时的取值规则。
//
// 地区原来靠数据库默认值 'JP' 兜底，后台又没地方选，于是每个新加的号都静默成了
// 日本（2026-10 实锤：两个韩国团、一个马来西亚团全登记成 JP）。现在去掉默认值：
// 主账号建档必须选，子账号跟着父账号走，脚本建出来的号留空、页面上提示补。
//
// 纯函数、零 IO，可单测。

/** 下拉可选的地区，存两位代码。新增市场就在这里加一行，并补三语名称 competitors.regionName.*。 */
export const REGION_CODES = ['JP', 'KR', 'MY', 'TW', 'CN', 'TH', 'VN', 'ID', 'US'] as const
export type RegionCode = (typeof REGION_CODES)[number]

/** 大小写与首尾空白容错；不在清单里（含空串、非字符串）返回 null。 */
export function normalizeRegion(raw: unknown): RegionCode | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return (REGION_CODES as readonly string[]).includes(code) ? (code as RegionCode) : null
}

export type NewRegionResult = { ok: true; region: string | null } | { ok: false; message: string }

/**
 * 新建账号时落库的地区。
 * - 子账号（有 parentId）：沿用父账号的地区，忽略传入值 —— 主播跟着团走，
 *   不能让一个团下面混出两个地区；父账号自己没填就也留空。
 * - 主账号：必须带清单里的地区。
 */
export function resolveNewRegion(input: {
  parentId: string | null | undefined
  parentRegion: string | null | undefined
  region: unknown
}): NewRegionResult {
  if (input.parentId) return { ok: true, region: input.parentRegion ?? null }
  const region = normalizeRegion(input.region)
  if (!region) return { ok: false, message: 'region required' }
  return { ok: true, region }
}

/** 编辑下拉的选项：清单 + 清单之外的现值（不保留的话，打开下拉就会被悄悄换成别的地区）。 */
export function regionOptions(current: string | null | undefined): string[] {
  const code = current?.trim().toUpperCase()
  const options: string[] = [...REGION_CODES]
  if (code && !options.includes(code)) options.push(code)
  return options
}

// ---- 账号导航条的地区快速筛选 ----

/** 「地区未填」那一桶的键。不会和两位地区代码撞上。 */
export const REGION_UNSET = '-'

const regionKey = (region: string | null | undefined): string =>
  region?.trim().toUpperCase() || REGION_UNSET

/** 两位地区代码 → 国旗 emoji（两个区域指示符）。不是两位字母就返回空串，调用方只显示代码。 */
export function regionFlag(code: string | null | undefined): string {
  const c = code?.trim().toUpperCase() ?? ''
  if (!/^[A-Z]{2}$/.test(c)) return ''
  return String.fromCodePoint(...c.split('').map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

/**
 * 按地区分桶计数：账号多的在前，同数按代码字母序，未填垫底。
 * 只出现库里真有的地区——清单里没人的地区不给按钮，点了也是空的。
 */
export function regionBuckets(regions: (string | null | undefined)[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of regions) {
    const k = regionKey(r)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return Array.from(counts, ([key, count]) => ({ key, count }))
    .sort((a, b) => {
      if ((a.key === REGION_UNSET) !== (b.key === REGION_UNSET)) return a.key === REGION_UNSET ? 1 : -1
      return b.count - a.count || a.key.localeCompare(b.key)
    })
}

/** filter 为空串 = 全部；REGION_UNSET = 只要地区未填的；其余按代码比对。 */
export function matchesRegionFilter(region: string | null | undefined, filter: string): boolean {
  return !filter || regionKey(region) === filter
}
