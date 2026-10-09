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
