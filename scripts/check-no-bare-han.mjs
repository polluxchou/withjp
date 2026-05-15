// Ratchet check: forbid bare Chinese (Han) characters inside JSX in src/.
//
// Why a custom script instead of ESLint?
//   * eslint-config-next pulls in many transitive plugins. In sandboxed /
//     bare-clone environments the @typescript-eslint/parser can hang on .tsx
//     files. The TypeScript compiler API is already a devDep, parses cleanly
//     in every env, and gives us the AST positions we need.
//
// What this rule enforces:
//   * No Han characters inside JsxText (children).
//   * No Han characters inside JsxAttribute string literals (e.g. title="…").
//   * No Han characters inside JsxExpression string / template literals
//     (e.g. {`已选 ${n} 项`} or {'中文'}).
//
// Allowlist: see ALLOWLIST below. Files already containing bare Han are
// grandfathered. The allowlist is intentionally explicit so it shrinks over
// time as files get migrated to useTranslations() — every removal is a
// visible ratchet step.

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import ts from 'typescript'

const HAN = /[一-鿿]/

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

// Grandfathered files — known to contain bare Han in JSX today. Re-add an
// entry only if a single PR needs to land partial migration; the ratchet's
// stale-allowlist check will flag it for removal once the file is fully
// migrated.
// finance-forecast migration was deferred (reverted from this PR) — tracked
// as a follow-up. ESLint carries a matching override in .eslintrc.json.
// NextTimelineView + timeline page string added by main after this PR branched;
// also deferred to the follow-up migration.
const ALLOWLIST = new Set([
  'src/app/[locale]/(app)/finance-forecast/page.tsx',
  'src/components/finance-forecast/FinanceForecastDashboard.tsx',
  'src/components/finance-forecast/ForecastViewBar.tsx',
  'src/components/finance-forecast/LifecycleTemplateEditor.tsx',
  'src/components/milestones/NextTimelineView.tsx',
  'src/app/[locale]/(app)/timeline/page.tsx',
])

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      yield* walkFiles(p)
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
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

function findViolations(filePath, text) {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []

  function isHan(s) { return typeof s === 'string' && HAN.test(s) }

  function visit(node) {
    // <div>中文</div>
    if (node.kind === ts.SyntaxKind.JsxText && isHan(node.text)) {
      out.push({ pos: node.getStart(sf), kind: 'JsxText', sample: node.text.trim().slice(0, 30) })
    }
    // <div title="中文" />
    if (node.kind === ts.SyntaxKind.JsxAttribute && node.initializer) {
      const init = node.initializer
      if (init.kind === ts.SyntaxKind.StringLiteral && isHan(init.text)) {
        out.push({ pos: init.getStart(sf), kind: 'JsxAttribute', sample: init.text.slice(0, 30) })
      }
    }
    // {'中文'} or {`已选 ${n} 项`} inside JSX
    if (node.kind === ts.SyntaxKind.JsxExpression && node.expression) {
      const expr = node.expression
      if (expr.kind === ts.SyntaxKind.StringLiteral && isHan(expr.text)) {
        out.push({ pos: expr.getStart(sf), kind: 'JsxExpression literal', sample: expr.text.slice(0, 30) })
      }
      // Walk descendants of the expression for nested string/template literals.
      const stack = [expr]
      while (stack.length) {
        const n = stack.pop()
        if (n.kind === ts.SyntaxKind.StringLiteral && isHan(n.text) && n !== expr) {
          out.push({ pos: n.getStart(sf), kind: 'string literal in JSX', sample: n.text.slice(0, 30) })
        }
        if (n.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral && isHan(n.text)) {
          out.push({ pos: n.getStart(sf), kind: 'template literal in JSX', sample: n.text.slice(0, 30) })
        }
        if (n.kind === ts.SyntaxKind.TemplateExpression) {
          if (isHan(n.head.text)) {
            out.push({ pos: n.head.getStart(sf), kind: 'template literal in JSX', sample: n.head.text.slice(0, 30) })
          }
          for (const span of n.templateSpans) {
            if (isHan(span.literal.text)) {
              out.push({ pos: span.literal.getStart(sf), kind: 'template literal in JSX', sample: span.literal.text.slice(0, 30) })
            }
          }
        }
        n.forEachChild?.((c) => stack.push(c))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

let newOffenders = 0
let staleAllowlist = []

const seen = new Set()
for (const filePath of walkFiles(SRC)) {
  const rel = path.relative(ROOT, filePath)
  seen.add(rel)
  const text = fs.readFileSync(filePath, 'utf8')
  const violations = findViolations(filePath, text)
  const isAllowed = ALLOWLIST.has(rel)

  if (violations.length === 0) {
    if (isAllowed) staleAllowlist.push(rel)
    continue
  }
  if (isAllowed) continue

  newOffenders++
  console.error(`\n✗ ${rel} (${violations.length} violation${violations.length > 1 ? 's' : ''})`)
  for (const v of violations) {
    const { line, col } = lineCol(text, v.pos)
    console.error(`  ${rel}:${line}:${col}  [${v.kind}]  "${v.sample}"`)
  }
}

// Also report allowlist entries that no longer exist — keeps the list honest.
for (const rel of ALLOWLIST) {
  if (!seen.has(rel)) {
    console.error(`\n✗ Allowlist entry no longer exists: ${rel}`)
    newOffenders++
  }
}

if (staleAllowlist.length > 0) {
  console.error('\n✗ Allowlist contains files that no longer have bare Han — please remove these entries (ratchet step):')
  for (const f of staleAllowlist) console.error(`  - ${f}`)
  newOffenders += staleAllowlist.length
}

if (newOffenders > 0) {
  console.error(`\nFound ${newOffenders} file${newOffenders > 1 ? 's' : ''} with bare-Han issues. See docs/copy-glossary.md for naming conventions.`)
  process.exit(1)
}

console.log('No new bare-Han JSX violations.')
