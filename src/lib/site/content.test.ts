import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMembers, membersFromQuery, MEMBER_SLOTS, type SiteMemberRow } from './content.ts'
import { MEMBER_SEED } from '../../../scripts/site-content-seed-data.mjs'

// ── 用 scripts/site-content-seed-data.mjs 的 MEMBER_SEED 作为"读库渲染是否
// 正确"的基准 ──────────────────────────────────────────────────────────────
// Task 12 把成员从 i18n 数组（site.members.list[]）改读 site_members 表，
// 删 key 前用这份测试证明新的 buildMembers（消费库行分列的
// name_ja/name_zh/name_en + specialty_*）能逐字节重建出当时 messages 里的
// role 文案——本文件不再直接读 messages/*.json（那份 key 已随本任务删除），
// 改用 MEMBER_SEED：它就是当初从 messages 抄出来、写进 site_members 表的
// 那份原始抄本（scripts/seed-site-content.mjs 用它 upsert 真实数据），删 key
// 之后仍然是"当年 i18n 文案长什么样"这件事唯一存活的书面记录。
// （尤其 3 号 LULU：ja 用片假名「ルル」、zh 用汉字「露露」，两种不同书写
// 系统，不是简繁变体，这也是 name_zh 这一列存在的全部理由。）
const SEED = MEMBER_SEED as { no: number; name: string; photoUrl: string; role: { ja: string; zh: string; en: string } }[]

// ja/zh 用全角"／"，en 用半角" / "——与 scripts/seed-site-content.mjs 的
// SPLITTERS 互为逆操作（本文件的 joinNameAndSpecialty 就是它的逆函数）。
const SPLITTERS: Record<'ja' | 'zh' | 'en', (value: string) => string[]> = {
  ja: (value) => value.split('／'),
  zh: (value) => value.split('／'),
  en: (value) => value.split(/\s+\/\s+/),
}

function emptyRow(no: number): SiteMemberRow {
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
    expected_reveal_on: '2026-12-01',
  }
}

test('12 个卡位补齐，未公开卡位显示占位', () => {
  const rows: SiteMemberRow[] = Array.from({ length: 12 }, (_, i) => emptyRow(i + 1))
  rows[0] = {
    ...rows[0],
    is_revealed: true,
    name: 'KANO',
    name_ja: '花乃',
    specialty_ja: '罠',
    photo_url: '/p.webp',
  }
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members.length, 12)
  assert.equal(members[0].name, 'KANO')
  assert.equal(members[0].image, '/p.webp')
  assert.equal(members[11].name, '— 公開前 —')
})

test('未公开卡位用该行的预计公开时间，而不是全局写死的文案', () => {
  const rows = [
    {
      no: 9,
      is_revealed: false,
      name: null,
      name_ja: null,
      name_en: null,
      name_zh: null,
      specialty_ja: null,
      specialty_zh: null,
      specialty_en: null,
      photo_url: null,
      expected_reveal_on: '2026-12-01',
    },
  ]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members[8].role, '2026-12')
})

test('未公开卡位日期为空时显示明确 fallback，而不是空字符串', () => {
  const rows = [
    {
      no: 9,
      is_revealed: false,
      name: null,
      name_ja: null,
      name_en: null,
      name_zh: null,
      specialty_ja: null,
      specialty_zh: null,
      specialty_en: null,
      photo_url: null,
      expected_reveal_on: null,
    },
  ]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members[8].role, '— 公开时间未定 —')
})

test('查询结果里完全缺失的卡位（rows 没有该 no）与显式未公开一样处理，不让网格缺角', () => {
  // 只传 no.1，其余 11 个卡位在 rows 里完全不存在（不是显式 is_revealed:false）
  const rows: SiteMemberRow[] = [
    {
      no: 1,
      is_revealed: true,
      name: 'KANO',
      name_ja: '花乃',
      name_zh: null,
      name_en: null,
      specialty_ja: '罠',
      specialty_zh: null,
      specialty_en: null,
      photo_url: '/p.webp',
      expected_reveal_on: null,
    },
  ]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members.length, MEMBER_SLOTS)
  assert.equal(members[1].name, '— 公開前 —')
  assert.equal(members[1].role, '— 公开时间未定 —')
  assert.equal(members[1].image, undefined)
})

test('已公开卡位没有配图时不渲染 image（不用别的卡位的图顶替）', () => {
  const rows: SiteMemberRow[] = [
    {
      no: 1,
      is_revealed: true,
      name: 'KANO',
      name_ja: '花乃',
      name_zh: null,
      name_en: null,
      specialty_ja: '罠',
      specialty_zh: null,
      specialty_en: null,
      photo_url: null,
      expected_reveal_on: null,
    },
  ]
  const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
  assert.equal(members[0].image, undefined)
})

test(
  '已公开卡位 name_ja 为 NULL 时（合法数据，非异常）role 回退到罗马字 name',
  () => {
    // 这不是"异常历史数据"的兜底，而是当前生产可达的正常操作路径：
    // `site_members_revealed_fields` 约束（supabase/migrations/
    // 20260814112723_site_content.sql:104-111）与 `validateEffectiveMember`
    // （src/lib/site/members-service.ts:177-184）都只要求已公开卡位的
    // `name`/`photo_url`/`specialty_ja` 非空——两处都没有约束 `name_ja`。
    // 管理员完全可以合法地填了罗马字名、照片、日文特长,但漏填 name_ja,
    // DB 和应用层都不会拦。这条测试断言的就是那条路径下的实际回退行为：
    // pickLocaleText 的 ja 参数用 `row.name_ja ?? row.name ?? ''` 兜底,
    // name_ja 缺失时不留白、不崩，而是显示罗马字卡片名。
    //
    // 「已公开成员是否必须有日文名」是产品决定，不在本任务改约束——这里只是
    // 如实测试当前约束下代码的实际行为，供下一个改约束或改回退逻辑的人参考。
    const rows: SiteMemberRow[] = [
      {
        no: 1,
        is_revealed: true,
        name: 'KANO',
        name_ja: null,
        name_zh: null,
        name_en: null,
        specialty_ja: '罠',
        specialty_zh: null,
        specialty_en: null,
        photo_url: '/p.webp',
        expected_reveal_on: null,
      },
    ]
    const members = buildMembers(rows, 'ja', '— 公開前 —', '— 公开时间未定 —')
    assert.equal(members[0].name, 'KANO')
    assert.equal(members[0].role, 'KANO／罠')
  },
)

test(
  'buildMembers 重建的 name/role 与 MEMBER_SEED（当年 messages/*.json 成员文案的原始抄本）' +
    '逐字节一致——尤其 3 号 LULU 的 zh 名「露露」不能回退成 ja 的「ルル」',
  () => {
    assert.equal(SEED.length, 8)

    const rows: SiteMemberRow[] = SEED.map((item) => {
      const [nameJa, specialtyJa] = SPLITTERS.ja(item.role.ja)
      const [nameZh, specialtyZh] = SPLITTERS.zh(item.role.zh)
      const [nameEn, specialtyEn] = SPLITTERS.en(item.role.en)
      return {
        no: item.no,
        is_revealed: true,
        photo_url: item.photoUrl,
        name: item.name,
        name_ja: nameJa.trim(),
        name_zh: nameZh.trim(),
        name_en: nameEn.trim(),
        specialty_ja: specialtyJa.trim(),
        specialty_zh: specialtyZh.trim(),
        specialty_en: specialtyEn.trim(),
        expected_reveal_on: null,
      }
    })

    // 专门核实 3 号 LULU：zh 姓名必须是汉字「露露」，不能是 ja 的片假名「ルル」，
    // 也不能是 en 罗马字「Lulu」——三种书写系统必须各自独立保留。
    const lulu = rows.find((r) => r.no === 3)
    assert.equal(lulu?.name_ja, 'ルル')
    assert.equal(lulu?.name_zh, '露露')
    assert.equal(lulu?.name_en, 'Lulu')

    for (const locale of ['ja', 'zh', 'en'] as const) {
      const members = buildMembers(rows, locale, 'UNUSED_UNREVEALED_NAME', 'UNUSED_SCHEDULE_UNKNOWN')
      SEED.forEach((item, i) => {
        assert.equal(members[i].name, item.name, `member no.${item.no} name mismatch for locale=${locale}`)
        assert.equal(members[i].role, item.role[locale], `member no.${item.no} role mismatch for locale=${locale}`)
      })
    }
  },
)

test('membersFromQuery：查询成功时按 locale 转换全部 12 行', () => {
  const rows: SiteMemberRow[] = Array.from({ length: 12 }, (_, i) => emptyRow(i + 1))
  rows[0] = { ...rows[0], is_revealed: true, name: 'KANO', name_ja: '花乃', specialty_ja: '罠', photo_url: '/p.webp' }

  const errors: unknown[] = []
  const members = membersFromQuery(
    'ja',
    { data: rows, error: null },
    { unrevealedName: '— 公開前 —', unrevealedScheduleUnknown: '— 公开时间未定 —' },
    (error) => errors.push(error),
  )

  assert.equal(members.length, 12)
  assert.equal(members[0].name, 'KANO')
  assert.equal(errors.length, 0)
})

test('membersFromQuery：查询失败时降级为 12 个未公开占位卡位，并把错误交给 onQueryError，不 throw', () => {
  const errors: unknown[] = []
  const members = membersFromQuery(
    'ja',
    { data: null, error: { code: '500', message: 'boom' } },
    { unrevealedName: '— 公開前 —', unrevealedScheduleUnknown: '— 公开时间未定 —' },
    (error) => errors.push(error),
  )

  assert.equal(members.length, 12)
  assert.ok(members.every((m) => m.name === '— 公開前 —'))
  assert.ok(members.every((m) => m.role === '— 公开时间未定 —'))
  assert.deepEqual(errors, [{ code: '500', message: 'boom' }])
})
