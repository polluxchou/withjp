import { randomUUID } from 'node:crypto'
import { createServerClient } from '../supabase/server.ts'

export const MAX_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function validateImage(file: { type: string; size: number }) {
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false as const, error: 'type' as const }
  if (file.size > MAX_BYTES) return { ok: false as const, error: 'size' as const }
  return { ok: true as const }
}

/**
 * 扩展名只从白名单里取。原实现是 `file.name.split('.').pop()` —— 用户可以塞进
 * 斜杠，在桶里造出子目录结构。白名单之外一律回退 png。
 */
export function safeExtension(filename: string): string {
  const raw = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  return ALLOWED_EXT.has(raw) ? raw : 'png'
}

/**
 * 落桶并返回公开 URL。失败只回传稳定错误码 `'upload_failed'` —— 不透传
 * `error.message`，避免把 Supabase 内部报错（路径、桶配置等）泄露给客户端。
 */
export async function uploadImage(
  bucket: string,
  file: File,
): Promise<{ url: string; error: null } | { url: null; error: 'upload_failed' }> {
  const path = `${randomUUID()}.${safeExtension(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const db = createServerClient()
  const { error } = await db.storage.from(bucket).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    return { url: null, error: 'upload_failed' }
  }

  const { data } = db.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}
