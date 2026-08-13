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
    // aria-hidden：纯装饰性的瞬态层，同一句宣言在 VISION 页有正式标题呈现，
    // 读屏用户不需要在导航区听到它。
    <div
      aria-hidden
      className="site-veil pointer-events-none fixed inset-0 z-[60] animate-site-veil bg-site-veil"
      style={{ clipPath: CLIP }}
    >
      <div className="site-veil-body max-w-[520px] animate-site-veil-in pl-14 pr-8 pt-[104px]">
        <div className="font-condensed text-[13px] tracking-[0.34em] text-site-on-accent">
          {t('eyebrow')}
        </div>
        <div className="mt-[18px] font-serif-jp text-[28px] leading-[1.3] text-site-on-accent md:text-[40px]">
          {t('line1')}
          <br />
          {t('line2')}
        </div>
      </div>
    </div>
  )
}
