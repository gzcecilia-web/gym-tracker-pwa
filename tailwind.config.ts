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
        bg: '#FAF9F6',
        card: '#ffffff',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        profile: 'rgb(var(--profile-accent-rgb) / <alpha-value>)',
        sun: '#F4C95D',
        balance: '#A8C686',
        brown: '#8C5E58',
        ink: '#2B2B2B',
        muted: '#7B7872',
        line: '#ECEAE6',
        lineStrong: '#DDD8D0',
        surface: '#FFFFFF',
        surfaceSoft: '#FDFCF9'
      },
      borderRadius: {
        'r-lg': '20px',
        'r-md': '16px',
        'r-sm': '12px'
      },
      boxShadow: {
        soft: '0 6px 18px rgba(90, 80, 67, 0.06)',
        card: '0 10px 24px rgba(90, 80, 67, 0.07)',
        float: '0 16px 34px rgba(90, 80, 67, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
