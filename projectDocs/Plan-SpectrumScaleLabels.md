# Plan — Spectrum scale labels and the Deep Learning leap

Target: `components/CommandVerbHierarchy.tsx` lines 673–908 (the Cognitive Timeline
Footer, as it shipped in #167) and the `RIBBON_TIMELINE_*` / `RIBBON_SPECTRUM_*` block
in `utils/verbRibbonChrome.ts` lines 293–458.

Brief, verbatim: *"Reincorporate the old scale labels that started with basic recall and
show the leap in knowledge needed from band 3 to band 4. Remove the full text
descriptions and try to provide short appropriate context for linking these concepts to
the user. Improve the design as needed."*

---

## 0. What was actually deleted, read from the commit

`git show 3095f8e:components/CommandVerbHierarchy.tsx` (the parent of #167) gives the
deleted row exactly:

```tsx
<div className="flex justify-between items-end gap-4 mb-3 px-1">
  <span className={`${RIBBON_TIMELINE_LABEL} whitespace-nowrap`}>Basic Recall</span>
  <span className={`${RIBBON_TIMELINE_LABEL} hidden sm:block`}>Explain &amp; Compare</span>
  <span className={`${RIBBON_TIMELINE_LABEL} hidden sm:block`}>Analyse &amp; Apply</span>
  <span className={`${RIBBON_TIMELINE_LABEL} whitespace-nowrap`}>Evaluate &amp; Create</span>
</div>
```

Three facts follow from putting that beside `TIER_GROUPS` (`data/commandTerms.ts:34–77`),
and all three change the design:

**F1 — they were never span labels.** `Explain & Compare` is byte-identical to
`TIER_GROUPS[2].title`. `Analyse & Apply` is byte-identical to `TIER_GROUPS[3].title`.
`Basic Recall` is a paraphrase of `TIER_GROUPS[0].title` (`Remember & List`); `Evaluate &
Create` is a paraphrase of `TIER_GROUPS[5].title` (`Evaluate, Synthesise & Create`) with
"Synthesise" dropped. So the row was **four tier titles — tiers 1, 3, 4 and 6** — with
tiers 2 and 5 simply omitted. `VerbRibbonRedesignPlan.md` R6 called them "span labels" and
`Plan-CognitiveSpectrum.md` F5 inherited that reading; both are wrong, and the wrongness is
why nobody could see how to derive them.

**F2 — the four tiers chosen are the four structurally significant rungs.** Tier 1 is the
floor, tier 6 the ceiling, and tiers 3 and 4 are the two sides of the Deep Learning
Threshold. Whoever wrote that row was marking the poles of the scale and the gate in the
middle. That is a real design intent, and it is exactly the intent the user is now asking
to get back.

**F3 — below `sm` the row already collapsed to the two poles.** Labels 2 and 3 carried
`hidden sm:block`; labels 1 and 4 did not. On a phone the deleted row was `Basic Recall …
Evaluate & Create` and nothing else — the arc, and only the arc. The responsive behaviour
of the thing the user misses is already a two-ended scale.

**F4 — the positions were meaningless.** `flex justify-between` across the full width put
four labels at roughly 0 / 33 / 66 / 100%. Under the geometry #167 established, tiers 1, 3,
4, 6 have their band centres at 8.333 / 41.667 / 58.333 / 91.667%. Only the outer two were
near their tiers, and only by accident of being flush. Below `sm`, with two children,
`justify-between` put them at 0 and 100% — which is right for poles and wrong for tiers 1
and 6.

---

## 1. Four labels, or six? The honest answer is two — and the reason is in the data

**Six is already there and a second six would be pure duplication.** The dot row
(`:817–908`) renders `tierShortLabel(tier)` for all six tiers — `Remember · Define ·
Explain · Analyse · Discuss · Evaluate` — and `commandVerbHierarchy.test.tsx:263` pins that
they are derived, precisely because a hand-written copy had drifted at two of six. A second
row naming the same six tiers in longer words is the "one vocabulary too many" R6 warned
about, restated.

**Four cannot be derived as spans**, because per F1 they were not spans. Deriving them as
*tier titles* is trivial (`TIER_GROUPS[0/2/3/5].title`) but reintroduces the collision F4
describes: a label for tier 3 belongs at 41.667%, which is exactly where the dot row
already prints `Explain` one row below.

**Two spans is the only partition the codebase's own logic supports.** The Deep Learning
Threshold at the 3/4 boundary is not decoration — it is where `getBandForMark` stops being
able to return Band 4 (`data/commandTerms.ts:938–947`, `getTierTargetBand` at `:1005`), and
it is the Verb Gate's cap: *"If a student 'Describes' when the verb is 'Analyse', you MUST
cap their mark at 50% (Band 3)"* (`projectDocs/systemPrompt.md:15`). Every other grouping
of six tiers into fewer labels is arbitrary. This one is load-bearing.

So: **one rail, two span captions, one either side of the threshold, each named by its
endpoint tiers.** That restores F2's intent (the poles *and* the gate), restores F3's phone
reading (the arc), collides with nothing, and every word comes from `tierShortLabel` /
`TIER_GROUPS[].title` / `getTierTargetBand`, so it cannot drift. At `lg` and above the
captions use the full titles, which puts `Explain & Compare` and `Analyse & Apply` back on
screen **verbatim**, and `Remember & List` / `Evaluate, Synthesise & Create` in place of the
two paraphrases.

### The copy consequence, stated plainly

**The words "Basic Recall" do not come back.** They exist nowhere in the data; they are a
paraphrase of `TIER_GROUPS[0].title`, and reproducing them is the fifth hand-written copy
this whole series exists to kill. The derived equivalent is **`Remember & List`** (full) or
**`Remember`** (short). Same for `Evaluate & Create` → **`Evaluate, Synthesise & Create`**.
If the maintainer wants the literal historical strings, the correct fix is to change
`TIER_GROUPS[0].title` in `data/commandTerms.ts` so every one of the ~12 surfaces that
reads it changes together — not to type them into the footer again. That is a content
decision, out of scope here, and flagged as **Q1**.

---

## 2. Constraints inherited (from `Plan-CognitiveSpectrum.md` §2), all honoured

| | Constraint | How this plan meets it |
|---|---|---|
| C1 | Colours only from `getBandHex` / the tier config | The rail's band fragments interpolate `getTierScaleConfig(3).text` and `getTierScaleConfig(4).text` at the call site. No new hex, no new palette. |
| C2 | No new copy; assemble from existing sources | Every string is `tierShortLabel`, `TIER_GROUPS[].title`, `getTierTargetBand`, or the chip's own label hoisted to a constant. |
| C3 | Colour is never the only signal | The rail states `Band Caps 1–3` / `Band Caps 4–6` in words and numbers; the cue names the side in words. |
| C6 | New constants pair colours with `dark:`, no `light:` | Three of the four new constants carry no colour at all; the fourth is `text-slate-600 dark:text-slate-400`. |
| C7 | No text on the spectrum | The rail sits **above** the track, on the page background, and is deliberately **not** `aria-hidden` — see §3.1. |
| C8 | No module-scope read of an imported value | The two new module constants are a number and a string literal. Everything that dereferences an import stays in the component body. |
| — | Don't touch `RIBBON_TIMELINE_STEP_LABEL_IDLE` / `RIBBON_TIMELINE_THRESHOLD_CHIP` | Neither constant changes, and neither moves in the tree. |
| — | Six step buttons' `onClick`/`aria-label` byte-for-byte | `:845–861` is untouched. |
| — | New keyframes end at rest | **This plan adds no keyframe.** See §3.5. |

---

## 3. Design

### 3.1 The scale rail

A new row above the track, holding two captions, one per side of the threshold. It sits in
the vertical band the threshold chip already occupies.

Insert as the first child of the track wrapper at `:745` (`<div className="relative
mb-4">`), before `<div className={RIBBON_TIMELINE_TRACK}>`:

```tsx
{/* The scale rail.

    The arc four hand-written labels used to draw — `Basic Recall`,
    `Explain & Compare`, `Analyse & Apply`, `Evaluate & Create` — derived this
    time. Those four were not span labels: two were byte-identical to a
    `TIER_GROUPS` title and two were paraphrases of one, so the row was four
    TIER titles (1, 3, 4, 6) with two tiers dropped, laid out by
    `justify-between` so none of them sat over the tier it named.

    Tiers 1, 3, 4 and 6 are the floor, the two sides of the Deep Learning
    Threshold, and the ceiling. That intent survives here as the two SPANS
    those rungs bound, which is the only partition of the six tiers the app's
    own logic supports: the 3/4 boundary is where `getBandForMark` stops being
    able to return Band 4, and it is the Verb Gate's cap.

    Naming the tiers again, one per rung, is what the dot row below already
    does from `tierShortLabel`. This names the two halves. */}
<div className={RIBBON_SPECTRUM_SCALE_RAIL}>
  <span className={RIBBON_SPECTRUM_SCALE_SPAN}>
    <span className="lg:hidden">
      {tierShortLabel(1)} – {tierShortLabel(DEEP_LEARNING_TIER)}
    </span>
    <span className="hidden lg:inline">
      {tierTitle(1)} – {tierTitle(DEEP_LEARNING_TIER)}
    </span>
    <span
      className={`${RIBBON_SPECTRUM_SCALE_BAND} ${getTierScaleConfig(DEEP_LEARNING_TIER).text}`}
    >
      {' · '}Band Caps {getTierTargetBand(1)}–{getTierTargetBand(DEEP_LEARNING_TIER)}
    </span>
  </span>

  <span className={RIBBON_SPECTRUM_SCALE_SPAN}>
    <span className="lg:hidden">
      {tierShortLabel(DEEP_LEARNING_TIER + 1)} – {tierShortLabel(TIER_STEPS.length)}
    </span>
    <span className="hidden lg:inline">
      {tierTitle(DEEP_LEARNING_TIER + 1)} – {tierTitle(TIER_STEPS.length)}
    </span>
    <span
      className={`${RIBBON_SPECTRUM_SCALE_BAND} ${getTierScaleConfig(DEEP_LEARNING_TIER + 1).text}`}
    >
      {' · '}Band Caps {getTierTargetBand(DEEP_LEARNING_TIER + 1)}–
      {getTierTargetBand(TIER_STEPS.length)}
    </span>
  </span>
</div>
```

Two small additions beside `TIER_STEPS` at `:91` (literals only, so safe at module scope —
C8):

```ts
/** The tier the Deep Learning Threshold sits above: the 3/4 boundary is where
 *  `getTierTargetBand` stops returning 3, and where the Verb Gate's Band 3 cap
 *  stops being the ceiling. Written once, read by the rail, the boundary notch
 *  and the cue. */
const DEEP_LEARNING_TIER = 3;

/** The chip's own words, so the cue can point at the marker on the bar without
 *  a second hand-written copy of its label. */
const THRESHOLD_LABEL = 'Deep Learning Threshold';
```

And in the body, next to `activeGroup` at `:278`:

```ts
/** A tier's full title, from the same array the strip is built from. Falls back
 *  to the short label rather than to a literal. */
const tierTitle = (tier: number): string =>
  sortedVerbsByGroup.find((group) => group.tier === tier)?.title ?? tierShortLabel(tier);
```

What renders, at each breakpoint:

| Width | Left caption | Right caption |
|---|---|---|
| `< sm` | *(hidden, as the chip and five step labels already are)* | — |
| `sm`–`md` | `REMEMBER – EXPLAIN` | `ANALYSE – EVALUATE` |
| `md`–`lg` | `REMEMBER – EXPLAIN · BAND CAPS 1–3` | `ANALYSE – EVALUATE · BAND CAPS 4–6` |
| `lg`+ | `REMEMBER & LIST – EXPLAIN & COMPARE · BAND CAPS 1–3` | `ANALYSE & APPLY – EVALUATE, SYNTHESISE & CREATE · BAND CAPS 4–6` |

**Why an en dash and not an arrow.** `contrast.ts:128` skips every node inside
`[aria-hidden="true"]`. An arrow would want `aria-hidden` on the glyph or on the whole rail,
and aria-hiding the rail would quietly take a new block of text out of the light-theme
contrast audit — the same class of blind spot `ce544fc` existed to close. An en dash reads
as a range (`commandVerbs.md` already sets `Marks: 1–2` that way), needs no hiding, and
leaves the rail measured.

### 3.2 The rail costs no vertical space, and here is the arithmetic

The footer's current stack, measured from the constants:

| Element | Height |
|---|---|
| Cue `<p>` — `min-h-[2.25rem]` | 36px |
| Cue's `mb-7` | 28px |
| Track wrapper — `h-3` + `mb-4` | 28px |
| Dot row — `h-10` | 40px |
| `py-4` on the footer | 32px |
| **Total** | **164px** |

That `mb-7` is not slack. `RIBBON_TIMELINE_CUE`'s doc comment (`utils/verbRibbonChrome.ts:311–319`)
records it being measured at 640/720/800/900px: the threshold chip hangs from the dot row at
`-top-11`, which places it about 16px above the track — i.e. **inside the `mb-7` gap** — and
`mb-5` let it overlap the cue's second line by 4px.

The chip occupies roughly the middle 170px of that 28px-tall band. **The left and right
thirds of it are empty today.** The rail is `absolute -top-5 inset-x-0` inside the existing
`relative mb-4` wrapper, so it is out of flow and lands in exactly that empty air, beside
the chip rather than above or below it.

**Net vertical change: 0px.** Nothing has to be removed to pay for the row, because the row
is not spending anything. That is the honest answer to "what would you remove or compress"
— and it is only available because #167 already reserved this band for the chip.

Clearance check at the tightest width the rail renders (`sm`, 640px viewport → 592px ribbon
after `p-6`): the chip is ~168px centred, so 212–380px; the `sm` captions are ~106px each,
so 0–106 and 486–592. Roughly 106px of clear air each side. At `md` (720px) the captions
grow to ~200px and clearance is ~76px. At `lg` (960px) the long captions are ~283px and
~348px against a chip at 396–564px, leaving 113px and 48px. All comfortable; **widths are
estimated from glyph metrics and must be checked in a browser — Q2.**

**Optional compression, not specified blind.** Removing the prose subtitle (§3.4) shortens
the cue, and if a browser confirms the cue is one line at every width ≥ `sm`, `mb-7` can
come down to `mb-5` for 8px. The current value was measured, so this one must be too.
Deliberately left as a follow-up.

### 3.3 The leap from Band 3 to Band 4, drawn and stated

Three devices, all grounded in something the repo already asserts. None invents pedagogy.

**(a) The gap widens — geometry says "different in kind".** `:766–773` currently draws five
boundary notches, with `boundary === 3 ? 'w-1' : 'w-0.5'`. Change the threshold's to `w-2`:

```tsx
className={`${RIBBON_SPECTRUM_BOUNDARY} ${boundary === DEEP_LEARNING_TIER ? 'w-2' : 'w-0.5'}`}
```

Four hairlines of 2px and one slot of 8px. The spectrum runs continuously through four
boundaries and is **cut** at the fifth. That is "a step up in kind, not degree" stated in
the one language the bar has. It is a call-site change only, no new constant, no new colour
— the notch is already painted in the page's own background (`RIBBON_SPECTRUM_BOUNDARY`,
`bg-slate-50 dark:bg-[rgb(var(--color-bg-base))]`), so it reads as a physical break rather
than a drawn line.

Side effect, and a good one: at tier 3 the leading edge (`RIBBON_SPECTRUM_EDGE`, `left:
50%`) lands **inside the slot** — the playhead stops at the gate. Intentional; confirm by
eye.

**(b) The magnitude, as a number, either side of the gap.** The rail's band fragments read
`Band Caps 1–3` on the left and `Band Caps 4–6` on the right, derived from
`getTierTargetBand(1/3/4/6)`. That is the leap quantified in the app's own unit: everything
left of the slot tops out at Band 3 however well it is written; everything right of it
reaches Band 4, 5 or 6. It is the same claim `RIBBON_STAT_CAPTION` makes per verb
("`{TERM}` questions cap a response at Band N"), made once for each half of the ladder.

Span statements, not tier statements, on purpose: a student at tier 4 has a cap of 4, and
the cue line 20px above says exactly that (`Band Cap 4 · Sound`). The rail says what the
*side* is worth; the cue says what *their* tier is worth. Neither can be read as promising
the other.

**(c) Colour placed at the shoulders.** The left band fragment takes
`getTierScaleConfig(3).text` (yellow/amber) and the right takes `getTierScaleConfig(4).text`
(green) — the colours of the two surfaces the slot separates, and the exact tokens the cue's
tier fragment already wears at those tiers. Yellow number, gap, green number. Derived from
C1's source of truth, and per C3 the numbers carry the meaning without it.

**What was considered and rejected:**

- *Splitting the dormant layer at 50% so the far side reads dimmer until crossed.*
  Structurally attractive, but `verbRibbonChrome.test.tsx:404–411` finds the dormant layer
  as *the gradient layer with no `clipPath`* and the lit layer as *the one with a
  `clipPath`*. Two clipped dormant halves would make `dormantLayer()` return `undefined` and
  `litLayer()` return a dormant layer — silently breaking three shipped tests to gain an
  effect colour already conveys.
- *A physical riser — the track's right half drawn taller than its left.* Needs two track
  segments, each with `background-size: 200%` to keep the gradient from rescaling, and it
  invalidates the two pinned `clipPath` values. Too much structural risk for a 2px effect.
- *`animate-fade-in-up-sm` on the chip when the tier crosses* — `Plan-CognitiveSpectrum.md`
  §3.6 floated this as an optional flourish. **It is a trap and should not be taken as
  written.** `fadeInUpSm` ends at `transform: translateY(0)` with `forwards`, and
  `RIBBON_TIMELINE_THRESHOLD_CHIP` carries `transform -translate-y-1/2`. The animation's
  final frame would override the constant's transform and leave the chip permanently 7px
  lower. If the flourish is ever wanted, it must go on a wrapper `<div>`, never on the chip
  itself.

### 3.4 The cue line: prose out, one clause in

Replace `:727–729` (the subtitle tail) with a threshold-relation clause. **The live
region's content does not change by a single byte.**

```tsx
<p className={RIBBON_TIMELINE_CUE}>
  <span role="status">
    {/* …unchanged, :712–726… */}
  </span>
  {activeTermInfo && (
    <span className={RIBBON_TIMELINE_CUE_SIDE}>
      {' — '}
      {activeTermInfo.tier > DEEP_LEARNING_TIER ? 'Above' : 'Below'} the {THRESHOLD_LABEL}
    </span>
  )}
</p>
```

Four properties, each deliberate:

- **The lede is untouched.** `Tier 4 · Analyse & Apply · Band Cap 4 · Sound` still says what
  the tier asks (its title) and how that relates to the band cap — that half of the brief was
  already satisfied by #167. Keeping it byte-for-byte means
  `commandVerbHierarchy.test.tsx:347–370` passes unchanged, including `length < 80` (tier 6,
  the longest, is 65 characters) and the pinned `Band Cap` wording that R9 settled.
- **The tail is outside the live region**, exactly where the subtitle was, for the reason
  recorded at `:698–709`: a `status` re-announces its whole content on every change, and
  "Above the Deep Learning Threshold" is the same for three tiers running.
- **Length.** The subtitles ran 44–96 characters of prose *about the tier*; this is 32–33
  characters of *structure*, with only two possible values. The visible cue drops from ~140
  characters to ~100 at tier 6, and the removed part is all of the prose.
- **`hidden sm:inline`.** Below `sm` the threshold chip is hidden
  (`RIBBON_TIMELINE_THRESHOLD_CHIP` begins `hidden sm:block`), so naming the threshold there
  would point at a marker that is not on screen. Above `sm` the words and the marker appear
  together — that pointing *is* the "short context linking these concepts" the brief asks
  for.

**The prose subtitle is not lost, and the comment that says it might be is wrong.** `:708`
claims the cue holds "the only copy of it in the document" while the tier strip is shut. It
does not: the footer (`:673`, indent 10) and the strip (`:395`, indent 10) are siblings
inside the same `overflow-hidden` wrapper (`:394`) inside the same `inert={!isOpen}` panel
(`:389–393`). They open and close together and are inert together. `RIBBON_TIER_SUBTITLE` at
`:615–619` renders `group.subtitle` for every tier, always, whenever the footer is visible.
Removing the footer's copy loses nothing that was ever reachable — verified by indentation
and by the `inert` attribute's placement.

**The `own words` collision gets *better*, not worse.** `data/commandTerms.ts:44` — tier 2's
subtitle — ends "in your own words", which is why `tests/e2e/workspace-chrome.spec.ts:196–204`
had to scope its paste-guard assertion by "Pasting is switched off" instead of by the body
prose. #167 already defused this by moving the subtitle outside the `role="status"` span;
deleting the subtitle removes the phrase from the footer entirely. The e2e filter stays (the
API health indicator is also a `status`), but its **comment at `:196–199` becomes false and
must be corrected**.

### 3.5 Motion: none added

No new keyframe, no new animation, no `requestAnimationFrame`. The reduced-motion trap
documented at `Plan-CognitiveSpectrum.md` §3.4 and pinned by
`verbRibbonChrome.test.tsx:484–509` is therefore not engaged at all. `runs nothing forever
in a strip that is always mounted` continues to pass.

### 3.6 New constants

Add to `utils/verbRibbonChrome.ts`, after `RIBBON_SPECTRUM_BOUNDARY` (`:416`). Each records
what it is painted on, per the file's house rule at `:13–15`.

```ts
/** The scale rail above the spectrum — the two spans the Deep Learning
 *  Threshold divides the ladder into. Painted on the page background.
 *
 *  `absolute`, and that is the whole vertical budget: the threshold chip hangs
 *  from the dot row at `-top-11`, which puts it about 16px above the track —
 *  inside the air `RIBBON_TIMELINE_CUE`'s `mb-7` already reserves for it. The
 *  chip occupies the middle of that band and the two ends of it are empty, so
 *  this row costs the footer no height at all.
 *
 *  `hidden sm:flex`, the same floor as the chip it sits beside and as
 *  `RIBBON_TIMELINE_STEP_LABEL_IDLE`: below `sm` there is no room for either,
 *  and naming a threshold whose marker is hidden points at nothing.
 *
 *  Flush to the track's own edges (`inset-x-0`, no padding), so the left
 *  caption starts where the spectrum starts. */
export const RIBBON_SPECTRUM_SCALE_RAIL =
  'hidden sm:flex absolute inset-x-0 -top-5 items-baseline justify-between ' +
  'pointer-events-none';

/** One span's caption. Painted on the page background, in the tone
 *  `RIBBON_TIMELINE_STEP_LABEL_IDLE`'s contrast fix measured at 7.24:1 — this
 *  is the same text on the same background at nearly the same size, so it takes
 *  the same pair rather than a fresh guess. Not `aria-hidden`: `contrast.ts`
 *  skips everything inside an `aria-hidden` subtree, and hiding a new block of
 *  text from the audit is the blind spot that let this component's three
 *  contrast defects ship in the first place. */
export const RIBBON_SPECTRUM_SCALE_SPAN =
  'text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ' +
  'text-slate-600 dark:text-slate-400';

/** The band-cap fragment of a span caption — the number the leap across the
 *  threshold is measured in. Set in the telemetry face per DesignSpec §4, like
 *  `RIBBON_TIMELINE_CUE_BAND` and `RIBBON_STAT_VALUE`. Its colour is the
 *  adjoining tier's and is interpolated at the call site, the way everything
 *  tier-coloured in this component is. Shown from `md`, where there is room for
 *  it beside the threshold chip. Painted on the page background. */
export const RIBBON_SPECTRUM_SCALE_BAND =
  'hidden md:inline font-mono font-black tabular-nums';

/** The cue's tail — which side of the Deep Learning Threshold the reader's tier
 *  falls on. It replaces the tier's full prose subtitle, which ran 44–96
 *  characters; this is 32. Carries no colour, so it inherits the cue's own.
 *  Painted on the page background, and deliberately OUTSIDE the live region,
 *  like the subtitle it replaces: it is the same string for three tiers running
 *  and a `status` re-announces everything it contains. */
export const RIBBON_TIMELINE_CUE_SIDE = 'hidden sm:inline font-normal';
```

All four satisfy C6: three carry no colour token at all, and `RIBBON_SPECTRUM_SCALE_SPAN`'s
single `text-slate-600` has its `dark:text-slate-400` partner. None contains `light:`.

---

## 4. Task list

1. **`utils/verbRibbonChrome.ts`** — add the four constants of §3.6 after
   `RIBBON_SPECTRUM_BOUNDARY` (`:416`). Do not touch `RIBBON_TIMELINE_STEP_LABEL_IDLE` or
   `RIBBON_TIMELINE_THRESHOLD_CHIP`.
2. **`utils/verbRibbonChrome.ts` `:293–325`** — rewrite `RIBBON_TIMELINE_CUE`'s doc comment.
   It currently records the four labels as deleted and the subtitle as present; both
   statements are about to be false. Keep the class string itself unchanged.
3. **`components/CommandVerbHierarchy.tsx` `:91`** — add `DEEP_LEARNING_TIER` and
   `THRESHOLD_LABEL` beside `TIER_STEPS`. Literals only (C8).
4. **`components/CommandVerbHierarchy.tsx` `:278`** — add the `tierTitle` helper.
5. **`components/CommandVerbHierarchy.tsx` `:745`** — insert the scale rail as the first
   child of the track wrapper (§3.1).
6. **`components/CommandVerbHierarchy.tsx` `:770`** — widen the threshold notch, `'w-1'` →
   `'w-2'`, keyed off `DEEP_LEARNING_TIER` rather than the literal `3` (§3.3a).
7. **`components/CommandVerbHierarchy.tsx` `:727–729`** — replace the subtitle tail with the
   threshold-side clause (§3.4). Leave `:710–726` byte-for-byte.
8. **`components/CommandVerbHierarchy.tsx` `:840`** — render the chip's text from
   `THRESHOLD_LABEL` so the cue and the chip cannot disagree. The chip's `className` is
   unchanged.
9. **`components/CommandVerbHierarchy.tsx` `:698–709`** — correct the comment claiming the
   cue holds the only copy of the subtitle. It is wrong today (§3.4).
10. **Optional, separable commit** — hoist the threshold marker (`:837–843`) out of
    `sortedVerbsByGroup.map` and render it once from `DEEP_LEARNING_TIER` instead of `idx ===
    3`. It currently depends on array order rather than on the tier.
11. **`tests/unit/commandVerbHierarchy.test.tsx`** and **`tests/unit/verbRibbonChrome.test.tsx`** — §5.
12. **`tests/e2e/workspace-chrome.spec.ts` `:196–199`** — correct the comment. The filter and
    the assertions stay.
13. **`projectDocs/changeLog.md`** — a subsection under the existing `[Unreleased] -
    2026-08-20 (The cognitive spectrum)` block, not a new release heading.
14. **`projectDocs/VerbRibbonRedesignPlan.md` `:1067–1075`** — amend open item 9. R6 stays
    closed but its *premise* was wrong: the four labels were tier titles, not span labels.
15. **`projectDocs/Plan-CognitiveSpectrum.md`** — annotate F5 and §3.5 with the same
    correction and a pointer here.

---

## 5. Tests

### Must keep passing, unchanged
- `verbRibbonChrome.test.tsx` → `leaves the timeline step labels their contrast` (`:291`),
  `gives the threshold marker a light-theme tone` (`:299`).
- `verbRibbonChrome.test.tsx` → `gives every colour on a theme surface a light value and a
  dark partner` (`:149`), `is written in the new idiom throughout` (`:192`) — these sweep
  every export and pick up the four new constants for free.
- `verbRibbonChrome.test.tsx` → the whole `the cognitive spectrum lights one geometry from
  one palette` block (`:395–531`). The rail adds no element with an inline
  `linear-gradient`, so `spectrumLayers` / `dormantLayer` / `litLayer` are unaffected.
- `commandVerbHierarchy.test.tsx` → `announces the level politely, in words` (`:347`) — the
  lede is byte-identical. Also `:115`, `:195`, `:228`, `:263`, `:404`.
- `tests/unit/bandColors.test.ts` — whole file.

### Must be rewritten
- `commandVerbHierarchy.test.tsx` → `keeps the tier's own subtitle in the line, readable but
  unannounced` (`:376`). Its premise dies with the subtitle. Replace with **`moves the
  tier's prose subtitle off the footer without losing it`**: render `ANALYSE`, assert
  `screen.getAllByText(/Break things apart and use knowledge/).length === 1`, and assert the
  survivor is inside the tier card (`RIBBON_TIER_SUBTITLE`), not the cue's `<p>`.

### New, in `commandVerbHierarchy.test.tsx`
1. **`restores the scale labels without restoring the drift`** — the rail contains `Remember
   & List` and `Evaluate, Synthesise & Create`; the document contains **no** `Basic Recall`
   and no `Evaluate & Create`. (jsdom applies no media queries, so both the `lg:hidden` and
   `hidden lg:inline` copies are in the tree — scope by the rail and match with a regex.)
2. **`names the two spans from the tier data rather than from literals`** — for tiers 1, 3,
   4, 6 the rail contains `TIER_GROUPS[tier-1].title`; assert tiers 1 and 3 on one side, 4
   and 6 on the other, so reordering `TIER_GROUPS` fails here rather than shipping.
3. **`states each side's band cap, so the leap across the threshold is a number`** — the rail
   contains `Band Caps 1–3` and `Band Caps 4–6`, built from `getTierTargetBand` (assert
   against the function's return values, not literals).
4. **`tells the reader which side of the threshold their tier is on`** — `EXPLAIN` (tier 3) →
   `Below the Deep Learning Threshold`; `ANALYSE` (tier 4) → `Above …`. Boundary cases only.
5. **`keeps the announcement to the lede`** — `getByRole('status').textContent` does not
   contain `Deep Learning`, and is still under 80 characters at tier 6.
6. **`says nothing about a threshold when no verb is chosen`** — the cue is exactly `Choose a
   command verb to light the spectrum.` and the document contains no `Above`/`Below the Deep
   Learning Threshold`.
7. **`spends no footer height on the scale rail`** — the rail's `className` contains
   `absolute`; the cue's `min-h-[2.25rem] line-clamp-2` is unchanged.

### New, in `verbRibbonChrome.test.tsx`
8. **`cuts the deep-learning boundary wider than the four ordinary ones`** — the boundary
   whose inline `left` is `50%` carries `w-2`; the other four carry `w-0.5`.
9. **`keeps the scale rail inside the contrast audit`** — `RIBBON_SPECTRUM_SCALE_RAIL` and
   `RIBBON_SPECTRUM_SCALE_SPAN` contain no `opacity-`, and the rendered rail has no
   `aria-hidden="true"` ancestor.

### E2E
- `npx playwright test tests/e2e/light-theme.spec.ts` — runs at `WIDE` and opens the ribbon
  (`:69`), so the rail is rendered, on the page background, and measured.
- `npx playwright test tests/e2e/workspace-chrome.spec.ts` — the paste guard; run it because
  task 12 touches the file.
- `npm run test:e2e` — CI's Mobile Safari leg.

### Commands
```bash
npm run test -- --run tests/unit/commandVerbHierarchy.test.tsx \
                     tests/unit/verbRibbonChrome.test.tsx \
                     tests/unit/bandColors.test.ts \
                     tests/unit/editorPasteGuard.test.tsx
npm run test:all
npm run check:eager-reads
npx playwright test tests/e2e/light-theme.spec.ts tests/e2e/workspace-chrome.spec.ts
```

### Verification by eye — non-negotiable
No visual-regression baseline exists (R2). Check **both themes**, at **375 / 640 / 768 /
1024 / 1400px**, with **tier 3** selected (yellow is where every contrast defect in this
component has been), **tier 4** (the crossing), and **no verb**. Specifically: the captions
clear the chip at 640 and 768; the 8px slot reads as a break and not as a hole; and at tier
3 the leading edge sitting inside the slot reads as arrival rather than as a rendering fault.

---

## 6. Risks, judgement calls and open questions

**Q1 — "Basic Recall" does not come back, and that is the point.** The user named it; the
data does not contain it. §1 states the alternative (change `TIER_GROUPS[0].title` so all
twelve-odd surfaces move together). **Needs the maintainer's word**, because it is the one
place this plan does not do literally what was asked.

**Q2 — every width figure in §3.2 is estimated from glyph metrics, not measured.** The
`sm`/`md`/`lg` ladder exists to keep the captions clear of the chip; if the real metrics run
15% wide the `md` step fails first. **Needs a browser at 640 and 768px.** Fix if it bites:
push the band fragment from `md` to `lg`.

**Q3 — the rail's vertical alignment with the chip is 2–3px out on paper.** `-top-5` puts
the caption's centre at about −13px where the chip's is at about −16px. A `-top-[22px]`
arbitrary value fixes it if the eye agrees. **Purely optical, needs a browser.**

**Q4 — `w-2` may be too wide at 375px.** 8px on a 343px track is 2.3%. It should read as a
slot; it might read as damage. Fallback `w-1.5`. **Visual judgement, needs a browser.**

**Q5 — the dashed threshold rule runs down the middle of the widened slot.** Through 8px it
will be plainly visible as a dashed line inside the break. Intended — it makes the rule and
the slot one object, a gate — but it can look wrong in one theme only.

**Q6 — a `lg`-width duplication remains, knowingly.** `Remember & List` on the rail sits
above `Remember` on the dot row. The range form (`X – Y`) keeps it reading as a heading over
a rung rather than the same label twice, and it is the price of restoring the arc at all.

**Q7 — the two threshold clauses read as spatial metaphors on a horizontal bar.**
"Above"/"Below" for a left/right position. "Past"/"Short of" is spatially right but "Short of
the Deep Learning Threshold" reads as a criticism of a tier-1 question, which is not a
deficient question — it is a question whose verb caps at Band 1 by design.

**Q8 — task 10 is a cleanup the brief did not ask for.** Separable into its own commit.

---

## 7. Summary, and what could not be verified

- The four deleted labels were **not span labels**. Two are byte-identical to
  `TIER_GROUPS[2].title` and `TIER_GROUPS[3].title`; the other two are paraphrases of
  `TIER_GROUPS[0].title` and `TIER_GROUPS[5].title`. The row was four *tier* titles — tiers
  1, 3, 4, 6 — with tiers 2 and 5 dropped, and `justify-between` put none of them over the
  tier it named. R6 and F5 both inherited the wrong premise, which is why the labels looked
  underivable.
- Those four tiers are the floor, the ceiling, and the two sides of the Deep Learning
  Threshold — and below `sm` the deleted row already rendered only the two poles. So the
  design answer is **two derived spans, not four labels and not six**.
- The rail **costs zero footer height**: the threshold chip hangs at `-top-11` into the 28px
  of air `mb-7` reserves, and the two ends of that band are empty.
- The leap is carried three ways — an 8px slot against four 2px hairlines, `Band Caps 1–3` /
  `Band Caps 4–6` on the shoulders in the two adjoining tiers' own colours, and one
  32-character clause in the cue naming which side the reader is on. No new keyframe, no new
  colour, no invented pedagogy.
- The live region's content is **byte-for-byte unchanged**, so the `< 80` character pin and
  the `Band Cap` wording R9 settled both survive.
- One shipped comment is provably wrong and this plan depends on saying so:
  `CommandVerbHierarchy.tsx:708` claims the cue holds the only copy of the tier subtitle. The
  footer and the tier strip are siblings inside the same `inert`-gated panel, so
  `RIBBON_TIER_SUBTITLE` always renders alongside it.
- **Could not verify:** every width figure in §3.2 and the `sm`/`md`/`lg` ladder that depends
  on them (Q2); the rail's 2–3px optical offset from the chip (Q3); whether `w-2` reads as a
  slot or a hole (Q4); how the dashed rule looks through the widened slot (Q5); whether the
  leading edge parked inside the slot at tier 3 reads as arrival; and Mobile Safari, which
  has no WebKit in this container. The suite was not run — all "passes unchanged" claims are
  derived by reading assertions against the proposed diff, not by execution.
