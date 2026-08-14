# Design Language & Style Specification (v2.2.1)

## 1. Design Philosophy

**Cognitive Clarity First**: The interface is designed to reduce cognitive load while providing deep context. It uses a split-pane architecture to keep the user's work (Writing) and the AI's assistance (Context/Feedback) visible simultaneously.

**Luminous Progression**: The UI is "alive" and reacts to user progress. The **Editor** and **Action Buttons** shift through a chromatic scale (Slate -> Emerald -> Sky -> Indigo) as the response quality and word count increase.

**The "Studio" Aesthetic**: A premium, professional feel achieved through:

- **Cubic Mesh Textures**: Subtle SVG overlays used in headers and cards to provide tactile depth.
- **Glassmorphism**: Heavy use of `backdrop-blur-3xl` and semi-transparent surfaces (`bg-surface/80`).
- **Aurora Motion**: Deep-layer animated blobs in the background to prevent a static feel.

## 2. Colour System

### Brand & Tier Colors (Semantic)

The application uses a 6-tier system mapped to NESA Command Verbs:

- **Tier 1 (Retrieving)**: Red (`#ef4444`) - Recall, Define.
- **Tier 2 (Comprehending)**: Orange (`#f97316`) - Describe, Outline.
- **Tier 3 (Applying)**: Yellow/Amber (`#f59e0b`) - Apply, Calculate.
- **Tier 4 (Analysing)**: Green/Emerald (`#10b981`) - Explain, Analyse.
- **Tier 5 (Synthesising)**: Blue/Sky (`#0ea5e9`) - Discuss, Synthesise.
- **Tier 6 (Evaluating)**: Purple/Indigo (`#6366f1`) - Evaluate, Justify.

### Chromatic Progression (Editor States)

1.  **Draft** (0-15%): Slate themes, focused on initial input.
2.  **Forming** (15-40%): Emerald themes, indicates a viable response is taking shape.
3.  **Polishing** (40-75%): Sky/Blue themes, indicates structural completeness.
4.  **Mastery** (75%+): Indigo/Purple "Glow", indicates potential Exemplar (Band 6) quality.

### Light Theme Parity

The app was drawn dark-first, so light is where colour quietly goes missing. Two
rules, and the second is the one that gets broken.

**1. A tint must be visible against the surface it is on.** Dark surfaces are
near-black, so an alpha wash (`bg-<hue>-500/10`) reads clearly. Light surfaces
are white, where the matching `-50` shade is a ~2% difference and effectively
is not there. The light steps are therefore one stop deeper than their dark
counterparts _look_: `-100` for a surface wash, `-200` for a tile sitting on
one. `getBandConfig` is the source of truth and `bandColors.test.ts` pins it.

**2. Whether a white-alpha token needs a light partner depends on what is
BEHIND it, not on the token.** This is what makes a blanket find-and-replace
the wrong tool — most white-alpha classes in this codebase are already correct:

- **On a coloured gradient or a modal backdrop** — the editor header, the
  score placard, the verb ribbon's tier tile and detail-card icon,
  `bg-black/80` scrims. These are the same colour in both themes, so
  `bg-white/20` and `border-white/20` are right as written and must be left
  alone.

  This example used to read "the ribbon header", and that surface is gone —
  the verb ribbon's header was a full-bleed tier gradient until it became a
  glass rail, and its tier colour now lives on a 36px tile and a 2px
  underline. The rule is unchanged; only the illustration moved. Check what a
  class is painted on, not what this list happened to name when it was
  written.
- **On a theme surface** — anything over `--color-bg-surface`, a `bg-white`
  card, or a `slate-100/200` track. Here white-alpha is invisible in light
  mode, and the element silently loses its ring, rim, tick or divider. These
  need an explicit pair: `ring-slate-900/10 dark:ring-white/10`.

When auditing, the question is never "is this class dark-only?" but "what is it
painted on?".

**Which variant to write in new code.** Light is the base and `dark:` carries
the override — `bg-white/80 dark:bg-[rgb(var(--color-bg-surface))]/70` — as in
`utils/panelStyles.ts`, `components/PdfExportOptions.tsx` and
`utils/headerChrome.ts`. That is the Tailwind-native form, and putting the pair
in one place makes the §2 audit above a reading exercise rather than a search.
The project-local `light:` variant (`tailwind.config.js`) remains
valid and existing components are **not** being migrated, because `App.tsx`
maintains both the `.dark` class and `[data-theme='light']`. Expect to meet
both idioms; write the new one.

## 3. Component Patterns

### Layering & Hierarchy

- **Base**: Deep deep-sea navy (`#0a0f1a`) with noise and radial gradients.
- **Surface**: Card containers with 1px border (`white/10`) and slight elevation.
- **Inlay**: Darker, recessed wells (`bg-surface-inset`) for inputs and code blocks.

### Interaction States

- **Haptic Buttons**: Heavy shadows, 105% hover scaling, and active state compression (95%).
- **Syllabus Nodes**: Circular "nodes" in the navigator indicate path completeness with pulsing glows.

### Keyboard Reach

The rule: **a keyboard user must be able to reach exactly what is on screen —
no more, no less.** Both halves get broken in the same way, by treating a visual
state as if it were a DOM state.

- **Modal dialogs** (`aria-modal="true"`) must use `useFocusTrap`. The
  attribute tells assistive technology the rest of the page is inert; only the
  trap makes that true. Put the ref on the element carrying `role="dialog"`
  and give it `tabIndex={-1}`. The hook also restores focus to whatever opened
  the dialog — without that, closing a modal drops a keyboard user back at the
  top of the document.
- **Non-modal popovers** (`role="dialog"` _without_ `aria-modal`, e.g.
  `PdfExportOptions`) must NOT trap. The page behind them is live and Tab is
  expected to move on.
- **Collapsed disclosures** need `inert` while shut. The grid-rows animation
  takes a panel to zero height, which is a visual collapse and nothing more —
  its buttons stay in the tab order and in the accessibility tree. `inert`
  costs nothing visually, unlike hiding the content, which fights the
  animation.

Both concerns arbitrate by stack, matching `useEscapeKey`: only the topmost
surface acts, because dialogs do open over each other.

## 4. Typography

- **Interface**: `Inter` - High legibility for data-dense controls.
- **Manuscript**: `Newsreader` (Serif) - Used for the main writing area and AI exemplars to simulate the gravity of an official examination paper.
- **Telemetry**: `JetBrains Mono` - Used for marks, token counts, and system logs.

## 5. Print & Export

Custom `@media print` styles ensure:

- Removal of all UI chrome and backgrounds.
- Transformation of serif text to high-contrast black.
- Prevention of page breaks within criteria blocks.
- Standardised 15mm margins.
