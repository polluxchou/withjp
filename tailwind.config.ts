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
        canvas: '#fafafa',
        primary: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          soft: '#ede9fe',
        },
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.03)',
        'card-hover': '0 1px 3px rgba(0,0,0,0.07), 0 4px 10px -6px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}

export default config
