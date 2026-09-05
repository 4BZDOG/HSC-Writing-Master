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
      // ────────────────────────────────────────────────────────────────────
      // DESIGNED LAYER SCALE (single source of truth for stacking order)
      //
      // Every global overlay/floating layer draws its `z-<token>` from this
      // table instead of a scattered arbitrary `z-[NNN]`. The NUMBERS are the
      // app's historically-grown ranks, preserved EXACTLY so that no layer
      // changes its relative stacking order — the names add meaning and a
      // single edit point without renumbering anything. Tiers are listed
      // strictly bottom → top; equal numbers are deliberate co-tiers that let
      // DOM order decide (unchanged from before).
      //
      //   token             │  z   │ purpose
      //   ──────────────────┼──────┼──────────────────────────────────────────
      //   header            │  60  │ sticky app header / top nav bar
      //   header-pill       │  70  │ floating action pill above the header
      //                     │      │   (exit-focus-mode pill)
      //   modal             │ 100  │ BASE tier — standard modal scrim + panel
      //   dropdown          │ 100  │ co-tier: portal listbox/menu (Combobox)
      //   tooltip           │ 100  │ co-tier: portal hover tooltip
      //   popover           │ 120  │ anchored menus that open above base modals
      //                     │      │   (header tools menu, PDF export options)
      //   modal-elevated    │ 200  │ elevated / full-screen / admin modals
      //                     │      │   (must clear popovers)
      //   skip-link         │ 200  │ co-tier: keyboard skip-to-content link
      //   background-task   │ 400  │ persistent background-task indicator
      //   overlay-status    │ 500  │ persistent status chips (API health/monitor)
      //   modal-data        │ 500  │ co-tier: Data Manager modal
      //   upgrade           │ 900  │ upgrade / paywall modal
      //   quickstart        │ 940  │ first-run quick-start modal
      //   legal             │ 950  │ legal document modal
      //   agreement         │ 980  │ user agreement / consent modal
      //   toast             │ 1000 │ toast notifications
      //   status-banner     │ 1000 │ co-tier: API status (blocked) banner
      //   recalibrate       │ 1200 │ sample recalibration modal
      //   improvement       │ 1300 │ improvement review modal
      //   loading           │ 2000 │ global full-screen loading overlay
      //   profile           │ 2000 │ co-tier: user profile modal
      //   focus-editor      │ 2100 │ focus-area editor modal
      //   critical          │ 2200 │ confirmation / rename / flag — out-ranks all
      //
      // NOT in this scale (deliberately kept as local values):
      //   • AiBusyOverlay's `z` prop (default standard `z-50`, one call site
      //     overrides to `z-[100]`) — a component-LOCAL scrim inside a
      //     positioned modal panel, not a global layer.
      //   • WorkspaceRightPanel's `z-[30]` clip layer — local card stacking.
      // ────────────────────────────────────────────────────────────────────
      zIndex: {
        header: '60',
        'header-pill': '70',
        modal: '100',
        dropdown: '100',
        tooltip: '100',
        popover: '120',
        'modal-elevated': '200',
        'skip-link': '200',
        'background-task': '400',
        'overlay-status': '500',
        'modal-data': '500',
        upgrade: '900',
        quickstart: '940',
        legal: '950',
        agreement: '980',
        toast: '1000',
        'status-banner': '1000',
        recalibrate: '1200',
        improvement: '1300',
        loading: '2000',
        profile: '2000',
        'focus-editor': '2100',
        critical: '2200',
      },
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
      /*
       * Radius by ROLE, not by eye. See DesignSpec §3, "Radius & Elevation".
       *
       * Arbitrary values had drifted to ten of them — 14, 18, 20, 24, 28, 30,
       * 32, 36, 40, 44, 48px — across what are really four jobs. Each job now
       * has one name, so a new surface joins the set instead of picking a
       * number that looked about right.
       */
      borderRadius: {
        // A modal shell or a workspace card: the outermost box of a surface
        // that floats over the page.
        surface: '32px',
        // The same surface's INNER edge, for a header or footer that sits
        // inside its 2px border. 32 - 2 = 30; the pair has to move together or
        // the corner shows a sliver of the wrong curve.
        'surface-inner': '30px',
        // A section inside a surface: an accordion, a reference panel, a
        // bordered block of settings. Matches PANEL_SURFACE.
        panel: '20px',
        // A fixed-size square: an icon tile, an avatar, a badge. A percentage
        // because the radius has to track the box — the same 32px on a 56px
        // tile and a 112px one reads as two different shapes. This is the one
        // place a non-token radius was doing real work.
        tile: '32%',
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
