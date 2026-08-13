import { Link } from '@/i18n/navigation'
import type { SiteArticle } from '@/lib/site/news'

/** NEWS 页的一行。窄屏把 4 列网格折成两行：日期+分类一行，标题一行。 */
export default function NewsRow({ article }: { article: SiteArticle }) {
  return (
    <Link
      href={article.href}
      className="grid gap-x-6 gap-y-2 border-b border-site-line px-2 py-6 transition-colors hover:bg-site-panel lg:grid-cols-[140px_120px_1fr_40px] lg:items-center"
    >
      <div className="flex items-center gap-3 lg:contents">
        <span className="font-condensed text-[15px] tracking-[0.08em] text-site-fg/60">{article.date}</span>
        <span className="border border-site-accent px-2 py-0.5 text-center font-condensed text-[11px] tracking-[0.14em] text-site-accent lg:py-[3px]">
          {article.tag}
        </span>
      </div>
      <span className="text-[17px]">{article.title}</span>
      <span aria-hidden className="hidden text-right text-site-accent lg:block">
        →
      </span>
    </Link>
  )
}

/** 首页三卡形态（同一条内容的另一种排布）。 */
export function NewsCard({ article, readLabel }: { article: SiteArticle; readLabel: string }) {
  return (
    <Link href={article.href} className="block h-full px-[26px] py-7">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="font-condensed text-[13px] tracking-[0.1em] text-site-fg/50">{article.date}</span>
        <span className="border border-site-accent px-2 py-0.5 font-condensed text-[11px] tracking-[0.14em] text-site-accent">
          {article.tag}
        </span>
      </div>
      <div className="text-[17px] font-medium leading-[1.6]">{article.title}</div>
      <div className="mt-4 font-condensed text-[13px] tracking-[0.18em] text-site-hot">{readLabel}</div>
    </Link>
  )
}
