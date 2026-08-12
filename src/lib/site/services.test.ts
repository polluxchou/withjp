import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { buildServiceMedia } from './services.ts'

type ServicesMessages = { site: { services: { placeholders: string[] } } }

const readMessages = (locale: 'ja' | 'zh' | 'en') =>
  JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as ServicesMessages

test('Services media preserves the approved image order and localized alt text', () => {
  const expectedAlts = {
    ja: ['着ぐるみ撮影／制作風景', 'モーション連動のテスト画面'],
    zh: ['皮套拍摄／制作现场', '动作联动测试画面'],
    en: ['Suit shoot / production floor', 'Motion linkage test screen'],
  } as const

  for (const locale of ['ja', 'zh', 'en'] as const) {
    const media = buildServiceMedia(readMessages(locale).site.services.placeholders)
    assert.deepEqual(media, [
      {
        src: '/site/services-character.webp',
        alt: expectedAlts[locale][0],
        objectPosition: '50% 24%',
      },
      {
        src: '/site/services-expression.webp',
        alt: expectedAlts[locale][1],
        objectPosition: '50% 28%',
      },
    ])
  }
})

test('Services media assets exist in the public site directory', () => {
  for (const filename of ['services-character.webp', 'services-expression.webp']) {
    assert.equal(
      existsSync(new URL(`../../../public/site/${filename}`, import.meta.url)),
      true,
      filename,
    )
  }
})

test('Services page renders real media with responsive two-column sizes', () => {
  const source = readFileSync(
    new URL('../../app/[locale]/site/services/page.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /buildServiceMedia\(placeholders\)/)
  assert.match(source, /src=\{media\.src\}/)
  assert.match(source, /alt=\{media\.alt\}/)
  assert.match(source, /objectPosition=\{media\.objectPosition\}/)
  assert.match(source, /sizes="\(min-width: 640px\) 50vw, 100vw"/)
})

test('SiteImage applies an optional focal point without changing its default crop mode', () => {
  const source = readFileSync(
    new URL('../../components/site/SiteImage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /objectPosition\?: string/)
  assert.match(source, /style=\{objectPosition \? \{ objectPosition \} : undefined\}/)
  assert.match(source, /className="object-cover"/)
})
