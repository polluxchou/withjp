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

/**
 * 错误响应里的 fields 是稳定字段码（required/too_long/invalid_slug/...），
 * 不是自然语言——这里只是把它们平铺展示出来方便定位是哪个字段出的问题，
 * 不是最终用户文案。
 */
export function formatFieldErrors(fields: Record<string, string> | undefined): string | null {
  if (!fields) return null
  const entries = Object.entries(fields)
  if (entries.length === 0) return null
  return entries.map(([k, v]) => `${k}: ${v}`).join('；')
}
