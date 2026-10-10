// src/lib/competitors/board-pagination.test.ts
// 源码断言：两个看板函数的整表加载必须走 fetchAllRows 分页。
// fetchAll.test.ts 只证明分页函数本身对，证明不了看板真的在用它——
// 把截图查询改回一句 select('*')（也就是 2026-10-10 那次线上 bug）时，别的测试一个都不会红。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const src = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')

function bodyOf(name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

for (const name of ['getCompetitorBoard', 'getCompanyBoard']) {
  test(`${name}：每个整表 db.from(...) 都包在 fetchAllRows 里，并带稳定排序与 range`, () => {
    const body = bodyOf(name)
    const froms = body.match(/db\.from\(/g) ?? []
    assert.ok(froms.length >= 4, `${name} 里应有至少 4 个整表加载，实际 ${froms.length}`)
    const wrapped = body.match(/fetchAllRows\(\(from, to\) => db\.from\(/g) ?? []
    assert.equal(wrapped.length, froms.length, `${name} 里有 db.from 没走 fetchAllRows，超过 1000 行会被静默截断`)
    const ranged = body.match(/\.range\(from, to\)/g) ?? []
    assert.equal(ranged.length, froms.length, `${name} 里有分页查询没带 .range(from, to)`)
    // 每段分页查询都要有 .order(：没有稳定排序，翻页会漏行或重复
    const segments = body.split('fetchAllRows((from, to) =>').slice(1)
    for (const seg of segments) {
      const q = seg.slice(0, seg.indexOf('.range(from, to)'))
      assert.match(q, /\.order\(/, `${name} 里有分页查询没带 .order(...)：${q.trim().slice(0, 60)}`)
    }
  })
}
