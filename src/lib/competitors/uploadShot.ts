// src/lib/competitors/uploadShot.ts
// 截图上传流程（压缩 → 存对象 → 落库）。抽出来是因为有两个入口共用：
// 相册右上角的上传控件，和日期网格里空格子的 + 粘贴入口。
import { compressImage } from '@/components/competitors/compressImage'

/** 上传一张截图到某个竞品的某一天。成功返回 null，失败返回错误标识。 */
export async function uploadShot(
  competitorId: string,
  file: File,
  shotOn: string | null,
): Promise<'upload_failed' | null> {
  const compressed = await compressImage(file)
  const form = new FormData()
  form.append('file', compressed)

  const up = await fetch('/api/competitors/upload', { method: 'POST', body: form })
  const upJson = await up.json().catch(() => ({ error: 'parse' }))
  if (!up.ok || upJson.error) return 'upload_failed'

  const res = await fetch(`/api/competitors/${competitorId}/shots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: upJson.data.url, shot_on: shotOn || null }),
  })
  if (!res.ok) return 'upload_failed'
  return null
}

/**
 * 从粘贴事件里取第一张图片。取不到返回 null。
 * 剪贴板里同时有文本和图片时只认图片项。
 */
export function imageFromClipboard(items: DataTransferItemList | undefined | null): File | null {
  if (!items) return null
  for (const it of Array.from(items)) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile()
      if (file) return file
    }
  }
  return null
}
