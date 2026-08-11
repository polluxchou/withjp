import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateApplication,
  isBotSubmission,
  hashIp,
  LIMITS,
} from './application.ts'

const valid = {
  name: 'テスト 花子',
  age: 22,
  residence: '大阪市中央区',
  contact: 'line: hanako_test',
  experience: 'ダンス 5 年',
  consent: true,
  locale: 'ja',
}

test('accepts a complete application and trims whitespace', () => {
  const result = validateApplication({ ...valid, name: '  花子  ', residence: ' 大阪 ' })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.name, '花子')
  assert.equal(result.value.residence, '大阪')
  assert.equal(result.value.age, 22)
  assert.equal(result.value.locale, 'ja')
})

test('reports every missing required field at once', () => {
  const result = validateApplication({})
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fields.name, 'required')
  assert.equal(result.fields.residence, 'required')
  assert.equal(result.fields.contact, 'required')
  assert.equal(result.fields.age, 'required')
  assert.equal(result.fields.consent, 'consent')
})

test('treats whitespace-only strings as missing', () => {
  const result = validateApplication({ ...valid, name: '   ' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fields.name, 'required')
})

test('enforces length limits at the boundary', () => {
  const atLimit = validateApplication({ ...valid, name: 'あ'.repeat(LIMITS.name) })
  assert.equal(atLimit.ok, true)

  const overLimit = validateApplication({ ...valid, name: 'あ'.repeat(LIMITS.name + 1) })
  assert.equal(overLimit.ok, false)
  if (overLimit.ok) return
  assert.equal(overLimit.fields.name, 'tooLong')
})

test('enforces the experience limit but keeps it optional', () => {
  const empty = validateApplication({ ...valid, experience: '' })
  assert.equal(empty.ok, true)
  if (!empty.ok) return
  assert.equal(empty.value.experience, null)

  const tooLong = validateApplication({ ...valid, experience: 'x'.repeat(LIMITS.experience + 1) })
  assert.equal(tooLong.ok, false)
  if (tooLong.ok) return
  assert.equal(tooLong.fields.experience, 'tooLong')
})

test('accepts age as a numeric string but rejects non-numeric input', () => {
  const asString = validateApplication({ ...valid, age: '22' })
  assert.equal(asString.ok, true)
  if (!asString.ok) return
  assert.equal(asString.value.age, 22)

  for (const bad of ['twenty', '22歳', '2.5', {}, true]) {
    const result = validateApplication({ ...valid, age: bad })
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`)
    if (result.ok) continue
    assert.equal(result.fields.age, 'invalidAge')
  }
})

test('enforces the age range at both boundaries', () => {
  assert.equal(validateApplication({ ...valid, age: LIMITS.ageMin }).ok, true)
  assert.equal(validateApplication({ ...valid, age: LIMITS.ageMax }).ok, true)

  for (const bad of [LIMITS.ageMin - 1, LIMITS.ageMax + 1]) {
    const result = validateApplication({ ...valid, age: bad })
    assert.equal(result.ok, false)
    if (result.ok) continue
    assert.equal(result.fields.age, 'outOfRange')
  }
})

test('requires consent', () => {
  for (const bad of [false, undefined, 'true']) {
    const result = validateApplication({ ...valid, consent: bad })
    assert.equal(result.ok, false)
    if (result.ok) continue
    assert.equal(result.fields.consent, 'consent')
  }
})

test('only accepts the three shipped locales', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    assert.equal(validateApplication({ ...valid, locale }).ok, true)
  }
  const result = validateApplication({ ...valid, locale: 'ko' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fields.locale, 'required')
})

test('flags a filled honeypot as a bot', () => {
  assert.equal(isBotSubmission({ hp: 'https://spam.example', elapsedMs: 9000 }), true)
  assert.equal(isBotSubmission({ hp: '', elapsedMs: 9000 }), false)
  assert.equal(isBotSubmission({ elapsedMs: 9000 }), false)
})

test('flags submissions that arrive faster than a human can type', () => {
  assert.equal(isBotSubmission({ elapsedMs: LIMITS.minElapsedMs - 1 }), true)
  assert.equal(isBotSubmission({ elapsedMs: LIMITS.minElapsedMs }), false)
})

test('treats a missing or unusable timestamp as a bot', () => {
  // 我们自己的表单一定会带上 elapsedMs；不带的客户端就不是我们的表单。
  assert.equal(isBotSubmission({}), true)
  assert.equal(isBotSubmission({ elapsedMs: 'soon' }), true)
  assert.equal(isBotSubmission({ elapsedMs: Number.NaN }), true)
})

test('hashes IPs deterministically and salt-dependently', () => {
  const a = hashIp('203.0.113.7', 'salt-a')
  assert.equal(a, hashIp('203.0.113.7', 'salt-a'))
  assert.notEqual(a, hashIp('203.0.113.8', 'salt-a'))
  assert.notEqual(a, hashIp('203.0.113.7', 'salt-b'))
  assert.match(a, /^[0-9a-f]{64}$/)
  // 原始 IP 不得出现在结果里 —— 我们存的是限流用的指纹，不是可回溯的地址
  assert.equal(a.includes('203'), false)
})
