import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
        success: { text: 'var(--success-text)', soft: 'var(--success-soft)', dot: 'var(--success-dot)' },
        warning: { text: 'var(--warning-text)', soft: 'var(--warning-soft)', dot: 'var(--warning-dot)' },
        danger:  { text: 'var(--danger-text)',  soft: 'var(--danger-soft)',  dot: 'var(--danger-dot)' },
        info:    { text: 'var(--info-text)',    soft: 'var(--info-soft)',    dot: 'var(--info-dot)' },
      },
      fontSize: {
        micro: ['11px', '14px'], xs: ['12px', '16px'], sm: ['13px', '18px'],
        md: ['14px', '20px'], lg: ['15px', '22px'], xl: ['20px', '26px'], '2xl': ['24px', '30px'],
      },
      borderRadius: { card: '14px', field: '10px', chip: '7px', btn: '999px' },
      boxShadow: {
        card: '0 1px 3px rgba(33,28,51,0.05), 0 8px 24px -12px rgba(124,58,237,0.08)',
        pop: '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)',
        'card-hover': '0 1px 3px rgba(33,28,51,0.07), 0 4px 10px -6px rgba(33,28,51,0.10)',
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #a855f7 100%)',
      },
    },
  },
  plugins: [],
}

export default config
