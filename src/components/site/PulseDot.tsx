/** 呼吸方块。零圆角 —— 官网没有圆形指示灯，只有方块。 */
export default function PulseDot({ size = 9 }: { size?: number }) {
  return (
    <i
      aria-hidden
      className="site-pulse block shrink-0 animate-site-pulse bg-site-accent"
      style={{ width: size, height: size }}
    />
  )
}
