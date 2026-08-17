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

const zh = JSON.parse(
  readFileSync(new URL('../../../messages/zh.json', import.meta.url), 'utf8'),
) as { site: { contact: { sections: SiteContactSectionCopy[] } } }

const en = JSON.parse(
  readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'),
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
  assert.equal(sections[1].rows[0].value, '吉光片羽株式会社')
  assert.equal(sections[2].rows[1].value, 'business@echoamp.jp')
})

test('Contact lists no representative names in any locale', () => {
  // 两家合作公司的代表姓名已下线：对外页面只留公司主体信息，个人姓名不再公开。
  for (const messages of [ja, zh, en]) {
    const names = messages.site.contact.sections.flatMap(({ rows }) =>
      rows.filter(({ label, value }) => /代表|Representative/.test(label) || /CHEN HAO|YANG JIANUO/.test(value)),
    )
    assert.deepEqual(names, [])
  }
})

// 地址行每种语言只给本语言的写法，不叠 subvalue 副行 —— 以前是三语共用日文原址
// 再叠一行罗马字，等于中文页上根本没有中文。断言里显式写上 subvalue: undefined
// 就是防止双语又被叠回来。段 02 的西宮地址同理，见下一条。
test('Contact section 01 carries the Shin-Osaka address in every locale', () => {
  for (const [messages, addressLabel, expected] of [
    [ja, '所在地', '〒532-0003 大阪府大阪市淀川区宮原2丁目12-14 ライオンズマンション新大阪第5 404'],
    [zh, '所在地', '〒532-0003 大阪府大阪市淀川区宫原2丁目12-14 Lions Mansion 新大阪第5 404室'],
    [en, 'Address', 'Lions Mansion Shin-Osaka No.5, Room 404, 2-12-14 Miyahara, Yodogawa-ku, Osaka 532-0003'],
  ] as const) {
    const address = messages.site.contact.sections[0].rows.find(({ label }) => label === addressLabel)
    assert.deepEqual({ value: address?.value, subvalue: address?.subvalue }, { value: expected, subvalue: undefined })
  }
})

// 段 02 是另一家公司（吉光片羽／西宮市），地址与段 01 的新大阪不能混。
// 规则同段 01：每种语言只给本语言的写法，不叠 subvalue。
test('Contact section 02 carries the Nishinomiya address in every locale', () => {
  for (const [messages, addressLabel, expected] of [
    [ja, '所在地', '〒662-0073 兵庫県西宮市松風町2-5-106号室'],
    [zh, '所在地', '〒662-0073 兵库县西宫市松风町2-5-106号室'],
    [en, 'Address', 'Room 106, 2-5 Matsukazecho, Nishinomiya, Hyogo 662-0073'],
  ] as const) {
    const address = messages.site.contact.sections[1].rows.find(({ label }) => label === addressLabel)
    assert.deepEqual({ value: address?.value, subvalue: address?.subvalue }, { value: expected, subvalue: undefined })
  }
})

test('contact actions become locale-safe internal and external links', () => {
  const sections = buildContactSections(ja.site.contact.sections)
  assert.equal(sections[0].ctaHref, '/site/recruit')
  assert.equal(sections[1].ctaHref, '/site/recruit/staff')
  assert.equal(sections[2].ctaHref, 'mailto:business@echoamp.jp')
  assert.equal(sections[2].rows[1].href, 'mailto:business@echoamp.jp')
  assert.deepEqual(sections.map(({ id }) => id), ['contact-01', 'contact-02', 'contact-03'])
})

// 按钮文案不能承诺一个它并不通往的渠道。段 01 的按钮曾经写着「用 LINE 咨询 /
// LINE で相談する / Ask us on LINE」，而 action 是 'recruit'——点下去落到报名
// 表单，不是 LINE。ctaHref 那条测试只验「链接对不对」，验不出「文案说的是不是
// 同一件事」，所以这个错能一直在线上待着。
//
// 判据：contact 的 action 只有 recruit / staff-recruit / email 三种，没有 line，
// 所以任何提到 LINE 的按钮文案必然名不副实；提到邮箱的则必须真的是 email。
test('CTA 文案不承诺按钮并不通往的渠道', () => {
  for (const [locale, messages] of [['ja', ja], ['zh', zh], ['en', en]] as const) {
    for (const section of messages.site.contact.sections) {
      if (!section.cta) continue
      const where = `${locale} contact-${section.no}`
      assert.ok(
        !/\bLINE\b/i.test(section.cta),
        `${where}: 按钮文案提到 LINE，但没有 line 这种 action —— 它实际通往 ${section.action}`,
      )
      if (/@|メール|mail/i.test(section.cta)) {
        assert.equal(section.action, 'email', `${where}: 按钮文案像邮箱，action 却是 ${section.action}`)
      }
    }
  }
})

test('staff-recruit 映射到员工招募页', () => {
  const [s] = buildContactSections([
    { no: '02', eyebrow: 'FOR COMPANION', title: 't', body: 'b',
      cta: 'c', action: 'staff-recruit', rows: [] },
  ])
  assert.equal(s.ctaHref, '/site/recruit/staff')
})

test('Contact sections 01 and 02 expose their company websites in every locale', () => {
  for (const [messages, websiteLabel] of [
    [ja, '会社サイト'],
    [zh, '公司官网'],
    [en, 'Website'],
  ] as const) {
    const sections = buildContactSections(messages.site.contact.sections)
    const chironWebsite = sections[0].rows.find((row) => row.label === websiteLabel)
    const kikkouWebsite = sections[1].rows.find((row) => row.label === websiteLabel)

    assert.deepEqual(
      { value: chironWebsite?.value, href: chironWebsite?.href, link: chironWebsite?.link },
      { value: 'https://chi-ron.com/', href: 'https://chi-ron.com/', link: 'external' },
    )
    assert.deepEqual(
      { value: kikkouWebsite?.value, href: kikkouWebsite?.href, link: kikkouWebsite?.link },
      { value: 'https://kikkou.jp/', href: 'https://kikkou.jp/', link: 'external' },
    )
    assert.equal(sections[2].rows[1].href, 'mailto:business@echoamp.jp')
  }
})

test('Contact section 01 carries the Chiron mark and the asset is in public/', () => {
  const [chiron, partner, client] = buildContactSections(ja.site.contact.sections)
  assert.equal(chiron.brandLogo, '/site/chiron-logo.webp')
  // 没有 brand 的段不该凭空拿到图
  assert.equal(partner.brandLogo, undefined)
  assert.equal(client.brandLogo, undefined)

  // 路径写死在代码里，文件丢了页面上只会是一块空白，测试兜住这一步
  const asset = new URL('../../../public/site/chiron-logo.webp', import.meta.url)
  assert.ok(readFileSync(asset).byteLength > 0)
})

test('Contact renders the brand mark as a themed mask, keeping the text lockup as fallback', () => {
  const source = readFileSync(
    new URL('../../components/site/ContactSection.tsx', import.meta.url),
    'utf8',
  )
  // mask + bg-site-fg 是深浅主题都成立的关键：换成 <img> 就会在深色主题里变成黑底黑字
  assert.match(source, /maskImage: `url\(\$\{section\.brandLogo\}\)`/)
  assert.match(source, /className="block h-10 w-24 bg-site-fg"/)
  assert.match(source, /aria-label=\{`\$\{section\.brand\.primary\} \$\{section\.brand\.secondary\}`\}/)
})

test('Contact renders external websites in a safe new tab without changing email links', () => {
  const source = readFileSync(
    new URL('../../components/site/ContactSection.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /target=\{row\.link === 'external' \? '_blank' : undefined\}/)
  assert.match(source, /rel=\{row\.link === 'external' \? 'noreferrer' : undefined\}/)
})

test('Contact localizes the operating entity but keeps production partner unchanged', () => {
  assert.equal(zh.site.contact.sections[0].partner, '运营主体')
  assert.equal(ja.site.contact.sections[0].partner, '運営主体')
  assert.equal(en.site.contact.sections[0].partner, 'Operating Entity')
  for (const messages of [zh, ja, en]) {
    assert.equal(messages.site.contact.sections[1].partner, 'PRODUCTION PARTNER')
  }
})

test('Contact section 03 uses the approved client copy in every locale', () => {
  const jaClient = ja.site.contact.sections[2]
  assert.deepEqual(
    {
      eyebrow: jaClient.eyebrow,
      title: jaClient.title,
      body: jaClient.body,
      cta: jaClient.cta,
      services: jaClient.rows[0].value,
      hours: jaClient.rows[2].value,
    },
    {
      eyebrow: 'FOR CLIENT',
      title: '法人・ブランド様へ',
      body: '楽曲制作、着ぐるみ技術、商業ライブ配信のご相談、広告事業のご提携、不正行為・コンプライアンスに関する通報をメールで承ります。',
      cta: 'business@echoamp.jp',
      services: '楽曲制作／着ぐるみ技術／商業ライブ配信／広告事業のご提携／不正行為・コンプライアンスに関する通報',
      hours: '平日 10:00–19:00（JST）／日本語・中国語',
    },
  )

  const zhClient = zh.site.contact.sections[2]
  assert.deepEqual(
    {
      eyebrow: zhClient.eyebrow,
      title: zhClient.title,
      body: zhClient.body,
      cta: zhClient.cta,
      services: zhClient.rows[0].value,
      hours: zhClient.rows[2].value,
    },
    {
      eyebrow: '客户合作',
      title: '企业及品牌合作',
      body: '我们接受有关乐曲制作、皮套人技术、商业直播咨询、广告业务合作，以及不诚信行为与合规投诉的邮件联系。',
      cta: 'business@echoamp.jp',
      services: '乐曲制作／皮套人技术／商业直播咨询／广告业务合作／不诚信行为与合规投诉',
      hours: '工作日 10:00–19:00（日本时间）／中文・日文',
    },
  )

  const enClient = en.site.contact.sections[2]
  assert.deepEqual(
    {
      eyebrow: enClient.eyebrow,
      title: enClient.title,
      body: enClient.body,
      cta: enClient.cta,
      services: enClient.rows[0].value,
      hours: enClient.rows[2].value,
    },
    {
      eyebrow: 'FOR CLIENT',
      title: 'For Businesses & Brands',
      body: 'For music production, mascot costume technology, commercial livestreaming, advertising partnerships, or reports of misconduct and compliance concerns, please contact us by email.',
      cta: 'business@echoamp.jp',
      services: 'Music production / mascot costume technology / commercial livestreaming / advertising partnerships / misconduct and compliance reports',
      hours: 'Weekdays 10:00–19:00 (JST) / Japanese & Chinese',
    },
  )
})
