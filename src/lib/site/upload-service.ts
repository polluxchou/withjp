// /api/site/upload 的业务逻辑（评审 Important：补测试矩阵）。
//
// 同 news-service.ts / members-service.ts 的理由：本文件被
// src/app/api/site/site-content-api.integration.test.ts 用
// `node --test --experimental-strip-types` 直接跑，刻意不 import
// 'next/server'——鉴权/结果都用平铺对象表达（AuthResult / HandlerResult），
// route.ts（只被 Next 加载）负责在边界处转换成真正的 NextResponse，并绑定
// 真实的 authGuard/getActorProfile/validateImage/uploadImage。
//
// authGuard + canEditSiteContent 是「已登录非管理员」与一个公开桶
// （site-media）之间唯一的东西——upload/route.ts 的代码本身写得对，但此前
// 没有任何测试会在它被删掉/改错时变红。news/members 的 401/403/2xx 矩阵是
// 完整的，upload 一格都没有，这里照同一套 handler factory + fake 依赖模式补上。
import { canEditSiteContent, type SiteContentActor } from '../auth/site-content.ts'
import type { AuthResult, HandlerResult } from './site-content-shared.ts'

export type { AuthResult, HandlerResult }

export const UPLOAD_BUCKET = 'site-media'

// validateImage/uploadImage 的最小契约：与 src/lib/storage/upload-image.ts
// 的真实签名结构兼容（同 NewsDb/MemberDb 收窄类型不收窄行为的理由），测试
// 文件里的 fake 实现直接满足这个接口，不需要强制类型转换。
export interface UploadRouteDeps {
  authGuard: () => Promise<AuthResult>
  getActorProfile: (userId: string) => Promise<SiteContentActor | null>
  validateImage: (file: { type: string; size: number }) => { ok: true } | { ok: false; error: 'type' | 'size' }
  uploadImage: (
    bucket: string,
    file: File,
  ) => Promise<{ url: string; error: null } | { url: null; error: 'upload_failed' }>
}

// 错误码是稳定的 snake_case（news/members 的 API 契约同款——评审 I5：这个
// route 之前返回的是人话散文，且中英混杂，ImageUploadField.tsx 原样透传
// 渲染，是全分支唯一一处未经 i18n 的用户可见错误）。前端映射见
// src/components/ui/ImageUploadField.tsx。
export function createUploadHandler(deps: UploadRouteDeps) {
  return async function handleUpload(req: Request): Promise<HandlerResult> {
    const auth = await deps.authGuard()
    if (!auth.ok) return { status: auth.status, body: { data: null, error: 'unauthorized' } }

    const actor = await deps.getActorProfile(auth.user.id)
    if (!canEditSiteContent(actor)) {
      return { status: 403, body: { data: null, error: 'forbidden' } }
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return { status: 400, body: { data: null, error: 'invalid_form_data' } }
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return { status: 400, body: { data: null, error: 'file_required' } }
    }

    const validated = deps.validateImage(file)
    if (!validated.ok) {
      const errorCode = validated.error === 'type' ? 'invalid_type' : 'file_too_large'
      return { status: 400, body: { data: null, error: errorCode } }
    }

    const { url, error } = await deps.uploadImage(UPLOAD_BUCKET, file)
    if (error) {
      return { status: 500, body: { data: null, error } }
    }

    return { status: 201, body: { data: { url }, error: null } }
  }
}
