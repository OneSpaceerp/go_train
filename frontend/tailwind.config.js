/**
 * Go Train design tokens — Apple HIG & WCAG AA calibrated.
 * Light & Dark semantic channels support <alpha-value>; coral accent provides
 * unmistakable interactive affordance while brand-650 (#D92632) guarantees
 * >= 4.68:1 contrast with white label text.
 */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.22, 1.2, 0.36, 1)',
      },
      colors: {
        brand: {
          50: '#FFF0F1',
          100: '#FFDDDF',
          200: '#FFC2C5',
          300: '#FF9CA1',
          400: '#FF7E84',
          500: '#FB5A5F',
          600: '#F23D46',
          650: '#D92632', // 4.68:1 contrast vs #FFFFFF (WCAG AA compliant CTA fill)
          700: '#BE1E28',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          mute: 'rgb(var(--ink-mute) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          page: 'rgb(var(--page) / <alpha-value>)',
          sunk: 'rgb(var(--sunk) / <alpha-value>)',
          elevated: 'rgb(var(--elevated) / <alpha-value>)',
        },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)' },
        bad: { DEFAULT: 'rgb(var(--bad) / <alpha-value>)' },
        field: 'rgb(var(--field) / <alpha-value>)',
      },
      // Body/UI on the system font (instant, offline, matches the OS);
      // Poppins (Cairo in Arabic) as the display face for titles and numbers
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
      },
      borderRadius: {
        field: '0.875rem',
        tile: '1rem',
        card: '1.375rem',
        sheet: '2rem',
      },
      boxShadow: {
        card: '0 6px 20px -8px rgba(20, 24, 40, 0.08), 0 1px 3px rgba(20, 24, 40, 0.04)',
        nav: '0 -8px 28px -12px rgba(15, 20, 35, 0.14)',
        dock: '0 12px 32px -8px rgba(15, 20, 35, 0.22), 0 2px 8px rgba(15, 20, 35, 0.08)',
        fab: '0 10px 24px -6px rgba(217, 38, 50, 0.48)',
      },
      screens: { standalone: { raw: '(display-mode: standalone)' } },
    },
  },
  plugins: [],
}
