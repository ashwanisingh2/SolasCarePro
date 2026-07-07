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
          success: '#34D399',  // Emerald Green (emerald-400)
          warning: '#FBBF24',  // Amber Yellow (amber-400)
          danger: '#F87171',   // Rose Red (rose-400)
          border: '#334155',   // Subtle gray border
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
