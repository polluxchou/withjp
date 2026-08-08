// scripts/check-style-tokens.mjs
// 禁用样式扫描：slate-* / indigo-* / zinc-* / 裸 hex。
// 基线机制：--update-baseline 记录存量违规（文件 × 计数），常规运行时
// 任何文件的违规数超过基线即失败；低于基线则提示可收紧。
// 白名单：图表主题与 token 定义处允许 hex。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts/style-tokens-baseline.json')
const WHITELIST = ['src/lib/chart-theme.ts', 'src/app/globals.css']
const PATTERNS = [
  { name: 'slate', re: /\bslate-\d{2,3}\b/g },
  { name: 'indigo', re: /\bindigo-\d{2,3}\b/g },
  { name: 'zinc', re: /\bzinc-\d{2,3}\b/g },
  { name: 'hex', re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g },
  // 固定透明度 var() token 带 /N 修饰符会静默失效（Task 1 审查结论）
  { name: 'alpha-on-fixed', re: /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:canvas|surface|line(?:-soft|-strong)?|muted-(?:soft|text|dot)|(?:primary|success|warning|danger|info)-(?:soft|soft-hover|text|dot|border))\/\d+/g },
  // 16px 不在排版阶梯上（design-system §2）
  { name: 'text-base', re: /\btext-base\b/g },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx?|css)$/.test(name)) yield p
  }
}

const counts = {}
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (WHITELIST.includes(rel)) continue
  const text = readFileSync(file, 'utf8')
  let n = 0
  for (const { re } of PATTERNS) n += (text.match(re) ?? []).length
  if (n > 0) counts[rel] = n
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n')
  console.log(`baseline updated: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} violations`)
  process.exit(0)
}

let baseline = {}
try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { /* 无基线 = 零容忍 */ }

const errors = []
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0
  if (n > allowed) errors.push(`${file}: ${n} 处禁用样式（基线 ${allowed}）`)
}
if (errors.length) {
  console.error('check-style-tokens 失败：新增了 slate/indigo/zinc/裸 hex 等禁用样式 —— 请改用 docs/design-system.md 的 token\n' + errors.join('\n'))
  process.exit(1)
}
console.log('check-style-tokens ok')
