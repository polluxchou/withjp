import { NextRequest, NextResponse } from 'next/server'
import { validateApplication, isBotSubmission } from '@/lib/site/application'
import { submitApplication, httpStatusForApplicationError } from '@/lib/site/application-service'

/**
 * 公开的应募投递接口 —— 全站唯一一个不过 authGuard 的写接口。
 *
 * 防护分三层：
 *   1. honeypot + 最短填写时长（./application.ts，纯函数）
 *   2. 字段校验（同上）
 *   3. 每 IP 每小时上限（application-service.ts，查 ip_hash）
 *
 * 落库走 service role，表上没有给 anon 的 insert 策略，所以绕过本接口写不进来。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ data: null, error: 'invalid_json' }, { status: 400 })
  }

  // 机器人：返回和成功一样的响应但不落库。告诉爬虫「你被识别了」只会让它换招。
  if (isBotSubmission({ hp: body.hp, elapsedMs: body.elapsedMs })) {
    return NextResponse.json({ data: { id: null }, error: null }, { status: 201 })
  }

  const validation = validateApplication(body)
  if (!validation.ok) {
    return NextResponse.json(
      { data: null, error: 'validation', fields: validation.fields },
      { status: 400 },
    )
  }

  const result = await submitApplication(validation.value, {
    // 部署在反代之后，客户端 IP 只能从转发头拿；两个头都没有就不限流（宁可
    // 放过也不误伤）。
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip'),
    userAgent: req.headers.get('user-agent'),
  })

  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error },
      { status: httpStatusForApplicationError(result.error) },
    )
  }

  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
