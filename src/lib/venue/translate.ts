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

// 解析译名 JSON;数量须与请求一致,否则视为失败返回 null。
// 兼容裸数组,以及对象包裹(如 DeepSeek json_object 模式的 {"result":[...]})。
export function parseTranslateResponse(raw: string, expectedCount: number): NameTranslation[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const arr: unknown = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed as Record<string, unknown>).find(Array.isArray)
      : undefined
  if (!Array.isArray(arr) || arr.length !== expectedCount) return null
  const out: NameTranslation[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') return null
    const ja = (item as Record<string, unknown>).ja
    const en = (item as Record<string, unknown>).en
    if (typeof ja !== 'string' || typeof en !== 'string') return null
    out.push({ ja, en })
  }
  return out
}

function deepseekApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY is not configured')
  return key
}

function deepseekBaseUrl(): string {
  return (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
}

// 批量把中文名翻译成日/英(DeepSeek,OpenAI 兼容 chat/completions + json_object)。
// 失败(网络/解析/数量不符)返回 null,调用方保持现状。
export async function translateNames(names: string[]): Promise<NameTranslation[] | null> {
  if (names.length === 0) return []
  const prompt = [
    '你是场地平面图标签的翻译器。把下列中文标签翻译成日文和英文。',
    '这些是简短的场地/设备/区域名称(如「直播设备架」「会议室」)。',
    '只输出一个 JSON 对象,形如 {"result":[{"ja":"...","en":"..."}, ...]}。',
    'result 数组的长度与顺序必须与输入完全一致、一一对应。',
    '不要输出 JSON 以外的任何文字。',
    '输入(JSON 数组):',
    JSON.stringify(names),
  ].join('\n')

  let raw: string
  try {
    const res = await fetch(`${deepseekBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey()}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    raw = (data.choices?.[0]?.message?.content as string) ?? ''
  } catch {
    return null
  }
  return parseTranslateResponse(raw, names.length)
}
