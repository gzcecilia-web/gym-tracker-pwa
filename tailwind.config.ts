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
        bg: '#f7f6f2',
        card: '#ffffff',
        accent: '#b66f56',
        olive: '#677a52',
        ink: '#1f2937'
      },
      boxShadow: {
        soft: '0 8px 24px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};

export default config;
