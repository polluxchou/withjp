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

function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return key
}

function geminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
}

// 批量把中文名翻译成日/英。失败(网络/解析/数量不符)返回 null,调用方保持现状。
export async function translateNames(names: string[]): Promise<NameTranslation[] | null> {
  if (names.length === 0) return []
  const prompt = [
    '你是场地平面图标签的翻译器。把下列中文标签翻译成日文和英文。',
    '这些是简短的场地/设备/区域名称(如「直播设备架」「会议室」)。',
    '只输出一个 JSON 数组,长度与输入完全一致、顺序一一对应,每项形如 {"ja":"...","en":"..."}。',
    '不要输出数组以外的任何文字。',
    '输入(JSON 数组):',
    JSON.stringify(names),
  ].join('\n')

  const url = `${geminiBaseUrl()}/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey()}`
  let raw: string
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    raw = (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? ''
  } catch {
    return null
  }
  return parseTranslateResponse(raw, names.length)
}
