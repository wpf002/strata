/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#080f1a', 900: '#0d1b2e', 800: '#112240', 700: '#1B3A5C',
          600: '#244d7a', 500: '#2d6098',
        },
        gold: { 400: '#e8c96a', 500: '#C9A84C', 600: '#a8893a' },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
