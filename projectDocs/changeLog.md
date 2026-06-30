# HSC AI Evaluator - Change Log

## [2.2.3] - 2026-06-30

### 🐛 Fixes

- **Ribbon Corner Flash**: Eliminated the square-corner artifact that flashed before the rounded corners settled when the writing progression ribbon (Editor header) animated. Added a `.clip-stable` utility that promotes rounded `overflow-hidden` surfaces to their own compositing layer up front, so the radius clip applies from the first frame. The Editor/Prompt headers and footers now also carry explicit matching corner radii as a fallback.
- **Cut-off Borders**: Removed the redundant `rounded-3xl overflow-hidden` wrapper around the Syllabus Reference panel that was clipping the inner accordion cards' rounded borders at the corners.
- **Project-wide Clip Stabilisation**: Extended `.clip-stable` to the remaining animated rounded `overflow-hidden` surfaces so they no longer flash square corners on entrance/transition — the Writing Metrics dashboard, Sample Answers and Marking Guide accordions, the gradient-header modals (Evaluation Result, Improvement Review, Outcome Detail, Command Term Guide, Sample Answer Generator), the Command Verb Hierarchy card, the Login card, and the idle/empty-state card.
- **Full Modal Uniformity**: Completed the pass across every remaining `animate-fade-in-up` modal panel (creators, importers, generators, the Data Manager, User Profile, Database Dashboard, confirmation/rename dialogs) and the Data Manager course-reorder cards, so all dialogs share the same flash-free rounded-corner entrance. Verified safe — each modal's only `position: fixed` element is its backdrop overlay, and embedded dropdowns are absolutely positioned, so promoting the panel to its own layer affects no fixed descendants.

- **Scrollbar Styling**: Fixed the `.custom-scrollbar` rule — the track was declared twice (the second actually styling the thumb) and there was no default thumb rule, so dark-theme panels fell back to the chunky native scrollbar. Slim themed thumbs now render in both themes, with hover states and Firefox (`scrollbar-width`/`scrollbar-color`) support. Also defined the missing `.scrollbar-hide` utility that the main workspace column, breadcrumb rail and verb-hierarchy carousel relied on (it isn't part of the Tailwind CDN build, so native scrollbars had been leaking through).

### ♿ Accessibility

- **Keyboard Focus Rings**: Replaced the blanket `outline: none !important` (which silently failed WCAG 2.4.7 — keyboard users had no visible focus anywhere) with a `:focus-visible` accent ring. Pointer interaction stays ring-free, so the mouse-driven look is unchanged.
- **Icon Button Labels**: Added `aria-label`s to icon-only modal close buttons that lacked them (and the Manifest search-clear button), so screen readers announce a purpose instead of an unlabelled button.
- **More Icon Labels**: Extended the audit to the remaining icon-only controls — the focus-mode toggle (now also `aria-pressed`), Sample Answers prev/next, Marking Guide save/cancel, the keyword add button, the prompt enrich-error dismiss, profile save, and the database back button.

### 🎨 Design

- **Border Consistency**: Normalised faint `border-white/5` outlines and dividers up to `border-white/10` across the main user-facing flow — the Prompt card footer and outcome chips, the Evaluation Result modal header, the Sample Answers dividers, the Breadcrumb bar, and the idle-state card. The dense admin/data-manager tools were intentionally left on their own consistent `/5` scale.
- **Glow Rendering Fix**: The band `glow` tokens are colour-only Tailwind shadow classes (`shadow-{color}/25`), which set the shadow colour but render nothing without a paired shadow-size utility. The Editor card, Prompt card and Command Term Guide modal were setting a glow with no size, so the signature chromatic glow never appeared; added `shadow-2xl` so it renders. Also gave the Evaluate button a resting `shadow-xl` so its band-coloured haptic glow shows before hover, not only on it.
- **Dead Opacity Modifiers**: Removed ~38 `border-opacity-*`/`bg-opacity-*` (and `hover:`/`light:` variants) utility classes across 12 components. Every band colour token (`getBandConfig`, `getStatusColor`) uses Tailwind's modern slash-alpha syntax (e.g. `border-purple-500/50`), which bakes the alpha in directly — the separate legacy opacity-modifier utilities only affect non-slash colours, so every one of these was a confirmed no-op (decorative dead code implying a hover/selection effect that never fired). Pure cleanup, zero visual change.
- **Broken Hover Interpolation**: Fixed `hover:${tierConfig.bg}` in the Command Verb Hierarchy tier-filter pills — interpolating a multi-class token string directly after a `hover:` prefix only scopes the _first_ class to hover; the trailing `light:`/`print:` classes lost their `hover:` condition and were rendering unconditionally, tinting the pill's background at all times in light mode instead of only on hover.

---

## [2.2.1] - 2025-05-23

### 🚀 Features

- **Gemini 3 Pro Integration**: Upgraded evaluation and generation to `gemini-3-pro-preview`.
- **Thinking Config**: Enabled reasoning budgets (up to 8k tokens) for complex marking tasks.
- **Vault Maintenance**: Integrated "Data Vault" into the primary selector for rapid data access.
- **Syllabus Audit v2**: Enhanced validation logic for "Complete" vs "Incomplete" curriculum points.

### 🎨 Design

- **Mesh Overlays**: Added cubic SVG textures to all major header surfaces.
- **Chromatic Progression**: The Editor's theme now dynamically shifts through a quality-based color scale.
- **Luminous Progress**: Refactored the Analysis Progress Bar with segmented high-density tracking and live micro-logs.

### 🔧 Maintenance

- **Documentation Audit**: Synchronized all `projectDocs` to reflect the final architectural state.
- **TypeScript Fixes**: Resolved inheritance issues in `ErrorBoundary` and type assertions in the Library system.
- **Data Integrity**: Implemented a "Repair Verbs" migration to fix mismatched verbs in imported datasets.

---

## [2.2.0] - 2025-05-22

### 🚀 Features

- **Strict Band Logic**: Implemented deterministic math for Band calculation based on Cognitive Tiers.
- **Time Machine**: Added Snapshot preview and restore capabilities to the Database Dashboard.
- **XP System**: Simulated Leveling/XP system for user engagement.

## [2.1.0] - 2025-05-18

### 🚀 Features

- **Admin Audit Studio**: First iteration of the bulk-processing dashboard.
- **Quality Check API**: Added dedicated endpoint for reviewing question/code quality.

## [2.0.0] - 2025-05-15

### 🛠️ Architecture

- **IndexedDB Migration**: Full data persistence layer using `idb`.
- **API Guard**: Circuit breaker implementation to handle rate limits and errors.
