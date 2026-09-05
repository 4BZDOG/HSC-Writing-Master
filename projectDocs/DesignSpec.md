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

## 4. Typography

- **Interface**: `Inter` - High legibility for data-dense controls.
- **Manuscript**: `Newsreader` (Serif) - Used for the main writing area and AI exemplars to simulate the gravity of an official examination paper.
- **Telemetry**: `JetBrains Mono` - Used for marks, token counts, and system logs.

### Measure

A reading column is bounded by what prose can be read at, not by the window it
sits in. The report column and the improvement modal's unified view both take
`max-w-3xl`.

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

**Why not tighter.** The column also holds the score cards and the stat grid,
and narrowing it takes them along. Measured on the same screen: 44rem reaches 95
characters but clips "Key Terms" to "Key…"; 40rem takes "Volume" with it; 38rem
hits the 80 the skill asks for and clips both. `3xl` (48rem) is the tightest
line this layout buys without spending a label to get it — 104 characters,
longer than ideal, against 142 before.

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
| 700    | `font-bold`     | Headings, buttons, chips, numbers                                                      |
| 900    | `font-black`    | Display type (the italic masthead), large headings (`text-xl`+), and telemetry figures |

`font-bold` and `font-black` together were used 842 times against 4 uses of
`font-normal`. When almost everything is heavy, weight stops encoding anything —
so the ladder above is what a new element picks from, and prose picks nothing.

**900 is not "more bold".** At 10px the extra 200 is a smudge rather than
emphasis, which is where 23 of its uses were. It is reserved for type big enough
to carry it.

**A `<p>` is not automatically prose.** Some hold a title with a body line
beneath: the error notice's heading, a course name above its topic count, a
backup's date above its size. Those take 600, not 400 — a size-based rule cannot
tell them apart from a sentence, and seven were restored by hand after it tried.

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

1. The house display treatment — `font-black … italic uppercase` at `text-lg`
   and above — is the card and header title style (`CARD_HEADER_TITLE`,
   `HEADER_WORDMARK`, `RIBBON_VERB_DISPLAY`). It was asked for, it reads as a
   masthead rather than as chrome, and it is not the micro-label pattern above.
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
