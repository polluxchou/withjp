import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import {
  createNewsCreateHandler,
  createNewsDeleteHandler,
  createNewsListHandler,
  createNewsPatchHandler,
  type AuthResult,
  type NewsDb,
  type NewsQueryBuilder,
  type NewsQueryResult,
  type NewsRow,
  type NewsRouteDeps,
} from '../../../lib/site/news-service.ts'
import {
  createMemberListHandler,
  createMemberPatchHandler,
  type MemberDb,
  type MemberQueryBuilder,
  type MemberQueryResult,
  type MemberRow,
  type MemberRouteDeps,
} from '../../../lib/site/members-service.ts'
import { PUBLIC_SITE_LOCALES } from '../../../lib/site/domain-routing.ts'
import type { SiteContentActor } from '../../../lib/auth/site-content.ts'

// ============================================================
// 覆盖范围——新闻（Task 9）：
//
//   1. 未登录 GET/POST/PATCH/DELETE → 401
//   2. 非管理员：GET 200，写请求 403，且 is_published:true 不会改到库
//   3. 管理员创建 recruit 分类新闻成功、审计字段写入 actor.id、
//      category 非法值 400 且不产生部分记录、image_url 空白写 null
//   4. 管理员 PATCH 下架成功；请求夹带伪造审计字段被拒绝，库里不出现攻击者 UUID
//   5. PATCH 未知字段 / 修改 slug / 必填字段全空白均 400，且不产生部分更新
//   7. 下架后 revalidatePath 对 PUBLIC_SITE_LOCALES 的每个 locale 都记录了
//      list/首页/详情三条内部源路径为 stale
//
// 覆盖范围——成员（Task 11，见 task-11-brief.md）：
//
//   1. 未登录 GET/PATCH → 401
//   2. 非管理员：GET 200，PATCH 403，数据库原值不变
//   3. 管理员 PATCH 合法字段成功，updated_by_user_id 写入 actor.id
//   4. 提交 no / 审计字段返回 400 forbidden_field，不落库
//   5. PATCH 未知字段返回 400
//   6. 跨字段业务约束：已公开卡位缺 name/photo_url/specialty_ja 400；
//      未公开卡位缺 expected_reveal_on 400；且校验依赖「现有行 + 本次
//      patch」合并后的有效值——只改照片时不会误报已有日期缺失
//   7. PATCH 只提交一个字段时，其余未提及的选填字段保持原值不变（同新闻的
//      optional() 位置回归测试）
//   8. 非法卡位编号（超出 1-12 范围）返回 400
//   9. PATCH 成功后 revalidatePath 对每个 PUBLIC_SITE_LOCALES 都记录了
//      /site 与 /site/vision 两条路径（brief 指定路径，与新闻的三条不同）
//
// 未覆盖、且为什么：
//   - 真实 HTTP 服务器（next build && next start）：本任务用「handler factory
//     + fake context」的方式验证 HTTP 状态/解析/数据库写入/失效调用的组合，
//     没有起真实 Next 服务器或连测试用 Supabase 项目——本地没有可用的测试
//     Supabase 项目，брief 也把这条列为可选的黑盒替代方案。
//   - 「下架后官网详情页 404」：本仓库里 /[locale]/site/news/[slug] 目前仍读
//     messages/*.json 的静态 i18n 内容（src/lib/site/news.ts），还没有接
//     site_news 表——把公开页切换到读库是 Task 10 的范围。现在去 fetch
//     那个路由只是在测试与本次改动无关的旧逻辑，断言它 404 会是假阳性。
//     这里只验证「下架」真正把 is_published 写成 false（下面 fakeDb 状态断言）
//     和 revalidatePath 确实对详情路径打了 stale 标记——一旦 Task 10 把公开
//     页接上数据库，这两个前提就足够让 404 成立。
//   - 成员页面/vision 页是否真的读库展示：同上，是 Task 12 的范围。
// ============================================================

const NOW = '2026-08-14T00:00:00.000Z'

function matchesFilters(row: NewsRow, filters: Array<[string, unknown]>): boolean {
  return filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val)
}

type Op = 'select' | 'insert' | 'update' | 'delete'

// 最小的 fake 查询构造器：只实现 news-service.ts 实际调用到的链式方法
// （select/insert/update/delete/eq/single + thenable），backing store 是
// 传进来的同一个数组引用，所以多个 handler 调用之间共享同一份「表」状态。
class FakeNewsQuery implements NewsQueryBuilder {
  private op: Op | null = null
  private filters: Array<[string, unknown]> = []
  private payload: Record<string, unknown> | null = null
  private wantSingle = false
  private rows: NewsRow[]

  constructor(rows: NewsRow[]) {
    this.rows = rows
  }

  select(): NewsQueryBuilder {
    if (this.op === null) this.op = 'select'
    return this
  }
  insert(row: Record<string, unknown>): NewsQueryBuilder {
    this.op = 'insert'
    this.payload = row
    return this
  }
  update(row: Record<string, unknown>): NewsQueryBuilder {
    this.op = 'update'
    this.payload = row
    return this
  }
  delete(): NewsQueryBuilder {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown): NewsQueryBuilder {
    this.filters.push([column, value])
    return this
  }
  single(): NewsQueryBuilder {
    this.wantSingle = true
    return this
  }

  private execute(): NewsQueryResult {
    switch (this.op) {
      case 'select': {
        const matched = this.rows.filter((r) => matchesFilters(r, this.filters))
        if (this.wantSingle) {
          return matched.length === 1
            ? { data: { ...matched[0] }, error: null }
            : { data: null, error: { message: 'not found' } }
        }
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      case 'insert': {
        const row = { id: randomUUID(), created_at: NOW, updated_at: NOW, ...this.payload } as NewsRow
        this.rows.push(row)
        return { data: { ...row }, error: null }
      }
      case 'update': {
        const matched = this.rows.filter((r) => matchesFilters(r, this.filters))
        for (const row of matched) Object.assign(row, this.payload, { updated_at: new Date().toISOString() })
        if (this.wantSingle) {
          return matched.length === 1
            ? { data: { ...matched[0] }, error: null }
            : { data: null, error: { message: 'not found' } }
        }
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      case 'delete': {
        const matched = this.rows.filter((r) => matchesFilters(r, this.filters))
        for (const row of matched) {
          const idx = this.rows.indexOf(row)
          if (idx >= 0) this.rows.splice(idx, 1)
        }
        return { data: null, error: null }
      }
      default:
        return { data: null, error: { message: 'no operation configured' } }
    }
  }

  then<TResult1 = NewsQueryResult, TResult2 = never>(
    onfulfilled?: ((value: NewsQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

class FakeNewsDb implements NewsDb {
  rows: NewsRow[] = []
  from(table: 'site_news'): NewsQueryBuilder {
    assert.equal(table, 'site_news')
    return new FakeNewsQuery(this.rows)
  }
}

function fakeAuthGuard(userId: string | null): () => Promise<AuthResult> {
  return async () => (userId ? { ok: true, user: { id: userId } } : { ok: false, status: 401 })
}

function fakeActorProfiles(actors: Record<string, SiteContentActor>) {
  return async (id: string): Promise<SiteContentActor | null> => actors[id] ?? null
}

interface RevalidateCall { path: string }

function makeRevalidateRecorder() {
  const calls: RevalidateCall[] = []
  return { calls, revalidatePath: (path: string) => { calls.push({ path }) } }
}

function makeDeps(opts: {
  userId: string | null
  actors?: Record<string, SiteContentActor>
  db?: FakeNewsDb
  recorder?: ReturnType<typeof makeRevalidateRecorder>
}): { deps: NewsRouteDeps; db: FakeNewsDb; recorder: ReturnType<typeof makeRevalidateRecorder> } {
  const db = opts.db ?? new FakeNewsDb()
  const recorder = opts.recorder ?? makeRevalidateRecorder()
  const deps: NewsRouteDeps = {
    authGuard: fakeAuthGuard(opts.userId),
    getActorProfile: fakeActorProfiles(opts.actors ?? {}),
    db,
    revalidatePath: recorder.revalidatePath,
  }
  return { deps, db, recorder }
}

const ADMIN_ID = 'admin-actor'
const NON_ADMIN_ID = 'ops-actor'
const ATTACKER_ID = randomUUID()

const ACTORS: Record<string, SiteContentActor> = {
  [ADMIN_ID]: { id: ADMIN_ID, is_admin: true, role: 'bd' },
  [NON_ADMIN_ID]: { id: NON_ADMIN_ID, is_admin: false, role: 'ops' },
}

function jsonRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/site/news', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function validCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'test-news-slug',
    tag: 'RECRUIT',
    category: 'recruit',
    published_on: '2026-08-14',
    title_ja: 'テストニュース',
    lead_ja: 'テストのリード文',
    body_ja: 'テストの本文です。',
    ...overrides,
  }
}

async function seedRow(db: FakeNewsDb, overrides: Partial<NewsRow> = {}): Promise<NewsRow> {
  const row: NewsRow = {
    id: randomUUID(),
    slug: 'seeded-slug',
    tag: 'PROJECT',
    category: 'project',
    published_on: '2026-08-01',
    is_pinned: false,
    is_published: true,
    image_url: null,
    title_ja: '既存タイトル', title_zh: null, title_en: null,
    lead_ja: '既存リード', lead_zh: null, lead_en: null,
    body_ja: '既存本文', body_zh: null, body_en: null,
    created_by_user_id: ADMIN_ID,
    updated_by_user_id: ADMIN_ID,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
  db.rows.push(row)
  return row
}

// ── 1. 未登录 ──────────────────────────────────────────────────────────

test('未登录 GET /api/site/news 返回 401', async () => {
  const { deps } = makeDeps({ userId: null })
  const result = await createNewsListHandler(deps)()
  assert.equal(result.status, 401)
})

test('未登录 POST /api/site/news 返回 401', async () => {
  const { deps } = makeDeps({ userId: null })
  const result = await createNewsCreateHandler(deps)(jsonRequest('POST', validCreatePayload()))
  assert.equal(result.status, 401)
})

test('未登录 PATCH /api/site/news/:id 返回 401', async () => {
  const { deps } = makeDeps({ userId: null })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { is_published: false }), 'irrelevant-id')
  assert.equal(result.status, 401)
})

test('未登录 DELETE /api/site/news/:id 返回 401', async () => {
  const { deps } = makeDeps({ userId: null })
  const result = await createNewsDeleteHandler(deps)('irrelevant-id')
  assert.equal(result.status, 401)
})

// ── 2. 非管理员：读可以，写 403 ──────────────────────────────────────────

test('非管理员 GET 返回 200', async () => {
  const { deps, db } = makeDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  await seedRow(db)
  const result = await createNewsListHandler(deps)()
  assert.equal(result.status, 200)
})

test('非管理员 POST 返回 403，且伪造 is_published 不会落库', async () => {
  const { deps, db } = makeDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  const result = await createNewsCreateHandler(deps)(
    jsonRequest('POST', validCreatePayload({ is_published: true })),
  )
  assert.equal(result.status, 403)
  assert.equal(db.rows.length, 0)
})

test('非管理员 PATCH 返回 403，数据库原值不变', async () => {
  const { deps, db } = makeDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { is_published: true })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { is_published: false }), row.id)
  assert.equal(result.status, 403)
  assert.equal(db.rows.find((r) => r.id === row.id)?.is_published, true)
})

test('非管理员 DELETE 返回 403，记录仍在', async () => {
  const { deps, db } = makeDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db)
  const result = await createNewsDeleteHandler(deps)(row.id)
  assert.equal(result.status, 403)
  assert.equal(db.rows.length, 1)
})

// ── 3. 管理员创建 ────────────────────────────────────────────────────────

test('管理员创建 recruit 分类新闻：201，审计字段=actor.id，category 原样入库', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const result = await createNewsCreateHandler(deps)(
    jsonRequest('POST', validCreatePayload({ category: 'recruit' })),
  )
  assert.equal(result.status, 201)
  assert.equal(db.rows.length, 1)
  const row = db.rows[0]
  assert.equal(row.category, 'recruit')
  assert.equal(row.created_by_user_id, ADMIN_ID)
  assert.equal(row.updated_by_user_id, ADMIN_ID)
})

test('创建时 category 非法值返回 400，不产生部分记录', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const result = await createNewsCreateHandler(deps)(
    jsonRequest('POST', validCreatePayload({ category: 'other' })),
  )
  assert.equal(result.status, 400)
  assert.equal(db.rows.length, 0)
})

test('image_url 为空白时写入 null，不会借用其他记录的图片', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedRow(db, { image_url: '/site/existing.webp' })
  const result = await createNewsCreateHandler(deps)(
    jsonRequest('POST', validCreatePayload({ image_url: '   ' })),
  )
  assert.equal(result.status, 201)
  const created = db.rows.find((r) => r.slug === 'test-news-slug')
  assert.equal(created?.image_url, null)
})

test('创建时提交伪造的审计字段返回 400（forbidden_field），不落库', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const result = await createNewsCreateHandler(deps)(
    jsonRequest('POST', validCreatePayload({ created_by_user_id: ATTACKER_ID })),
  )
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'forbidden_field')
  assert.equal(db.rows.length, 0)
})

// ── 4. 管理员 PATCH 下架 + 拒绝伪造审计字段 ───────────────────────────────

test('管理员 PATCH 下架成功', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { is_published: true })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { is_published: false }), row.id)
  assert.equal(result.status, 200)
  assert.equal(db.rows.find((r) => r.id === row.id)?.is_published, false)
})

// 回归测试：optionalText()/imageUrlField() 曾经把 `.optional()` 放在
// transform 之前，导致 zod 解析对象时认不出「这个键就是没传」，未提及的选填
// 字段会被解析成显式 null 一起写回——一次只想切换 is_pinned 的 PATCH 会把
// title_zh/image_url 等已有内容全部清空。这里断言只 PATCH 一个字段时，
// 其余没提到的选填字段必须保持原值不变。
test('PATCH 只提交一个字段时，其余未提及的选填字段（zh/en 内容、主图）保持原值不变', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, {
    is_pinned: false,
    image_url: '/site/existing.webp',
    title_zh: '现有中文标题', title_en: 'Existing English Title',
    lead_zh: '现有中文导语', lead_en: 'Existing English Lead',
    body_zh: '现有中文正文', body_en: 'Existing English Body',
  })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { is_pinned: true }), row.id)
  assert.equal(result.status, 200)
  const stored = db.rows.find((r) => r.id === row.id)
  assert.equal(stored?.is_pinned, true)
  assert.equal(stored?.image_url, '/site/existing.webp')
  assert.equal(stored?.title_zh, '现有中文标题')
  assert.equal(stored?.title_en, 'Existing English Title')
  assert.equal(stored?.lead_zh, '现有中文导语')
  assert.equal(stored?.lead_en, 'Existing English Lead')
  assert.equal(stored?.body_zh, '现有中文正文')
  assert.equal(stored?.body_en, 'Existing English Body')
})

test('PATCH 夹带攻击者的 created_by_user_id / updated_by_user_id 返回 400，库中不出现该 UUID', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { created_by_user_id: ADMIN_ID, updated_by_user_id: ADMIN_ID })
  const result = await createNewsPatchHandler(deps)(
    jsonRequest('PATCH', {
      is_published: false,
      created_by_user_id: ATTACKER_ID,
      updated_by_user_id: ATTACKER_ID,
    }),
    row.id,
  )
  assert.equal(result.status, 400)
  const stored = db.rows.find((r) => r.id === row.id)
  assert.notEqual(stored?.created_by_user_id, ATTACKER_ID)
  assert.notEqual(stored?.updated_by_user_id, ATTACKER_ID)
  assert.equal(stored?.is_published, true) // 整个 patch 被拒绝，没有部分生效
  assert.ok(!db.rows.some((r) => r.created_by_user_id === ATTACKER_ID || r.updated_by_user_id === ATTACKER_ID))
})

// ── 5. PATCH 校验：未知字段 / slug 修改 / 必填字段全空白 ──────────────────

test('PATCH 未知字段返回 400，不产生部分更新', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { title_ja: '原标题' })
  const result = await createNewsPatchHandler(deps)(
    jsonRequest('PATCH', { title_ja: '改过的标题', totally_unknown_field: 'x' }),
    row.id,
  )
  assert.equal(result.status, 400)
  assert.equal(db.rows.find((r) => r.id === row.id)?.title_ja, '原标题')
})

test('PATCH 试图修改 slug 返回 400', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { slug: 'original-slug' })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { slug: 'new-slug' }), row.id)
  assert.equal(result.status, 400)
  assert.equal(db.rows.find((r) => r.id === row.id)?.slug, 'original-slug')
})

test('PATCH 必填字段全空白返回 400，不产生部分更新', async () => {
  const { deps, db } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { title_ja: '原标题', lead_ja: '原导语', body_ja: '原正文' })
  const result = await createNewsPatchHandler(deps)(
    jsonRequest('PATCH', { title_ja: '   ', lead_ja: '原导语', body_ja: '原正文' }),
    row.id,
  )
  assert.equal(result.status, 400)
  const stored = db.rows.find((r) => r.id === row.id)
  assert.equal(stored?.title_ja, '原标题')
})

// ── 7. 下架后的失效标记：逐 locale 断言三条内部源路径 ──────────────────────

test('下架后 revalidatePath 对每个 PUBLIC_SITE_LOCALES 都记录了 list/首页/详情三条路径', async () => {
  const { deps, db, recorder } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { slug: 'to-be-unpublished', is_published: true })
  const result = await createNewsPatchHandler(deps)(jsonRequest('PATCH', { is_published: false }), row.id)
  assert.equal(result.status, 200)

  const paths = recorder.calls.map((c) => c.path)
  for (const locale of PUBLIC_SITE_LOCALES) {
    assert.ok(paths.includes(`/${locale}/site`), `missing /${locale}/site`)
    assert.ok(paths.includes(`/${locale}/site/news`), `missing /${locale}/site/news`)
    assert.ok(paths.includes(`/${locale}/site/news/to-be-unpublished`), `missing detail path for ${locale}`)
  }
  // 3 条路径 × PUBLIC_SITE_LOCALES 个 locale，不多不少。
  assert.equal(paths.length, PUBLIC_SITE_LOCALES.length * 3)
})

test('删除前读取 slug：删除后仍能对该 slug 的详情路径打失效标记', async () => {
  const { deps, db, recorder } = makeDeps({ userId: ADMIN_ID, actors: ACTORS })
  const row = await seedRow(db, { slug: 'to-be-deleted' })
  const result = await createNewsDeleteHandler(deps)(row.id)
  assert.equal(result.status, 200)
  assert.equal(db.rows.length, 0)
  const paths = recorder.calls.map((c) => c.path)
  assert.ok(paths.some((p) => p.endsWith('/site/news/to-be-deleted')))
})

// ============================================================
// ── 成员（Task 11）──────────────────────────────────────────────────────
// ============================================================

type MemberOp = 'select' | 'update'

class FakeMemberQuery implements MemberQueryBuilder {
  private op: MemberOp | null = null
  private filters: Array<[string, unknown]> = []
  private payload: Record<string, unknown> | null = null
  private wantSingle = false
  private rows: MemberRow[]

  constructor(rows: MemberRow[]) {
    this.rows = rows
  }

  select(): MemberQueryBuilder {
    if (this.op === null) this.op = 'select'
    return this
  }
  update(row: Record<string, unknown>): MemberQueryBuilder {
    this.op = 'update'
    this.payload = row
    return this
  }
  eq(column: string, value: unknown): MemberQueryBuilder {
    this.filters.push([column, value])
    return this
  }
  single(): MemberQueryBuilder {
    this.wantSingle = true
    return this
  }

  private matches(row: MemberRow): boolean {
    return this.filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val)
  }

  private execute(): MemberQueryResult {
    switch (this.op) {
      case 'select': {
        const matched = this.rows.filter((r) => this.matches(r))
        if (this.wantSingle) {
          return matched.length === 1
            ? { data: { ...matched[0] }, error: null }
            : { data: null, error: { message: 'not found' } }
        }
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      case 'update': {
        const matched = this.rows.filter((r) => this.matches(r))
        for (const row of matched) Object.assign(row, this.payload, { updated_at: new Date().toISOString() })
        if (this.wantSingle) {
          return matched.length === 1
            ? { data: { ...matched[0] }, error: null }
            : { data: null, error: { message: 'not found' } }
        }
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      default:
        return { data: null, error: { message: 'no operation configured' } }
    }
  }

  then<TResult1 = MemberQueryResult, TResult2 = never>(
    onfulfilled?: ((value: MemberQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

class FakeMemberDb implements MemberDb {
  rows: MemberRow[] = []
  from(table: 'site_members'): MemberQueryBuilder {
    assert.equal(table, 'site_members')
    return new FakeMemberQuery(this.rows)
  }
}

function makeMemberDeps(opts: {
  userId: string | null
  actors?: Record<string, SiteContentActor>
  db?: FakeMemberDb
  recorder?: ReturnType<typeof makeRevalidateRecorder>
}): { deps: MemberRouteDeps; db: FakeMemberDb; recorder: ReturnType<typeof makeRevalidateRecorder> } {
  const db = opts.db ?? new FakeMemberDb()
  const recorder = opts.recorder ?? makeRevalidateRecorder()
  const deps: MemberRouteDeps = {
    authGuard: fakeAuthGuard(opts.userId),
    getActorProfile: fakeActorProfiles(opts.actors ?? {}),
    db,
    revalidatePath: recorder.revalidatePath,
  }
  return { deps, db, recorder }
}

function memberJsonRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/site/members/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function seedMemberRow(db: FakeMemberDb, overrides: Partial<MemberRow> = {}): Promise<MemberRow> {
  const row: MemberRow = {
    id: randomUUID(),
    no: 1,
    is_revealed: false,
    photo_url: null,
    name: null,
    name_ja: null,
    name_zh: null,
    name_en: null,
    specialty_ja: null,
    specialty_zh: null,
    specialty_en: null,
    expected_reveal_on: '2026-12-01',
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
  db.rows.push(row)
  return row
}

// ── 1. 未登录 ──────────────────────────────────────────────────────────

test('未登录 GET /api/site/members 返回 401', async () => {
  const { deps } = makeMemberDeps({ userId: null })
  const result = await createMemberListHandler(deps)()
  assert.equal(result.status, 401)
})

test('未登录 PATCH /api/site/members/:no 返回 401', async () => {
  const { deps } = makeMemberDeps({ userId: null })
  const result = await createMemberPatchHandler(deps)(memberJsonRequest('PATCH', { is_revealed: false }), '1')
  assert.equal(result.status, 401)
})

// ── 2. 非管理员：读可以，写 403 ──────────────────────────────────────────

test('非管理员 GET 返回 200，且按 no 升序排列', async () => {
  const { deps, db } = makeMemberDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 3 })
  await seedMemberRow(db, { no: 1 })
  await seedMemberRow(db, { no: 2 })
  const result = await createMemberListHandler(deps)()
  assert.equal(result.status, 200)
  const body = result.body as { data: MemberRow[] }
  assert.deepEqual(body.data.map((r) => r.no), [1, 2, 3])
})

test('非管理员 PATCH 返回 403，数据库原值不变', async () => {
  const { deps, db } = makeMemberDeps({ userId: NON_ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { expected_reveal_on: '2026-10-01' }),
    '1',
  )
  assert.equal(result.status, 403)
  assert.equal(db.rows.find((r) => r.no === 1)?.expected_reveal_on, '2026-12-01')
})

// ── 3. 管理员 PATCH 合法字段成功 ─────────────────────────────────────────

test('管理员 PATCH 未公开卡位的预计公开日成功，updated_by_user_id=actor.id', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { expected_reveal_on: '2026-10-15' }),
    '1',
  )
  assert.equal(result.status, 200)
  const stored = db.rows.find((r) => r.no === 1)
  assert.equal(stored?.expected_reveal_on, '2026-10-15')
  assert.equal(stored?.updated_by_user_id, ADMIN_ID)
})

// ── 4. no / 审计字段是禁区 ───────────────────────────────────────────────

test('PATCH 提交 no 字段返回 400（forbidden_field），不落库', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { no: 2, expected_reveal_on: '2026-11-01' }),
    '1',
  )
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'forbidden_field')
  assert.equal(db.rows.find((r) => r.no === 1)?.expected_reveal_on, '2026-12-01')
})

test('PATCH 提交伪造的 updated_by_user_id 返回 400（forbidden_field），库中不出现该 UUID', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { updated_by_user_id: ATTACKER_ID }),
    '1',
  )
  assert.equal(result.status, 400)
  assert.notEqual(db.rows.find((r) => r.no === 1)?.updated_by_user_id, ATTACKER_ID)
})

// ── 5. 未知字段 ──────────────────────────────────────────────────────────

test('PATCH 未知字段返回 400，不产生部分更新', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, name_ja: '原名字' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { name_ja: '改过的名字', totally_unknown_field: 'x' }),
    '1',
  )
  assert.equal(result.status, 400)
  assert.equal(db.rows.find((r) => r.no === 1)?.name_ja, '原名字')
})

// ── 6. 跨字段业务约束（依赖"现有行 + patch"合并后的有效值）──────────────

test('已公开卡位缺 name/photo_url/specialty_ja 返回 400，且不产生部分更新', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, is_revealed: false, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { is_revealed: true }),
    '1',
  )
  assert.equal(result.status, 400)
  const body = result.body as { fields: Record<string, string> }
  assert.equal(body.fields.name, 'required_when_revealed')
  assert.equal(body.fields.photo_url, 'required_when_revealed')
  assert.equal(body.fields.specialty_ja, 'required_when_revealed')
  assert.equal(db.rows.find((r) => r.no === 1)?.is_revealed, false)
})

test('已公开卡位所有必填字段合并后齐全时可以成功公开', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, {
    no: 1,
    is_revealed: false,
    name: '既存の名前',
    photo_url: '/site/existing.webp',
    specialty_ja: '既存の特技',
    expected_reveal_on: '2026-12-01',
  })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { is_revealed: true }),
    '1',
  )
  assert.equal(result.status, 200)
  assert.equal(db.rows.find((r) => r.no === 1)?.is_revealed, true)
})

test('未公开卡位缺 expected_reveal_on 返回 400', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, {
    no: 1,
    is_revealed: true,
    name: '既存の名前',
    photo_url: '/site/existing.webp',
    specialty_ja: '既存の特技',
    expected_reveal_on: null,
  })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { is_revealed: false }),
    '1',
  )
  assert.equal(result.status, 400)
  const body = result.body as { fields: Record<string, string> }
  assert.equal(body.fields.expected_reveal_on, 'required_when_unrevealed')
})

// 回归测试：只改照片时不能误报已有日期缺失——校验必须读现有行的
// expected_reveal_on，而不是只看本次 patch 有没有带这个字段。
test('未公开卡位只 PATCH 照片时，不会误报已有的 expected_reveal_on 缺失', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, is_revealed: false, expected_reveal_on: '2026-12-01', photo_url: null })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { photo_url: '/site/new-photo.webp' }),
    '1',
  )
  assert.equal(result.status, 200)
  const stored = db.rows.find((r) => r.no === 1)
  assert.equal(stored?.photo_url, '/site/new-photo.webp')
  assert.equal(stored?.expected_reveal_on, '2026-12-01')
})

// 回归测试：optionalText() 的 `.optional()` 位置——同 news-service.ts 曾经
// 踩过的坑，成员的 PATCH 全是可选字段，影响面更大。只提交一个字段时，其余
// 未提及的选填字段必须保持原值不变。
test('PATCH 只提交一个字段时，其余未提及的选填字段（中英文姓名/特长）保持原值不变', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, {
    no: 1,
    is_revealed: true,
    name: 'KANO',
    photo_url: '/site/kano.webp',
    name_zh: '现有中文名', name_en: 'Existing English Name',
    specialty_ja: '既存の特技', specialty_zh: '现有中文特长', specialty_en: 'Existing English Specialty',
  })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { photo_url: '/site/kano-new.webp' }),
    '1',
  )
  assert.equal(result.status, 200)
  const stored = db.rows.find((r) => r.no === 1)
  assert.equal(stored?.photo_url, '/site/kano-new.webp')
  assert.equal(stored?.name, 'KANO')
  assert.equal(stored?.name_zh, '现有中文名')
  assert.equal(stored?.name_en, 'Existing English Name')
  assert.equal(stored?.specialty_zh, '现有中文特长')
  assert.equal(stored?.specialty_en, 'Existing English Specialty')
})

// ── 8. 非法卡位编号 ───────────────────────────────────────────────────────

test('PATCH 非法卡位编号（超出 1-12 范围）返回 400', async () => {
  const { deps, db } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1 })
  const result = await createMemberPatchHandler(deps)(memberJsonRequest('PATCH', { name_ja: 'x' }), '13')
  assert.equal(result.status, 400)
  const body = result.body as { error: string }
  assert.equal(body.error, 'invalid_no')
})

// ── 9. 失效标记：逐 locale 断言 /site 与 /site/vision 两条路径 ────────────

test('PATCH 成功后 revalidatePath 对每个 PUBLIC_SITE_LOCALES 都记录了 /site 与 /site/vision', async () => {
  const { deps, db, recorder } = makeMemberDeps({ userId: ADMIN_ID, actors: ACTORS })
  await seedMemberRow(db, { no: 1, expected_reveal_on: '2026-12-01' })
  const result = await createMemberPatchHandler(deps)(
    memberJsonRequest('PATCH', { expected_reveal_on: '2026-11-01' }),
    '1',
  )
  assert.equal(result.status, 200)

  const paths = recorder.calls.map((c) => c.path)
  for (const locale of PUBLIC_SITE_LOCALES) {
    assert.ok(paths.includes(`/${locale}/site`), `missing /${locale}/site`)
    assert.ok(paths.includes(`/${locale}/site/vision`), `missing /${locale}/site/vision`)
  }
  // 2 条路径 × PUBLIC_SITE_LOCALES 个 locale，不多不少（brief 指定路径，与
  // 新闻的三条不同——成员没有独立列表页）。
  assert.equal(paths.length, PUBLIC_SITE_LOCALES.length * 2)
})
