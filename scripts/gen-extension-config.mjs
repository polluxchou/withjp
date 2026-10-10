// 生成 extensions/live-shot/config.local.js（已 gitignore，不进仓库）。
// 只读两个公开值：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（本来就打包在网页前端里）。
// 运行：node --env-file=<主仓>/.env.local scripts/gen-extension-config.mjs [--api-base http://localhost:3100]
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY：用 --env-file 指向 .env.local 运行')
  process.exit(1)
}
const i = process.argv.indexOf('--api-base')
let apiBase = 'https://mcn.agenova.chat'
if (i > 0) {
  // 写了 --api-base 却没给值（或值不对）时报错退出，不要悄悄回落到线上地址
  const v = process.argv[i + 1]
  if (!v || !/^https?:\/\//.test(v)) {
    console.error('--api-base 需要一个以 http:// 或 https:// 开头的地址，例如 --api-base http://localhost:3100')
    process.exit(1)
  }
  apiBase = v
  if (/^https?:\/\/127\.0\.0\.1([:/]|$)/.test(v)) {
    console.warn('提示：扩展的 host_permissions 只覆盖 http://localhost/*，用 127.0.0.1 会被浏览器拦截，请改用 localhost')
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions', 'live-shot', 'config.local.js')
writeFileSync(
  out,
  [
    '// 自动生成，勿提交（已 gitignore）。重新生成见 extensions/live-shot/README.md',
    `export const API_BASE = ${JSON.stringify(apiBase)}`,
    `export const SUPABASE_URL = ${JSON.stringify(url)}`,
    `export const SUPABASE_ANON_KEY = ${JSON.stringify(key)}`,
    '',
  ].join('\n'),
)
console.log(`✓ ${out}（API_BASE=${apiBase}）`)
