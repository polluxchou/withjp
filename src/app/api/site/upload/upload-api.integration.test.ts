import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createUploadHandler,
  type AuthResult,
  type UploadRouteDeps,
} from '../../../../lib/site/upload-service.ts'
import type { SiteContentActor } from '../../../../lib/auth/site-content.ts'

// ============================================================
// 覆盖范围（评审 Important：/api/site/upload 补测试矩阵）：
//
// authGuard + canEditSiteContent 是「已登录非管理员」与一个公开桶
// （site-media）之间唯一的东西——upload/route.ts 的代码本身写得对，但此前
// 没有任何测试会在它被删掉/改错时变红。news/members 的 401/403/2xx 矩阵是
// 完整的，upload 一格都没有，这里照
// site-content-api.integration.test.ts 的 handler factory + fake 依赖
// 模式补上：
//   1. 未登录返回 401
//   2. 非管理员返回 403，不会调用 uploadImage
//   3. 管理员上传成功返回 201 + 公开 url
//   4. file 字段缺失 / 类型不支持 / 超出体积上限返回 400 稳定错误码
//   5. uploadImage 底层失败返回 500 upload_failed
// ============================================================

function fakeAuthGuard(userId: string | null): () => Promise<AuthResult> {
  return async () => (userId ? { ok: true, user: { id: userId } } : { ok: false, status: 401 })
}

function fakeActorProfiles(actors: Record<string, SiteContentActor>) {
  return async (id: string): Promise<SiteContentActor | null> => actors[id] ?? null
}

const ADMIN_ID = 'admin-actor'
const NON_ADMIN_ID = 'ops-actor'

const ACTORS: Record<string, SiteContentActor> = {
  [ADMIN_ID]: { id: ADMIN_ID, is_admin: true, role: 'bd' },
  [NON_ADMIN_ID]: { id: NON_ADMIN_ID, is_admin: false, role: 'ops' },
}

function uploadRequest(file?: File): Request {
  const form = new FormData()
  if (file) form.set('file', file)
  return new Request('http://localhost/api/site/upload', { method: 'POST', body: form })
}

function pngFile(sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], 'test.png', { type: 'image/png' })
}

interface UploadCall { bucket: string; file: File }

function makeDeps(opts: {
  userId: string | null
  actors?: Record<string, SiteContentActor>
  validateImage?: UploadRouteDeps['validateImage']
  uploadImageResult?: { url: string; error: null } | { url: null; error: 'upload_failed' }
}): { deps: UploadRouteDeps; calls: UploadCall[] } {
  const calls: UploadCall[] = []
  const deps: UploadRouteDeps = {
    authGuard: fakeAuthGuard(opts.userId),
    getActorProfile: fakeActorProfiles(opts.actors ?? {}),
    validateImage: opts.validateImage ?? (() => ({ ok: true })),
    uploadImage: async (bucket, file) => {
      calls.push({ bucket, file })
      return opts.uploadImageResult ?? { url: 'https://example.supabase.co/storage/v1/object/public/site-media/x.png', error: null }
    },
  }
  return { deps, calls }
}

// ── 1. 未登录 ──────────────────────────────────────────────────────────

test('未登录 POST /api/site/upload 返回 401', async () => {
  const { deps, calls } = makeDeps({ userId: null })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 401)
  assert.equal(calls.length, 0)
})

// ── 2. 非管理员：403，且不会调用底层上传 ──────────────────────────────────

test('非管理员 POST /api/site/upload 返回 403，不调用 uploadImage', async () => {
  const { deps, calls } = makeDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 403)
  const body = result.body as { error: string }
  assert.equal(body.error, 'forbidden')
  assert.equal(calls.length, 0)
})

// ── 3. 管理员上传成功 ─────────────────────────────────────────────────────

test('管理员上传合法图片返回 201 + 公开 url，落在 site-media 桶', async () => {
  const { deps, calls } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 201)
  const body = result.body as { data: { url: string } }
  assert.equal(body.data.url, 'https://example.supabase.co/storage/v1/object/public/site-media/x.png')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].bucket, 'site-media')
})

// ── 4. 400 校验分支 ────────────────────────────────────────────────────────

test('缺少 file 字段返回 400 file_required', async () => {
  const { deps, calls } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const result = await createUploadHandler(deps)(uploadRequest())
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'file_required')
  assert.equal(calls.length, 0)
})

test('图片类型不受支持返回 400 invalid_type', async () => {
  const { deps, calls } = makeDeps({
    userId: ADMIN_ID,
    actors: ACTORS,
    validateImage: () => ({ ok: false, error: 'type' }),
  })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'invalid_type')
  assert.equal(calls.length, 0)
})

test('图片超出体积上限返回 400 file_too_large', async () => {
  const { deps, calls } = makeDeps({
    userId: ADMIN_ID,
    actors: ACTORS,
    validateImage: () => ({ ok: false, error: 'size' }),
  })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'file_too_large')
  assert.equal(calls.length, 0)
})

// ── 5. 底层上传失败 ────────────────────────────────────────────────────────

test('uploadImage 底层失败返回 500 upload_failed', async () => {
  const { deps } = makeDeps({
    userId: ADMIN_ID,
    actors: ACTORS,
    uploadImageResult: { url: null, error: 'upload_failed' },
  })
  const result = await createUploadHandler(deps)(uploadRequest(pngFile()))
  assert.equal(result.status, 500)
  const body = result.body as { error: string }
  assert.equal(body.error, 'upload_failed')
})
