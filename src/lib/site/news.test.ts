import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildArticle,
  buildArticles,
  findArticle,
  isNewsSlug,
  shouldShowNewsApply,
  type SiteNewsRow,
} from './news.ts'

function row(overrides: Partial<SiteNewsRow> = {}): SiteNewsRow {
  return {
    slug: 'echoamp-launch',
    tag: 'PROJECT',
    category: 'project',
    published_on: '2026-07-21',
    is_pinned: false,
    is_published: true,
    image_url: '/site/moondollz-silhouettes.webp',
    title_ja: 'タイトル ja',
    title_zh: '标题 zh',
    title_en: 'Title en',
    lead_ja: 'リード ja',
    lead_zh: '导语 zh',
    lead_en: 'Lead en',
    body_ja: '段落一 ja\n\n段落二 ja',
    body_zh: '段落一 zh\n\n段落二 zh',
    body_en: 'Paragraph one en\n\nParagraph two en',
    ...overrides,
  }
}

test('把库行按 locale 转成 SiteArticle：三语字段各自取值，日期与 href 由 slug/published_on 派生', () => {
  const r = row()
  const ja = buildArticle('ja', r)
  assert.equal(ja.title, 'タイトル ja')
  assert.equal(ja.lead, 'リード ja')
  assert.deepEqual(ja.body, ['段落一 ja', '段落二 ja'])
  assert.equal(ja.date, '2026.07.21')
  assert.equal(ja.href, '/site/news/echoamp-launch')
  assert.equal(ja.tag, 'PROJECT')
  assert.equal(ja.slug, 'echoamp-launch')

  const zh = buildArticle('zh', r)
  assert.equal(zh.title, '标题 zh')

  const en = buildArticle('en', r)
  assert.equal(en.title, 'Title en')
})

test('body 按 \\n\\n 切回段落数组，不管有几段', () => {
  const single = buildArticle('ja', row({ body_ja: '只有一段' }))
  assert.deepEqual(single.body, ['只有一段'])

  const three = buildArticle(
    'ja',
    row({ body_ja: '第一段\n\n第二段\n\n第三段' }),
  )
  assert.deepEqual(three.body, ['第一段', '第二段', '第三段'])
})

test('zh/en 缺失时回退日语（pickLocaleText 的三语回退契约）', () => {
  const r = row({ title_zh: null, title_en: null, lead_zh: '', lead_en: '   ' })
  assert.equal(buildArticle('zh', r).title, 'タイトル ja')
  assert.equal(buildArticle('en', r).title, 'タイトル ja')
  assert.equal(buildArticle('zh', r).lead, 'リード ja')
  assert.equal(buildArticle('en', r).lead, 'リード ja')
})

test('image_url 为 null 时文章缺图，不会被改写成别的文章的图片', () => {
  const article = buildArticle('ja', row({ image_url: null }))
  assert.equal(article.image, undefined)
})

test('image_url 有值时原样透传', () => {
  const article = buildArticle('ja', row({ image_url: '/site/shin-osaka-station.webp' }))
  assert.equal(article.image, '/site/shin-osaka-station.webp')
})

test('category 是不随语言变化的行为开关，三语下都一样，交给 shouldShowNewsApply 判定', () => {
  const recruitRow = row({ slug: 'first-recruitment-round', category: 'recruit' })
  for (const locale of ['ja', 'zh', 'en'] as const) {
    const article = buildArticle(locale, recruitRow)
    assert.equal(article.category, 'recruit')
    assert.equal(shouldShowNewsApply(article.category), true)
  }

  const projectRow = row({ category: 'project' })
  assert.equal(shouldShowNewsApply(buildArticle('ja', projectRow).category), false)
})

test('buildArticles 把多行按传入顺序整体转换', () => {
  const rows = [
    row({ slug: 'a', title_ja: 'A' }),
    row({ slug: 'b', title_ja: 'B' }),
  ]
  const articles = buildArticles('ja', rows)
  assert.deepEqual(articles.map((a) => a.slug), ['a', 'b'])
  assert.deepEqual(articles.map((a) => a.title), ['A', 'B'])
})

test('findArticle 按 slug 命中一行并转换；未命中返回 undefined', () => {
  const rows = [row({ slug: 'a', title_ja: 'A' }), row({ slug: 'b', title_ja: 'B' })]
  assert.equal(findArticle('ja', rows, 'b')?.title, 'B')
  assert.equal(findArticle('ja', rows, 'nope'), undefined)
})

test('isNewsSlug 校验 slug 形状（与数据库 check 约束一致），拒绝路径穿越', () => {
  assert.equal(isNewsSlug('echoamp-launch'), true)
  assert.equal(isNewsSlug('../../etc/passwd'), false)
  assert.equal(isNewsSlug(''), false)
})

test('shows the apply action only for the recruit category', () => {
  assert.equal(shouldShowNewsApply('recruit'), true)
  assert.equal(shouldShowNewsApply('project'), false)
})
