import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// 后台（src/app/[locale]/(app)）服务端组件的登录检查表。检查本身的行为在
// page-session.test.ts 里测；这里钉住接线：每个服务端 page/layout 都要在表里
// 定好口径，查登录的那几种必须在函数体最前面、碰数据之前就查。
// 页面引用 next/* 与 @/ 别名，node --test 加载不了，只能读源码。
const APP = join(fileURLToPath(new URL('../../', import.meta.url)), 'app/[locale]/(app)')
const read = (rel: string) => readFileSync(join(APP, rel), 'utf8')

function serverFiles(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) return serverFiles(abs)
    if (name !== 'page.tsx' && name !== 'layout.tsx') return []
    const isClient = /^\s*['"]use client['"]/.test(readFileSync(abs, 'utf8'))
    return isClient ? [] : [relative(APP, abs)]
  })
}

// requirePageUser：本轮新加的检查（getClaims，没登录跳 /<locale>/login）。
// authGuard / getUser：早先各页自己写的检查，没登录跳 /login（再由 middleware 补语言）。
// none：不在服务端读库（只做跳转、或渲染打包进代码的静态数据），靠 layout 那一道。
type Guard = 'requirePageUser' | 'authGuard' | 'getUser' | 'none'

// 新增服务端 page/layout 要先在这里定口径，否则下面第一条测试会挂。
const POLICY: Record<string, Guard> = {
  'layout.tsx': 'requirePageUser',
  'page.tsx': 'requirePageUser',
  'team/page.tsx': 'requirePageUser',
  'team/assignments/page.tsx': 'requirePageUser',
  'recruit-applications/page.tsx': 'requirePageUser',
  'finance-forecast/page.tsx': 'getUser',
  'expenses/layout.tsx': 'getUser',
  'site-content/news/page.tsx': 'getUser',
  'site-content/members/page.tsx': 'getUser',
  'competitors/page.tsx': 'authGuard',
  'competitors/live/page.tsx': 'authGuard',
  'competitors/companies/page.tsx': 'authGuard',
  'team/org/page.tsx': 'authGuard',
  'devices/page.tsx': 'none',
  'config/changelog/page.tsx': 'none',
}

const GUARD_RE: Record<Exclude<Guard, 'none'>, RegExp> = {
  requirePageUser: /await requirePageUser\(params\.locale\)/,
  authGuard: /const user = await authGuard\(\)\n\s*if \(user instanceof Response\) redirect\(/,
  getUser:
    /const auth = await createAuthServerClient\(\)\n\s*const \{ data: \{ user \} \} = await auth\.auth\.getUser\(\)\n\s*if \(!user\) redirect\(/,
}

// default export 的函数体（从参数表后的 `) {` 开始）。
function defaultExportBody(src: string, file: string): string {
  const at = src.indexOf('export default')
  assert.ok(at >= 0, `${file} 没有 default export`)
  const open = src.indexOf(') {\n', at)
  assert.ok(open >= 0, `${file} 找不到 default export 的函数体`)
  return src.slice(open + ') {\n'.length)
}

// 检查之前只许出现：空行、注释、取路由参数（Next 15 起 params 是 Promise）、
// 解出 children、设语言、取文案——都不碰数据。
const BEFORE_GUARD_LINE_RE =
  /^\s*(?:$|\/\/|const params = await props\.params$|const \{ children \} = props$|setRequestLocale\(|const \w+ = await getTranslations\()/

test('后台每个服务端 page/layout 都在检查表里，表里的文件也都还在', () => {
  assert.deepEqual(serverFiles().sort(), Object.keys(POLICY).sort())
})

test('查登录的页面：检查是函数体里第一件事，在任何读库之前', () => {
  let checked = 0
  for (const [file, guard] of Object.entries(POLICY)) {
    if (guard === 'none') continue
    const body = defaultExportBody(read(file), file)
    const m = GUARD_RE[guard].exec(body)
    assert.ok(m, `${file} 应以 ${guard} 检查登录`)
    for (const line of body.slice(0, m.index).split('\n')) {
      assert.match(line, BEFORE_GUARD_LINE_RE, `${file} 在登录检查之前不能做别的事：${line.trim()}`)
    }
    checked++
  }
  // 当前盘点：requirePageUser 5（layout + 4 页）+ getUser 4 + authGuard 4。
  assert.equal(checked, 13)
})

test('本轮补上的页面都接收路由参数 locale，未登录跳回同语言登录页', () => {
  for (const [file, guard] of Object.entries(POLICY)) {
    if (guard !== 'requirePageUser') continue
    const src = read(file)
    assert.match(src, /import \{ requirePageUser \} from '@\/lib\/auth\/require-page-user'/, file)
    assert.match(src, /params: Promise<\{ locale: string \}>/, `${file} 要声明 params.locale`)
  }
})

test('标成 none 的文件确实不在服务端读库', () => {
  for (const [file, guard] of Object.entries(POLICY)) {
    if (guard !== 'none') continue
    assert.doesNotMatch(read(file), /@\/lib\/supabase\/|@\/lib\/auth\/actor|createServerClient/, file)
  }
})
