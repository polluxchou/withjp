// 禁用样式扫描：slate-* / indigo-* / zinc-* / gray-* / stone-* / neutral-* /
// 裸 hex / 固定透明度 token 带 /N / text-base。
//
// 基线机制：--update-baseline 记录存量违规（文件 × 计数），常规运行时任何
// 文件的违规数超过基线即失败；低于基线则提示可收紧（非致命）。基线中若有
// 文件已不存在（僵尸条目）则视为致命错误，提示重新生成基线。
//
// 防洗白：--update-baseline 默认拒绝任何文件计数比旧基线上升（可能是在借
// 机蒙混新增违规），需显式加 --allow-increase 才放行；正常收紧/改名不受
// 影响。
//
// 行级豁免：某一行确有必要保留禁用样式时，整行加注释含 `style-tokens-ignore`
// 即可跳过该行扫描。
//
// 白名单：图表主题与全局 token 定义处允许 hex。
//
// 正向校验：token 家族（ink/line/primary/...）下的色阶/变体必须真实登记于
// tailwind.config.ts，否则类名不会被生成、静默失效（教训：text-ink-600，
// design-system §7）。此类违规不走基线，一律致命。
import { readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts/style-tokens-baseline.json')
const IGNORE_MARKER = 'style-tokens-ignore'
const WHITELIST = ['src/lib/chart-theme.ts', 'src/app/globals.css']

const PATTERNS = [
  { name: 'slate', re: /\bslate-\d{2,3}\b/g },
  { name: 'indigo', re: /\bindigo-\d{2,3}\b/g },
  { name: 'zinc', re: /\bzinc-\d{2,3}\b/g },
  // 灰阶只许 ink/line/muted 语义 token；gray/stone/neutral 顺带堵上
  { name: 'off-scale-gray', re: /\b(?:gray|stone|neutral)-\d{2,3}\b/g },
  // 覆盖 3/4/6/8 位裸 hex（含 #rgba / #rrggbbaa 写法）
  { name: 'hex', re: /#[0-9a-fA-F]{3,8}\b/g },
  // 固定透明度 var() token 带 /N 或 /[任意值] 修饰符会静默失效（Task 1 审查结论）
  { name: 'alpha-on-fixed', re: /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:canvas|surface|line(?:-soft|-strong)?|muted-(?:soft|text|dot)|(?:primary|success|warning|danger|info)-(?:soft|soft-hover|text|dot|border|strong))\/(?:\d+|\[[^\]]+\])/g },
  // 16px 不在排版阶梯上（design-system §2）
  { name: 'text-base', re: /\btext-base\b/g },
]

// 从 tailwind.config.ts 解析已登记 token：colors 顶层键为家族名，嵌套键为
// 色阶/变体（DEFAULT = 裸家族名）；backgroundImage 键一并纳入（bg-primary-gradient）。
// 嵌套对象不含二层大括号，逐字符配平提取块即可。
function loadRegisteredTokens() {
  const cfg = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf8')
  const tokens = new Set()
  const families = new Set()
  for (const section of ['colors', 'backgroundImage']) {
    const head = cfg.indexOf(`${section}: {`)
    if (head < 0) continue
    const open = cfg.indexOf('{', head)
    let depth = 0
    let close = open
    for (let i = open; i < cfg.length; i++) {
      if (cfg[i] === '{') depth++
      else if (cfg[i] === '}' && --depth === 0) { close = i; break }
    }
    const body = cfg.slice(open + 1, close)
    const entryRe = /(['"]?)([A-Za-z0-9-]+)\1\s*:\s*(\{[^}]*\}|'[^']*')/g
    let m
    while ((m = entryRe.exec(body))) {
      const [, , key, value] = m
      if (section === 'colors') families.add(key)
      if (!value.startsWith('{')) {
        tokens.add(key)
        continue
      }
      // 单次左到右分词剥掉字符串值：'key': 保留、'value' 剥成 ''，
      // 避免 'soft-hover' 这类带引号的键造成引号配对错位、吃掉后续键
      const inner = value.replace(/('[^']*'\s*:)|'[^']*'/g, (m, key) => (key ? m : "''"))
      const subRe = /(['"]?)([A-Za-z0-9-]+)\1\s*:/g
      let s
      while ((s = subRe.exec(inner))) {
        tokens.add(s[2] === 'DEFAULT' ? key : `${key}-${s[2]}`)
      }
    }
  }
  return { tokens, families }
}

const { tokens: REGISTERED, families: FAMILIES } = loadRegisteredTokens()
const familyAlt = [...FAMILIES].sort((a, b) => b.length - a.length).join('|')
const USAGE_RE = new RegExp(
  String.raw`\b(?:bg|text|border|ring|divide|fill|stroke)-((?:${familyAlt})(?:-[a-z0-9]+)*)\b`,
  'g',
)

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      yield* walk(p)
    } else if (st.isFile() && /\.(tsx?|jsx?|css)$/.test(name)) {
      yield p
    }
  }
}

// 逐行扫描，既能实现行级豁免，也顺带拿到行号用于定位。
function findViolations(text) {
  const violations = []
  const lines = text.split('\n')
  lines.forEach((line, idx) => {
    if (line.includes(IGNORE_MARKER)) return
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line))) {
        violations.push({ name, line: idx + 1, sample: m[0] })
        if (m.index === re.lastIndex) re.lastIndex++
      }
    }
  })
  return violations
}

const args = process.argv.slice(2)
const isUpdate = args.includes('--update-baseline')
const allowIncrease = args.includes('--allow-increase')

// 家族命中但色阶/变体未登记的用法（如 text-ink-600）：类名不会被生成，静默失效。
function findUnregisteredTokens(text) {
  const hits = []
  text.split('\n').forEach((line, idx) => {
    if (line.includes(IGNORE_MARKER)) return
    USAGE_RE.lastIndex = 0
    let m
    while ((m = USAGE_RE.exec(line))) {
      if (!REGISTERED.has(m[1])) hits.push({ line: idx + 1, sample: m[0] })
    }
  })
  return hits
}

const seen = new Set()
const violationsByFile = {}
const unregisteredByFile = {}
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  seen.add(rel)
  if (WHITELIST.includes(rel)) continue
  const text = readFileSync(file, 'utf8')
  const violations = findViolations(text)
  if (violations.length) violationsByFile[rel] = violations
  const unregistered = findUnregisteredTokens(text)
  if (unregistered.length) unregisteredByFile[rel] = unregistered
}
const counts = Object.fromEntries(Object.entries(violationsByFile).map(([k, v]) => [k, v.length]))

// 未登记 token 不走基线（--update-baseline 也拦）：类名压根不会生成，属静默 bug 而非迁移欠账。
if (Object.keys(unregisteredByFile).length) {
  for (const [rel, hits] of Object.entries(unregisteredByFile)) {
    console.error(`\n✗ ${rel} (${hits.length} 处未登记 token)`)
    for (const h of hits) {
      console.error(`  ${rel}:${h.line}  [unregistered-token]  "${h.sample}"`)
    }
  }
  console.error('\ncheck-style-tokens 失败：以上 token 家族的色阶/变体未登记于 tailwind.config.ts，类名不会被生成、样式静默失效 —— 请改用已登记 token，或先在 tailwind.config.ts + docs/design-system.md 登记后再用')
  process.exit(1)
}

if (isUpdate) {
  let oldBaseline = {}
  if (existsSync(BASELINE)) {
    try { oldBaseline = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { oldBaseline = {} }
  }

  const increased = []
  for (const [file, n] of Object.entries(counts)) {
    const old = oldBaseline[file] ?? 0
    if (n > old) increased.push({ file, old, n })
  }

  if (increased.length && !allowIncrease) {
    console.error('check-style-tokens --update-baseline 被拒：以下文件违规数比旧基线上升，疑似借机洗白新增违规。')
    console.error('如确认是新增扫描模式一次性提升基线等正当场景，显式加 --allow-increase 重跑：')
    for (const { file, old, n } of increased) {
      console.error(`  ${file}: ${old} -> ${n} (+${n - old})`)
    }
    process.exit(1)
  }

  const sorted = {}
  for (const key of Object.keys(counts).sort()) sorted[key] = counts[key]
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`baseline updated: ${Object.keys(sorted).length} files, ${Object.values(sorted).reduce((a, b) => a + b, 0)} violations`)
  process.exit(0)
}

let baseline = {}
if (existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch (e) {
    console.error(`check-style-tokens 失败：基线文件读取/解析失败，可能已损坏或存在未解决的合并冲突 —— ${BASELINE}`)
    console.error(e.message)
    process.exit(1)
  }
} // 文件不存在 = 零容忍，baseline 保持 {}

const zombies = Object.keys(baseline).filter((rel) => !seen.has(rel))
const overBaseline = []
for (const [rel, violations] of Object.entries(violationsByFile)) {
  const allowed = baseline[rel] ?? 0
  if (violations.length > allowed) overBaseline.push({ rel, violations, allowed })
}
const belowBaseline = []
for (const [rel, allowed] of Object.entries(baseline)) {
  if (!seen.has(rel)) continue // 已作为僵尸条目报告
  const current = (violationsByFile[rel] ?? []).length
  if (current < allowed) belowBaseline.push({ rel, current, allowed })
}

for (const { rel, violations, allowed } of overBaseline) {
  console.error(`\n✗ ${rel} (${violations.length} 处，基线 ${allowed} 处)`)
  for (const v of violations) {
    console.error(`  ${rel}:${v.line}  [${v.name}]  "${v.sample}"`)
  }
}

if (zombies.length) {
  console.error('\n✗ 基线中存在僵尸条目（文件已不存在/已移动），请跑 `node scripts/check-style-tokens.mjs --update-baseline` 重新生成基线（若是改名/合并导致新文件名下违规数看似上升，裸命令会被防洗白守卫拒绝，需改跑 `--update-baseline --allow-increase`）：')
  for (const rel of zombies) console.error(`  - ${rel}`)
}

if (belowBaseline.length) {
  console.log(`\n提示：${belowBaseline.length} 个文件低于基线，可跑 --update-baseline 收紧：`)
  for (const { rel, current, allowed } of belowBaseline) {
    console.log(`  ${rel}: ${current} < ${allowed}`)
  }
}

if (overBaseline.length || zombies.length) {
  console.error('\ncheck-style-tokens 失败：新增了 slate/indigo/zinc/gray/stone/neutral/裸 hex 等禁用样式，或基线存在僵尸条目 —— 请改用 docs/design-system.md 的 token，或重新生成基线')
  process.exit(1)
}

console.log('check-style-tokens ok')
