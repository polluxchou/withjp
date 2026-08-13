# Contact Page Screenshot Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public Contact page as the three screenshot-matched partner/contact sections while preserving three locales, both site themes, and responsive behavior.

**Architecture:** Keep translated copy in `messages/{ja,zh,en}.json`, convert it into link-aware typed view data with a small pure helper, and render each section through one focused `ContactSection` component. The route remains a thin composition layer, while the pure helper and the Japanese source content are protected by Node tests.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, next-intl, Tailwind CSS, Node test runner.

---

## File map

- Create `src/lib/site/contact.ts`: translated copy types and link-aware view-data conversion.
- Create `src/lib/site/contact.test.ts`: screenshot content and link-semantic regression tests.
- Create `src/components/site/ContactSection.tsx`: one responsive screenshot-style section and details table.
- Modify `src/app/[locale]/site/contact/page.tsx`: replace the two-card layout with the three translated sections.
- Modify `messages/ja.json`, `messages/zh.json`, `messages/en.json`: store equal-shaped three-section content.
- Modify `package.json`: include the new regression test in the full test suite.

### Task 1: Lock the screenshot content and interaction contract

**Files:**
- Create: `src/lib/site/contact.test.ts`
- Modify: `package.json`
- Test: `src/lib/site/contact.test.ts`

- [ ] **Step 1: Write the failing content and link tests**

Create `src/lib/site/contact.test.ts` with tests that read the real Japanese message file and call the not-yet-created helper:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --experimental-strip-types src/lib/site/contact.test.ts
```

Expected: FAIL because `src/lib/site/contact.ts` does not exist and the current Japanese messages have no `sections` array.

- [ ] **Step 3: Register the focused test in the full suite**

Append `src/lib/site/contact.test.ts` to the existing `test` script in `package.json`. Do not alter the other test paths.

- [ ] **Step 4: Commit the failing contract**

```bash
git add src/lib/site/contact.test.ts package.json
git commit -m "test(site): lock contact page content contract"
```

### Task 2: Add typed contact content and all three locales

**Files:**
- Create: `src/lib/site/contact.ts`
- Modify: `messages/ja.json`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Test: `src/lib/site/contact.test.ts`

- [ ] **Step 1: Add the minimal typed converter**

Create `src/lib/site/contact.ts`:

```ts
import { RECRUIT_HREF } from './nav.ts'

export type SiteContactAction = 'recruit' | 'email'

export interface SiteContactRowCopy {
  label: string
  value: string
  subvalue?: string
  email?: boolean
}

export interface SiteContactBrandCopy {
  primary: string
  secondary: string
}

export interface SiteContactSectionCopy {
  no: string
  eyebrow: string
  title: string
  body: string
  note?: string
  cta?: string
  action?: SiteContactAction
  partner?: string
  brand?: SiteContactBrandCopy
  rows: SiteContactRowCopy[]
}

export interface SiteContactRow extends SiteContactRowCopy {
  href?: string
}

export interface SiteContactSection
  extends Omit<SiteContactSectionCopy, 'rows'> {
  id: string
  ctaHref?: string
  rows: SiteContactRow[]
}

export function buildContactSections(
  copy: SiteContactSectionCopy[],
): SiteContactSection[] {
  return copy.map((section) => ({
    ...section,
    id: `contact-${section.no}`,
    ctaHref:
      section.action === 'recruit'
        ? RECRUIT_HREF
        : section.action === 'email' && section.cta
          ? `mailto:${section.cta}`
          : undefined,
    rows: section.rows.map((row) => ({
      ...row,
      href: row.email ? `mailto:${row.value}` : undefined,
    })),
  }))
}
```

- [ ] **Step 2: Replace the Japanese `site.contact` object**

Keep `eyebrow` and `title`, then add this `sections` array:

```json
{
  "eyebrow": "CONTACT",
  "title": "お問い合わせ",
  "sections": [
    {
      "no": "01",
      "eyebrow": "FOR CREATOR",
      "title": "応募したい方へ",
      "body": "オーディション、レッスン、活動条件について。採用とオフライン運営はカイロン株式会社が担当します。LINE でのご相談が最短です。",
      "cta": "LINE で相談する",
      "action": "recruit",
      "partner": "RECRUITING PARTNER",
      "brand": { "primary": "Chiron", "secondary": "カイロン株式会社" },
      "rows": [
        { "label": "会社名", "value": "カイロン株式会社（Chiron Co., Ltd.）" },
        { "label": "代表", "value": "ZHANG QIAN" },
        { "label": "設立・所在地", "value": "2021年／大阪市浪速区" },
        { "label": "事業内容", "value": "ライブ配信キャストの採用・オフライン運営" },
        { "label": "所在地", "value": "大阪府大阪市浪速区難波中1丁目11-4 2階", "subvalue": "SEIYU Building 2F, 11-7 Nambanaka, Osaka" }
      ]
    },
    {
      "no": "02",
      "eyebrow": "FOR COMPANION",
      "title": "制作・運営パートナー",
      "body": "ヘアメイク、ロケ撮影、グループ配信の運営研修、AIGC コンテンツ制作を担当するパートナーです。",
      "note": "お問い合わせ窓口は準備中",
      "partner": "PRODUCTION PARTNER",
      "rows": [
        { "label": "会社名", "value": "吉光片羽株式会社" },
        { "label": "代表", "value": "YANG JIANUO" },
        { "label": "設立・所在地", "value": "2019年／西宮市" },
        { "label": "事業内容", "value": "インフルエンサーマーケティング" },
        { "label": "担当領域", "value": "ヘアメイク／ロケ撮影／運営研修／AIGC 制作" }
      ]
    },
    {
      "no": "03",
      "eyebrow": "FOR CLIENT",
      "title": "法人・ブランド様へ",
      "body": "タイアップ配信、AIGC 映像制作、楽曲制作、着ぐるみ IP のご相談はメールで承ります。",
      "cta": "business@echoamp.jp",
      "action": "email",
      "rows": [
        { "label": "内容", "value": "タイアップ配信／AIGC 映像制作／楽曲制作／着ぐるみ IP" },
        { "label": "連絡先", "value": "business@echoamp.jp", "email": true },
        { "label": "対応", "value": "平日 10:00–19:00（JST）／日本語・中国語" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Add equal-shaped Chinese and English content**

Replace the Chinese `site.contact` object with:

```json
{
  "eyebrow": "CONTACT",
  "title": "联系我们",
  "sections": [
    {
      "no": "01",
      "eyebrow": "FOR CREATOR",
      "title": "想报名的人",
      "body": "关于试镜、课程与活动条件。招募及线下运营由 Chiron 株式会社负责，通过 LINE 咨询最快。",
      "cta": "用 LINE 咨询",
      "action": "recruit",
      "partner": "RECRUITING PARTNER",
      "brand": { "primary": "Chiron", "secondary": "カイロン株式会社" },
      "rows": [
        { "label": "公司名称", "value": "カイロン株式会社（Chiron Co., Ltd.）" },
        { "label": "代表", "value": "ZHANG QIAN" },
        { "label": "成立・所在地", "value": "2021年／大阪市浪速区" },
        { "label": "业务内容", "value": "ライブ配信キャストの採用・オフライン運営" },
        { "label": "所在地", "value": "大阪府大阪市浪速区難波中1丁目11-4 2階", "subvalue": "SEIYU Building 2F, 11-7 Nambanaka, Osaka" }
      ]
    },
    {
      "no": "02",
      "eyebrow": "FOR COMPANION",
      "title": "制作与运营合作伙伴",
      "body": "负责妆发、外景拍摄、团体直播运营培训和 AIGC 内容制作的合作伙伴。",
      "note": "咨询窗口正在准备中",
      "partner": "PRODUCTION PARTNER",
      "rows": [
        { "label": "公司名称", "value": "吉光片羽株式会社" },
        { "label": "代表", "value": "YANG JIANUO" },
        { "label": "成立・所在地", "value": "2019年／西宮市" },
        { "label": "业务内容", "value": "インフルエンサーマーケティング" },
        { "label": "负责领域", "value": "ヘアメイク／ロケ撮影／運営研修／AIGC 制作" }
      ]
    },
    {
      "no": "03",
      "eyebrow": "FOR CLIENT",
      "title": "企业与品牌方",
      "body": "联名直播、AIGC 影像制作、歌曲制作和皮套 IP 合作，请通过邮件联系我们。",
      "cta": "business@echoamp.jp",
      "action": "email",
      "rows": [
        { "label": "内容", "value": "联名直播／AIGC 影像制作／歌曲制作／皮套 IP" },
        { "label": "联系方式", "value": "business@echoamp.jp", "email": true },
        { "label": "服务时间", "value": "工作日 10:00–19:00（JST）／日语・中文" }
      ]
    }
  ]
}
```

Replace the English `site.contact` object with:

```json
{
  "eyebrow": "CONTACT",
  "title": "GET IN TOUCH",
  "sections": [
    {
      "no": "01",
      "eyebrow": "FOR CREATOR",
      "title": "For applicants",
      "body": "For auditions, lessons and activity terms. Chiron handles recruiting and offline operations; LINE is the fastest way to reach us.",
      "cta": "Ask us on LINE",
      "action": "recruit",
      "partner": "RECRUITING PARTNER",
      "brand": { "primary": "Chiron", "secondary": "カイロン株式会社" },
      "rows": [
        { "label": "Company", "value": "カイロン株式会社（Chiron Co., Ltd.）" },
        { "label": "Representative", "value": "ZHANG QIAN" },
        { "label": "Founded / location", "value": "2021年／大阪市浪速区" },
        { "label": "Business", "value": "ライブ配信キャストの採用・オフライン運営" },
        { "label": "Address", "value": "大阪府大阪市浪速区難波中1丁目11-4 2階", "subvalue": "SEIYU Building 2F, 11-7 Nambanaka, Osaka" }
      ]
    },
    {
      "no": "02",
      "eyebrow": "FOR COMPANION",
      "title": "Production & operations partner",
      "body": "Our partner for hair and makeup, location shoots, group-stream operations training and AIGC content production.",
      "note": "Contact desk coming soon",
      "partner": "PRODUCTION PARTNER",
      "rows": [
        { "label": "Company", "value": "吉光片羽株式会社" },
        { "label": "Representative", "value": "YANG JIANUO" },
        { "label": "Founded / location", "value": "2019年／西宮市" },
        { "label": "Business", "value": "インフルエンサーマーケティング" },
        { "label": "Coverage", "value": "ヘアメイク／ロケ撮影／運営研修／AIGC 制作" }
      ]
    },
    {
      "no": "03",
      "eyebrow": "FOR CLIENT",
      "title": "For companies and brands",
      "body": "For tie-up streams, AIGC film production, music production and suit IP, contact us by email.",
      "cta": "business@echoamp.jp",
      "action": "email",
      "rows": [
        { "label": "Services", "value": "Tie-up streams / AIGC film production / music production / suit IP" },
        { "label": "Contact", "value": "business@echoamp.jp", "email": true },
        { "label": "Hours", "value": "Weekdays 10:00–19:00 (JST) / Japanese and Chinese" }
      ]
    }
  ]
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --experimental-strip-types src/lib/site/contact.test.ts
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Run the three-locale parity check**

Run:

```bash
npm run test:i18n
```

Expected: exit 0 with no missing or extra keys.

- [ ] **Step 6: Commit the typed content model**

```bash
git add src/lib/site/contact.ts messages/ja.json messages/zh.json messages/en.json
git commit -m "feat(site): add contact partner content"
```

### Task 3: Render the screenshot-style responsive sections

**Files:**
- Create: `src/components/site/ContactSection.tsx`
- Modify: `src/app/[locale]/site/contact/page.tsx`
- Test: `src/lib/site/contact.test.ts`

- [ ] **Step 1: Create the reusable section component**

Create `src/components/site/ContactSection.tsx`:

```tsx
import BlueprintFrame from './BlueprintFrame'
import SiteButton from './SiteButton'
import type { SiteContactSection as ContactSectionData } from '@/lib/site/contact'

export default function ContactSection({ section }: { section: ContactSectionData }) {
  return (
    <BlueprintFrame
      tone="soft"
      className="grid gap-10 px-7 py-10 md:px-10 md:py-12 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.32fr)] lg:gap-14 lg:px-12 lg:py-16"
    >
      <div className="flex min-w-0 flex-col items-start">
        <div className="font-condensed text-[13px] tracking-[0.24em] text-site-accent">
          {section.eyebrow} ／ {section.no}
        </div>
        <h2 className="mb-4 mt-5 font-serif-jp text-[clamp(30px,3vw,42px)] leading-[1.35]">
          {section.title}
        </h2>
        <p className="max-w-[560px] text-[15px] leading-[2] text-site-fg/72">
          {section.body}
        </p>
        {section.note && (
          <p className="mt-7 text-[14px] tracking-[0.08em] text-site-fg/45">
            {section.note}
          </p>
        )}
        {section.cta && section.ctaHref && (
          <SiteButton
            href={section.ctaHref}
            variant={section.action === 'recruit' ? 'hot' : 'ghost'}
            size="md"
            className="mt-8"
          >
            {section.cta}
          </SiteButton>
        )}
      </div>

      <div className="min-w-0 lg:pt-1">
        {(section.partner || section.brand) && (
          <div className="mb-6 flex min-h-12 flex-wrap items-center gap-5">
            {section.brand && (
              <div className="bg-site-fg px-3 py-2 text-site-canvas">
                <div className="font-serif-jp text-[20px] leading-none">{section.brand.primary}</div>
                <div className="mt-1 text-[8px] tracking-[0.16em]">{section.brand.secondary}</div>
              </div>
            )}
            {section.partner && (
              <div className="font-condensed text-[13px] tracking-[0.28em] text-site-fg/48">
                {section.partner}
              </div>
            )}
          </div>
        )}

        <dl className="border border-site-line-strong bg-site-panel">
          {section.rows.map((row) => (
            <div
              key={`${section.id}-${row.label}`}
              className="grid border-b border-site-line px-5 py-5 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-5 md:px-6 md:py-6"
            >
              <dt className="mb-1.5 font-condensed text-[15px] tracking-[0.13em] text-site-accent sm:mb-0">
                {row.label}
              </dt>
              <dd className="min-w-0 text-[15px] leading-[1.75] md:text-[16px]">
                {row.href ? (
                  <a className="break-all transition-colors hover:text-site-accent" href={row.href}>
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
                {row.subvalue && (
                  <span className="mt-1 block text-[13px] text-site-fg/48">
                    {row.subvalue}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </BlueprintFrame>
  )
}
```

- [ ] **Step 2: Replace the route composition**

Update `src/app/[locale]/site/contact/page.tsx` so the page builds and renders all translated sections:

```tsx
import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import ContactSection from '@/components/site/ContactSection'
import {
  buildContactSections,
  type SiteContactSectionCopy,
} from '@/lib/site/contact'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.contact' })
  return { title: t('title') }
}

export default function SiteContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.contact')
  const sections = buildContactSections(t.raw('sections') as SiteContactSectionCopy[])

  return (
    <SiteSection divider={false} className="pb-20 lg:pb-24">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} size="page" className="mb-10 lg:mb-14" />
      <div className="space-y-8 lg:space-y-10">
        {sections.map((section) => (
          <ContactSection key={section.id} section={section} />
        ))}
      </div>
    </SiteSection>
  )
}
```

- [ ] **Step 3: Run focused and copy/style checks**

Run:

```bash
node --test --experimental-strip-types src/lib/site/contact.test.ts
npm run test:copy
```

Expected: focused tests pass and all i18n, bare-Han, and style-token checks exit 0.

- [ ] **Step 4: Commit the rendered page**

```bash
git add src/components/site/ContactSection.tsx src/app/[locale]/site/contact/page.tsx
git commit -m "feat(site): rebuild contact page from reference"
```

### Task 4: Full verification and browser QA

**Files:**
- Verify only; modify the smallest owning file if a check reveals a defect.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
npm run test:copy
npm run build
```

Expected: every command exits 0; the Node suite reports zero failures; the production build includes `/[locale]/site/contact`.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git diff cc67f82..HEAD --check
git status --short
```

Expected: no whitespace errors; only the unrelated pre-existing `dev-3099.log` remains untracked.

- [ ] **Step 3: Verify the live Japanese page at desktop width**

Open `http://localhost:3099/ja/site/contact`, reload after the code changes, and verify:

- Exactly three sections appear in `01`, `02`, `03` order.
- Desktop sections use a left introduction and right details table.
- The Chiron wordmark, partner labels, all rows, the LINE CTA, and email CTA are visible.
- Email links resolve to `mailto:business@echoamp.jp`.
- No browser console errors or warnings are introduced.

- [ ] **Step 4: Verify mobile behavior**

Use a 390×844 viewport and verify:

- Each section becomes one column.
- Long legal names, addresses, and email text wrap without horizontal page overflow.
- Buttons remain fully visible and keyboard-focusable.

- [ ] **Step 5: Verify Chinese and English rendering**

Reload `/zh/site/contact` and `/en/site/contact`; verify all three sections render with translated labels and no missing-message errors.

- [ ] **Step 6: Commit any verification-only correction**

Only if QA required a correction:

```bash
git add src/components/site/ContactSection.tsx src/app/[locale]/site/contact/page.tsx messages/ja.json messages/zh.json messages/en.json
git commit -m "fix(site): polish contact responsive layout"
```
