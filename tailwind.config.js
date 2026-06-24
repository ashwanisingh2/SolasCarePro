/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0F172A',     // Deep Navy main bg
          card: '#1E293B',     // Card base
          violet: '#8B5CF6',   // Electric Violet accent
          cyan: '#06B6D4',     // Cyan highlight
          success: '#10B981',  // Emerald Green
          warning: '#F59E0B',  // Amber Yellow
          danger: '#EF4444',   // Rose Red
          border: '#334155',   // Subtle gray border
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
