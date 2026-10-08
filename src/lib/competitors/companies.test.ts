// src/lib/competitors/companies.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assembleCompanyBoard, latestSnapshotByCompetitor, normalizeCapital, normalizeSources, websiteLabel,
} from './companies.ts'
import type { CompanyAccountRow, CompanyCompetitorInput, CompetitorCompany } from './companies.ts'

function company(id: string, name: string, sort_order = 0, extra: Partial<CompetitorCompany> = {}): CompetitorCompany {
  return {
    id, name, legal_name: null, website: null, location: '', group_format: '', scale: '',
    capital_background: 'unknown', capital_note: '', recruit_note: '', note: '', sources: [],
    info_as_of: null, sort_order, ...extra,
  }
}

function link(
  id: string, company_id: string, group_name: string,
  competitor_id: string | null = null, handle: string | null = null, sort_order = 0,
): CompanyAccountRow {
  return { id, company_id, group_name, handle, competitor_id, note: '', sort_order }
}

function comp(id: string, handle: string, parent_id: string | null = null): CompanyCompetitorInput {
  return { id, handle, display_name: handle.toUpperCase(), parent_id }
}

test('assembleCompanyBoard: 团挂到所属公司下，已追踪的团带上最新粉丝数', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'GGTK')],
    [link('l1', 'co1', '1MB Twinkle', 'c1', '1mb.twinkle')],
    [comp('c1', '1mb.twinkle')],
    [
      { competitor_id: 'c1', captured_on: '2026-09-28', followers: 100 },
      { competitor_id: 'c1', captured_on: '2026-10-05', followers: 120 },
    ],
  )
  assert.equal(board.companies.length, 1)
  const acc = board.companies[0].accounts[0]
  assert.equal(acc.group_name, '1MB Twinkle')
  assert.deepEqual(acc.tracked, {
    competitor_id: 'c1', handle: '1mb.twinkle', display_name: '1MB.TWINKLE', avatar_url: null,
    followers: 120, likes: null, followers_on: '2026-10-05',
  })
  assert.deepEqual(board.unassigned, [])
})

test('assembleCompanyBoard: 头像与获赞跟着追踪账号走，获赞取同一条最新快照', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'TOST')],
    [link('l1', 'co1', 'Solulune', 'c1')],
    [{ ...comp('c1', 'solulune.jp'), avatar_url: ' https://x.supabase.co/a.jpeg ' }],
    [
      { competitor_id: 'c1', captured_on: '2026-09-01', followers: 1, likes: 999 },
      { competitor_id: 'c1', captured_on: '2026-09-16', followers: 27400, likes: 192200 },
    ],
  )
  const t = board.companies[0].accounts[0].tracked
  assert.equal(t?.avatar_url, 'https://x.supabase.co/a.jpeg')
  assert.equal(t?.likes, 192200)
})

test('assembleCompanyBoard: 空白头像当没有头像', () => {
  const board = assembleCompanyBoard([], [], [{ ...comp('c1', 'a'), avatar_url: '   ' }], [])
  assert.equal(board.unassigned[0].avatar_url, null)
})

test('assembleCompanyBoard: 角标取关联行的 highlight，缺列或空白时为 null', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'GGTK')],
    [
      { ...link('l1', 'co1', 'A', null, null, 1), highlight: 'Diamond #1' },
      { ...link('l2', 'co1', 'B', null, null, 2), highlight: '  ' },
      link('l3', 'co1', 'C', null, null, 3),
    ],
    [],
    [],
  )
  assert.deepEqual(board.companies[0].accounts.map((a) => a.highlight), ['Diamond #1', null, null])
})

test('assembleCompanyBoard: 公司粉丝合计只算有数据的已追踪团，一个都没有时为 null', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'GGTK', 1), company('co2', 'MaGo', 2)],
    [
      link('l1', 'co1', 'A', 'c1'), link('l2', 'co1', 'B', 'c2'), link('l3', 'co1', 'C', 'c3'),
      link('l4', 'co1', 'Untracked'), link('l5', 'co2', 'Kiwii Girls'),
    ],
    [comp('c1', 'a'), comp('c2', 'b'), comp('c3', 'c')],
    [
      { competitor_id: 'c1', captured_on: '2026-09-16', followers: 100 },
      { competitor_id: 'c2', captured_on: '2026-09-16', followers: 23 },
      { competitor_id: 'c3', captured_on: '2026-09-16', followers: null },
    ],
  )
  assert.equal(board.companies[0].follower_total, 123)
  assert.equal(board.companies[1].follower_total, null)
})

test('assembleCompanyBoard: 官网只放行 http(s)', () => {
  const board = assembleCompanyBoard(
    [
      company('a', 'Ok', 1, { website: ' https://ggtk.jp/ ' }),
      company('b', 'Js', 2, { website: 'javascript:alert(1)' }),
      company('c', 'Bare', 3, { website: 'tostost.com' }),
      company('d', 'None', 4),
    ],
    [], [], [],
  )
  assert.deepEqual(board.companies.map((c) => c.website), ['https://ggtk.jp/', null, null, null])
})

test('assembleCompanyBoard: 没进追踪清单的团照样挂在公司下，tracked 为 null', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'MaGo')],
    [link('l1', 'co1', 'Kiwii Girls')],
    [],
    [],
  )
  const acc = board.companies[0].accounts[0]
  assert.equal(acc.group_name, 'Kiwii Girls')
  assert.equal(acc.tracked, null)
  assert.equal(acc.handle, null)
})

test('assembleCompanyBoard: 没有关联行的追踪主账号进未归属，子主播不算', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'TOST')],
    [link('l1', 'co1', 'Solulune', 'c1')],
    [comp('c1', 'solulune.jp'), comp('c2', 'truecolor1003'), comp('k1', 'katoeri', 'c1')],
    [],
  )
  assert.deepEqual(board.unassigned.map((a) => a.handle), ['truecolor1003'])
})

test('assembleCompanyBoard: 关联指向子主播或已删竞品时不算追踪，也不把它挤出未归属', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'X')],
    [link('l1', 'co1', 'A', 'k1', 'katoeri'), link('l2', 'co1', 'B', 'gone', 'old.handle')],
    [comp('c1', 'solulune.jp'), comp('k1', 'katoeri', 'c1')],
    [],
  )
  const [a, b] = board.companies[0].accounts
  assert.equal(a.tracked, null)
  assert.equal(a.handle, 'katoeri')
  assert.equal(b.tracked, null)
  assert.equal(b.handle, 'old.handle')
  assert.deepEqual(board.unassigned.map((x) => x.handle), ['solulune.jp'])
})

test('assembleCompanyBoard: handle 以追踪表为准（对方改过 id 时关联行里是旧的）', () => {
  const board = assembleCompanyBoard(
    [company('co1', 'X')],
    [link('l1', 'co1', 'A', 'c1', 'old.handle')],
    [comp('c1', 'new.handle')],
    [],
  )
  assert.equal(board.companies[0].accounts[0].handle, 'new.handle')
})

test('assembleCompanyBoard: 公司按 sort_order 再按名字排，团同理', () => {
  // Aardvark 名字最靠前但 sort_order 最大：只按名字排会把它排到第一。
  const board = assembleCompanyBoard(
    [company('a', 'Zeta', 20), company('b', 'Beta', 10), company('c', 'Alpha', 10), company('d', 'Aardvark', 30)],
    [link('l1', 'b', 'Second', null, null, 2), link('l2', 'b', 'First', null, null, 1), link('l3', 'b', 'AlsoFirst', null, null, 1)],
    [],
    [],
  )
  assert.deepEqual(board.companies.map((c) => c.name), ['Alpha', 'Beta', 'Zeta', 'Aardvark'])
  assert.deepEqual(board.companies[1].accounts.map((a) => a.group_name), ['AlsoFirst', 'First', 'Second'])
})

test('assembleCompanyBoard: 未归属按粉丝降序，没数据的垫底并按 handle 排', () => {
  const board = assembleCompanyBoard(
    [],
    [],
    [comp('c1', 'bbb'), comp('c2', 'aaa'), comp('c3', 'small'), comp('c4', 'big')],
    [
      { competitor_id: 'c3', captured_on: '2026-10-01', followers: 10 },
      { competitor_id: 'c4', captured_on: '2026-10-01', followers: 999 },
      { competitor_id: 'c1', captured_on: '2026-10-01', followers: null },
    ],
  )
  assert.deepEqual(board.unassigned.map((a) => a.handle), ['big', 'small', 'aaa', 'bbb'])
  assert.equal(board.unassigned[3].followers_on, '2026-10-01')
})

test('assembleCompanyBoard: 没粉丝数据的账号无论输入顺序如何都排在有数据的后面', () => {
  for (const order of [['c1', 'c2'], ['c2', 'c1']]) {
    const all = { c1: comp('c1', 'nodata'), c2: comp('c2', 'hasdata') } as Record<string, CompanyCompetitorInput>
    const board = assembleCompanyBoard(
      [],
      [],
      order.map((id) => all[id]),
      [{ competitor_id: 'c2', captured_on: '2026-10-01', followers: 5 }],
    )
    assert.deepEqual(board.unassigned.map((a) => a.handle), ['hasdata', 'nodata'], `input order ${order}`)
  }
})

test('assembleCompanyBoard: 公司的脏枚举与脏 sources 被清洗', () => {
  const dirty = company('co1', 'X', 0, {
    capital_background: 'chinese' as never,
    sources: [{ label: 'ok', url: 'https://a.jp' }, { label: '', url: 'https://b.jp' }, { label: 'js', url: 'javascript:alert(1)' }] as never,
  })
  const board = assembleCompanyBoard([dirty], [], [], [])
  assert.equal(board.companies[0].capital_background, 'unknown')
  assert.deepEqual(board.companies[0].sources, [{ label: 'ok', url: 'https://a.jp' }])
})

test('websiteLabel: 只留域名并去掉 www.，解析失败原样返回', () => {
  assert.equal(websiteLabel('https://www.mago-audition.com/'), 'mago-audition.com')
  assert.equal(websiteLabel('https://jamcn.live/?lang=ja'), 'jamcn.live')
  assert.equal(websiteLabel('not a url'), 'not a url')
})

test('normalizeCapital: 合法值原样返回，其余归为 unknown', () => {
  assert.equal(normalizeCapital('confirmed'), 'confirmed')
  assert.equal(normalizeCapital('none_seen'), 'none_seen')
  assert.equal(normalizeCapital(null), 'unknown')
  assert.equal(normalizeCapital('CONFIRMED'), 'unknown')
})

test('normalizeSources: 非数组返回空，丢掉非对象项', () => {
  assert.deepEqual(normalizeSources(null), [])
  assert.deepEqual(normalizeSources('x'), [])
  assert.deepEqual(normalizeSources([null, 1, { label: ' L ', url: 'http://x.jp' }]), [{ label: 'L', url: 'http://x.jp' }])
})

test('latestSnapshotByCompetitor: 取日期最大的一条，同日保留先出现的', () => {
  const m = latestSnapshotByCompetitor([
    { competitor_id: 'c1', captured_on: '2026-10-01', followers: 1 },
    { competitor_id: 'c1', captured_on: '2026-10-03', followers: 3 },
    { competitor_id: 'c1', captured_on: '2026-10-03', followers: 4 },
    { competitor_id: 'c1', captured_on: '2026-10-02', followers: 2 },
  ])
  assert.equal(m.get('c1')?.followers, 3)
})
