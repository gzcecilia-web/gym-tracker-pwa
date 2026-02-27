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
        bg: '#F4F4F3',
        card: '#ffffff',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        olive: '#677a52',
        ink: '#1F2937'
      },
      boxShadow: {
        soft: '0 4px 14px rgba(0,0,0,0.06)'
      }
    }
  },
  plugins: []
};

export default config;
