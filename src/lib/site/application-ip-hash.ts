import { createHash } from 'node:crypto'

/**
 * IP 的限流指纹。存哈希而不是原始 IP：我们要的是「同一来源一小时内提交了
 * 几次」，不需要知道来源是谁，也不该把访客地址留在库里。
 *
 * 单独成一个文件，不留在 application.ts 里：application.ts 的
 * validateApplication/isBotSubmission/常量与类型同时被 StaffApplicationForm.tsx
 * /ApplicationForm.tsx 等客户端组件 import，`node:crypto` 混在同一个模块里
 * 会被 webpack 一起打进客户端 bundle——Next 默认的客户端 webpack 配置不处理
 * `node:` scheme（next.config.mjs 只 stub 了 net/tls/fs），会直接让
 * `next build` 失败（UnhandledSchemeError: Reading from "node:crypto" is not
 * handled by plugins）。这个函数本身只在服务端被调用
 * （application-service.ts），拆到独立文件后客户端 bundle 不再需要解析
 * node:crypto。
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}
