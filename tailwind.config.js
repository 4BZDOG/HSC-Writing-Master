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
      // `colors` still feeds every colour utility (bg-*, text-*, border-*,
      // from-*, ring-*, …), so keep `primary`/`accent` here. The per-utility
      // palettes below add the app's SEMANTIC tokens, each mapped to a CSS var
      // that already flips per theme in index.css — so they are theme-aware
      // WITHOUT a `light:` counterpart. They deep-merge on top of the
      // colours-derived defaults; the semantic names (primary/secondary/…) are
      // unused as utility classes today, so this only ADDS classes.
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
      },
      backgroundColor: {
        base: 'rgb(var(--color-bg-base) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-bg-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-surface-elevated) / <alpha-value>)',
          inset: 'rgb(var(--color-bg-surface-inset) / <alpha-value>)',
          light: 'rgb(var(--color-bg-surface-light) / <alpha-value>)',
        },
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
      },
      textColor: {
        primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
        muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        dim: 'rgb(var(--color-text-dim) / <alpha-value>)',
      },
      borderColor: {
        primary: 'rgb(var(--color-border-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-border-secondary) / <alpha-value>)',
        accent: 'rgb(var(--color-border-accent) / <alpha-value>)',
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
        // The same event on the current step's DOT. It cannot share
        // `tier-ignite`: that flare is shaped for a bar — it stretches 2.4x
        // vertically and not at all horizontally, which on a `rounded-full`
        // child draws a teardrop rather than a halo, and holds it for 900ms.
        // A circle needs a uniform scale. Same duration and same curve, so the
        // dot and its band still read as one ignition.
        'dot-bloom': 'dotBloom 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
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
        // The dot's halo. Uniform `scale`, so a circle stays a circle:
        // `tierIgnite` is `scaleY(2.4)` with no matching `scaleX`, which is a
        // bar segment lighting up and a vertical teardrop on anything
        // `rounded-full`.
        //
        // Three frames, the same shape as `tierIgnite`, for a reason that is
        // easy to lose: the shared curve is an easeOutExpo, so a two-frame
        // `0.7 → 0` fade is all but over by 120ms. Measured in the browser at
        // that instant, a two-frame halo sat at opacity 0.28 while the bar's
        // flare beside it was still at 0.81 — one event, read as a flicker
        // and a bloom. Rising to a peak at 30% puts the two on one rhythm.
        //
        // The scales look large and are not. The halo is `inset-0` inside a
        // `w-4 h-4 border-2` dot, so its box is the dot's PADDING box — 12px
        // inside a 16px dot — and nothing shows at all until it passes 16/12.
        // Measured: 23.2px dot, 38.2px halo at the peak, both inside the
        // `ring-4` the current dot already wears.
        //
        // The same rule as `tierIgnite` binds the last frame and for the same
        // reason — it is the resting state, `opacity: 0`.
        dotBloom: {
          '0%': { opacity: '0', transform: 'scale(1)' },
          '30%': { opacity: '0.65', transform: 'scale(2.2)' },
          '100%': { opacity: '0', transform: 'scale(3)' },
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
