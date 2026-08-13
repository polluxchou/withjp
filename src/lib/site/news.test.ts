import test from 'node:test'
import assert from 'node:assert/strict'
import { buildArticles, findArticle, isNewsSlug, NEWS_SLUGS, type SiteArticleCopy } from './news.ts'

const copy: SiteArticleCopy[] = NEWS_SLUGS.map((slug, i) => ({
  date: `2026.10.0${i + 1}`,
  tag: 'LIVE',
  title: `title ${slug}`,
  lead: `lead ${slug}`,
  body: ['a', 'b', 'c'],
}))

test('pairs copy with routes in slug order; image is optional until a photo is set', () => {
  const articles = buildArticles(copy)
  assert.equal(articles.length, NEWS_SLUGS.length)
  assert.deepEqual(
    articles.map((a) => a.slug),
    [...NEWS_SLUGS],
  )
  for (const article of articles) {
    // 当前一批真实新闻的配图还没到位——只要求「有图时必须是站内 webp 资源」，
    // 不要求每条都有图，否则这条测试会拦下正常的缺图状态。
    if (article.image !== undefined) assert.match(article.image, /^\/site\/.+\.webp$/)
    assert.equal(article.href, `/site/news/${article.slug}`)
  }
})

test('drops slots that have no copy yet instead of rendering empty cards', () => {
  const partial = copy.slice(0, 2)
  const articles = buildArticles(partial)
  assert.equal(articles.length, 2)
})

test('finds an article by slug and rejects unknown ones', () => {
  assert.equal(findArticle(copy, 'operations-partner-announced')?.title, 'title operations-partner-announced')
  assert.equal(findArticle(copy, 'nope'), undefined)
})

test('isNewsSlug guards the route param', () => {
  assert.equal(isNewsSlug('echoamp-launch'), true)
  assert.equal(isNewsSlug('../../etc/passwd'), false)
})
