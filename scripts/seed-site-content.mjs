// 官网新闻 / 成员的一次性内容搬迁脚本（Task 8）。
//
// 现有的 5 篇新闻与 8 位成员写在 messages/*.json 里，本脚本把它们的字面量
// 抄本（scripts/site-content-seed-data.mjs）写进 site_news / site_members
// 两张表（Task 7 已建好）。只从 fixture 读取内容与图片路径，不 import 任何
// UI 层的私有展示常量。
//
// 这是一次性前置步骤（Task 8），不是幂等的定期任务：`upsert(onConflict)` 全列
// 覆盖，回读断言比对的又是同一份硬编码 fixture（NEWS_SEED/MEMBER_SEED），所以
// 上线后重跑会静默把运营在后台做的编辑（下架的文章重新上线、公开的成员打回
// 未公开、姓名照片清空……）覆盖回 seed 时的初始状态，还会打印 `Done.` 正常
// 退出——没有任何报错信号。这正是评审 Important 2 指出的问题：本脚本现在默认
// 拒绝在目标表已有数据时执行，除非显式传 `--force`（仍然不建议——上线后需要
// 重新灌内容应该走后台 CRUD，不是这个脚本）。
//
// 上线后不要重跑。Run: node --env-file=.env.local scripts/seed-site-content.mjs

import { createClient } from '@supabase/supabase-js'
import {
  NEWS_SEED,
  MEMBER_SEED,
  UNREVEALED_MEMBER_NOS,
  UNREVEALED_EXPECTED_REVEAL_ON,
} from './site-content-seed-data.mjs'

const FORCE = process.argv.includes('--force')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --env-file=.env.local scripts/seed-site-content.mjs')
  process.exit(1)
}

// 写入前先亮出连的是哪个项目——`node --env-file` 不会覆盖已经 export 过的同名
// shell 变量，误把 --env-file 指向的库当成生产库（或反过来）是现实风险，而
// 这个脚本此前从头到尾不打印它连的是哪个 host。
console.log(`Target Supabase project: ${new URL(url).host}`)

const supabase = createClient(url, key)

/**
 * 目标表非空时的重跑守卫。任一表已有行就拒绝执行——不区分"只有新闻脏了"
 * 还是"只有成员脏了"，因为两张表在同一次 run() 里先后写入，允许跑一半
 * 没有意义。`--force` 才能跳过，且跳过前仍打一条警告说明风险。
 */
async function guardAgainstRerun() {
  const [{ count: newsCount, error: newsErr }, { count: memberCount, error: memberErr }] = await Promise.all([
    supabase.from('site_news').select('*', { count: 'exact', head: true }),
    supabase.from('site_members').select('*', { count: 'exact', head: true }),
  ])
  if (newsErr || memberErr) {
    console.error('FATAL: 检查 site_news/site_members 是否已有数据时失败:', newsErr?.message ?? memberErr?.message)
    process.exit(1)
  }

  const dirty = (newsCount ?? 0) > 0 || (memberCount ?? 0) > 0
  if (!dirty) return

  if (!FORCE) {
    console.error(
      `FATAL: site_news 现有 ${newsCount} 行、site_members 现有 ${memberCount} 行——本脚本不是幂等的定期任务，\n` +
        '而是一次性内容搬迁脚本：upsert 会用写死的 fixture 全列覆盖已有行，运营在后台做的任何编辑\n' +
        '（下架的文章重新上线、已公开的成员被打回未公开且姓名/照片清空、updated_at 被触发器抹掉……）\n' +
        '都会被静默覆盖且退出码为 0。如果你确定要用 fixture 覆盖现有数据（例如刚建表、这些行本来\n' +
        '就是上一次 seed 留下的），加 --force 显式跳过这条检查；否则请改用后台 CRUD 编辑内容。',
    )
    process.exit(1)
  }
  console.warn(`WARN: --force 已传入，将覆盖 site_news 现有 ${newsCount} 行、site_members 现有 ${memberCount} 行。`)
}

// ── 三语拆分规则 ──────────────────────────────────────────────
//
// ja / zh 用全角 `／`，en 用 ASCII " / "。这两套规则不能合并成一个：
// 用同一个正则套三语会让 specialty_en（或反过来 specialty_ja/zh）整列错乱。
const SPLITTERS = {
  ja: (value) => value.split('／'),
  zh: (value) => value.split('／'),
  en: (value) => value.split(/\s+\/\s+/),
}

/**
 * 按 locale 拆分一条 role，恰好拆不成两段（含空白段）就直接退出——
 * 不猜测、不用宽松规则兜底继续写库。
 */
function splitRole(locale, no, value) {
  const parts = SPLITTERS[locale](value)
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    console.error(
      `FATAL: member no.${no} 的 role.${locale} 无法恰好拆成两段: ${JSON.stringify(value)} -> ${JSON.stringify(parts)}`,
    )
    process.exit(1)
  }
  return parts.map((part) => part.trim())
}

/** 对 MEMBER_SEED 全量跑一遍三种 locale 的拆分规则，任何一条失败都以非零码退出。 */
function assertAllRolesSplitCleanly() {
  for (const locale of Object.keys(SPLITTERS)) {
    for (const row of MEMBER_SEED) {
      splitRole(locale, row.no, row.role[locale])
    }
  }
}

// ── 新闻行 ────────────────────────────────────────────────────

function buildNewsRow(item) {
  return {
    slug: item.slug,
    tag: item.tag,
    category: item.category,
    published_on: item.publishedOn.replaceAll('.', '-'),
    image_url: item.imageUrl ?? null,
    is_published: true,
    title_ja: item.title.ja,
    title_zh: item.title.zh,
    title_en: item.title.en,
    lead_ja: item.lead.ja,
    lead_zh: item.lead.zh,
    lead_en: item.lead.en,
    body_ja: item.body.ja.join('\n\n'),
    body_zh: item.body.zh.join('\n\n'),
    body_en: item.body.en.join('\n\n'),
  }
}

// ── 成员行 ────────────────────────────────────────────────────

function buildRevealedMemberRow(item) {
  const [nameJa, specialtyJa] = splitRole('ja', item.no, item.role.ja)
  // zh 的左段（名字）不能丢：多数成员与 ja 是同一个词的繁简变体，但 3 号
  // LULU 的 zh「露露」（汉字）与 ja「ルル」（片假名音译）是不同的写法，
  // 只留 ja 会把「露露」永久丢弃——这正是 name_zh 这一列存在的理由。
  const [nameZh, specialtyZh] = splitRole('zh', item.no, item.role.zh)
  const [nameEn, specialtyEn] = splitRole('en', item.no, item.role.en)

  return {
    no: item.no,
    is_revealed: true,
    photo_url: item.photoUrl,
    name: item.name,
    name_ja: nameJa,
    name_zh: nameZh,
    name_en: nameEn,
    specialty_ja: specialtyJa,
    specialty_zh: specialtyZh,
    specialty_en: specialtyEn,
    expected_reveal_on: null,
  }
}

function buildUnrevealedMemberRow(no) {
  return {
    no,
    is_revealed: false,
    photo_url: null,
    name: null,
    name_ja: null,
    name_zh: null,
    name_en: null,
    specialty_ja: null,
    specialty_zh: null,
    specialty_en: null,
    expected_reveal_on: UNREVEALED_EXPECTED_REVEAL_ON,
  }
}

// ── 回读断言 ──────────────────────────────────────────────────
//
// 写入前算出完整的 expected rows，写入后立即 select 回读做深比较：验证的是
// 解析结果（拆分是否拆对了三语各自的字段），不是简单复述 seed 数组本身。

function assertNewsRoundTrip(expectedRows, actualRows) {
  const bySlug = new Map(actualRows.map((row) => [row.slug, row]))
  const expectedSlugs = expectedRows.map((row) => row.slug).sort()
  const actualSlugs = actualRows.map((row) => row.slug).sort()
  if (JSON.stringify(expectedSlugs) !== JSON.stringify(actualSlugs)) {
    console.error('FATAL: site_news slug 集合与 fixture 不一致')
    console.error('expected:', expectedSlugs)
    console.error('actual:  ', actualSlugs)
    process.exit(1)
  }

  const fields = [
    'tag',
    'category',
    'published_on',
    'image_url',
    'is_published',
    'title_ja',
    'title_zh',
    'title_en',
    'lead_ja',
    'lead_zh',
    'lead_en',
    'body_ja',
    'body_zh',
    'body_en',
  ]

  for (const expected of expectedRows) {
    const actual = bySlug.get(expected.slug)
    for (const field of fields) {
      if (actual[field] !== expected[field]) {
        console.error(
          `FATAL: site_news[${expected.slug}].${field} 回读不一致\n  expected: ${JSON.stringify(expected[field])}\n  actual:   ${JSON.stringify(actual[field])}`,
        )
        process.exit(1)
      }
    }
  }
}

function assertMembersRoundTrip(expectedRows, actualRows) {
  const byNo = new Map(actualRows.map((row) => [row.no, row]))
  if (actualRows.length !== 12) {
    console.error(`FATAL: site_members 行数应为 12，实际 ${actualRows.length}`)
    process.exit(1)
  }

  const fields = [
    'is_revealed',
    'photo_url',
    'name',
    'name_ja',
    'name_zh',
    'name_en',
    'specialty_ja',
    'specialty_zh',
    'specialty_en',
    'expected_reveal_on',
  ]

  for (const expected of expectedRows) {
    const actual = byNo.get(expected.no)
    if (!actual) {
      console.error(`FATAL: site_members 缺少 no.${expected.no}`)
      process.exit(1)
    }
    for (const field of fields) {
      if (actual[field] !== expected[field]) {
        console.error(
          `FATAL: site_members[no.${expected.no}].${field} 回读不一致\n  expected: ${JSON.stringify(expected[field])}\n  actual:   ${JSON.stringify(actual[field])}`,
        )
        process.exit(1)
      }
    }
    // 未公开卡位必须真的没有 expected_reveal_on 之外的展示字段，公开卡位反之。
    if (expected.is_revealed && (!actual.name?.trim() || !actual.photo_url?.trim() || !actual.specialty_ja?.trim())) {
      console.error(`FATAL: site_members[no.${expected.no}] 已公开但展示字段为空`)
      process.exit(1)
    }
    if (!expected.is_revealed && !actual.expected_reveal_on) {
      console.error(`FATAL: site_members[no.${expected.no}] 未公开但 expected_reveal_on 为空`)
      process.exit(1)
    }
  }
}

async function run() {
  console.log('── Step 0: 检查目标表是否已有数据（重跑守卫） ──')
  await guardAgainstRerun()
  console.log('  OK: 可以继续')

  console.log('\n── Step 1: 验证三语拆分规则 ──')
  assertAllRolesSplitCleanly()
  console.log(`  OK: ${MEMBER_SEED.length} 个成员 × 3 种 locale 均恰好拆成两段`)

  const expectedNewsRows = NEWS_SEED.map(buildNewsRow)
  const expectedMemberRows = [
    ...MEMBER_SEED.map(buildRevealedMemberRow),
    ...UNREVEALED_MEMBER_NOS.map(buildUnrevealedMemberRow),
  ]

  console.log('\n── Step 2: upsert site_news（按 slug） ──')
  const { error: newsErr } = await supabase
    .from('site_news')
    .upsert(expectedNewsRows, { onConflict: 'slug' })
  if (newsErr) {
    console.error('FATAL: site_news upsert 失败:', newsErr.message)
    process.exit(1)
  }
  console.log(`  OK: upsert 了 ${expectedNewsRows.length} 条`)

  console.log('\n── Step 3: upsert site_members（按 no） ──')
  const { error: membersErr } = await supabase
    .from('site_members')
    .upsert(expectedMemberRows, { onConflict: 'no' })
  if (membersErr) {
    console.error('FATAL: site_members upsert 失败:', membersErr.message)
    process.exit(1)
  }
  console.log(`  OK: upsert 了 ${expectedMemberRows.length} 条`)

  console.log('\n── Step 4: 回读并深比较 ──')
  const { data: newsRows, error: newsSelectErr } = await supabase.from('site_news').select('*')
  if (newsSelectErr) {
    console.error('FATAL: site_news 回读失败:', newsSelectErr.message)
    process.exit(1)
  }
  assertNewsRoundTrip(expectedNewsRows, newsRows)
  console.log(`  OK: site_news 回读 ${newsRows.length} 行，逐字段一致`)

  const { data: memberRows, error: memberSelectErr } = await supabase.from('site_members').select('*')
  if (memberSelectErr) {
    console.error('FATAL: site_members 回读失败:', memberSelectErr.message)
    process.exit(1)
  }
  assertMembersRoundTrip(expectedMemberRows, memberRows)
  console.log(`  OK: site_members 回读 ${memberRows.length} 行，逐字段一致`)

  console.log('\nDone.')
}

run()
