/**
 * Go Train design tokens. Structure, type scale and shadow vocabulary follow the
 * Nest App design system (the design reference); the accent is Go Train's own
 * coral, sampled from the logo, so "if it's coral, you can tap it".
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
      },
      colors: {
        // Coral accent (the logo). 600 is the primary; 700 pressed; 50 wash.
        brand: {
          50: '#FFF0F1', 100: '#FFDDDF', 200: '#FFC2C5', 400: '#FF7E84',
          500: '#FB5A5F', 600: '#F23D46', 700: '#D32731',
        },
        ink: { DEFAULT: 'rgb(var(--ink) / <alpha-value>)', soft: 'rgb(var(--ink-soft) / <alpha-value>)', mute: 'rgb(var(--ink-mute) / <alpha-value>)' },
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          page: 'rgb(var(--page) / <alpha-value>)',
          sunk: 'rgb(var(--sunk) / <alpha-value>)',
        },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)' },
        bad: { DEFAULT: 'rgb(var(--bad) / <alpha-value>)' },
        field: 'rgb(var(--field) / <alpha-value>)',
      },
      fontFamily: { sans: ['Poppins', 'Cairo', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { field: '0.875rem', tile: '1rem', card: '1.5rem', sheet: '2rem' },
      boxShadow: {
        card: '0 8px 22px -8px rgba(180, 160, 165, 0.45)',
        nav: '0 -8px 30px -16px rgba(80, 30, 35, 0.28)',
        fab: '0 10px 24px -6px rgba(242, 61, 70, 0.5)',
      },
      screens: { standalone: { raw: '(display-mode: standalone)' } },
    },
  },
  plugins: [],
}
