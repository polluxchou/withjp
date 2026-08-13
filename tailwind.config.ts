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
        // 对外官网（/[locale]/site）的独立命名空间。fg 走 rgb 三元组以支持
        // `/N` 修饰符（官网文字层级全靠白色透明度分级）；其余是固定值 var()，
        // 加 `/N` 会被 Tailwind 静默丢弃——禁止这样用。
        site: {
          canvas: 'var(--site-canvas)',
          panel: 'var(--site-panel)',
          header: 'var(--site-header)',
          fg: 'rgb(var(--site-fg) / <alpha-value>)',
          accent: 'var(--site-accent)',
          // 三角幕专用：固定亮青，不随主题翻转（理由见 globals.css 的 --site-veil）
          veil: 'var(--site-veil)',
          'on-accent': 'var(--site-on-accent)',
          hot: 'var(--site-hot)',
          'hot-hover': 'var(--site-hot-hover)',
          'on-hot': 'var(--site-on-hot)',
          line: 'var(--site-line)',
          'line-strong': 'var(--site-line-strong)',
        },
      },
      fontFamily: {
        // design-system §2：mono 仅用于编号/金额/代码。Tailwind 默认 mono 栈里是
        // "SFMono-Regular"（而非 "SF Mono"），与设计稿登记的字族名不一致，故显式覆盖。
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        // 对外官网专用（后台仍禁衬线、禁混搭）：condensed 承担英文标题与全部
        // 大写标签，serif-jp 承担和文明朝标题。两个拉丁族由 next/font 自托管
        // （变量在 src/app/[locale]/site/layout.tsx 注入）；和文走系统栈，
        // 不下载字体——理由见该 layout 的注释。
        condensed: ['var(--font-barlow-condensed)', '"Hiragino Sans"', '"Noto Sans JP"', 'sans-serif'],
        'serif-jp': [
          '"Noto Serif JP"',
          '"Hiragino Mincho ProN"',
          '"Yu Mincho"',
          'YuMincho',
          '"MS PMincho"',
          'serif',
        ],
        site: [
          'var(--font-barlow)',
          '"Hiragino Sans"',
          '"Noto Sans JP"',
          '"Yu Gothic"',
          'system-ui',
          'sans-serif',
        ],
      },
      // 官网的白色透明度阶梯。Tailwind 默认 opacity 阶只有 5 的倍数中的一部分
      // （0/5/10/20/25/30/40/50/60/70/75/80/90/95/100），而颜色的 `/N` 修饰符取的
      // 就是这张表 —— 写 `text-site-fg/78` 而表里没有 78，Tailwind 不报错、直接
      // 不生成类（教训同 design-system §7 的静默失效）。设计稿用到的档位在此登记。
      opacity: {
        8: '0.08',
        15: '0.15',
        22: '0.22',
        35: '0.35',
        55: '0.55',
        62: '0.62',
        65: '0.65',
        66: '0.66',
        68: '0.68',
        72: '0.72',
        78: '0.78',
      },
      animation: {
        // 官网动效。keyframes 定义在 globals.css（reduced-motion 降级也在那里）。
        'site-ticker': 'site-ticker 38s linear infinite',
        'site-pulse': 'site-pulse 2s infinite',
        'site-veil': 'site-veil .42s cubic-bezier(.2,.8,.2,1) both',
        'site-veil-in': 'site-veil-in .5s .1s both',
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
