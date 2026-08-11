// i18n gate. Two independent checks:
//
//   1. Key parity across messages/{zh,en,ja}.json.
//   2. Source-reference integrity: every t('key') in src/ resolves to a real
//      message, and every message is referenced from somewhere.
//
// Why check (2) exists:
//   next-intl does not fail loudly on a missing key. It logs a MISSING_MESSAGE
//   console.error and renders the literal path ("competitors.viewAll") into the
//   UI. Nothing in the toolchain catches that today — parity only compares the
//   three JSON files against each other, and `tsc --noEmit` is blind because
//   the repo has no `IntlMessages` type augmentation. A real regression slipped
//   through exactly this way: competitors.viewAll / competitors.collapse were
//   deleted while ShotAlbum.tsx still called t('viewAll') / t('collapse'), and
//   both `npm run test:i18n` and `tsc` stayed green.
//
// Why a custom script instead of ESLint?
//   Same reason as check-no-bare-han.mjs: @typescript-eslint/parser can hang on
//   .tsx in sandboxed environments. The TypeScript compiler API is already a
//   devDep and parses cleanly everywhere.
//
// Ratchet: existing debt lives in scripts/i18n-baseline.json (see
// check-style-tokens.mjs for the same mechanism).
//   * missing references — fatal above the per-file baseline count.
//   * unused messages    — warning only, baseline keeps known ones quiet.
//   Regenerate with `node scripts/check-i18n.mjs --update-baseline`; raising a
//   file's missing-count needs an explicit --allow-increase.

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const BASELINE = path.join(ROOT, 'scripts/i18n-baseline.json')
const locales = ['zh', 'en', 'ja']

const args = process.argv.slice(2)
const isUpdate = args.includes('--update-baseline')
const allowIncrease = args.includes('--allow-increase')

function readMessages(locale) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
}

// Splits a message tree into leaves (actual strings, what t() must resolve to)
// and containers (objects / arrays, what t.raw() may legitimately point at).
function collectKeys(value, prefix = '', acc = { leaves: [], containers: [] }) {
  // Arrays of strings (e.g. month-name lists) are valid leaf values. We record
  // one key per index so parity across locales still requires the same length
  // and shape, plus the array itself as a container for t.raw('months').
  if (Array.isArray(value)) {
    if (prefix) acc.containers.push(prefix)
    value.forEach((child, index) => collectKeys(child, `${prefix}[${index}]`, acc))
    return acc
  }

  if (value && typeof value === 'object') {
    if (prefix) acc.containers.push(prefix)
    for (const [key, child] of Object.entries(value)) {
      collectKeys(child, prefix ? `${prefix}.${key}` : key, acc)
    }
    return acc
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid message value at ${prefix}`)
  }

  acc.leaves.push(prefix)
  return acc
}

// ---------------------------------------------------------------------------
// Check 1 — key parity
// ---------------------------------------------------------------------------

const [baseLocale, ...otherLocales] = locales
const base = collectKeys(readMessages(baseLocale))
const baseKeys = new Set(base.leaves)

let parityFailed = false

for (const locale of otherLocales) {
  const keys = new Set(collectKeys(readMessages(locale)).leaves)

  for (const key of baseKeys) {
    if (!keys.has(key)) {
      console.error(`${locale} is missing key: ${key}`)
      parityFailed = true
    }
  }

  for (const key of keys) {
    if (!baseKeys.has(key)) {
      console.error(`${locale} has extra key: ${key}`)
      parityFailed = true
    }
  }
}

// Parity failures make the reference check meaningless (we would report against
// a half-broken key set), so bail out before it.
if (parityFailed) {
  process.exit(1)
}

console.log(`i18n key parity OK for ${locales.join(', ')}`)

// ---------------------------------------------------------------------------
// Check 2 — source references
// ---------------------------------------------------------------------------

const LEAVES = baseKeys
const CONTAINERS = new Set(base.containers)

const FACTORIES = new Set(['useTranslations', 'getTranslations'])
// Translator members that take a message key. `has` is an existence probe, so a
// missing key is the whole point of the call — it never counts as an error.
const KEY_METHODS = new Set(['rich', 'markup', 'raw', 'has'])

const SHADOW = Symbol('shadow') // name rebound to something that is not a translator
const DYNAMIC_NS = Symbol('dynamic-namespace')

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      yield* walkFiles(p)
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      yield p
    }
  }
}

function lineCol(text, pos) {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < pos; i++) {
    if (text.charCodeAt(i) === 10) { line++; lastBreak = i }
  }
  return { line, col: pos - lastBreak }
}

function staticText(node) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

// undefined = not a translator factory call | string = namespace ('' = root)
// DYNAMIC_NS = a factory call whose namespace cannot be read statically.
function namespaceOf(expr) {
  let node = expr
  if (node && ts.isAwaitExpression(node)) node = node.expression
  if (!node || !ts.isCallExpression(node)) return undefined
  if (!ts.isIdentifier(node.expression) || !FACTORIES.has(node.expression.text)) return undefined

  const arg = node.arguments[0]
  if (!arg) return '' // useTranslations() — keys are absolute

  const literal = staticText(arg)
  if (literal !== undefined) return literal

  // getTranslations({ locale, namespace: 'x' })
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined
      if (name !== 'namespace') continue
      const value = staticText(prop.initializer)
      return value === undefined ? DYNAMIC_NS : value
    }
    return '' // no namespace property — root
  }

  return DYNAMIC_NS
}

// `const [rows, t] = await Promise.all([getRows(), getTranslations('ns')])`
// is used by the async server pages, so bindings must be matched positionally.
function promiseAllElements(expr) {
  let node = expr
  if (node && ts.isAwaitExpression(node)) node = node.expression
  if (!node || !ts.isCallExpression(node)) return undefined
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'all') return undefined
  if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'Promise') return undefined
  const arg = node.arguments[0]
  if (!arg || !ts.isArrayLiteralExpression(arg)) return undefined
  return arg.elements
}

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
  } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue
      bindingNames(element.name, out)
    }
  }
  return out
}

// Nearest block-ish ancestor — `const` is block scoped.
function declarationScope(node, sourceFile) {
  let parent = node.parent
  while (parent) {
    if (
      ts.isBlock(parent) ||
      ts.isSourceFile(parent) ||
      ts.isModuleBlock(parent) ||
      ts.isCaseBlock(parent) ||
      ts.isCatchClause(parent) ||
      ts.isForStatement(parent) ||
      ts.isForInStatement(parent) ||
      ts.isForOfStatement(parent)
    ) {
      return parent
    }
    parent = parent.parent
  }
  return sourceFile
}

// One file's worth of findings. `dynamicPrefixes` records paths we know are
// reached dynamically, so the unused check can stay quiet about them.
function scanFile(filePath, text) {
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind)

  const bindings = new Map() // scope node -> Map<name, namespace | SHADOW | DYNAMIC_NS>
  const references = []
  const dynamicPrefixes = new Set()
  let dynamicCount = 0

  function declare(scope, name, value) {
    let scoped = bindings.get(scope)
    if (!scoped) {
      scoped = new Map()
      bindings.set(scope, scoped)
    }
    scoped.set(name, value)
  }

  // Pass 1 — bind names. Non-translator declarations and parameters are
  // recorded as SHADOW so that e.g. `items.map((t) => t(x))` does not get
  // mistaken for a translator call from an outer scope.
  function collect(node) {
    if (ts.isVariableDeclaration(node)) {
      const scope = declarationScope(node, sourceFile)
      const elements = promiseAllElements(node.initializer)

      if (elements && ts.isArrayBindingPattern(node.name)) {
        node.name.elements.forEach((element, index) => {
          if (ts.isOmittedExpression(element)) return
          const ns = elements[index] ? namespaceOf(elements[index]) : undefined
          const value = ns === undefined ? SHADOW : ns
          for (const name of bindingNames(element.name)) declare(scope, name, value)
        })
      } else {
        const ns = namespaceOf(node.initializer)
        if (ns !== undefined && ts.isIdentifier(node.name)) {
          declare(scope, node.name.text, ns)
        } else {
          for (const name of bindingNames(node.name)) declare(scope, name, SHADOW)
        }
      }
    }

    if (ts.isFunctionLike(node) && node.parameters) {
      for (const parameter of node.parameters) {
        for (const name of bindingNames(parameter.name)) declare(node, name, SHADOW)
      }
    }

    ts.forEachChild(node, collect)
  }
  collect(sourceFile)

  function lookup(node, name) {
    let current = node
    while (current) {
      const scoped = bindings.get(current)
      if (scoped && scoped.has(name)) return scoped.get(name)
      current = current.parent
    }
    return undefined
  }

  // A dynamic key still tells us something when it has a static head:
  // t(`filters.${x}`) can only reach keys under `<ns>.filters`.
  function dynamicPrefix(arg, ns) {
    if (arg && ts.isTemplateExpression(arg)) {
      const head = arg.head.text
      const cut = head.lastIndexOf('.')
      if (cut > 0) {
        const prefix = head.slice(0, cut)
        return ns ? `${ns}.${prefix}` : prefix
      }
    }
    return ns
  }

  // Pass 2 — resolve calls.
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      let name
      let method = ''

      if (ts.isIdentifier(callee)) {
        name = callee.text
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        if (KEY_METHODS.has(callee.name.text)) {
          name = callee.expression.text
          method = callee.name.text
        }
      }

      const binding = name === undefined ? undefined : lookup(node, name)
      if (binding !== undefined && binding !== SHADOW && node.arguments.length > 0) {
        const ns = binding === DYNAMIC_NS ? undefined : binding
        const arg = node.arguments[0]
        const key = staticText(arg)

        if (key === undefined) {
          dynamicCount++
          // '*' = could be any key, so nothing in the message tree is safe to
          // call unused: either the namespace itself is unresolvable, or the
          // key is fully computed under the root namespace.
          dynamicPrefixes.add(ns === undefined ? '*' : dynamicPrefix(arg, ns) || '*')
        } else {
          references.push({
            path: ns ? `${ns}.${key}` : key,
            method,
            pos: node.getStart(sourceFile),
            unknownNamespace: ns === undefined,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  // Namespaces themselves must exist — useTranslations('typo') would otherwise
  // only surface as a pile of missing keys, or none at all if the file is
  // entirely dynamic.
  const namespaces = new Set()
  for (const scoped of bindings.values()) {
    for (const value of scoped.values()) {
      if (typeof value === 'string' && value !== '') namespaces.add(value)
    }
  }

  return { references, dynamicPrefixes, dynamicCount, namespaces }
}

// Every ancestor path of a key, self included: a.b.c[0] -> a.b.c[0], a.b.c, a.b, a
function ancestorPaths(key) {
  const out = [key]
  let current = key
  while (true) {
    const cut = Math.max(current.lastIndexOf('.'), current.lastIndexOf('['))
    if (cut <= 0) break
    current = current.slice(0, cut)
    out.push(current)
  }
  return out
}

const missingByFile = {}
const badNamespacesByFile = {}
const used = new Set()
const dynamicPrefixes = new Set()
// Files only enter the baseline when they have findings, so zombie detection
// needs the full scanned set to tell "clean now" from "gone".
const allFiles = new Set()
let dynamicTotal = 0

for (const filePath of walkFiles(SRC)) {
  const rel = path.relative(ROOT, filePath)
  const text = fs.readFileSync(filePath, 'utf8')
  const { references, dynamicPrefixes: filePrefixes, dynamicCount, namespaces } = scanFile(filePath, text)

  allFiles.add(rel)
  dynamicTotal += dynamicCount
  for (const prefix of filePrefixes) dynamicPrefixes.add(prefix)

  const badNamespaces = [...namespaces].filter((ns) => !CONTAINERS.has(ns))
  if (badNamespaces.length) badNamespacesByFile[rel] = badNamespaces

  const missing = []
  for (const ref of references) {
    used.add(ref.path)

    // Keys under a namespace we could not resolve are unverifiable, and t.has()
    // is allowed to probe for absent keys.
    if (ref.unknownNamespace || ref.method === 'has') continue

    if (LEAVES.has(ref.path)) continue
    // t.raw() legitimately returns a whole subtree (e.g. the months array).
    if (ref.method === 'raw' && CONTAINERS.has(ref.path)) continue

    const { line, col } = lineCol(text, ref.pos)
    const reason = CONTAINERS.has(ref.path) ? 'points at a group, not a message' : 'not defined in messages'
    missing.push({ path: ref.path, line, col, reason, method: ref.method })
  }

  if (missing.length) missingByFile[rel] = missing
}

const unused = []
for (const key of LEAVES) {
  const paths = ancestorPaths(key)
  if (paths.some((p) => used.has(p))) continue
  if (dynamicPrefixes.has('*')) continue
  if (paths.some((p) => dynamicPrefixes.has(p))) continue
  unused.push(key)
}
unused.sort()

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

const missingCounts = Object.fromEntries(
  Object.entries(missingByFile).map(([file, items]) => [file, items.length])
)

// A bad namespace is a typo, not migration debt — never baselined.
if (Object.keys(badNamespacesByFile).length) {
  for (const [rel, namespaces] of Object.entries(badNamespacesByFile)) {
    console.error(`\n✗ ${rel}`)
    for (const ns of namespaces) {
      console.error(`  useTranslations('${ns}') — no such namespace in messages/${baseLocale}.json`)
    }
  }
  console.error('\ncheck-i18n failed: unknown translation namespace. Fix the name, or add the namespace to all three message files.')
  process.exit(1)
}

if (isUpdate) {
  let old = {}
  if (fs.existsSync(BASELINE)) {
    try { old = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } catch { old = {} }
  }
  const oldMissing = old.missing ?? {}

  const increased = []
  for (const [file, count] of Object.entries(missingCounts)) {
    const previous = oldMissing[file] ?? 0
    if (count > previous) increased.push({ file, previous, count })
  }

  if (increased.length && !allowIncrease) {
    console.error('\ncheck-i18n --update-baseline refused: these files have more missing references than the old baseline, which looks like new breakage being laundered in.')
    console.error('Re-run with --allow-increase if this is a legitimate one-off (e.g. the scanner got smarter):')
    for (const { file, previous, count } of increased) {
      console.error(`  ${file}: ${previous} -> ${count} (+${count - previous})`)
    }
    process.exit(1)
  }

  const sortedMissing = {}
  for (const key of Object.keys(missingCounts).sort()) sortedMissing[key] = missingCounts[key]
  fs.writeFileSync(BASELINE, JSON.stringify({ missing: sortedMissing, unused }, null, 2) + '\n')
  console.log(
    `i18n baseline updated: ${Object.keys(sortedMissing).length} files with missing refs ` +
    `(${Object.values(sortedMissing).reduce((a, b) => a + b, 0)} total), ${unused.length} unused keys`
  )
  process.exit(0)
}

let baseline = { missing: {}, unused: [] }
if (fs.existsSync(BASELINE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    baseline = { missing: parsed.missing ?? {}, unused: parsed.unused ?? [] }
  } catch (error) {
    console.error(`check-i18n failed: baseline unreadable — corrupt, or an unresolved merge conflict? ${BASELINE}`)
    console.error(error.message)
    process.exit(1)
  }
} // absent baseline = zero tolerance

const baselineUnused = new Set(baseline.unused)

const overBaseline = []
for (const [rel, items] of Object.entries(missingByFile)) {
  const allowed = baseline.missing[rel] ?? 0
  if (items.length > allowed) overBaseline.push({ rel, items, allowed })
}

const belowBaseline = []
const zombies = []
for (const [rel, allowed] of Object.entries(baseline.missing)) {
  if (!allFiles.has(rel)) {
    zombies.push(rel)
    continue
  }
  const current = (missingByFile[rel] ?? []).length
  if (current < allowed) belowBaseline.push({ rel, current, allowed })
}

for (const { rel, items, allowed } of overBaseline) {
  console.error(`\n✗ ${rel} (${items.length} missing reference${items.length > 1 ? 's' : ''}, baseline ${allowed})`)
  for (const item of items) {
    const call = item.method ? `t.${item.method}` : 't'
    console.error(`  ${rel}:${item.line}:${item.col}  ${call}('…') -> ${item.path}  — ${item.reason}`)
  }
}

if (zombies.length) {
  console.error('\n✗ Baseline references files that no longer exist. Regenerate with `node scripts/check-i18n.mjs --update-baseline`:')
  for (const rel of zombies) console.error(`  - ${rel}`)
}

const newUnused = unused.filter((key) => !baselineUnused.has(key))
const fixedUnused = [...baselineUnused].filter((key) => !unused.includes(key))

if (newUnused.length) {
  console.warn(`\n⚠ ${newUnused.length} message key${newUnused.length > 1 ? 's are' : ' is'} defined but never referenced from src/ (warning — dynamic lookups this scanner cannot see are possible):`)
  for (const key of newUnused.slice(0, 40)) console.warn(`  - ${key}`)
  if (newUnused.length > 40) console.warn(`  … and ${newUnused.length - 40} more`)
}

if (unused.length - newUnused.length > 0) {
  console.log(`\n${unused.length - newUnused.length} known-unused key(s) suppressed by the baseline.`)
}

if (fixedUnused.length) {
  console.log(`Tip: ${fixedUnused.length} baseline-unused key(s) are now referenced or removed — run --update-baseline to tighten.`)
}

if (belowBaseline.length) {
  console.log(`\nTip: ${belowBaseline.length} file(s) below the missing-reference baseline — run --update-baseline to tighten:`)
  for (const { rel, current, allowed } of belowBaseline) {
    console.log(`  ${rel}: ${current} < ${allowed}`)
  }
}

const dynamicNote = dynamicTotal
  ? `${dynamicTotal} dynamic key${dynamicTotal > 1 ? 's' : ''} skipped (computed at runtime — unused-key reporting is suppressed for ${dynamicPrefixes.has('*') ? 'all namespaces' : `${dynamicPrefixes.size} path(s)`})`
  : 'no dynamic keys'

if (overBaseline.length) {
  console.error('\ncheck-i18n failed: source references a message key that does not exist. next-intl would render the raw key path in the UI at runtime.')
  process.exit(1)
}

if (zombies.length) {
  console.error('\ncheck-i18n failed: the baseline has stale entries — regenerate it.')
  process.exit(1)
}

console.log(`i18n reference check OK — ${allFiles.size} files, ${used.size} distinct keys referenced, ${dynamicNote}.`)
