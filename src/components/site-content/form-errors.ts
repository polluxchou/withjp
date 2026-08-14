// NewsForm.tsx / MemberEditForm.tsx（表单提交失败展示）与 NewsAdminView.tsx
// （toggle/delete 失败展示）共用的错误码 → 文案映射（评审 Important：抽共享
// 模块）。四处调用的是同一组 PATCH/DELETE/POST 接口，错误码形状完全一致。
//
// 已知错误码是各自 messages/*.json 的 `<namespace>.errors.*` 键——调用方必须
// 保证传入的 t 是绑定了正确 namespace（siteNews 或 siteMembers）的
// useTranslations() 实例，本文件不关心具体是哪一个。

/** 两个命名空间（siteNews / siteMembers）共有的错误码。 */
export const SITE_CONTENT_KNOWN_ERROR_CODES = [
  'forbidden', 'forbidden_field', 'validation', 'invalid_json', 'not_found', 'db_error',
] as const

/**
 * 已知错误码 → 三语文案；未知错误码统一落到 `errors.unknown`，不把服务端
 * 原始错误码（或更糟，服务端散文）直接展示给用户。
 *
 * extraKnownCodes：命名空间私有的错误码（如 siteMembers 的 invalid_no），
 * 调用方按需追加，不强行让两个命名空间共用同一份码表。
 */
export function siteContentErrorMessage(
  t: (key: string) => string,
  code: string,
  extraKnownCodes: readonly string[] = [],
): string {
  const known: readonly string[] = extraKnownCodes.length > 0
    ? [...SITE_CONTENT_KNOWN_ERROR_CODES, ...extraKnownCodes]
    : SITE_CONTENT_KNOWN_ERROR_CODES
  return known.includes(code) ? t(`errors.${code}`) : t('errors.unknown')
}

// ── 字段级错误码 → 三语文案（deferred #4 重新定性：NewsForm 字段错误的问题
// 不是「打磨欠佳」，是渲染的是未翻译的原始错误码，如 `title_ja: too_long`；
// 和 I5 一起收）─────────────────────────────────────────────────────────
//
// news 与 members 的字段级错误码有交集（too_long/invalid_date/
// invalid_image_url/invalid/empty_patch）也有各自独有的（news 的
// invalid_slug/duplicate，members 的 required_when_revealed/
// required_when_unrevealed），三语文案分别登记在
// messages/*.json 的 siteNews.fieldErrors / siteMembers.fieldErrors 下，
// 调用方传入各自命名空间下 `fieldErrors` 的 useTranslations() 实例。
export const NEWS_FIELD_ERROR_CODES = [
  'required', 'too_long', 'invalid_slug', 'invalid_date', 'invalid_image_url', 'duplicate', 'invalid', 'empty_patch',
] as const

export const MEMBER_FIELD_ERROR_CODES = [
  'too_long', 'invalid_date', 'invalid_image_url', 'invalid',
  'required_when_revealed', 'required_when_unrevealed', 'empty_patch',
] as const

/** 未登记的字段错误码统一落到 `invalid`，不把服务端原始码直接展示给用户。 */
export function fieldErrorMessage(
  tFieldErrors: (key: string) => string,
  code: string,
  knownCodes: readonly string[],
): string {
  return knownCodes.includes(code) ? tFieldErrors(code) : tFieldErrors('invalid')
}

/**
 * 错误响应里的 fields 是 `{ 字段名: 错误码 }`——字段名（如 title_ja）是技术
 * 标识符，照原样展示；错误码必须经 fieldErrorMessage() 翻译，不能像之前
 * 那样直接拼接原始码（如 `title_ja: too_long`）。
 */
export function formatFieldErrors(
  tFieldErrors: (key: string) => string,
  knownCodes: readonly string[],
  fields: Record<string, string> | undefined,
): string | null {
  if (!fields) return null
  const entries = Object.entries(fields)
  if (entries.length === 0) return null
  return entries.map(([k, v]) => `${k}: ${fieldErrorMessage(tFieldErrors, v, knownCodes)}`).join('；')
}
