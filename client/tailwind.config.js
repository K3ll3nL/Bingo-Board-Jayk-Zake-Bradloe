/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#8b5cf6',
        secondary: '#ec4899',
      }
    },
  },
  safelist: [
    // BDSPRadar StatCard dynamic color lookup (COLOR_MAP)
    'text-emerald-400',
    'text-yellow-400',
    'text-red-400',
    'text-amber-400',
    'text-pink-400',
    'text-violet-400',
    // BDSPRadar range slider accent
    'accent-indigo-500',
  ],
  plugins: [],
}
