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
      //   status-banner     │ 1000 │ API status (blocked) banner
      //   recalibrate       │ 1200 │ sample recalibration modal
      //   improvement       │ 1300 │ improvement review modal
      //   toast             │ 1350 │ toast notifications — over every modal a
      //                     │      │   toast can be raised from, so "Undo" and
      //                     │      │   export failures are seen, not buried
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
        'status-banner': '1000',
        recalibrate: '1200',
        improvement: '1300',
        toast: '1350',
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
      /*
       * The same surface tokens again, for GRADIENT STOPS.
       *
       * `backgroundColor` above does not feed `from-*` / `via-*` / `to-*` —
       * those read `gradientColorStops`, which falls back to `colors`, which
       * here holds only `primary` and `accent`. So a fade that has to end in
       * the page's own colour had no theme-aware way to say so, and the one
       * place that needs it (the verb ribbon's strip fades) wrote the light
       * value out as a literal `from-slate-50` with a `dark:` partner — a
       * hand-copied snapshot of `--color-bg-base` that silently went wrong the
       * moment that token moved, which is exactly what has just happened.
       *
       * Only the two a fade can legitimately end in: the page behind it, and
       * the card it might instead sit on.
       */
      gradientColorStops: {
        base: 'rgb(var(--color-bg-base) / <alpha-value>)',
        surface: 'rgb(var(--color-bg-surface) / <alpha-value>)',
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
        // 'IBM Plex Sans Variable' is the family name @fontsource-variable
        // registers; the static family name follows it so a browser that has
        // Plex installed but cannot load a variable font still gets the right
        // face rather than dropping to the system sans.
        sans: ['IBM Plex Sans Variable', 'IBM Plex Sans', 'sans-serif'],
        // Two faces, two jobs. Plex reads the prose and the UI; Inter carries
        // the display roles it always carried here — the wordmark, the two
        // card headings and the section headings — where its 900 and its
        // tighter caps are the point. See `.t-display` / `.t-section`.
        display: ['Inter Variable', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      fontWeight: {
        // IBM Plex Sans has no 900. Its weight axis stops at 700, and so does
        // Newsreader's, so the ladder in DesignSpec §4 has five rungs and four
        // faces to put them on: one pair has to merge.
        //
        // 600 and 700 must not, because a card title at 600 and its section
        // heading at 700 sit next to each other on nearly every surface, and
        // merging them flattens the hierarchy people actually read. 700 and 900
        // can, because display type is already carrying its rank at three times
        // the size — the weight was a refinement on top of that.
        //
        // So `font-black` emits 700 rather than 900. Stating it here, instead
        // of leaving 900 in the config to be silently clamped at paint time,
        // means the config and the screen agree — grep for the weight and you
        // get what renders.
        black: '700',
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
        // A line drawing itself in from its left end: the verb's rule under the
        // ribbon's poster-scale heading, and the ceiling across its staircase.
        // Keyed on the verb or the tier at the call site, so it replays when the
        // question changes and not otherwise.
        'rule-draw': 'ruleDraw 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
        // A staircase building itself, one column after another from the left.
        // The delay is per column and inline, so the stagger is a property of
        // the column's position and not of a class; `both` so a column waiting
        // for its turn holds at the first frame instead of showing at full height
        // and then collapsing to start.
        'stair-rise': 'stairRise 650ms cubic-bezier(0.16, 1, 0.3, 1) both',
        // The ribbon's verb changing under a reader's thumb. A new verb arrives
        // from a dim, low start rather than from nothing: the old block is
        // unmounted the instant a chip is tapped, and a fade from `opacity: 0`
        // leaves the stage visibly empty for the first frames of the swap. This
        // starts at 0.3 and 6px down and settles in 320ms, so the word reads as
        // refreshed rather than blinked. `translate3d` so Safari puts it on the
        // compositor from frame one.
        'verb-swap': 'verbSwap 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        // The other half of a cross-fade: the ribbon's outgoing light. Same
        // duration and curve as `fade-in`, so the two opacities sum to one all
        // the way across and the stage never dips toward black between tiers.
        'fade-out': 'fadeOut 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
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
        // The final frame IS the resting state, for the reason `tierIgnite`'s
        // comment gives: the reduced-motion block runs an animation once,
        // instantly, and leaves it on its last frame. A line that ended at
        // `scaleX(0)` would be invisible for exactly the readers who asked for
        // no motion; this one ends full length. `both` fills backwards too, so
        // the delay-free start frame holds before the first paint.
        ruleDraw: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        // Same rule for the last frame: the resting state, full height. Growing
        // from the foot of the column (`origin-bottom` at the call site).
        stairRise: {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
        // Ends at the resting state (opacity 1, no offset) like every other
        // keyframe here, so the reduced-motion block's instant run leaves the
        // verb exactly where it would have been.
        verbSwap: {
          '0%': { opacity: '0.3', transform: 'translate3d(0, 6px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        // The one exception to "ends at rest": this is a LEAVING layer, which
        // the call site unmounts when the cross-fade is over. Its reduced-motion
        // run lands on opacity 0 and the same unmount removes it.
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('light', '[data-theme="light"] &');
      // Hover that only exists where a pointer can hover. On a touch screen a tap
      // leaves `:hover` stuck on the element until the next tap elsewhere, so a
      // hover style is not a hint there, it is a state the control is left in:
      // iOS Safari kept tier cards at 1.02 scale and columns at 125% brightness
      // after a tap, and then animated them back when the selection moved. This
      // wraps the rule in `@media (hover: hover)`, which iPhones report false.
      // Compose it as `can-hover:hover:*` or `can-hover:group-hover/step:*`.
      addVariant('can-hover', '@media (hover: hover)');
    },
  ],
};
