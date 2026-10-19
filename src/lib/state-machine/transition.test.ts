import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'

import { autoMonetizeOnRevenue, transitionCreator } from './transition.ts'

// 内存版 Supabase：按 eq 过滤、真的改表，断言落在表里的结果上，而不是调用顺序上。
// 只实现 transition.ts 用到的那几个链式方法。
type Row = Record<string, unknown>
type Op = { table: string; kind: 'select' | 'update' | 'insert'; filters: Array<[string, unknown]> }

class FakeQuery {
  private kind: Op['kind'] = 'select'
  private payload: Row = {}
  private filters: Array<[string, unknown]> = []
  private returning = false
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'
  private orderBy: { col: string; ascending: boolean } | null = null
  private limitN: number | null = null
  private db: FakeDb
  private table: string

  constructor(db: FakeDb, table: string) {
    this.db = db
    this.table = table
  }

  select() {
    if (this.kind !== 'select') this.returning = true
    return this
  }
  insert(payload: Row) {
    this.kind = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.kind = 'update'
    this.payload = payload
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val])
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending ?? true }
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  single() {
    this.mode = 'single'
    return this
  }
  maybeSingle() {
    this.mode = 'maybeSingle'
    return this
  }

  then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
    try {
      resolve(this.run())
    } catch (err) {
      reject?.(err)
    }
  }

  private run() {
    this.db.beforeRun?.({ table: this.table, kind: this.kind, filters: this.filters })
    const rows = (this.db.tables[this.table] ??= [])
    const matches = (r: Row) => this.filters.every(([c, v]) => r[c] === v)

    if (this.kind === 'insert') {
      const row = { id: `${this.table}-${rows.length + 1}`, ...this.payload }
      rows.push(row)
      return this.shape(this.returning ? [row] : null)
    }
    if (this.kind === 'update') {
      const hit = rows.filter(matches)
      for (const r of hit) Object.assign(r, this.payload)
      return this.shape(this.returning ? hit : null)
    }
    let hit = rows.filter(matches)
    if (this.orderBy) {
      const { col, ascending } = this.orderBy
      hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1))
    }
    if (this.limitN != null) hit = hit.slice(0, this.limitN)
    return this.shape(hit)
  }

  private shape(rows: Row[] | null) {
    if (rows == null) return { data: null, error: null }
    const copies = rows.map((r) => ({ ...r }))
    if (this.mode === 'many') return { data: copies, error: null }
    if (copies.length === 1) return { data: copies[0], error: null }
    if (copies.length === 0 && this.mode === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${copies.length}` } }
  }
}

class FakeDb {
  tables: Record<string, Row[]>
  beforeRun?: (op: Op) => void

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }

  get client() {
    return this as unknown as SupabaseClient
  }
}

const seed = (status: string) =>
  new FakeDb({
    creators: [{ id: 'c1', status }],
    lifecycle_transitions: [],
    agents: [
      { id: 'agent-fin', role: 'finance', is_active: true },
      { id: 'agent-ops', role: 'ops', is_active: true },
    ],
    tasks: [
      { id: 't-old', creator_id: 'c1', status: 'done', updated_at: '2026-10-01' },
      { id: 't-new', creator_id: 'c1', status: 'done', updated_at: '2026-10-10' },
    ],
  })

test('live 主播记营收 > 0：状态转为 monetized，并写一条 system 触发的转换记录', async () => {
  const db = seed('live')

  const res = await autoMonetizeOnRevenue(db.client, 'c1', 1200)

  assert.deepEqual(res, { transitioned: true, error: null })
  assert.equal(db.tables.creators[0].status, 'monetized')
  assert.equal(db.tables.lifecycle_transitions.length, 1)
  assert.deepEqual(
    { ...db.tables.lifecycle_transitions[0], id: undefined },
    {
      id: undefined,
      creator_id: 'c1',
      from_status: 'live',
      to_status: 'monetized',
      triggered_by: 'system',
      notes: 'Revenue recorded',
    },
  )
})

test('营收为 0 或负数：不转换、不写记录', async () => {
  for (const revenue of [0, -50, Number.NaN]) {
    const db = seed('live')
    const res = await autoMonetizeOnRevenue(db.client, 'c1', revenue)
    assert.deepEqual(res, { transitioned: false, error: null }, `revenue=${revenue}`)
    assert.equal(db.tables.creators[0].status, 'live')
    assert.equal(db.tables.lifecycle_transitions.length, 0)
  }
})

test('主播不在 live：记营收不动状态（已 monetized 的不会重复记转换）', async () => {
  for (const status of ['live_ready', 'monetized', 'terminated']) {
    const db = seed(status)
    const res = await autoMonetizeOnRevenue(db.client, 'c1', 1200)
    assert.deepEqual(res, { transitioned: false, error: null }, status)
    assert.equal(db.tables.creators[0].status, status)
    assert.equal(db.tables.lifecycle_transitions.length, 0)
    assert.equal(db.tables.tasks.length, 2)
  }
})

test('自动转 monetized 时照常生成 finance 的 ROI 任务，串在最近完成的任务后面', async () => {
  const db = seed('live')

  await autoMonetizeOnRevenue(db.client, 'c1', 1200)

  const created = db.tables.tasks.filter((t) => t.status === 'pending')
  assert.equal(created.length, 1)
  assert.equal(created[0].agent_id, 'agent-fin')
  assert.equal(created[0].title, 'Calculate ROI and profitability report')
  assert.equal(created[0].parent_task_id, 't-new')
  assert.deepEqual(created[0].input, { creator_id: 'c1', trigger: 'transition_live_to_monetized' })
})

test('transitionCreator：合法转换改状态、记录 triggered_by 与 notes，返回更新后的主播', async () => {
  const db = seed('live_ready')

  const res = await transitionCreator(db.client, {
    creatorId: 'c1',
    toStatus: 'live',
    triggeredBy: 'user',
    notes: 'go live',
  })

  assert.equal(res.ok, true)
  assert.equal(res.ok && res.creator.status, 'live')
  assert.equal(db.tables.creators[0].status, 'live')
  assert.equal(db.tables.lifecycle_transitions.length, 1)
  const rec = db.tables.lifecycle_transitions[0]
  assert.equal(rec.from_status, 'live_ready')
  assert.equal(rec.to_status, 'live')
  assert.equal(rec.triggered_by, 'user')
  assert.equal(rec.notes, 'go live')
})

test('transitionCreator：不在状态机里的转换 422，表不动', async () => {
  const db = seed('prospect')

  const res = await transitionCreator(db.client, { creatorId: 'c1', toStatus: 'monetized', triggeredBy: 'user' })

  assert.deepEqual(res, { ok: false, status: 422, error: 'Invalid transition: prospect → monetized' })
  assert.equal(db.tables.creators[0].status, 'prospect')
  assert.equal(db.tables.lifecycle_transitions.length, 0)
  assert.equal(db.tables.tasks.length, 2)
})

test('transitionCreator：主播不存在 404', async () => {
  const db = seed('live')

  const res = await transitionCreator(db.client, { creatorId: 'nope', toStatus: 'monetized', triggeredBy: 'user' })

  assert.deepEqual(res, { ok: false, status: 404, error: 'Creator not found' })
  assert.equal(db.tables.lifecycle_transitions.length, 0)
})

test('transitionCreator：读完到写入之间状态被别人改了，409 且不写转换记录（防双击/并发重复记）', async () => {
  const db = seed('live')
  // 在 update 落库前把状态改掉，模拟另一个请求抢先完成了同一次转换。
  db.beforeRun = (op) => {
    if (op.table === 'creators' && op.kind === 'update') db.tables.creators[0].status = 'monetized'
  }

  const res = await transitionCreator(db.client, { creatorId: 'c1', toStatus: 'monetized', triggeredBy: 'system' })

  assert.equal(res.ok, false)
  assert.equal(!res.ok && res.status, 409)
  assert.equal(db.tables.lifecycle_transitions.length, 0)
  assert.equal(db.tables.tasks.length, 2)
})

// 这次修的病灶在接线上：finance POST 之前用服务端 fetch 打相对 URL，一调就抛、
// 被 .catch 吞掉，还不带登录 cookie。route.ts 引 next/server 与 @/ 别名，
// node --test 加载不了，只能读源码钉住「直接调 lib、不再走 HTTP」。
const API = new URL('../../app/api/', import.meta.url).pathname
const read = (rel: string) => readFileSync(API + rel, 'utf8')

test('finance POST 写完营收后直接调 autoMonetizeOnRevenue，不再服务端 fetch', () => {
  const src = read('finance/route.ts')
  const post = src.slice(src.indexOf('export async function POST('))
  assert.doesNotMatch(src, /\bfetch\(/)
  assert.match(post, /autoMonetizeOnRevenue\(db, creator_id, Number\(revenue\)\)/)
  // 先写 finance 再判定：转换失败也不能挡住营收记录本身。
  assert.ok(post.indexOf(".from('finance')") < post.indexOf('autoMonetizeOnRevenue('))
})

test('transition 路由改调 transitionCreator，不再自己拼状态更新', () => {
  const src = read('creators/[id]/transition/route.ts')
  assert.match(src, /transitionCreator\(/)
  assert.doesNotMatch(src, /\.from\(/)
})
