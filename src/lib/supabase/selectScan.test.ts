import assert from 'node:assert/strict'
import test from 'node:test'

import { pagedCallProblems, scanSelectReads } from './selectScan.ts'

const guards = (src: string) => scanSelectReads(src).map((r) => `${r.table}:${r.guard ?? 'OPEN'}`)

test('裸的整表读取：没有任何行数上限 → OPEN', () => {
  assert.deepEqual(guards(`const { data } = await db.from('expenses').select('*')`), ['expenses:OPEN'])
})

test('带过滤和排序但没有上限，仍然是 OPEN（过滤结果一样会过千行）', () => {
  const src = `
    const { data } = await db
      .from('tasks')
      .select('id, status')
      .eq('creator_id', id)
      .order('created_at', { ascending: false })
  `
  assert.deepEqual(guards(src), ['tasks:OPEN'])
})

test('行号指向 .from 所在行', () => {
  const src = `const a = 1\nconst q = db\n  .from('tasks')\n  .select('*')\n`
  assert.equal(scanSelectReads(src)[0].line, 3)
})

test('single / maybeSingle / head 计数 / 主键过滤，都算有上限', () => {
  assert.deepEqual(guards(`db.from('a').select('*').eq('x', 1).single()`), ['a:single'])
  assert.deepEqual(guards(`db.from('a').select('*').eq('x', 1).maybeSingle()`), ['a:single'])
  assert.deepEqual(guards(`db.from('a').select('id', { count: 'exact', head: true })`), ['a:head'])
  assert.deepEqual(guards(`db.from('a').select('*').eq('id', x)`), ['a:pk'])
  assert.deepEqual(guards(`db.from('a').select('*').in('id', ids)`), ['a:pk'])
})

test('limit：不超过 1000 的字面量或变量算有上限；超过 1000 的字面量照样被截断 → OPEN', () => {
  assert.deepEqual(guards(`db.from('a').select('*').limit(5)`), ['a:limit'])
  assert.deepEqual(guards(`db.from('a').select('*').limit(1000)`), ['a:limit'])
  assert.deepEqual(guards(`db.from('a').select('*').limit(n)`), ['a:limit'])
  assert.deepEqual(guards(`db.from('a').select('*').limit(5000)`), ['a:OPEN'])
  assert.deepEqual(guards(`db.from('a').select('*').order('x').limit(1001)`), ['a:OPEN'])
})

test('显式 range 窗口算有上限', () => {
  assert.deepEqual(guards(`db.from('a').select('*').order('id').range(0, 49)`), ['a:limit'])
})

test('写操作（insert/update/delete/upsert 后接 select）不算读取', () => {
  const src = `
    await db.from('a').insert(row).select('*').single()
    await db.from('a').update(patch).eq('k', 1).select('*')
    await db.from('a').delete().eq('k', 1).select('id')
    await db.from('a').upsert(rows).select('*')
  `
  assert.deepEqual(guards(src), [])
})

test('没有 select 的 from（如 storage 桶）不算', () => {
  assert.deepEqual(guards(`await db.storage.from('bucket').upload(path, file)`), [])
})

test('写在 fetchAllRows 回调里的 from → paged（单行与多行、带条件拼接都算）', () => {
  const inline = `fetchAllRows((from, to) => db.from('a').select('*').order('id').range(from, to))`
  assert.deepEqual(guards(inline), ['a:paged'])
  const block = `
    const res = await fetchAllRows((from, to) => {
      let q = db.from('a').select('*')
      if (status) q = q.eq('status', status)
      return q.order('created_at', { ascending: false }).order('id').range(from, to)
    })
    const other = await db.from('b').select('*')
  `
  assert.deepEqual(guards(block), ['a:paged', 'b:OPEN'])
})

test('参数里的括号、引号、模板串不会把链条截断', () => {
  const src = "db.from('a').select('*').or(`x.eq.${f(1)},y.like.%)%`).ilike('n', '%(%').limit(3)"
  assert.deepEqual(guards(src), ['a:limit'])
})

test('注释里的示例代码不算', () => {
  const src = `
    // 改回 db.from('a').select('*') 就会丢行
    /* db.from('b').select('*') */
    const x = 1
  `
  assert.deepEqual(guards(src), [])
})

test('pagedCallProblems：分页段必须带 .order(\'id\' 兜底和 .range(from, to)', () => {
  const good = `fetchAllRows((from, to) => db.from('a').select('*').order('d').order('id', { ascending: true }).range(from, to))`
  assert.deepEqual(pagedCallProblems(good), [])

  const noRange = `fetchAllRows((from, to) => db.from('a').select('*').order('id'))`
  assert.equal(pagedCallProblems(noRange).length, 1)
  assert.match(pagedCallProblems(noRange)[0].problem, /range/)

  const noId = `fetchAllRows((from, to) => db.from('a').select('*').order('created_at').range(from, to))`
  assert.equal(pagedCallProblems(noId).length, 1)
  assert.match(pagedCallProblems(noId)[0].problem, /order/)

  // id 排序写在 range 后面不算：range 之后的 order 不参与这一页的切分
  const idAfter = `fetchAllRows((from, to) => db.from('a').select('*').range(from, to).order('id'))`
  assert.equal(pagedCallProblems(idAfter).length, 1)
})

test('pagedCallProblems：把现成的 page 函数当参数传进去的调用（没有内联查询）不检查', () => {
  assert.deepEqual(pagedCallProblems(`const res = await fetchAllRows(t.page)`), [])
})
