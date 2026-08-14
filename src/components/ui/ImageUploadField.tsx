'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImageOff, Upload } from 'lucide-react'
import { Field } from './Field'

export interface ImageUploadFieldProps {
  value: string | null
  onChange: (url: string) => void
  label: string
  hint?: string
  error?: string
}

const UPLOAD_ENDPOINT = '/api/site/upload'

// /api/site/upload 返回的稳定错误码（评审 I5：之前这里原样透传服务端散文,
// 是全分支唯一一处未经 i18n 的用户可见错误）。未登记的码统一落到 'unknown'。
const KNOWN_UPLOAD_ERROR_CODES = [
  'forbidden', 'invalid_form_data', 'file_required', 'invalid_type', 'file_too_large', 'upload_failed',
]

/**
 * 官网内容表单的图片上传字段（Task 9 新建，登记见 docs/design-system.md
 * §6.2）。直接打 /api/site/upload（T6 已建好，已经用 canEditSiteContent
 * 校验写权限），不重造上传逻辑；这里只管选文件、显示预览/上传态、把拿到的
 * 公开 URL 通过 onChange 交回给调用方的表单状态。
 *
 * onChange 传空字符串表示「清空图片」——调用方在提交时把空字符串当 null
 * 处理，与其他可选文本字段（trim 后为空转 null）走同一套约定。
 */
export default function ImageUploadField({ value, onChange, label, hint, error }: ImageUploadFieldProps) {
  const tCommon = useTranslations('common')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function uploadErrorMessage(code: string): string {
    return KNOWN_UPLOAD_ERROR_CODES.includes(code) ? tCommon(`uploadErrors.${code}`) : tCommon('uploadErrors.unknown')
  }

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form })
      const json = (await res.json()) as { data?: { url?: string }; error?: string }
      if (!res.ok || !json.data?.url) {
        setUploadError(uploadErrorMessage(typeof json.error === 'string' ? json.error : 'upload_failed'))
        return
      }
      onChange(json.data.url)
    } catch {
      setUploadError(uploadErrorMessage('upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field label={label} hint={hint} error={uploadError ?? error}>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-16 h-16 rounded-field object-cover border border-line flex-none" />
        ) : (
          <div
            aria-hidden
            className="w-16 h-16 rounded-field border border-dashed border-line-strong flex items-center justify-center text-ink-400 flex-none"
          >
            <ImageOff className="w-[15px] h-[15px]" strokeWidth={1.5} />
          </div>
        )}
        <div className="flex flex-col items-start gap-1.5">
          <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-field border border-line-strong text-xs font-medium text-ink-700 hover:bg-line-soft transition-colors cursor-pointer">
            <Upload className="w-[13px] h-[13px]" strokeWidth={1.5} />
            {uploading ? tCommon('loading') : tCommon('uploadImage')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="text-xs text-danger-text hover:underline"
              onClick={() => onChange('')}
            >
              {tCommon('delete')}
            </button>
          )}
        </div>
      </div>
    </Field>
  )
}
