// 禁用样式扫描：slate-* / indigo-* / zinc-* / gray-* / stone-* / neutral-* /
// 裸 hex / 固定透明度 token 带 /N / text-base。
//
// 零容忍：白名单外任何一处违规即失败。（历史：PR1-PR3 期间靠
// scripts/style-tokens-baseline.json 记录存量、只减不增；PR4 存量清零后基线
// 与 --update-baseline/--allow-increase 一并退役，见 docs/design-system.md §7。）
//
// 行级豁免：某一行确有必要保留禁用样式时，整行加注释含 `style-tokens-ignore`
// 即可跳过该行扫描（正向校验同样跳过）。
//
// 文件白名单（见下方 WHITELIST，逐行注明理由）：只豁免上述禁用样式扫描，
// 正向校验仍然生效。
//
// 正向校验：token 家族（ink/line/primary/...）下的色阶/变体必须真实登记于
// tailwind.config.ts，否则类名不会被生成、静默失效（教训：text-ink-600，
// design-system §7）。全库一律致命，白名单文件也不例外。
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const IGNORE_MARKER = 'style-tokens-ignore'
// 仅豁免「禁用样式」扫描的文件。新增条目必须在此写明理由，并在
// docs/design-system.md §7 同步登记。
const WHITELIST = [
  'src/lib/chart-theme.ts', // 图表色板唯一定义处，hex 就是它的产物（design-system §1.5）
  'src/app/globals.css', // token CSS 变量定义处，hex 是 token 本身的取值
  'src/venue/VenueCanvas.tsx', // 场馆 2D 平面图：纸面/网格/家具类型色属工程制图语义，非 UI chrome（spec §6「不动的」）
  'src/venue/Venue3DCanvas.client.tsx', // 场馆 3D 视图：three.js 材质/场景色同上，且需与 2D 同色系对齐（spec §6）
  'src/app/[locale]/login/page.tsx', // 登录页是独立营销位，不属后台设计系统辖区（spec §6「不动的」）
]

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

const violationsByFile = {}
const unregisteredByFile = {}
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  const text = readFileSync(file, 'utf8')
  // 白名单只豁免禁用样式扫描，正向校验照跑
  if (!WHITELIST.includes(rel)) {
    const violations = findViolations(text)
    if (violations.length) violationsByFile[rel] = violations
  }
  const unregistered = findUnregisteredTokens(text)
  if (unregistered.length) unregisteredByFile[rel] = unregistered
}

// 未登记 token 单独先报：类名压根不会生成，属静默 bug 而非样式选色问题。
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

for (const [rel, violations] of Object.entries(violationsByFile)) {
  console.error(`\n✗ ${rel} (${violations.length} 处)`)
  for (const v of violations) {
    console.error(`  ${rel}:${v.line}  [${v.name}]  "${v.sample}"`)
  }
}

if (Object.keys(violationsByFile).length) {
  console.error('\ncheck-style-tokens 失败：出现 slate/indigo/zinc/gray/stone/neutral/裸 hex 等禁用样式 —— 请改用 docs/design-system.md 的 token；确有必要的单行可加 `style-tokens-ignore` 注释豁免，整文件豁免需改本脚本 WHITELIST 并在 design-system §7 登记')
  process.exit(1)
}

console.log('check-style-tokens ok')
