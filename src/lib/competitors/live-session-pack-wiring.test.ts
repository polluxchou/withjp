// src/lib/competitors/live-session-pack-wiring.test.ts
// 源码断言：开播记录改成列式紧凑格式（liveSessionPack）下发后的接线。
// 打包 / 解包本身在 liveSessionPack.test.ts 单测；这里钉「读开播记录的地方都经 liveSessionRows 解包」，
// 以及没有人再从竞品对象上读已经不存在的旧字段（类型挡得住 .ts 里的写法，挡不住 any 与类型断言）。
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../../', import.meta.url)) // src/
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const SELF = 'lib/competitors/live-session-pack-wiring.test.ts'
// 旧字段名拼出来，不在本文件里写成一个完整的「点 + 字段名」
const OLD_FIELD = new RegExp('\\.' + 'live_' + 'sessions\\b')

/** 取某个函数的函数体（到第一个顶格的 `}` 为止），断言只看函数本身、不看注释。 */
function fnBody(src: string, signature: string): string {
  const start = src.indexOf(signature)
  assert.ok(start >= 0, `找不到 ${signature}`)
  const end = src.indexOf('\n}\n', start)
  assert.ok(end > start, `${signature} 的函数体没有闭合`)
  return src.slice(start, end + 2)
}

test('src 里没有任何地方再从竞品对象上读旧的开播记录字段（liveSpansOf 自己的入参除外）', () => {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f))
  assert.ok(files.length > 100, `扫描范围不对：src 下只找到 ${files.length} 个 ts/tsx 文件`)
  const offenders = files
    .filter((f) => f !== SELF && f !== 'lib/competitors/liveSessions.ts')
    .filter((f) => OLD_FIELD.test(readFileSync(join(SRC, f), 'utf8')))
  assert.deepEqual(offenders, [])
})

test('四个读开播记录的地方都经 liveSessionRows 解包', () => {
  assert.match(
    fnBody(read('lib/competitors/liveBoard.ts'), 'export function accountSpans('),
    /liveSpansOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.sessionShots \}\)/,
  )
  assert.match(
    read('lib/competitors/regionRuler.ts'),
    /liveStartsOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.sessionShots \?\? \[\] \}\)/,
  )
  assert.match(
    fnBody(read('lib/competitors/ask-context.ts'), 'function startsUpTo('),
    /liveStartsOf\(\{ live_sessions: liveSessionRows\(c\), shots: c\.shots \}\)/,
  )
  const modal = read('components/competitors/live/LiveSessionsModal.tsx')
  assert.match(modal, /const existing = useMemo\(\(\) => liveSessionRows\(competitor\), \[competitor\]\)/)
  assert.match(modal, /existing=\{existing\}/)
})

test('assembleBoard 把每个账号的开播记录打包挂到 liveSessionPack', () => {
  assert.match(fnBody(read('lib/competitors/assemble.ts'), 'export function assembleBoard'), /liveSessionPack: packLiveSessions\(/)
})
