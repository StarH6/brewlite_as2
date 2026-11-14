import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        coffee: {
          50: '#faf6f1',
          100: '#f2e8dc',
          200: '#e6d2bd',
          300: '#d5b394',
          400: '#c18f6c',
          500: '#a9704f',
          600: '#8a573c',
          700: '#6f4431',
          800: '#4b2e1f',
          900: '#2f1c13',
        },
        cream: '#f7f1e8',
      },
      boxShadow: {
        card: '0 18px 40px -24px rgba(75, 46, 31, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
