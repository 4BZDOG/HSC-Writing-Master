/**
 * Build-time Tailwind config — ported verbatim from the inline
 * `tailwind.config` that used to accompany the cdn.tailwindcss.com script in
 * index.html. Styling is now compiled into the bundle (see index.css), so the
 * app renders without any runtime CDN dependency.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.tsx',
    './{components,hooks,utils,data,services,pdf}/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'bg-base': 'rgb(var(--color-bg-base) / <alpha-value>)',
        'bg-surface': 'rgb(var(--color-bg-surface) / <alpha-value>)',
        'bg-surface-elevated': 'rgb(var(--color-bg-surface-elevated) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      animation: {
        // Unified on a refined easeOutExpo curve for a cohesive, snappy feel.
        'pulse-glow': 'pulseGlow 4s infinite ease-in-out',
        'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-up-sm': 'fadeInUpSm 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in': 'slideIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-entry': 'toastEntry 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shake: 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'progress-indeterminate': 'progressIndeterminate 1.4s ease-in-out infinite',
        in: 'animateIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shimmer: 'shimmer 2s infinite linear',
        'spin-slow': 'spin 12s linear infinite',
        // One-shot bloom for the band a reader has just reached on the
        // cognitive spectrum. Nothing existing was a flare that returns to
        // rest: `pulseGlow` and `shimmer` are infinite, and `animateIn` /
        // `fadeIn` end at opacity 1 and stay there. It replays by `key`, not
        // by iteration count, so it costs nothing between question changes.
        'tier-ignite': 'tierIgnite 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        // All keyframes animate only transform/opacity so they stay on the
        // GPU compositor (no layout/paint thrash).
        pulseGlow: {
          '0%, 100%': { opacity: '0.2', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(1.05)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeInUpSm: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        toastEntry: {
          '0%': { opacity: '0', transform: 'translateX(24px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        progressIndeterminate: {
          '0%': { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%': { transform: 'translateX(60%) scaleX(0.6)' },
          '100%': { transform: 'translateX(180%) scaleX(0.4)' },
        },
        animateIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // The final frame IS the resting state, and that is load-bearing:
        // `index.css`'s reduced-motion block sets `animation-duration: 0.01ms`
        // and `animation-iteration-count: 1`, so for a reader who has asked for
        // no motion the flare runs once, instantly, and lands on its last
        // frame. Ending anywhere but `opacity: 0` would burn a permanent bloom
        // into the spectrum for exactly those readers.
        tierIgnite: {
          '0%': { opacity: '0', transform: 'scaleX(0.4) scaleY(1)' },
          '30%': { opacity: '0.85', transform: 'scaleX(1) scaleY(2.4)' },
          '100%': { opacity: '0', transform: 'scaleX(1) scaleY(1)' },
        },
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('light', '[data-theme="light"] &');
    },
  ],
};
