/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/popup/index.html'
  ],
  theme: {
    extend: {
      colors: {
        viridis: {
          primary: '#22c55e',
          secondary: '#047857',
          accent: '#f97316',
          light: '#dcfce7',
          dark: '#14532d'
        }
      }
    },
  },
  plugins: [],
};