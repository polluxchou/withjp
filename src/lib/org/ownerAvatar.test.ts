import assert from 'node:assert/strict'
import test from 'node:test'

import { AVATAR_TONES, ownerInitials, ownerTone } from './ownerAvatar.ts'
import type { OwnerKey } from './quadrant.ts'

// 名字全是虚构的占位名。

test('ownerInitials: 空值、空串、纯空白 → null', () => {
  assert.equal(ownerInitials(null), null)
  assert.equal(ownerInitials(undefined), null)
  assert.equal(ownerInitials(''), null)
  assert.equal(ownerInitials('   '), null)
  assert.equal(ownerInitials('　\t\n'), null)
})

test('ownerInitials: 汉字取第一个字（姓），不管后面有几个字、有没有空格', () => {
  assert.equal(ownerInitials('张三'), '张')
  assert.equal(ownerInitials('山田太郎'), '山')
  assert.equal(ownerInitials('山田　太郎'), '山')
  assert.equal(ownerInitials('欧阳 小明'), '欧')
})

test('ownerInitials: 平假名、片假名（含半角）取第一个字', () => {
  assert.equal(ownerInitials('さくら'), 'さ')
  assert.equal(ownerInitials('カタカナ'), 'カ')
  assert.equal(ownerInitials('ｻｸﾗ'), 'ｻ')
  // 带空格的姓名：只取第一个字，不能按拉丁规则拼成两个字
  assert.equal(ownerInitials('やまだ たろう'), 'や')
  assert.equal(ownerInitials('ヤマダ タロウ'), 'ヤ')
})

test('ownerInitials: 韩文同汉字处理，一个音节就是一个字', () => {
  assert.equal(ownerInitials('홍길동'), '홍')
  assert.equal(ownerInitials('홍 길동'), '홍')
})

test('ownerInitials: 拉丁字母取前两个词的首字母并大写，一个词只取一个字母', () => {
  assert.equal(ownerInitials('Jane Doe'), 'JD')
  assert.equal(ownerInitials('jane doe'), 'JD')
  assert.equal(ownerInitials('John Q Public'), 'JQ')
  assert.equal(ownerInitials('Jane'), 'J')
  assert.equal(ownerInitials('jane'), 'J')
  assert.equal(ownerInitials('  Jane   Doe  '), 'JD')
  assert.equal(ownerInitials('Jane　Doe'), 'JD')
})

test('ownerInitials: 只按空白分词，连字符、点号不拆', () => {
  assert.equal(ownerInitials('Mary-Jane Doe'), 'MD')
  assert.equal(ownerInitials('jane.doe'), 'J')
})

test('ownerInitials: 其他字母文字（西里尔、希腊）按拉丁规则', () => {
  assert.equal(ownerInitials('иван петров'), 'ИП')
  assert.equal(ownerInitials('ελένη'), 'Ε')
})

test('ownerInitials: 按字素取，组合附加符号不被切掉', () => {
  assert.equal(ownerInitials('élise doe'), 'ÉD')
  assert.equal(ownerInitials('Élise Doe'), 'ÉD')
})

test('ownerInitials: 大写会变长的字母（ß、连字）保持原样，不会挤成三个字母', () => {
  assert.equal(ownerInitials('ßeta Doe'), 'ßD')
  assert.equal(ownerInitials('ﬁona'), 'ﬁ')
})

test('ownerInitials: 开头的 emoji、符号、数字、标点、空白都跳过', () => {
  assert.equal(ownerInitials('🎉 Jane Doe'), 'JD')
  assert.equal(ownerInitials('👩‍💻Jane'), 'J')
  assert.equal(ownerInitials('🇯🇵 张三'), '张')
  assert.equal(ownerInitials('★张三'), '张')
  assert.equal(ownerInitials('「张三」'), '张')
  assert.equal(ownerInitials('007 Jane'), 'J')
  assert.equal(ownerInitials('(Jane) Doe'), 'JD')
})

test('ownerInitials: 第二个词前面的 emoji / 符号同样跳过，取到下一个字母', () => {
  assert.equal(ownerInitials('Jane 🎉 Doe'), 'JD')
  assert.equal(ownerInitials('Jane 🎉'), 'J')
  assert.equal(ownerInitials('Jane 42'), 'J')
})

test('ownerInitials: 汉字与拉丁混写时不混排，只取第一个', () => {
  assert.equal(ownerInitials('Jane 张'), 'J')
  assert.equal(ownerInitials('Jane 张 Doe'), 'J')
  assert.equal(ownerInitials('张三 Jane'), '张')
  assert.equal(ownerInitials('さくら Doe'), 'さ')
})

test('ownerInitials: 一个字母都没有 → null', () => {
  assert.equal(ownerInitials('🎉🎉'), null)
  assert.equal(ownerInitials('123'), null)
  assert.equal(ownerInitials('--- ***'), null)
  assert.equal(ownerInitials('👩‍💻 🇯🇵'), null)
})

test('ownerInitials: 运行环境没有 Intl.Segmenter 时退回按码点切，不抛错', () => {
  const saved = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  assert.ok(saved)
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true })
  try {
    assert.equal(ownerInitials('张三'), '张')
    assert.equal(ownerInitials('🎉 Jane Doe'), 'JD')
    assert.equal(ownerInitials('🎉'), null)
    // 证明真的走了退回分支（而不是用了先前缓存的 Segmenter）：按码点切会把组合附加符号切掉。
    assert.equal(ownerInitials('e\u0301lise'), 'E')
  } finally {
    Object.defineProperty(Intl, 'Segmenter', saved)
  }
  assert.equal(ownerInitials('élise'), 'É')
})

test('ownerTone: 未指派没有颜色', () => {
  assert.equal(ownerTone('none'), null)
})

test('ownerTone: 同一个 key 永远是同一个颜色，且钉死成下面这些值', () => {
  // 期望值由独立实现的 FNV-1a 算出。改哈希或色调顺序会让所有人换色，必须是有意为之。
  const golden: [OwnerKey, string][] = [
    ['user:a', 'neutral'], ['user:b', 'success'], ['user:c', 'violet'], ['user:d', 'info'],
    ['creator:a', 'success'], ['creator:c', 'info'],
    ['user:00000000-0000-0000-0000-000000000001', 'neutral'],
  ]
  for (const [k, tone] of golden) {
    assert.equal(ownerTone(k), tone, k)
    assert.equal(ownerTone(k), ownerTone(k))
  }
})

test('ownerTone: 只从约定的色调里取，大量 key 能均匀铺满每个色调', () => {
  const counts = new Map<string, number>()
  for (let i = 0; i < 400; i++) {
    const tone = ownerTone(`user:${i.toString(16).padStart(8, '0')}-fixture`)
    assert.ok(tone && AVATAR_TONES.includes(tone), `意外的色调 ${tone}`)
    counts.set(tone, (counts.get(tone) ?? 0) + 1)
  }
  for (const tone of AVATAR_TONES) assert.ok((counts.get(tone) ?? 0) >= 60, `${tone} 只出现 ${counts.get(tone) ?? 0} 次`)
})

test('ownerTone: 员工与主播即使 id 相同，也是不同的人，颜色按完整 key 算', () => {
  const differs = Array.from({ length: 50 }, (_, i) => ownerTone(`user:${i}`) !== ownerTone(`creator:${i}`))
  assert.ok(differs.some(Boolean))
})

test('AVATAR_TONES: 不含 warning / danger（分别留给「未指派」和「逾期」）', () => {
  assert.ok(!AVATAR_TONES.includes('warning' as never))
  assert.ok(!AVATAR_TONES.includes('danger' as never))
  assert.equal(new Set(AVATAR_TONES).size, AVATAR_TONES.length)
})
