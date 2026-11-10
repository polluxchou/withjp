import type { Instrumentation } from 'next'
import { buildRequestErrorRecord } from '@/lib/observability/request-error'
import { reportError } from '@/lib/observability/report'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./instrumentation-node')
    await registerNodeInstrumentation()
  }
}

// 服务端渲染、route handler、server action、proxy 里没被接住的错误都会走到这里。
// 只取路径/方法/路由/digest/错误名与消息（脱敏规则见 request-error.ts），
// 请求头整个不碰。出口是 reportError —— 接错误追踪服务时改那一处，不改这里。
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportError(buildRequestErrorRecord({ error, request, context }))
}
