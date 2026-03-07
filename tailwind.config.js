/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf8ec',
          100: '#faefc8',
          400: '#e0b84a',
          500: '#C9A84C',
          600: '#a8882e',
          700: '#7d641e',
        },
        accent: {
          500: '#C0282B',
          600: '#9B1C1C',
          700: '#7f1d1d',
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
