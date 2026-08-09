import type { Config } from 'tailwindcss'

const config: Config = {
  // 扫描范围必须与门禁（check-style-tokens.mjs）一致 = src 全树（design-system §7.5）。
  // src/venue 长期缺席：画布组件里的类名（含 slate-* 桌面灰、[writing-mode:vertical-rl]
  // 等任意值）此前只在别处碰巧同名时才被顺带生成，一旦别处删掉就静默失效。
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    './src/venue/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // 支持 `/N` 透明度修饰符的 token 仅限：ink-* / primary / primary-hover / primary-ring
      // （它们映射到 `rgb(var(--x) / <alpha-value>)`，Tailwind 用修饰符替换 <alpha-value>）。
      // 其余 token（canvas/surface/line-*/primary-soft*/primary-border/success|warning|danger|info-*/muted-*）
      // 映射到固定透明度的 var()（rgba(...) 或 hex），加 `/N` 修饰符 Tailwind 会静默不生成类——禁止这样用。
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
        },
        line: { soft: 'var(--line-soft)', DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          soft: 'var(--primary-soft)',
          'soft-hover': 'var(--primary-soft-hover)',
          border: 'var(--primary-border)',
          ring: 'rgb(var(--primary) / <alpha-value>)',
        },
        success: { text: 'var(--success-text)', soft: 'var(--success-soft)', dot: 'var(--success-dot)', border: 'var(--success-border)' },
        warning: { text: 'var(--warning-text)', soft: 'var(--warning-soft)', dot: 'var(--warning-dot)', border: 'var(--warning-border)' },
        danger:  { text: 'var(--danger-text)',  soft: 'var(--danger-soft)',  dot: 'var(--danger-dot)', border: 'var(--danger-border)', strong: 'var(--danger-strong)' },
        info:    { text: 'var(--info-text)',    soft: 'var(--info-soft)',    dot: 'var(--info-dot)', border: 'var(--info-border)' },
        muted:   { text: 'var(--muted-text)',   soft: 'var(--muted-soft)',   dot: 'var(--muted-dot)' },
        'row-hover': 'var(--row-hover)',
      },
      fontFamily: {
        // design-system §2：mono 仅用于编号/金额/代码。Tailwind 默认 mono 栈里是
        // "SFMono-Regular"（而非 "SF Mono"），与设计稿登记的字族名不一致，故显式覆盖。
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        micro: ['11px', '14px'], xs: ['12px', '16px'], sm: ['13px', '18px'],
        md: ['14px', '20px'], lg: ['15px', '22px'], xl: ['20px', '26px'], '2xl': ['24px', '30px'],
      },
      borderRadius: { card: '14px', field: '10px', icon: '7px', btn: '999px' },
      letterSpacing: { kpi: '-0.03em', title: '-0.02em', section: '-0.01em' },
      boxShadow: {
        card: '0 1px 3px rgba(33,28,51,0.05), 0 8px 24px -12px rgba(124,58,237,0.08)',
        pop: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
      },
      backgroundImage: {
        'primary-gradient': 'var(--primary-gradient)',
      },
    },
  },
  plugins: [],
}

export default config
