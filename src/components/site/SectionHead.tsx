import { Link } from '@/i18n/navigation'

/**
 * 区块头：青色编号 eyebrow（`01 ／ NEWS`）+ 大标题，右侧可挂一个
 * 「VIEW ALL →」。设计稿每个区块都是这个开头，抽出来避免十几处复制。
 */
export default function SectionHead({
  eyebrow,
  title,
  sub,
  moreHref,
  moreLabel,
  titleFont = 'condensed',
  size = 'section',
  className = '',
}: {
  eyebrow: string
  title: string
  sub?: string
  moreHref?: string
  moreLabel?: string
  /** 英文/数字标题用 condensed；和文宣言用明朝 */
  titleFont?: 'condensed' | 'serif'
  /** section = 首页区块标题；page = 子页页头（设计稿里大一档） */
  size?: 'section' | 'page'
  className?: string
}) {
  const titleCls =
    titleFont === 'serif'
      ? 'font-serif-jp text-[clamp(24px,3.4vw,52px)] leading-[1.35]'
      : size === 'page'
        ? 'font-condensed text-[clamp(30px,4vw,56px)] tracking-[0.04em]'
        : 'font-condensed text-[clamp(28px,3.2vw,44px)] tracking-[0.04em]'

  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div>
        <div className="font-condensed text-[12px] tracking-[0.3em] text-site-accent">{eyebrow}</div>
        <h2 className={`mt-1.5 ${titleCls}`}>{title}</h2>
        {sub && <p className="mt-1.5 font-serif-jp text-[17px] text-site-fg/70">{sub}</p>}
      </div>
      {moreHref && moreLabel && (
        <Link
          href={moreHref}
          className="font-condensed text-[15px] tracking-[0.16em] text-site-accent transition-colors hover:text-site-fg"
        >
          {moreLabel}
        </Link>
      )}
    </div>
  )
}
