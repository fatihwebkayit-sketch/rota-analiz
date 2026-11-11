/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0e0f10', 900: '#131415', 850: '#17181a', 800: '#1c1d20', 700: '#25272b', 600: '#33363b', 500: '#4a4e55' },
        fg: { DEFAULT: '#e7e5e0', muted: '#9a9ca1', faint: '#6b6e74' },
        amber: { DEFAULT: '#f0a03c', soft: '#f0a03c26' },
        up: '#5fb57f',
        down: '#e2614f',
      },
      fontFamily: { sans: ['"Inter Variable"', 'system-ui', 'sans-serif'] },
      fontSize: { '2xs': ['10.5px', '14px'] },
    },
  },
  plugins: [],
};
