'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import BlueprintFrame from './BlueprintFrame'

/**
 * 首页头图的动态版：静帧永远渲染（它才是 LCP），视频作为覆盖层在满足条件时
 * 才挂载、加载完再淡入。
 *
 * 为什么不直接写 <video poster>：视频有 1.1MB，移动端流量占比最高而头图只是
 * 氛围件，所以窄屏根本不下载它 —— 这一条比任何图片压缩都省。另外 `<source
 * media>` 在现代浏览器里已失效，按屏宽取舍只能在客户端判。
 */
export default function SiteHeroVideo({
  src,
  poster,
  alt,
  sizes = '100vw',
  className = '',
}: {
  src: string
  poster: string
  alt: string
  sizes?: string
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // 窄屏省流量；reduced-motion 是无障碍诉求，两者都退化成静帧
    const wide = window.matchMedia('(min-width: 768px)')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    setMounted(wide.matches && !still.matches)
  }, [])

  useEffect(() => {
    if (!mounted) return
    // autoplay 属性被策略拒绝时不会报错、只是不播，这里补一次显式 play()
    ref.current?.play().catch(() => {})
  }, [mounted])

  return (
    <BlueprintFrame className={`overflow-hidden ${className}`}>
      <Image src={poster} alt={alt} fill sizes={sizes} priority className="object-cover" />
      {mounted && (
        <video
          ref={ref}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setVisible(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </BlueprintFrame>
  )
}
