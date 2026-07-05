/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Semantic ink-on-paper palette ─────────────────────────────
        // Kept the `brand.500` key so any code that still imports
        // `#3757FF` via a class keeps compiling — but it now points at
        // the new refined indigo.
        brand: {
          50:  '#EEF0FB',
          100: '#DDE2F7',
          200: '#B8C1EF',
          300: '#8E9BE6',
          400: '#6A78DE',
          500: '#4B5FE0', // primary indigo (oklch 0.52 0.16 268)
          600: '#3B4CC4',
          700: '#2E3CA0',
          800: '#25307E',
          900: '#1C2560',
        },
        // NEW — single warm accent, reserved for the create-event CTA.
        accent: {
          50:  '#FBEFE8',
          100: '#F6DDCC',
          200: '#EEBB9A',
          300: '#E89A70',
          400: '#E68A5E', // primary coral (oklch 0.70 0.16 44)
          500: '#D9744A',
          600: '#B85A34',
          700: '#8F4326',
        },
        surface: {
          light: '#F6F4EE',  // warm paper
          dark:  '#0E0E10',
        },
        panel: {
          light: '#FDFCF8',  // cards / rails / sheets
          dark:  '#16161C',
        },
        elevated: {
          light: '#EDEAE1',
          dark:  '#1C1C24',
        },
        border: {
          light: '#E4E1D8',
          dark:  '#2A2A32',
        },
        muted: {
          light: '#8B8880',
          dark:  '#8A8A94',
        },
        text: {
          light: '#0E0E10',
          dark:  '#F5F5F2',
        },
      },
      fontFamily: {
        // Load via <link> in app/+html.tsx (see handoff/+html.tsx).
        sans:    ['Manrope', 'System', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [],
};
