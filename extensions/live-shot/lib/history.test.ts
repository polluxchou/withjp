import assert from 'node:assert/strict'
import test from 'node:test'

import { historyOutcome, readErrorMessage, readHistoryModal } from './history.js'

const MODAL = "SAMPLE's LIVE\nFan Club\nLv.1\n161\nWatch LIVE\n\nHistory\n\nNov\n8\n\nDance\n\nSunday, 8:03 PM - 10:57 PM · 265.5K likes\n"

// 假 document：modal 为 null 表示弹窗还没开；点头像后 openAfter 次轮询才出现
function fakeDoc({ modalText = null as string | null, avatar = true, openAfter = 1 } = {}) {
  let text = modalText
  let polls = 0
  let clicked = 0
  const modal = { get innerText() { return text } }
  const doc = {
    clicked: () => clicked,
    querySelectorAll: (sel: string) => {
      assert.equal(sel, '[class*="tux-modal__container"]')
      if (text === null && clicked > 0 && ++polls >= openAfter) text = MODAL
      return text === null ? [] : [{ innerText: 'Some other dialog' }, modal]
    },
    querySelector: (sel: string) => {
      assert.equal(sel, '[data-e2e="room-header-anchor-avatar"]')
      return avatar ? { click: () => { clicked += 1 } } : null
    },
  }
  return doc
}
const noWait = async () => {}

test('readHistoryModal：弹窗已开着就直接读，只交 History 起的部分、去空行，不点头像', async () => {
  const doc = fakeDoc({ modalText: MODAL })
  const r = await readHistoryModal(doc as unknown as Document, noWait)
  assert.equal(r.text, 'History\nNov\n8\nDance\nSunday, 8:03 PM - 10:57 PM · 265.5K likes')
  assert.equal(r.opened, false)
  assert.equal(typeof r.timeZone, 'string')
  assert.equal(doc.clicked(), 0)
})

test('readHistoryModal：弹窗没开就点头像，等它出现再读', async () => {
  const doc = fakeDoc({ openAfter: 3 })
  const r = await readHistoryModal(doc as unknown as Document, noWait)
  assert.equal(doc.clicked(), 1)
  assert.equal(r.opened, true)
  assert.match(r.text!, /^History\nNov\n8/)
})

test('readHistoryModal：没头像 / 点了不出弹窗 / 弹窗里没有记录', async () => {
  assert.deepEqual(await readHistoryModal(fakeDoc({ avatar: false }) as unknown as Document, noWait), { error: 'no_avatar' })
  assert.deepEqual(await readHistoryModal(fakeDoc({ openAfter: 999 }) as unknown as Document, noWait), { error: 'no_modal' })
  const empty = fakeDoc({ modalText: 'Fan Club\nHistory\n\n' })
  assert.deepEqual(await readHistoryModal(empty as unknown as Document, noWait), { error: 'no_history' })
  for (const code of ['no_avatar', 'no_modal', 'no_history', 'whatever']) assert.ok(readErrorMessage(code))
})

test('historyOutcome：成功 → 场数与日期范围、新增/已有；有跳过的另起一行', () => {
  const ok = historyOutcome({ status: 200, body: { data: { parsed: 81, first_date: '2026-08-11', last_date: '2026-11-08', inserted: 3, updated: 78, skipped: 0 }, error: null } }, 'sample.jp')
  assert.deepEqual(ok, { kind: 'ok', lines: [{ text: '✓ 读到 81 场 · 8/11 → 11/8', tone: 'ok' }, { text: '新增 3 · 已有 78', tone: '' }] })
  const sk = historyOutcome({ status: 200, body: { data: { parsed: 5, first_date: '2026-11-01', last_date: '2026-11-08', inserted: 0, updated: 3, skipped: 2 } } }, 'x')
  assert.equal(sk.lines.length, 3)
  assert.equal(sk.lines[2].tone, 'warn')
})

test('historyOutcome：401 要重新登录；其它错误给一句话', () => {
  assert.equal(historyOutcome({ status: 401, body: { error: 'unauthorized' } }, 'x').kind, 'login')
  const msg = (status: number, error: string) => historyOutcome({ status, body: { data: null, error } }, 'sample.jp').lines[0].text
  assert.equal(msg(404, 'not_in_library'), '@sample.jp 不在竞品库')
  assert.match(msg(422, 'no_sessions'), /英文/)
  assert.match(msg(403, 'forbidden'), /权限/)
  assert.match(msg(0, 'network_error'), /网络/)
  assert.match(msg(500, 'db_error'), /导入失败/)
  assert.equal(historyOutcome(null, 'x').kind, 'error')
})
