// src/components/competitors/compressImage.ts
// 客户端压缩：把上传的截图缩到长边 <= maxEdge 并转 WebP，降低 Supabase 存储/流量。
// 仅在浏览器运行（用到 createImageBitmap / canvas）。失败或收益为负时回退原文件。

export async function compressImage(file: File, maxEdge = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file // 保留动图，不压

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); return file }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!blob || blob.size >= file.size) return file // 没压小就用原图

  const base = file.name.replace(/\.\w+$/, '') || 'shot'
  return new File([blob], `${base}.webp`, { type: 'image/webp' })
}
