import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildContactSections,
  type SiteContactSectionCopy,
} from './contact.ts'

const ja = JSON.parse(
  readFileSync(new URL('../../../messages/ja.json', import.meta.url), 'utf8'),
) as { site: { contact: { sections: SiteContactSectionCopy[] } } }

test('Japanese contact copy preserves the three screenshot sections in order', () => {
  const sections = ja.site.contact.sections
  assert.equal(sections.length, 3)
  assert.deepEqual(
    sections.map(({ no, eyebrow }) => [no, eyebrow]),
    [
      ['01', 'FOR CREATOR'],
      ['02', 'FOR COMPANION'],
      ['03', 'FOR CLIENT'],
    ],
  )
  assert.equal(sections[0].rows[0].value, 'カイロン株式会社（Chiron Co., Ltd.）')
  assert.equal(sections[0].rows[1].value, 'ZHANG QIAN')
  assert.equal(sections[1].rows[0].value, '吉光片羽株式会社')
  assert.equal(sections[1].rows[1].value, 'YANG JIANUO')
  assert.equal(sections[2].rows[1].value, 'business@echoamp.jp')
})

test('contact actions become locale-safe internal and external links', () => {
  const sections = buildContactSections(ja.site.contact.sections)
  assert.equal(sections[0].ctaHref, '/site/recruit')
  assert.equal(sections[1].ctaHref, undefined)
  assert.equal(sections[2].ctaHref, 'mailto:business@echoamp.jp')
  assert.equal(sections[2].rows[1].href, 'mailto:business@echoamp.jp')
  assert.deepEqual(sections.map(({ id }) => id), ['contact-01', 'contact-02', 'contact-03'])
})
