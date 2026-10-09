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

The app was drawn dark-first, so light is where colour quietly goes missing.
Five rules. The two numbered 0 are the ground the other three stand on and were
both missing for most of this app's life; of the rest, the second is the one
that gets broken, and the third is the one that gets re-derived from scratch
every time it is broken.

**0. Both themes have a depth ladder, and light's runs the other way.**

Depth in the dark theme is luminance — the page at `10 15 26`, a card at
`18 24 38`, something lifted above the card at `30 41 59`. Translated
token-for-token into light, those became `248 250 252` / `255 255 255` /
`255 255 255`: a card sat ΔL\* 1.8 off the page it was on, and `surface` and
`elevated` were literally the same white. Every boundary in the light theme was
therefore carried by a 1px border, and those borders were alphas tuned against
near-black (see rule 2). The result is the "white on white" a bright monitor
turns into a lightbox.

The light ladder is now built on the relationship a light interface actually
has — **paper is the bright thing, and the desk it sits on is not**:

| token                         | light         | job                                                                                 |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `--color-bg-base`             | `226 232 240` | the desk                                                                            |
| `--color-bg-surface`          | `255 255 255` | the paper — unchanged, because it is what ~520 hard-written `bg-white`s already are |
| `--color-bg-surface-elevated` | `248 250 252` | a strip or menu lying **on** the paper                                              |
| `--color-bg-surface-inset`    | `231 237 244` | a well cut **into** the paper                                                       |
| `--color-bg-surface-light`    | `215 222 233` | a chip raised off the paper                                                         |

Note the direction. In dark, `elevated` is **lighter** than `surface`; in light
it is **darker**. Elevation reads as separation from the surface, and which way
that runs flips with the theme, because white has no headroom above it. An
"elevated" token that is brighter than the card it sits on is the light theme's
version of the mistake rule 2 describes.

`tests/unit/surfaceLadder.test.ts` holds both halves — a card at least ΔL\* 3
off its page, and no two rungs the same colour — in **both** themes. It measures
in ΔL\* rather than in a WCAG contrast ratio on purpose: WCAG contrast is built
for text and carries a `+0.05` that swamps the luminances near black, so the
same perceptual step scores 1.08:1 on the dark ramp and 1.23:1 on the light one.
Held to a ratio, the check would either wave the light defect through or fail
the dark theme for a step that has always been fine.

The corollary, and the thing that actually breaks when the ground moves: **a
literal is not a token.** Anything painting "the page's own colour" — a fade
that ends in it, a gap cut through a bar to show it — names `bg-base` /
`from-base`, never a `slate-50` measured off the screen once and written down.
The verb ribbon had two of those, each with a comment recording the value it had
been measured at, and both would have gone on painting near-white slots on a
page that is no longer near-white.

**0b. A theme pair has a DIRECTION, and it is not the same for ink and fills.**

For TEXT the rule is one line — **the light side is the higher Tailwind step**,
because ink has to move opposite to its ground. `text-slate-600
dark:text-slate-400` is right; `text-slate-400 dark:text-slate-500` is that
declaration with its two values swapped, and a swapped pair is the wrong tone on
_both_ grounds rather than one. Six shipped that way, between 1.25:1 and 4.34:1,
including a criterion number whose own comment said it existed to be read out
loud. `tests/unit/themePairDirection.test.ts` holds it.

For a FILL or a BORDER the relationship reverses, and the check deliberately
does not look at them: a divider is _darker_ than white and _lighter_ than
near-black, so `bg-slate-300 dark:bg-slate-700` is correct and reads as inverted
to the ink rule. Nineteen such pairs are in the codebase and every one is right.

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
  score placard, the verb ribbon's tier tile and the icon tile on its selected
  tier card, `bg-black/80` scrims. These are the same colour in both themes, so
  `bg-white/20` and `border-white/20` are right as written and must be left
  alone.

  This example has moved three times. It used to read "the ribbon header", and
  that surface is gone — the verb ribbon's header was a full-bleed tier gradient,
  then a glass rail, then the same row every accordion wears, and is now a themed
  banner — light in the light theme, dark in the dark — over a dark stage (see
  "The hero" in §3), with its tier colour on a 32px tile. It
  later named the ribbon's detail-card icon, which went when that card stopped
  being a wash of the tier. The rule is unchanged; only the illustration moved.
  Check what a class is painted on, not what this list happened to name when it
  was written.

- **On a theme surface** — anything over `--color-bg-surface`, a `bg-white`
  card, or a `slate-100/200` track. Here white-alpha is invisible in light
  mode, and the element silently loses its ring, rim, tick or divider. These
  need an explicit pair: `ring-slate-900/10 dark:ring-white/10`.

When auditing, the question is never "is this class dark-only?" but "what is it
painted on?".

**3. Never de-emphasise text with `opacity`. Change the colour instead.**

Opacity does not scale a contrast ratio — it composites the text _towards_ its
background, and the loss is far from linear. That is why the arithmetic is
never what it looks like, and why every fix that tried to keep the dimming and
just soften it has come back:

| what shipped                                                    | measured        |
| --------------------------------------------------------------- | --------------- |
| `slate-500` on a card, undimmed                                 | 4.81:1          |
| the same text under `opacity-90`                                | 3.91:1          |
| the same text under `opacity-70`                                | 2.66:1          |
| `slate-500 opacity-80` on the insights panel                    | 3.22:1          |
| `slate-500 opacity-60` on the editor's spent-strategy row       | 2.30:1          |
| the exemplar caption's band tone, undimmed / under `opacity-80` | 9.37:1 / 5.62:1 |

An `opacity` on an ancestor is the same fault at a distance and is harder to
see: it reaches every reading inside that subtree, including 32 buttons' worth
of text in the verb ribbon's case, and nothing in the class list of the failing
element mentions it.

De-emphasis is a job for tone, weight and size, all three of which are
measurable at the element that wears them:

```
- <span className="text-slate-500 opacity-70">
+ <span className="text-slate-600 dark:text-slate-400">
```

The exemption is anything that is not read: a decorative wash, a mesh overlay,
a gradient scrim, an icon that repeats an adjacent label. Opacity on those is
fine and common. The rule is about text.

`tests/unit/textDimming.test.ts` holds this at zero across `components/` and
`utils/`, with four named exemptions that each carry their reason: two disabled
controls, which WCAG 1.4.3 exempts, one deliberately blurred `aria-hidden`
teaser, and one decorative glyph. It shipped as a per-file count over eleven
recorded sites; the count was replaced once those were read, because a number
records how much debt a file carries and nothing about whether any of it is a
defect — and it failed on the fix as loudly as on the regression.

It also matches the band palette, not just spelled-out Tailwind tones. A colour
that arrives as `${bandConfig.text}` puts no `text-purple-300` in the source for
a pattern to find, so four band-coloured lines carried an `opacity` the check
never looked at while it reported a clean sweep — the worst thing a guard can
do. The last of them was `opacity-60` stacked on `animate-pulse`, which is
itself an opacity animation.

`tests/e2e/light-theme.spec.ts` is the other half, and the better one: it
MEASURES rather than pattern-matches. It only sees states it is driven into,
though, so the two are complementary — the sweep proves a ratio, the unit test
covers everywhere the sweep has not reached yet.

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

### Radius

Radius is chosen by ROLE, from `theme.extend.borderRadius` in
`tailwind.config.js`. Never write an arbitrary `rounded-[Npx]`.

| Token                       | Value      | Role                                                                                      |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `rounded-surface`           | 32px       | A modal shell or a workspace card — the outermost box of a surface floating over the page |
| `rounded-surface-inner`     | 30px       | That surface's inner edge: a header or footer inside its border                           |
| `rounded-panel`             | 20px       | A section within a surface: an accordion, a reference panel, a bordered block             |
| `rounded-tile`              | 32%        | A fixed-size square: an icon tile, an avatar, a badge                                     |
| `rounded-xl` / `rounded-lg` | 12px / 8px | Controls, and the smaller controls nested inside them                                     |
| `rounded-full`              | —          | Pills, dots, avatars                                                                      |

Two things this replaced. Arbitrary values had drifted to ten — 14, 18, 20, 24,
28, 30, 32, 36, 40, 44, 48px — across four real jobs; modal shells alone used
five of them. And `rounded`, `rounded-sm` and `rounded-md` (4, 2 and 6px) sat
around `rounded-lg` doing the same job at near-identical values.

**Why the scale is not flatter.** Radius has to decrease with nesting: a chip at
its card's radius reads wrong. So `xl`/`lg` stay as a pair, and `2xl` remains on
cards that are neither a surface nor a panel. Collapsing everything to one value
would be a simpler rule and a worse interface.

**`rounded-tile` is a percentage on purpose.** The same 32px on a 56px tile and
a 112px one reads as two different shapes; a percentage keeps the corner
proportional at every size. It is the one place a non-token radius was doing
real work rather than drifting.

**`surface` and `surface-inner` move together.** A `rounded-surface` box with
`border-2` has an inner edge of 32 − 2 = 30px, which is what a header or footer
sitting inside it must use, or the corner shows a sliver of the wrong curve.
Change one and change the other.

### Elevation

Two steps, and one effect:

- `shadow-sm` — resting. A panel sitting on the page.
- `shadow-lg` — lifted. A modal, a popover, a dragged item, and every
  `hover:`/`focus:` lift. An interactive shadow always means lift, whatever step
  it was written at; a hover that resolved to the resting step did nothing.
- `shadow-inner` is not an elevation and is unaffected.

Band glows (`getBandConfig().glow`) are part of the colour system, not this
scale, and keep their own coloured shadows. Three modal shells keep a bespoke
`shadow-[0_64px_128px…]`: a deliberately deep shadow no step on this scale
provides.

### The hero

One surface in the application is allowed to be louder than the rest, and it is
the verb ribbon (`components/CommandVerbHierarchy.tsx`). It explains the single
fact that decides a student's ceiling — **the command verb caps the band** — and
the design makes that fact the picture: the verb is set at poster scale, and a
staircase of six tier columns shows how far it lets a response climb.

**It is one hero, on purpose.** A workspace where every panel is loud has no
hero, only noise. The accordions, the tier cards and everything else stay calm so
that this one does not have to compete with them. If a second surface wants the
same treatment, the question is which of the two stops being it.

What makes it a different object, and not a bigger panel:

| Decision | The hero                                                                         | Why                                                                                                  |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Rank     | `rounded-surface` (32px), the workspace cards' radius                            | Panels are 20px. The radius says this is a card, not reference material                              |
| Ground   | A **stage, dark in both themes** (`bg-[#070b14]`), under a themed banner         | A lit slab on a pale desk in the light theme; a spotlit stage in the dark one                        |
| Banner   | The header bar is **themed**: white in the light theme, the stage itself in dark | A dark bar among white panels is the one defect a contrast audit cannot see (see below)              |
| Light    | The tier's own hue, from one custom property (`--band-rgb`), as an aura and edge | The six tier colours carry meaning, so the accent is not a free choice and changes with the question |
| Type     | The verb in Inter 900 italic caps, up to 96px, sized to the word                 | The display voice that already names the product, at the one place it is the subject                 |
| Picture  | A ceiling staircase: lit columns up to the verb's tier, hatched ones above       | "Locked" is hatched and dashed — present and out of reach — and the dashed line is the ceiling       |
| Motion   | One orchestrated moment on a change of verb, and responses to input              | A line draws in, a flare crosses one column, the aura cross-fades. Nothing loops                     |

**The banner is the one part of the hero that follows the theme.** The header bar
(`RIBBON_HEADER_*`) used to be part of the stage, so in the light theme the
ribbon opened with a dark slab above a page of white panels whose headers are all
light. Its text was perfectly legible, so no contrast check could object — which
is the defect `tests/e2e/light-theme.spec.ts` warns about by name. It is an
ordinary themed bar now: opaque white with dark ink in the light theme (which also
hides the part of the aura that would tint it), see-through with white ink in the
dark theme, where the stage's light falling through it is the look. The tier is
still on the 32px tile, the selected-verb chip and the miniature staircase, each
with a pair for the unlit bars, the neutral tile and the chevron. What stays one
ground is everything from the banner's lower edge down to the drawer. The
distinction is in the names: `RIBBON_INK_*` is the stage and is held to one ground
with no theme variants; `RIBBON_HEADER_*`, `RIBBON_SELECTED_*` and `RIBBON_MINI_*`
are the banner and are held to the opposite rule — every colour has a `dark:`
partner. The root's neutral edge is a pair too (`border-slate-300
dark:border-white/15`), because a shut ribbon sits on the page, where white at 15%
is invisible. `tests/e2e/verb-ribbon.spec.ts` reads the computed colours of the
banner and the stage in both themes.

**The stage is dark in both themes, and that is a claim the tests hold.** The
theme tokens flip: `--color-text-muted` resolves to slate-600 under the light
theme, and a tier's `text` class swaps to its `-900` step, which is dark ink on a
dark ground. Nothing throws; the light theme is simply unreadable on the stage.
So everything painted on it is named `RIBBON_INK_*` in `utils/verbRibbonChrome.ts`
and held to three rules by `tests/unit/verbRibbonChrome.test.tsx`:

1. **No `light:` or `dark:` partner.** It has one ground, so a partner is a second
   guess at it. (The banner is not the stage and takes the opposite rule; the
   root's neutral edge is the one themed class on it. The mesh overlay needs no
   exemption: the stage uses its `plain` mode.)
2. **No theme token.** No `--color-*`. A component that sits on both a themed
   surface and the stage takes a `tone` (`StrategyBrief tone="ink"`), which names
   its colours outright instead of reading tokens.
3. **Nothing dimmed with `opacity`, and no tone below `slate-400`.** Measured on
   this ground, `slate-300` is 13:1 and `slate-400` 7.7:1; `slate-500` is 4.1:1
   and fails.

The tier's hue itself clears the floor on this ground (4.65:1 for purple, the
lowest, to 10:1 for yellow), which is what allows tier-coloured text on it.

**The aura is a sibling of the content, never an ancestor of any text.** The e2e
contrast sweep returns `unassessable` for any text whose background chain meets a
gradient. With the light a sibling, every text node's nearest background is the
flat ground and the audit can measure it.

**Geometry is one scale.** Band `i` owns `[(i-1)/6, i/6]` of the staircase; its
step is centred there and is one sixth wide less a gutter, so the column, its
numeral, its name and the Deep Learning Threshold at 50% agree by construction.
Tier 1's column is 28% of the tallest, not a sixth: a sliver cannot carry its
numeral or be hit with a thumb.

**The verb is sized to the word.** `ribbonVerbSize` steps down for longer verbs
and for the two-word ones, which wrap. All thirty-eight were measured against
their column at 1920, 1440, 1280, 1024, 820, 390 and 360px, and none overflows;
if a verb is added or a breakpoint moves, that measurement is the thing to repeat.

**Motion on a phone.** The hero is the one surface that animates a lot, and
iOS Safari is where that is felt first, so it is built to a stricter rule than
the rest of the app. `tests/unit/verbRibbonChrome.test.tsx` and
`tests/e2e/verb-ribbon-touch.spec.ts` (which runs on the phone projects, real
WebKit included) hold it:

- **Animate `transform` and `opacity`, and nothing else.** A selection is marked
  by a halo overlay that fades (`RIBBON_TIER_HALO`), not by a transition on the
  card's border width, shadow and fill. Name the properties a transition covers;
  `transition-all` and overshoot curves (`cubic-bezier(0.34, 1.56, …)`) are out.
- **No `mask-image` on anything that scrolls or moves**, and no `clip-stable` on
  the stage or its cards (a permanent layer plus an opaque mask). A scroller's
  edge fade is two overlays in the container's own colour, ending in the SAME
  colour at zero alpha rather than `transparent`, which Safari takes through grey.
- **No `mix-blend-mode`.** It renders everything beneath it offscreen and blends it
  back, every frame anything beneath it changes. The shared `MeshOverlay` takes
  `plain` for surfaces that animate.
- **No big blur on something that is re-created.** A glow behind a word, or under
  the stage, is a radial gradient in a sibling, not a `text-shadow` or a
  `box-shadow`. A shadow is painted from the box it belongs to, so one on a box
  that is resizing is re-rastered every frame.
- **A layer that must survive a resize has a fixed size.** The aura and mesh are
  top-anchored and 80rem tall, and the stage clips them; `inset-0` on a box that
  changes height repaints the layer on every frame of the change.
- **Hover is `can-hover:`**, a variant wrapping `@media (hover: hover)`. On a
  touch screen a tap leaves `:hover` on the element, so a bare `hover:` is a state
  the control is left in. Press feedback is `active:` on `transform`.
- **Touch targets are `touch-manipulation`** (no double-tap zoom) and `select-none`.
- **A cross-fade is two layers.** Re-keying an element takes the old one away on
  the same frame the new one starts from nothing, which dips to the ground. The
  outgoing layer stays for the length of the fade (`RIBBON_INK_AURA_LEAVING`).
- **Do not move what the reader is touching.** The strip is placed instantly when
  the ribbon opens, and is not re-centred under a tap on a card already in view.

## 4. Typography

- **Interface**: `IBM Plex Sans` — high legibility for data-dense controls, in a
  voice that reads as engineered rather than as the default sans of every
  AI-built product. Shipped as its variable font: one 96KB latin file carries
  the whole 100–700 axis, against 289KB for the twelve static Inter faces it
  replaced, so the change made the app lighter as well as more specific.
- **Manuscript**: `Newsreader` (Serif) - Used for the main writing area and AI exemplars to simulate the gravity of an official examination paper.
- **Telemetry**: `JetBrains Mono` - Used for marks, token counts, and system logs.

### Measure

A reading column is bounded by what prose can be read at, not by the window it
sits in. The report column and the improvement modal's unified view both take
`max-w-3xl`. From `xl` up the report goes further and becomes a document with a
margin: the score placard and the metrics move into the space beside the column,
and the prose narrows behind them.

**Measured across viewports before choosing it.** The line length only ever went
wrong from about 1024px up, because below that the column is already bounded by
the screen:

| Viewport     | Panel  | Fill | Characters | After     |
| ------------ | ------ | ---- | ---------- | --------- |
| 390 phone    | 306px  | 84%  | 38         | unchanged |
| 768 tablet   | 652px  | 90%  | 87         | unchanged |
| 1024 laptop  | 908px  | 93%  | 125        | **104**   |
| 1440 desktop | 1022px | 94%  | 142        | **104**   |
| 1920 wide    | 1022px | 94%  | 142        | **104**   |

Phone and tablet are untouched by construction, not by a breakpoint: their
column is narrower than the cap, so it never engages. The text fills its panel
at every size — 84–94% before, 90–92% after — so filling was never the problem.

**Why the column alone could not get tighter.** It also held the score cards and
the stat grid, and narrowing it took them along. Measured on the same screen:
44rem reached 95 characters but clipped "Key Terms" to "Key…"; 40rem took
"Volume" with it; 38rem hit the 80 the skill asks for and clipped both. `3xl`
(48rem) was the tightest line that layout bought without spending a label to get
it.

**So the layout changed instead, and the trade went away.** Capping the column
left about 400px of nothing beside it on a desktop, which is the half of the
problem a cap cannot reach: the container was the thing that was too wide. From
`xl` the report is a `minmax(0,1fr)` reading column and a 22rem margin holding
the placard, the goal card and the metrics, inside a `5xl` shell:

| Viewport     | Column | Margin | Characters | Was |
| ------------ | ------ | ------ | ---------- | --- |
| 390 phone    | 308px  | —      | 33         | 33  |
| 768 tablet   | 654px  | —      | 88         | 88  |
| 1024 laptop  | 768px  | —      | 106        | 106 |
| 1280 desktop | 640px  | 352px  | **86**     | 106 |
| 1440 desktop | 640px  | 352px  | **86**     | 106 |
| 1920 wide    | 640px  | 352px  | **86**     | 106 |

Below `xl` nothing changed, by construction rather than by a second rule: the
wrapper is a flex column there and the aside is its first child, so a phone
still meets the mark before the report. The `order` swap only applies once there
are two columns to swap between. Nothing clips in the 352px margin at any width,
including the two metric cards side by side. `tests/e2e/report-column.spec.ts`
measures all six widths.

**The margin does not follow the reader.** A sticky aside was built first and
worked — pinned at `top-6` the mark stayed in view through the whole report —
and was taken out. The aside measures 687px against a scroll container of 572px
at 1440x700 and 496px at 1280x620, a laptop with a browser bar. Pinned, the top
holds and the bottom of the column, where the Volume and Key Terms figures are,
can never be scrolled to. A capped height with its own scrollbar inside a 352px
margin is worse than scrolling with the page, and a `min-height` media query
guessing where the sidebar stops fitting breaks the first time the goal card
gains a line.

**Bound the column, never the text inside it.** `max-w-[56ch]` on the prose was
tried and reverted: the card stayed 1022px while the text stopped at 508, which
reads as a defect rather than a margin, and centring it with `mx-auto` put the
prose 240px right of its own card header. The container is the thing that is too
wide; capping its contents only moves the problem inward. Where a reading
surface is one column among wider chrome — the unified diff view — the bound
goes on the wrapper holding the legend AND the prose, so they narrow together.

`ch` is the advance width of "0", about 1.35× wider than Newsreader's average
lowercase, so a `ch` cap renders about 1.35× its number in characters: `68ch`
measured 89, `56ch` measured 74–76. That is why the reverted cap looked correct
in characters while being wrong on screen.

### Weight

Weight carries hierarchy, so it has to mean something. One step per job:

| Weight | Class           | Job                                                                                    |
| ------ | --------------- | -------------------------------------------------------------------------------------- |
| 400    | (none)          | Prose. Sentences, messages, help text, descriptions                                    |
| 500    | `.t-label`      | A small label — see below                                                              |
| 600    | `font-semibold` | A title inside a block, sitting above its own body line                                |
| 700    | `font-bold`     | Headings, buttons, numbers, and a chip that has nothing else marking it out            |
| 700    | `font-black`    | Display type (the italic masthead), large headings (`text-xl`+), and telemetry figures |

`font-bold` and `font-black` together were used 842 times against 4 uses of
`font-normal`. When almost everything is heavy, weight stops encoding anything —
so the ladder above is what a new element picks from, and prose picks nothing.

**The ladder has five rungs and four faces.** IBM Plex Sans stops at 700, and so
does Newsreader, so one pair has to share a weight. 600 and 700 must not: a card
title at 600 and its section heading at 700 sit next to each other on nearly
every surface, and merging them flattens the hierarchy people actually read. 700
and 900 can, because display type is already carrying its rank at three times
the size — the weight was a refinement on top of that. So `font-black` emits
700, stated in `tailwind.config.js` rather than left as a 900 to be clamped
silently at paint time, and `font-synthesis-weight: none` in `index.css` stops a
browser faking the difference. `tests/unit/typefaceLadder.test.ts` holds all
three together: the face named in the theme must be one the app imports, and no
weight in the theme may exceed what that face can draw.

**`font-black` still keeps its own rung**, even sharing a value. It marks the
job — display type — so the ladder survives a future face that does have a 900.

**900 was not "more bold".** At 10px the extra 200 was a smudge rather than
emphasis, which is where 23 of its uses were. The rung is still reserved for
type big enough to carry it.

**Measured, not assumed: Plex is narrower here, not wider.** The worry when
choosing it was that a wider face would push the stat labels into truncation.
Measured at 390, 768, 1024 and 1440 against the Inter baseline, the set of
clipped strings is identical — 11 on a phone, 4 above it — and every one of them
overflows _less_ under Plex: "Evaluate, Synthesise & Create" 200px → 187,
"Construct models of the processes" 313 → 296. Part of that is the face and part
is 900 becoming 700. Either way the change introduced no new truncation
anywhere.

**A chip that already has a colour, a border and a fill does not also need 700.** The weight was the fourth thing saying "this is separate", and the first
three were doing it. Those chips take the label weight, 500 — the syllabus terms
in the workspace, the band and tier pills in the sample-answer studio, the tag
row under a question. 700 stays for a chip carrying a number, and for one whose
only marker is its weight.

**A notice's message is prose.** An error or a warning is a sentence, and the
tint, the border and the icon have already said it is a notice — so it reads at
400, not 700. The exception is a notice set below 12px, where the readability
floor renders it at 11.5px and 400 goes thin against a tinted ground: those take 500.

**A `<p>` is not automatically prose.** Some hold a title with a body line
beneath: the error notice's heading, a course name above its topic count, a
backup's date above its size. Those take 600, not 400 — a size-based rule cannot
tell them apart from a sentence, and seven were restored by hand after it tried.

### Headings, and what earns the display voice

The interface has two type voices and one rule for choosing between them.

**Caps mark a boundary. They never mark a caption, a value or a notice.**

| Token        | Face  | Treatment                        | What wears it                                          |
| ------------ | ----- | -------------------------------- | ------------------------------------------------------ |
| `.t-display` | Inter | 900, italic, caps, `text-lg`+    | The product's name and the two workspace card headings |
| `.t-section` | Inter | 900, italic, caps, 12px, tracked | A heading that divides a panel into named parts        |
| `.t-label`   | Plex  | 500, sentence case, 12px         | Everything smaller: captions, stat names, chips        |

One level of heading wears the voice; the caption inside it never does. That is
the whole rule, and it decides the cases that used to need a judgement call each
time:

- "Cohort activity", "Band trend", "Context Scenario", "Select Content" —
  each names a division of its panel. **Section.**
- A stat tile's name sitting above its own figure is a caption for that value,
  not a division of anything. **Label.**
- A toast's title and an error state's title are transient notices. They are not
  part of the page's structure and disappear from it. **Label.**

**Why the rule and not a preference.** Before it, `.t-label` was carrying both
jobs: **37 of the app's 139 headings** were set in the caption token, so a
section's heading and the caption inside it were the same size, weight and case
on most screens. The display voice reached three headings out of all of them.
The problem was never which case looked better — it was that nothing said which
a given heading was, so the answer was whatever the last author typed.

This is also the boundary that keeps the caps from becoming the voice of the
whole app again, which is the state §4's label rule was written to end. A
section heading is a scarce thing on a screen; a label is not.

### Labels

A small label — a section caption, a stat's name, the text in a chip — is set by
`.t-label` in `index.css`, and by nothing else. Sentence case, 12px, weight 500,
normal tracking. Write `t-label` and add only colour and layout beside it; do
not restate the size, the weight or the tracking at the call site.

This rule exists because the alternative was measured. Labels were written
inline as `text-[10px] font-black uppercase tracking-[0.2em]` or a near-variant
in **467 className regions across 73 of 106 component files**, with four sizes
and eight tracking steps in play. At that density the treatment was not an
accent, it was the voice of the whole app — and it shouted at a size the
`text-[Npx]` readability floor at the bottom of `index.css` had already been
added to compensate for. That floor stays as a backstop for the arbitrary sizes
still used by data readouts; labels no longer depend on it.

Sentence case is _restored_, not imposed: dropping the `uppercase` transform
gives back the casing each label was already authored in, so no copy changed.

**Two exceptions, both deliberate.**

1. The display voice — `.t-display` and `.t-section`, both Inter 900 italic
   caps — is not this pattern and is governed by "Headings" above. It reads as a
   masthead rather than as chrome, and it is bounded: a heading that divides a
   panel, and nothing smaller.
2. Telemetry keeps `font-mono` per §4. `.t-label` sets size, weight, tracking
   and case; it does not set the family, so the two compose.

## 5. Writing in the interface

Words in the UI are design content, not decoration. Three rules, each of which
the app was breaking somewhere.

### Don't dress a page in the default treatments

Four habits read as generic wherever they appear, and all four had collected on
the auth pages — the first screens anyone sees.

**One word of a headline in a different colour.** `Band <span
className="text-indigo-500">6</span>` on both the login and reset-password
pages. The headline is a name; colouring one character of it adds no meaning and
is the single most recognisable tell of a generated page. Set a headline in one
colour.

**A label above a heading that repeats it.** Both pages carried an eyebrow
reading "HSC Writing Coach" above a "Band 6" headline, with a line underneath
saying the product was an HSC writing coach. Three elements, one fact. A label
earns its place by saying something the heading does not.

**An arrow appended to button or link text.** "Sign In →", "Back to sign in →"
(pointing away from where the link went), "Request this course →". A button
already says what pressing it does.

**An infinite animation on a state that is not changing.** A pulsing dot on an
already-selected card, a sparkle throbbing beside a "new" option, a glow
breathing behind a selection. Motion earns its place by showing something
happen: a spinner while work runs, a pulse on an error that just appeared, a
reveal when content arrives. A heartbeat on a static state is decoration that
moves.

Also retired: **a trust badge that asserts nothing checkable.** "Secure System"
sat in the login footer beside the legal terms and the version, which are real.

### Name things as the reader knows them

Not as the system is built. A teacher has courses and topics; the app has
manifests, target courses and discovered JSON files. An import toast read
"1 topic file still need a target course in manifest metadata" — which names a
file format, a resolver's variable, and a data shape, and tells the reader
nothing they can act on. It now names the missing course and says to import it
first.

### An empty screen is an invitation to act

State what is missing AND what closes the gap, and split by who can close it
where that differs. `PromptSelector` already sets the pattern:

> No sub-topics in this topic yet. _(then a curator/student split)_

A bare "No detailed criteria available." or "Nothing selected." is a dead end.

### A transient notice never sits on a control

Toasts dock at the bottom — full width below `sm`, bottom-left above it — and
that corner was chosen by measuring what each one covers, not by convention.

`top-24 right-4` put the card on the breadcrumb bar: at 390px it covered the
whole of it, and at 1440px it still covered "Change", the control for switching
question. Bottom-right cleared that and landed on "Evaluate", the primary
action. Bottom-left covers the syllabus accordions and some verb chips, and no
button a student needs.

An actionable toast lives for fourteen seconds. Nothing under it can be clicked
for that whole time, so where it lands is a layout decision, not a detail.

### One glyph, one job

`·` separates items on a line. `•` starts a list item. Both were being used as
inline separators, which put them in the same rendered line in two places —
"2 levels · 2 exemplars • Band ceiling 4".

The skill lists "meta strings joined with middle dots" among the template
chrome, and it is right that a line of them is a smell. But a compact summary
line does need a separator, and the answer to two glyphs doing one job is one
glyph, not a third. Where a meta line is long enough to need three separators,
that is the signal to write words instead.

### An error says what happened, and what is left

Never apologise, never be vague, and never assert a cause that has not been
established. The most useful sentence is usually about the reader's data:
"Your existing data is unchanged" answers the only question a failed restore
actually raises.

"Please try again" on its own is not an instruction — it names no cause and no
remedy. Where the cause genuinely is not knowable, say what state things are in
rather than filling the space.

Validation messages are already the standard to copy: "Enter a username.",
"Pick the school to place them in." Imperative, specific, and about the next
action rather than the failure.

**About 80 `Failed to …` strings still predate this section.** They were left
rather than rewritten in bulk: an error that confidently asserts the wrong
cause is worse than one that is merely thin, and establishing the real cause is
per-site work. Fix them against these rules as each is touched.

## 6. Print & Export

Custom `@media print` styles ensure:

- Removal of all UI chrome and backgrounds.
- Transformation of serif text to high-contrast black.
- Prevention of page breaks within criteria blocks.
- Standardised 15mm margins.
