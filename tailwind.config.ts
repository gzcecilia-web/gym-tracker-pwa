import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAF9',
        card: '#ffffff',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        olive: '#677a52',
        ink: '#111827',
        muted: '#6B7280',
        line: '#E5E7EB',
        surface: '#FFFFFF'
      },
      borderRadius: {
        'r-lg': '20px',
        'r-md': '16px',
        'r-sm': '12px'
      },
      boxShadow: {
        soft: '0 4px 14px rgba(15, 23, 42, 0.06)',
        card: '0 6px 18px rgba(15, 23, 42, 0.06)',
        float: '0 10px 26px rgba(15, 23, 42, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
