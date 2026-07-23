import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neutral: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        primary: '#2563eb',
        destructive: '#dc2626',
        success: '#16a34a',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': {
          '--color-surface': '#ffffff',
          '--color-border': '#cbd5e1',
          '--color-muted': '#64748b',
        },
        ':root[data-theme="hc-dark"]': {
          '--color-surface': '#111111',
          '--color-border': '#ffffff',
          '--color-muted': '#d4d4d4',
        },
        ':root[data-theme="hc-light"]': {
          '--color-surface': '#f5f5f5',
          '--color-border': '#000000',
          '--color-muted': '#333333',
        },
      })
    }),
  ],
}

export default config
