export interface NameTranslation { ja: string; en: string }
export type NameTranslations = Record<string, NameTranslation>

export interface TranslatableRow {
  id: string
  name: string
  name_ja: string
  name_en: string
  name_i18n_source: string
}

// 待翻译 = 名称非空且与上次翻译所依据的源名称不一致(新建或改名)。
export function pendingTranslations(rows: TranslatableRow[]): TranslatableRow[] {
  return rows.filter((r) => r.name !== '' && r.name !== r.name_i18n_source)
}

// 解析 Gemini 返回的 JSON 数组;数量须与请求一致,否则视为失败返回 null。
export function parseTranslateResponse(raw: string, expectedCount: number): NameTranslation[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null
  const out: NameTranslation[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null
    const ja = (item as Record<string, unknown>).ja
    const en = (item as Record<string, unknown>).en
    if (typeof ja !== 'string' || typeof en !== 'string') return null
    out.push({ ja, en })
  }
  return out
}
