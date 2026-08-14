// NewsAdminView.tsx / MembersAdminView.tsx 共用的「最后保存于」时间戳格式化
// （规格 §6：接受 ISR 风险时必配的三条兜底之一——后台列表显示每行
// updated_at，编辑者才能区分「我保存了但页面没重建」和「我根本没保存成功」）。
//
// 用绝对时间而不是相对时间（"3 分钟前"）：相对时间需要读者心算与「现在」的
// 差值，且会随时间推移在不重渲染的情况下逐渐过期显示；这里的用途是让编辑者
// 核对"这次保存是不是刚刚那一次"，绝对时间戳更适合核对，不需要引入定时
// 重渲染。

/** updated_at（ISO 字符串）→ 按当前 locale 显示到分钟精度的绝对时间。 */
export function formatSavedAt(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
