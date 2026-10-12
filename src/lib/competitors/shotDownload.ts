// src/lib/competitors/shotDownload.ts
// 下载文件名的派生规则。纯函数，和浏览器 API 无关，方便钉测试。
//
// 名字里带账号和日期，是因为下载下来的截图会离开系统进到聊天窗口、周报、
// 素材盘里 —— 到那时文件名是它唯一剩下的上下文。`screenshot (3).webp`
// 那种名字在别处等于没有信息。

/** 当天没标日期时的占位段。不留空是为了不产出 `handle__1.webp` 那种双下划线。 */
const UNDATED = 'undated'
/** 账号名取不出任何合法字符时的兜底，避免名字以下划线开头。 */
const FALLBACK = 'shot'
/** 扩展名兜底。空扩展名会拼出 `名字.`，系统识别不了。 */
const FALLBACK_EXT = 'jpg'
/** 合理的图片扩展名长度上限；超过就当它不是扩展名（多半是路径段里的点）。 */
const MAX_EXT = 5

/**
 * 文件名里保留 ASCII 字母数字、点、连字符，其余一律折成下划线。
 *
 * handle 是对方平台上的用户名，取值不由我们控制：`/` 会被当成路径分隔符，
 * `:` 在 Windows 上非法，两者都会让下载直接失败。
 */
function safeSlug(raw: string): string {
  const s = raw
    .trim()
    .replace(/[^A-Za-z0-9.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
  return s || FALLBACK
}

/** 从 URL 取扩展名。带 query / hash 的存储 URL 也要能取对。 */
export function shotExtension(url: string): string {
  // 只看最后一个路径段：`https://x.co/a.b/c` 里的点在目录名上，不是扩展名
  const path = url.split(/[?#]/, 1)[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  if (dot <= 0) return FALLBACK_EXT
  const ext = last.slice(dot + 1).toLowerCase()
  if (!ext || ext.length > MAX_EXT || !/^[a-z0-9]+$/.test(ext)) return FALLBACK_EXT
  return ext
}

/**
 * 单张截图的下载名：`<账号>_<日期>[_<第几张>].<扩展名>`。
 *
 * 当天只有一张时不加序号 —— `_1` 在只有一张的情况下只是噪音。
 */
export function shotFileName(
  handle: string,
  shot: { image_url: string; shot_on: string | null },
  index: number,
  total: number,
): string {
  const parts = [safeSlug(handle), shot.shot_on || UNDATED]
  if (total > 1) parts.push(String(index + 1))
  return `${parts.join('_')}.${shotExtension(shot.image_url)}`
}

/** 当天打包的压缩包名：`<账号>_<日期>.zip`。 */
export function dayZipName(handle: string, dateKey: string | null): string {
  return `${safeSlug(handle)}_${dateKey || UNDATED}.zip`
}
