# News Recruit Apply Visibility Design

## Goal

On public-site news detail pages, show the localized apply button only when the article's stable data category is exactly `recruit`.

## Target baseline

Implement against `main`, where the public-site news pages and `src/lib/site/news.ts` exist. The `feat/worktask-taskitem-link` branch does not contain those files and must not receive unrelated public-site changes.

## Data model

- Define a news category type that includes `recruit` and the non-recruit category values used by current articles.
- Store each article's category once in slug-keyed metadata in `src/lib/site/news.ts`, alongside its image metadata.
- Include `category` on every `SiteArticle` returned by `buildArticles` and `findArticle`.
- Do not derive behavior from localized `tag` text or duplicate the category in `messages/zh.json`, `messages/en.json`, and `messages/ja.json`.

## Rendering behavior

- In `src/app/[locale]/site/news/[slug]/page.tsx`, render the existing apply button only when `article.category === 'recruit'` through a pure category predicate.
- Keep the existing localized label, `RECRUIT_HREF`, styling, and size unchanged.
- Keep the back-to-news button visible for every article.
- Do not change news list rows, homepage cards, filtering, routes, or article copy.

## Verification

- Extend `src/lib/site/news.test.ts` first so it proves built articles expose the intended category for both recruit and non-recruit articles.
- Cover the exact `category === 'recruit'` visibility rule through a small pure predicate.
- Run the focused news test and confirm it fails before implementation, then passes afterward.
- Run the full automated test suite and the production build on the target branch.

## Acceptance criteria

1. A news article with `category: 'recruit'` displays the apply button.
2. Every news article with another category omits the apply button.
3. The back button remains visible for every article.
4. Behavior is identical across Chinese, English, and Japanese locales because category is locale-independent.
