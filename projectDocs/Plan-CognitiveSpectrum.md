# Plan — The Cognitive Spectrum (verb ribbon footer)

Target: `components/CommandVerbHierarchy.tsx` lines 581–689 (the "Cognitive Timeline
Footer") and the `RIBBON_TIMELINE_*` block in `utils/verbRibbonChrome.ts` lines 293–347.

Brief, verbatim: *"Try to implement an elegant spectrum the lights up as the levels
change. Give it gorgeous animations and appropriate text cues."*

---

## 0. Baseline — how stale is this, exactly

`git log -L 581,689:components/CommandVerbHierarchy.tsx` narrows 22 commits to six that
touched the footer:

| Commit | Date | What it changed in the footer |
|---|---|---|
| `ce544fc` | 2026-08-14 | Contrast only — idle step labels `slate-500 opacity-70` → `slate-600`, threshold chip `slate-400` → `slate-600 dark:slate-400` |
| `9188321` | 2026-08-14 | Terminology only — the six step labels became `tierShortLabel(tier)` |
| `e0d1fd7` | 2026-08-14 | Extraction only — class strings moved verbatim into `RIBBON_TIMELINE_*` |
| `fe6f265` | 2026-08-14 | `inert` on the shut panel (surrounding, not the footer) |
| `da16c19` | 2026-08-09 | Corner masking / header lock (surrounding) |
| `ae1b121` | 2026-07-24 | **The repo's initial import.** |

The concrete statement of staleness: the footer's **geometry, fill model and motion are
byte-for-byte as they arrived in the initial import.** Verified with `git log -S`:
`px-[16%]`, `(activeTermInfo.tier / 6) * 100`, `animate-ping` and `Deep Learning
Threshold` all trace to `ae1b121` and have never been touched (only the threshold chip's
*colour* changed). Everything since has been text tokens and contrast ratios. Nobody has
revised what the thing *is*.

The existing audit already said so and deferred it — `projectDocs/VerbRibbonRedesignPlan.md`
**R5** ("should the timeline become a read-only progress statement?"), **R6** (the four span
labels are a fifth vocabulary), **A7** ("the 'measurement ticks' measure nothing").
This plan closes A7 and R6, and answers R5 with "no — keep the six buttons, they are a
pinned accessibility fix (`commandVerbHierarchy.test.tsx:228`); make the *bar* the
read-only statement instead."

---

## 1. Findings (each read from source)

### F1 — the fill and the dots are on two different scales, and one is not a scale at all

`:610` fills to `(tier / 6) * 100%`. `:625` lays the six step buttons out with
`flex justify-between items-center`, so each dot's centre is a function of the six label
text widths. `RIBBON_TIMELINE_STEP_LABEL_IDLE` begins `hidden sm:block`, so below `sm`
five labels are not rendered, those buttons collapse to a 16px dot, `justify-between`
redistributes, and **the dots move depending on which tier is current.**

At tier 3 the bar is filled to 50% while dot 3 sits at roughly 40%. The illumination
metaphor the brief asks for is broken before any styling is applied.

### F2 — the four ticks mark nothing (A7, confirmed by re-derivation)

`:601` — `flex justify-between px-[16%]` with four `w-px` children → ticks at 16%, 38.67%,
61.33%, 84%. The five boundaries between six tiers are at 16.67, 33.33, 50, 66.67, 83.33.
Two ticks are near a boundary by coincidence; two mark nothing; and **there is no tick at
50%, which is exactly where the Deep Learning Threshold crosses the track.**

### F3 — the fill is a hard-edged single colour, not a spectrum

`:609` paints `bg-gradient-to-r ${activeConfig.gradient}` — one tier's own two-stop
gradient stretched across the filled portion. The bar is monochrome and repaints entirely
when the tier changes. Six discrete dots plus a one-colour bar is exactly the "traffic
lights" read the user objected to.

### F4 — `animate-ping` runs forever on an always-mounted strip

`:667–669`. Tailwind's `ping` is `1s … infinite`. `CommandVerbHierarchy` renders in both
navigator states and is never unmounted, so this animates for the entire session while the
student writes.

### F5 — the four span labels are a fifth vocabulary (R6)

`:587–592` hand-writes `Basic Recall`, `Explain & Compare`, `Analyse & Apply`,
`Evaluate & Create`. Two are verbatim `TIER_GROUPS[].title`; two are paraphrases.
`tierShortLabel`'s doc comment is a written record of this drift class happening twice in
admin components, and `commandVerbHierarchy.test.tsx:263` pins the *six* labels — the
*four* slipped past because they name spans rather than tiers.

> **Corrected 2026-08-20** — see `projectDocs/Plan-SpectrumScaleLabels.md` §0.
> The last clause is false and it cost the feature. They do **not** name spans:
> `Explain & Compare` is byte-identical to `TIER_GROUPS[2].title` and `Analyse &
> Apply` to `TIER_GROUPS[3].title`, while `Basic Recall` and `Evaluate & Create`
> are paraphrases of `TIER_GROUPS[0].title` and `TIER_GROUPS[5].title`. The row
> was four **tier** titles — tiers 1, 3, 4 and 6 — with tiers 2 and 5 dropped,
> and `justify-between` put none of them over the tier it named. This heading
> inherited the reading from `VerbRibbonRedesignPlan.md` R6. Believing the four
> were underivable is why §3.5 below deletes them outright instead of sourcing
> them; they are restored, derived, as the scale rail.

### F6 — the threshold rule is invisible in the light theme

`:640` — `border-slate-300/30 dark:border-white/10`. `slate-300` at 30% alpha over the
light page is effectively nothing. DesignSpec §2 rule 2 in its non-text form; the contrast
suite walks text nodes only, so it cannot catch this.

### F7 — `components/CognitiveSpectrum.tsx` already exists, is dead, and hard-copies the palette

71 lines, imported nowhere (`grep -rn` returns itself plus a doc comment at
`utils/renderUtils.ts:379`). It hard-codes `bg-red-500 … bg-purple-500` in a `switch` — a
fourth copy of the tier palette, exactly what `tests/unit/bandColors.test.ts` exists to
prevent — and its `title` attributes read `Band ${t}` for a tier index.

### F8 — what must not regress

`ce544fc` fixed seven readings below the 4.5 floor, three in this footer. The guard is
**`tests/unit/verbRibbonChrome.test.tsx` → `nothing in the ribbon is dimmed below the
floor`**, cases `leaves the timeline step labels their contrast` (`:289`) and `gives the
threshold marker a light-theme tone` (`:297`); e2e counterpart
**`tests/e2e/light-theme.spec.ts`** (`:73`, `:94`).
`RIBBON_TIMELINE_STEP_LABEL_IDLE` and `RIBBON_TIMELINE_THRESHOLD_CHIP` survive this
redesign **unchanged**.

---

## 2. Constraints this design accepts

**C1 — the tier→colour mapping is a single source of truth and the spectrum derives from
it.** `getTierScaleConfig(tier)` = `getBandConfig(clamp(tier))`; `BAND_HEX` is documented
as the exact Tailwind equivalents, with distinctness pinned by `bandColors.test.ts:24–28`.
The spectrum's stops are `getBandHex(1…6)` and nothing else. Precedent:
`EvaluationDisplay.tsx:148`.

**C2 — no new palette, no new copy.** Cues assemble from `tierShortLabel`,
`TIER_GROUPS[].subtitle`, `getTierTargetBand` and `getBandName` — all existing, all pinned.

**C3 — colour is never the only signal.** The cue line names the tier in words; dots keep
labels; the lit/unlit boundary is a hard geometric edge, not a hue judgement.

**C4 — every animation must be genuinely disabled under reduced motion.** `index.css:217–226`
neutralises declarative CSS but not `requestAnimationFrame`. **This design uses no rAF and
no imperative animation**, so the global block suffices. One trap follows — §3.4.

**C5 — no forever-animation.** Net: `animate-ping` (infinite) removed, one 900ms one-shot
added. A shimmer along the lit portion was considered and **rejected** — it would run all
session on an always-mounted component, the exact battery cost the brief names.

**C6 — the parity tests apply automatically.** `verbRibbonChrome.test.tsx:167`/`:191`
iterate every export, so each new constant must pair colour properties with a `dark:`
partner and contain no `light:`. Arbitrary values (`shadow-[…]`) are exempt;
`[rgb(var(--color-…))]` values are **not**.

**C7 — never put text on the spectrum.** `tests/e2e/support/contrast.ts:101` returns
`unassessable` for any element whose background chain hits a `background-image`. Text on a
gradient silently leaves the contrast audit. The cue line sits on the page background.

**C8 — no module-scope read of an imported value.** `npm run check:eager-reads` scans for
this; `projectDocs/bundleSafety.md` documents the crash class. **Build the gradient inside
`useMemo`.**

---

## 3. Design

### 3.1 One geometry: six equal bands

- Band *i* occupies `[(i−1)/6, i/6]`.
- Dot *i* sits at its band **centre**: `(2i−1)/12` → 8.333, 25, 41.667, 58.333, 75, 91.667%.
- Boundaries (the honest replacement for F2) at `i/6` for *i* = 1…5.
- The fill formula `(tier / 6) * 100` is **unchanged** — the only part of the geometry that
  was already right.

Filling to `tier/6` now means "tier *i*'s whole band is lit, with its dot inside the lit
region". The Deep Learning Threshold at `left-1/2` lands exactly on the 3/4 boundary — it
already did, so **its position needs no change**.

The dot row changes from `flex justify-between items-center` to `relative h-10`, each
button `absolute -translate-x-1/2 w-16 text-center` at
`style={{ left: \`${((2*tier-1)/12)*100}%\` }}`. Side effect worth having: the row's height
stops depending on which labels render, so the footer no longer jumps when the tier changes.

### 3.2 The spectrum: two layers and a clip

```ts
const spectrum = useMemo(() => {
  const stop = (i: number) => `${getBandHex(i)} ${(((2 * i - 1) / 12) * 100).toFixed(3)}%`;
  return (
    `linear-gradient(to right, ${getBandHex(1)} 0%, ` +
    [1, 2, 3, 4, 5, 6].map(stop).join(', ') +
    `, ${getBandHex(6)} 100%)`
  );
}, []);
```

Stops at band **centres**, not boundaries: each dot sits exactly on its own canonical hex,
transitions happen across boundaries, and the result reads as one continuous wash rather
than six flat blocks — six flat blocks would be the traffic lights again, only wider. A
visual judgement, stated as one.

Two elements, both `absolute inset-0`, both carrying that string as `backgroundImage`:

1. **Dormant** — `opacity-20 dark:opacity-25`. The whole journey, visible but unlit. This
   is what makes "not yet reached" read as *ahead of you* rather than *empty*.
2. **Lit** — full opacity, clipped:

```tsx
style={{ backgroundImage: spectrum, clipPath: `inset(0 ${100 - pct}% 0 0)` }}
className="absolute inset-0 transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
```

`clip-path`, **not** `width`. `width: N%` on a gradient element rescales the gradient into
that width — at tier 3 you would see all six colours squeezed into half the bar.
`inset()` clips a full-width gradient, so a given colour never moves. Animatable and
GPU-composited. Fallback if Mobile Safari misbehaves: an `overflow-hidden` wrapper at
`width: N%` containing a child pinned to the track's width.

Consequence to respect: `clip-path` clips box-shadows, so the tier glow lives on the
leading edge — which is where you want it anyway.

**Leading edge (the "playhead")** — what turns "a coloured bar" into "lit so far":

```
RIBBON_SPECTRUM_EDGE =
  'absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full pointer-events-none ' +
  'transition-[left] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ' +
  'bg-slate-900/70 dark:bg-white'
```

with `style={{ left: \`${pct}%\`, boxShadow: \`0 0 10px 2px ${getBandHex(tier)}66\` }}`.

A theme pair, not `bg-white/90`: white alpha over the pale light spectrum is DesignSpec §2
rule 2 — it disappears. The glow is the tier's own hex, so it stays derived from C1.
`left` is not compositor-promoted; accepted deliberately for one 2px element transitioning
once per question change, and documented rather than hidden.

**Boundaries** — five notches at `i/6`:

```
RIBBON_SPECTRUM_BOUNDARY =
  'absolute inset-y-0 w-0.5 -translate-x-1/2 pointer-events-none ' +
  'bg-slate-50 dark:bg-[rgb(var(--color-bg-base))]'
```

They read as physical gaps in the spectrum in both themes. The 3/4 boundary takes `w-1` —
it is the Deep Learning Threshold and deserves the wider gap.

**Track.** `RIBBON_TIMELINE_TRACK` `h-2` → `h-3`. Eight pixels is too thin to read a
six-colour spectrum in. Visual judgement, stated as one.

### 3.3 The ignition: one new keyframe, justified

1. **The edge advances** — 700ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Both are the house's
   own: that curve is the only one in `tailwind.config.js`'s animation block, and 700ms is
   what `RIBBON_ROOT`, the disclosure panel and `RIBBON_TIER_CARD` already use. The current
   `duration-1000 ease-out` appears nowhere else in the component.

2. **The newly-reached band ignites** — a one-shot bloom confined to band *tier*, with
   `key={tier}` so React remounts it and it replays on every change:

```tsx
<div
  key={activeTermInfo.tier}
  aria-hidden="true"
  className={`${RIBBON_SPECTRUM_IGNITION} animate-tier-ignite`}
  style={{
    left: `${((tier - 1) / 6) * 100}%`,
    width: `${100 / 6}%`,
    backgroundColor: getBandHex(tier),
  }}
/>
```

New keyframe in `tailwind.config.js`:

```js
animation: { 'tier-ignite': 'tierIgnite 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards' },
keyframes: {
  tierIgnite: {
    '0%':   { opacity: '0', transform: 'scaleX(0.4) scaleY(1)' },
    '30%':  { opacity: '0.85', transform: 'scaleX(1) scaleY(2.4)' },
    '100%': { opacity: '0', transform: 'scaleX(1) scaleY(1)' },
  },
},
```

**This is a new keyframe and it is declared rather than smuggled in.** Justification:
nothing existing is a one-shot bloom returning to rest — `pulseGlow` is `infinite`,
`shimmer` is an `infinite` translate, `animateIn`/`fadeIn` end at opacity 1 and stay. A
flare must end at 0 or it burns in. It animates transform and opacity only, honouring
`tailwind.config.js:45`. Net budget: **+1 one-shot, −1 infinite**.

3. **The dot** — `isActive` keeps `solidBg` + `scale-125`; `isCurrent` keeps
   `ring-4 scale-150 shadow-lg`. The `animate-ping` child is deleted and replaced by the
   *same* `animate-tier-ignite` on a `rounded-full` child, also `key`ed on tier.

### 3.4 The reduced-motion trap, written down

Under `index.css:217`, `animation-duration: 0.01ms !important` +
`animation-iteration-count: 1 !important` means the flare runs once, instantly, and **lands
on its final frame**. `tierIgnite`'s `100%` is `opacity: 0`, so it self-erases. Had the
final frame been `opacity: 0.85`, a reduced-motion user would get a permanent bloom burned
into the bar.

**Any keyframe added here must have its resting state as its final frame.** That is the
whole reason the flare goes 0 → 0.85 → 0.

No rAF, no `element.animate()`, no JS interpolation anywhere in the footer.

### 3.5 The text cues

Delete the four span labels (F5 / R6). One cue line takes their slot, above the track.

> **Corrected 2026-08-20** — see `projectDocs/Plan-SpectrumScaleLabels.md`. The
> four were not span labels (F5's correction above), so "nothing can derive
> them" was never the reason to delete them. The cue line stays and is right;
> what was lost with the four was the *arc* — the floor, the ceiling and the
> gate between tiers 3 and 4 — and that is restored as a scale rail naming the
> two spans those rungs bound. The cue's prose-subtitle fragment sketched below
> is also gone, replaced by a threshold-side clause.

```tsx
<p role="status" className={RIBBON_TIMELINE_CUE}>
  {activeTermInfo && activeConfig ? (
    <>
      <span className={`${RIBBON_TIMELINE_CUE_TIER} ${activeConfig.text}`}>
        Tier {activeTermInfo.tier} · {tierShortLabel(activeTermInfo.tier)}
      </span>
      {' — '}
      {sortedVerbsByGroup.find((g) => g.tier === activeTermInfo.tier)?.subtitle}
      {' '}
      <span className={RIBBON_TIMELINE_CUE_BAND}>
        Ceiling: Band {getTierTargetBand(activeTermInfo.tier)} ·{' '}
        {getBandName(getTierTargetBand(activeTermInfo.tier))}
      </span>
    </>
  ) : (
    'Choose a command verb to light the spectrum.'
  )}
</p>
```

At tier 4 a student reads: *"Tier 4 · Analyse — Break things apart and use knowledge in new
situations — dig deep. Ceiling: Band 4 · Sound."* Every fragment is sourced, not written.

Four properties matter:

- **`role="status"`, not `aria-live="assertive"`.** `PromptSelector.tsx:906–908` states the
  house reasoning: assertive interrupts a student mid-sentence, and changing question is
  ordinary navigation.
- **Rendered unconditionally**, including the no-verb case — a live region must exist
  before it changes.
- **The no-verb string names no tier.** `commandVerbHierarchy.test.tsx:195` pins that the
  component says nothing about an unrecognised verb, asserting `queryByText(/Tier 3/)` is
  null.
- **Height-locked** — `min-h-[2.25rem] line-clamp-2`, since the six subtitles run 44–96
  characters.

```
RIBBON_TIMELINE_CUE =
  'min-h-[2.25rem] line-clamp-2 px-1 mb-3 text-[11px] font-medium leading-snug ' +
  'text-slate-600 dark:text-[rgb(var(--color-text-muted))]'

RIBBON_TIMELINE_CUE_TIER = 'font-black uppercase tracking-widest text-[10px]'

RIBBON_TIMELINE_CUE_BAND =
  'font-mono font-black tabular-nums text-[10px] uppercase tracking-wider ' +
  'text-slate-700 dark:text-slate-300'
```

`font-mono tabular-nums` on the band ceiling per DesignSpec §4; `RIBBON_STAT_VALUE` already
sets the band cap in it. `text-slate-600` not `slate-500`: `ce544fc` measured `slate-500`
on this background at 4.66:1, the narrowest margin in the component.

### 3.6 The Deep Learning Threshold — it survives

Tier 3 → 4 is where a student crosses out of a Band 3 ceiling. The Band 3 cap is
load-bearing everywhere else (the Verb Gate, `getBandForMark`, `bandColors.test.ts:73`).
It is the only annotation here naming something a student would not deduce.

1. **Position: none** — `left-1/2` is exactly the 3/4 boundary under the new geometry.
2. **Visible in the light theme** (F6): `border-slate-300/30 dark:border-white/10` →
   `border-slate-400 dark:border-white/25`.
3. **Part of the spectrum**: the 3/4 boundary notch widens to `w-1`, so the threshold is a
   real gap the dashed rule descends from.

`RIBBON_TIMELINE_THRESHOLD_CHIP` is **unchanged** (F8). Optional flourish:
`animate-fade-in-up-sm` on the chip keyed on `tier >= 4`. Colour deliberately does not
carry the crossing — the cue line names it in words (C3).

---

## 4. Task list

1. **`tailwind.config.js`** — add the `tierIgnite` keyframe and `tier-ignite` animation
   (§3.3). Transform/opacity only; final frame is the resting state (§3.4).
2. **`utils/verbRibbonChrome.ts`** — replace the `RIBBON_TIMELINE_*` block (`:293–347`):
   - **Delete** `RIBBON_TIMELINE_LABEL` (F5/R6) and `RIBBON_TIMELINE_TICK` (F2/A7).
   - **Add** `RIBBON_SPECTRUM_DORMANT`, `RIBBON_SPECTRUM_LIT`, `RIBBON_SPECTRUM_EDGE`,
     `RIBBON_SPECTRUM_IGNITION`, `RIBBON_SPECTRUM_BOUNDARY`, `RIBBON_TIMELINE_CUE`,
     `RIBBON_TIMELINE_CUE_TIER`, `RIBBON_TIMELINE_CUE_BAND`.
   - **Change** `RIBBON_TIMELINE_TRACK` `h-2` → `h-3`.
   - **Do not touch** `RIBBON_TIMELINE_DOT`, `RIBBON_TIMELINE_STEP_LABEL`,
     `RIBBON_TIMELINE_STEP_LABEL_IDLE`, `RIBBON_TIMELINE_THRESHOLD_CHIP` (F8).
   - Every new constant gets a doc comment naming **what it is painted on** (file house
     rule, `:13–15`) and must satisfy C6.
3. **`CommandVerbHierarchy.tsx`** — add the `spectrum` `useMemo` (§3.2), **inside the
   component body, not module scope** (C8). Import `getBandHex`, `getBandName`.
4. **`CommandVerbHierarchy.tsx` `:586–593`** — delete the four span labels; render the cue
   line (§3.5).
5. **`CommandVerbHierarchy.tsx` `:596–612`** — rebuild the track: dormant layer, clipped lit
   layer, five boundary notches, leading edge. Remove the `px-[16%]` ticks and the
   `width`-based fill.
6. **`CommandVerbHierarchy.tsx` `:625–688`** — dot row to absolute positioning at
   `(2i−1)/12` (§3.1); keep every button, `onClick` and `aria-label` byte-for-byte
   (`commandVerbHierarchy.test.tsx:228`, `:263`).
7. **`CommandVerbHierarchy.tsx` `:666–670`** — delete the `animate-ping` child; add the
   `key`ed `animate-tier-ignite` halo (F4).
8. **`CommandVerbHierarchy.tsx` `:639–645`** — threshold contrast fix and `w-1` notch (§3.6).
9. **Delete `components/CognitiveSpectrum.tsx`** (F7) and re-point the orphaned reference at
   `utils/renderUtils.ts:379`. Separable into its own commit if the reviewer disagrees.
10. **Tests** — §5.
11. **`projectDocs/changeLog.md`** — `[Unreleased]` entry in the house voice: traffic-light →
    spectrum; F1/F2 as geometry defects present since the initial import; R5 answered and R6
    closed; the `tierIgnite` keyframe and why; `animate-ping` removal as a battery decision.
12. **`projectDocs/VerbRibbonRedesignPlan.md`** — mark R5, R6, A7 closed in *"Open items —
    carried, not closed"* (`:1027`). Leave R8 open.

---

## 5. Tests

### Must keep passing, unchanged
- `verbRibbonChrome.test.tsx` → `leaves the timeline step labels their contrast` (`:289`),
  `gives the threshold marker a light-theme tone` (`:297`) — **the contrast suite that must
  not regress** (F8).
- `verbRibbonChrome.test.tsx` → `gives every colour on a theme surface a light value and a
  dark partner` (`:147`), `is written in the new idiom throughout` (`:190`) — these pick up
  the eight new constants automatically (C6).
- `commandVerbHierarchy.test.tsx` → `:228`, `:263`, `:195`, `:115`.
- `bandColors.test.ts` — the whole file; it is the invariant the spectrum derives from.

### New, in `verbRibbonChrome.test.tsx`
1. `paints the spectrum from BAND_HEX rather than from literals` — all six `BAND_HEX` appear
   in tier order in the dormant layer's `backgroundImage`. The drift guard.
2. `lights the spectrum to the tier's share of six` — `clipPath` is `inset(0 83.333% 0 0)`
   for tier 1 (`IDENTIFY`), `inset(0 0% 0 0)` for tier 6 (`EVALUATE`).
3. `clips the lit layer rather than resizing it` — no `width` in the lit layer's inline
   style, so the rescaling bug cannot return.
4. `runs nothing forever in a strip that is always mounted` — no `animate-ping`/
   `animate-pulse` in the footer. Battery guard for F4.
5. `puts each dot at the centre of its own band` — `style.left` is `8.333%` / `91.667%`.
6. `ends its ignition keyframe at rest, so reduced motion leaves nothing burned in` —
   `keyframes.tierIgnite['100%'].opacity === '0'` (§3.4).

### New, in `commandVerbHierarchy.test.tsx`
7. `announces the level politely, in words` — a `role="status"` node contains `Tier 4`,
   `Analyse`, `Band 4` for `ANALYSE`, and is not `aria-live="assertive"`.
8. `keeps the live region mounted when no verb is chosen, and names no tier` — extends `:195`.
9. `locks the footer's height across every tier` — cue line carries `min-h-`/`line-clamp-2`.

### E2E
- `npx playwright test tests/e2e/light-theme.spec.ts` — `freezeAnimations` measures the
  resting state, which is what you want. The cue line is on the page background (C7) and is
  measured; the spectrum carries no text and is correctly `unassessable`.
- `npm run test:e2e` — CI runs Mobile Safari, the only place `clip-path` risk will surface.

### Commands
```bash
npm run test -- --run tests/unit/verbRibbonChrome.test.tsx \
                     tests/unit/commandVerbHierarchy.test.tsx \
                     tests/unit/bandColors.test.ts
npm run test:all
npm run check:bundle
npx playwright test tests/e2e/light-theme.spec.ts
```

### Verification by eye — non-negotiable
This component has no visual-regression baseline (R2). Check **both themes**, with **tier 3**
selected (yellow is where every contrast defect here has been), with **no verb** selected, at
**1400px and 375px**, and by **changing question repeatedly** to confirm the motion is not
noisy.

---

## 6. Risks and open questions

**Q1 — the tier-1 label at 320px.** Buttons at `-translate-x-1/2 w-16`; tier 1's centre is
≈27px at 320px, so a 64px label overhangs by ~5px. Only bites when tier 1 is current on a
phone. Fixes in preference order: `truncate`; `w-14`; clamp the outer two translates.
**Needs a browser at 320px.**

**Q2 — dormant-layer opacity is a guess.** `opacity-20 dark:opacity-25`. Tune by eye in both
themes. Purely a visual judgement.

**Q3 — light-theme saturation.** `BAND_HEX` are the `-500` shades; on a `slate-50` page
`yellow-500` is a low-contrast lit colour. **Not** a WCAG failure — the bar is decorative,
colour is not the only signal (C3), and the boundary is geometric. If it reads weakly, the
honest fix is a per-theme stop set using `BAND_HEX` in dark and `BAND_HEX_DARK` in light,
still derived from the source of truth. Deliberately not specified up front.

**Q4 — `clip-path` in Mobile Safari.** No WebKit in the container. CI runs Mobile Safari on
every PR — watch that check rather than assuming. Fallback in §3.2.

**Q5 — R5 is answered, not closed by consensus.** If the maintainer prefers read-only, tasks
6–7 collapse to plain `<div>`s and the `aria-label`s move to a single `role="img"` — the
`BandGoalCard` pattern at `EvaluationDisplay.tsx:137–141`.

**Q6 — task 9 is a deletion the brief did not ask for.** Splittable into its own commit.

---

## 7. Findings summary, and what could not be verified

- The footer's geometry, fill model and motion are **unchanged since the initial import**
  (`ae1b121`, 2026‑07‑24). The six commits since changed only text tokens and contrast
  ratios. The user's instinct is correct and provable with `git log -S`.
- **The fill and the dots have never been on the same scale**, and below `sm` the dot
  positions are not even stable across tier changes. The four "measurement ticks" mark
  nothing — logged as A7 and never fixed.
- The four span labels are a **fifth** hand-written copy of the tier vocabulary, on a footer
  that already has a test pinning the six labels against this exact drift.
- `components/CognitiveSpectrum.tsx` **already exists, is imported nowhere, and hard-codes
  the six tier colours** — a live drift risk owning this plan's name.
- Exactly **one** new keyframe is needed, and one infinite one is removed — a net battery win
  on an always-mounted strip. No rAF, so `index.css:217` covers reduced motion entirely; the
  one trap is that the flare's final frame must be `opacity: 0`.
- **Could not verify:** the tier-1 label overhang at 320px (Q1); dormant opacity and
  light-theme saturation, both needing eyes in a browser (Q2, Q3); `clip-path` transition
  behaviour in Mobile Safari (Q4); and whether `projectDocs/commandVerbs.md` constrains any
  of the cue wording — `VerbRibbonRedesignPlan.md` R9 warns that any agent changing
  student-facing copy in this component must read it first, and **this plan did not**.
- Out of scope but noted: DesignSpec §2's tier-hex table still contradicts `BAND_HEX` (R8),
  which is why §3.2 takes its hexes from `BAND_HEX` and not from the spec.
