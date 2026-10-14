import { PUBLIC_SITE_LOCALES, publicSiteUrl, type PublicLocale } from './domain-routing.ts'

// 官网每个页面的 canonical + hreflang。
//
// 同一页面线上有好几个网址能打开：eacn.agenova.chat/vision、/ja/vision（同样
// rewrite 到这一页）、内部域名 mcn.agenova.chat/ja/site/vision。canonical 统一指向
// 官网域名上的无 /ja 前缀形态，让搜索引擎把权重归到对外网址；languages 声明
// 日/英/中三版互为翻译，x-default 给默认语言（日文）。
//
// 每个页面在自己的 generateMetadata 里调用，**不要挪到 site/layout.tsx 统一给**：
// Next 的 metadata 逐段浅合并，子页面漏写 alternates 就会继承 layout 的值——
// 等于把漏写的页面声明成首页的重复页、从搜索结果里撤掉。seo.test.ts 用源码断言
// 钉住了「每个 page.tsx 都调用、且路径指向自己」。

export interface SiteAlternates {
  canonical: string
  languages: Record<string, string>
}

function toPublicLocale(locale: string): PublicLocale {
  return (PUBLIC_SITE_LOCALES as readonly string[]).includes(locale)
    ? (locale as PublicLocale)
    : PUBLIC_SITE_LOCALES[0]
}

/** suffix 是相对站点根的路径：'/'、'/vision'、'/news/<slug>'。 */
export function siteAlternates(locale: string, suffix: string): SiteAlternates {
  const languages: Record<string, string> = {}
  for (const l of PUBLIC_SITE_LOCALES) languages[l] = publicSiteUrl(l, suffix)
  languages['x-default'] = publicSiteUrl(PUBLIC_SITE_LOCALES[0], suffix)
  return { canonical: publicSiteUrl(toPublicLocale(locale), suffix), languages }
}
