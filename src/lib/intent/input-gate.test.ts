import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_INPUT_CHARS, sanitizeIntentText } from './input-gate.ts'

test('sanitizeIntentText 归一化全角字符（NFKC）', () => {
  const r = sanitizeIntentText('Ｑ３　薪资', MAX_INPUT_CHARS)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.text, 'Q3 薪资')
})

test('sanitizeIntentText 把控制字符换成空格并 trim', () => {
  // 控制字符必须写成转义序列。直接粘贴不可见字符的话，下一个人编辑这个文件
  // 时会把它弄丢，断言就永远过不了（或者更糟——变成永真）。
  const r = sanitizeIntentText('\x01新增\x07差旅\x1F', MAX_INPUT_CHARS)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.text, '新增 差旅')
})

test('sanitizeIntentText 空输入报 empty', () => {
  assert.deepEqual(sanitizeIntentText('   ', MAX_INPUT_CHARS), { ok: false, reason: 'empty' })
})

test('sanitizeIntentText 全是控制字符时报 empty_after_sanitize', () => {
  // \x01\x02 不是空白，trim 留得住，所以要走到 replace 之后才变空——
  // 与 reason: 'empty' 是两条不同的路径，别用 '' 测这一条。
  assert.deepEqual(
    sanitizeIntentText('\x01\x02', MAX_INPUT_CHARS),
    { ok: false, reason: 'empty_after_sanitize' },
  )
})

test('sanitizeIntentText 超长报 too_long 并带上原长度', () => {
  const raw = 'a'.repeat(MAX_INPUT_CHARS + 5)
  assert.deepEqual(
    sanitizeIntentText(raw, MAX_INPUT_CHARS),
    { ok: false, reason: 'too_long', length: MAX_INPUT_CHARS + 5 },
  )
})

test('sanitizeIntentText 长度上限按调用方传的值算（prior.outcome 收紧到 300）', () => {
  const raw = 'a'.repeat(301)
  const r = sanitizeIntentText(raw, 300)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'too_long')
})

test('模块级共享的 /g 正则不留 lastIndex 残留', () => {
  // CONTROL_CHARS 带 /g 且是模块级常量。若哪天有人改成用 .test() 复用它，
  // lastIndex 会残留、下一次调用漏掉开头的控制字符。连调两次同一输入必须
  // 得到同一结果——这就是那个回归的守卫。
  const a = sanitizeIntentText('\x01新增\x02', MAX_INPUT_CHARS)
  const b = sanitizeIntentText('\x01新增\x02', MAX_INPUT_CHARS)
  assert.deepEqual(a, b)
  assert.deepEqual(a, { ok: true, text: '新增' })
})
