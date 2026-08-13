'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

/** 三角幕的斜边：右上顶点在视口宽 68%，左下顶点在视口高 96%。 */
const VEIL_W = 0.68
const VEIL_H = 0.96
const CLIP = `polygon(0 0, ${VEIL_W * 100}% 0, 0 ${VEIL_H * 100}%)`

/**
 * logo 三角幕：hover 顶栏 logo 时，青色三角从左上角尖点扫开覆盖视口，
 * 内含公会宣言。
 *
 * 分工：什么时候「开」由 SiteHeader 决定（logo 的 hover），什么时候「关」
 * 由本组件自己决定（光标离开三角区域）。
 *
 * pointer-events:none 让它完全不拦截点击 —— 幕布盖着的时候导航照样能点，
 * 也因此 mousemove 事件能穿透到 window 上被下面的监听收到。
 */
export default function LogoVeil({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('site.veil')

  useEffect(() => {
    if (!open) return
    const onMove = (e: MouseEvent) => {
      // 直角三角形的内部判定：x/宽 + y/高 <= 1 即在斜边内侧
      const inside = e.clientX / (window.innerWidth * VEIL_W) + e.clientY / (window.innerHeight * VEIL_H) <= 1
      if (!inside) onClose()
    }
    // 光标移动是主要的收起方式，但不能是唯一的：hover 到 logo 之后直接滚滚轮
    // （光标一动不动）或用键盘操作的人，会被幕布一直挡着半个屏幕。
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('scroll', onClose, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // aria-hidden：纯装饰性的瞬态层，只能靠 hover 唤出（触屏与键盘都进不来），
    // 读屏用户不需要在导航区听到它。注意这里的内容现在是致敬语、站内别处没有
    // 第二处呈现 —— 若哪天要求它对读屏可达，得先给它一个非 hover 的入口。
    <div
      aria-hidden
      className="site-veil pointer-events-none fixed inset-0 z-[60] animate-site-veil bg-site-veil"
      style={{ clipPath: CLIP }}
    >
      <div className="site-veil-body max-w-[460px] animate-site-veil-in pl-14 pr-8 pt-[104px]">
        <div className="font-condensed text-[13px] tracking-[0.34em] text-site-on-accent">
          {t('eyebrow')}
        </div>
        {/* 20px 而不是原来的 40px，盒子也从 520 收到 460：文字块是矩形、三角幕
            越往下越窄，行数一多右下角就会戳出斜边被裁掉。原来的两行宣言在
            1024×640 就已经切掉第二行末尾 30px（既有问题），换成现在这句致敬语
            后最深一行溢出 151px。
            字号由作品名决定，不是随手挑的：『天は赤い河のほとり』连书名号是 11
            个全角字，40px 下单行就要 440px，而这一行所在深度上斜边只给到 ~460px
            —— 任何 24px 以上的字号都会把作品名拦腰断成两行。20px + 460px 盒子
            让日文稳定落成三行、作品名完整，最窄档仍留 63px 余量。
            以后若把这句改短，可以连同这两个值一起调回去。 */}
        <div className="mt-[18px] font-serif-jp text-[20px] leading-[1.5] text-site-on-accent">
          {t('line1')}
          <br />
          {t('line2')}
        </div>
      </div>
    </div>
  )
}
