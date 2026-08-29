# Live Draft-Readiness Hint — Implementation Plan

Branch: `claude/live-band-hint-styling`
Status: PLAN ONLY (no code changed by this document)

---

## 1. Summary & framing

We give students live, pre-evaluation feedback by elegantly hinting at how **complete
and ready** their in-progress draft is, across three surfaces: the Evaluate button, the
writing area, and a new readiness meter. The signal is **"draft readiness", never a
predicted band or mark.** It climbs the app's six-step band **colour** palette
(red 1 → orange 2 → yellow 3 → green 4 → blue 5 → purple 6) purely as a familiar visual
language, while every surface is **labelled with completeness words** ("Getting there",
"Nearly ready") and a percentage — never "Band X".

The colour is honest because it is computed from mechanical, client-side-observable
targets only — length against the question's own expected length, paragraph/structure,
syllabus-keyword coverage, and sentence variety — not from any quality judgement. Real
band/mark logic (`getBandForMark`, the Verb Gate, `getBandForColour`) is the single
source of truth for actual bands and is **not touched, duplicated, or fed by this
feature.** The readiness value is a **separate, provisional, mechanical score** named
`readinessScore` / `readinessLevel` throughout — deliberately never `band` — that merely
*borrows* the palette via the canonical helpers in `utils/renderUtils.ts`. This keeps the
hint consistent with the app's ruthless-marker persona: it says "your draft is taking
shape", it never promises a grade before the AI has read a word.

> This plan intentionally supersedes the current standalone `progressScore` in
> `components/WorkspaceRightPanel.tsx:120-149` and the `progress`-driven veil in
> `components/Editor.tsx:264-309`, folding both into one readiness signal so the whole
> workspace agrees on a single completeness number.

---

## 2. Readiness model

### 2.1 New pure module — `utils/draftReadiness.ts`

Pure, synchronous, React/DOM-free (mirrors `utils/writingAnalysis.ts`). **No AI call.**
It consumes only values already derived in `hooks/useWritingMetrics.ts` (`analyzeText`
output + per-question targets), so it introduces no new parsing of the syllabus.

```ts
export type ReadinessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = neutral (pre-writing)

export interface ReadinessInput {
  analysis: TextAnalysis;        // from utils/writingAnalysis.ts:analyzeText
  wordCount: number;             // hooks/useWritingMetrics.ts:45
  targetWordCount: number;       // progressInfo.targetCount (min for the target band)
  targetWordCountMax: number;    // progressInfo.targetCountMax
  keywordsTotal: number;         // prompt.keywords?.length
  keywordsUsed: number;          // keywordStats.used.length
  tier: number;                  // commandTermInfo.tier (1..6)
  maxBand: number;               // getBandForMark(totalMarks,totalMarks,tier) — target band
  expectedTerms?: number;        // getExpectedTerms(...) — Tier 4+ term expectation
}

export interface ReadinessResult {
  score: number;                 // 0..100 (rounded)
  level: ReadinessLevel;         // 0 neutral, else 1..6 mapping onto the band palette
  isNeutral: boolean;            // true when level === 0 (empty / barely-started)
  label: string;                 // e.g. "Getting there" — READINESS words, never band names
  subscores: { length: number; structure: number; keywords: number; variety: number }; // each 0..1
}

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  0: 'Start writing',
  1: 'Just beginning',
  2: 'Taking shape',
  3: 'Developing',
  4: 'Getting there',
  5: 'Nearly ready',
  6: 'Ready to submit',
};

export const computeDraftReadiness = (input: ReadinessInput): ReadinessResult => { /* … */ };

// Thin, pure colour bridge — delegates to the canonical palette, defines NO new hex.
export const getReadinessChroma = (level: ReadinessLevel): {
  isNeutral: boolean;
  hex: string;        // getBandHex(level) for 1..6; slate for 0
  hexDark: string;    // getBandHexDark(level) for 1..6; slate for 0
  config: BandConfig; // getBandConfig(level) for 1..6; a neutral slate config for 0
};
```

**Labels are deliberately distinct from `BAND_NAMES`** (`renderUtils.ts:254` —
Elementary/Limited/Developing/Sound/Excellent/Outstanding) so the UI can never be read as
naming a band.

### 2.2 Sub-scores (each 0..1)

1. **Length** `= clamp(wordCount / targetWordCount, 0, 1)`. Uses the *question's own*
   `targetWordCount` (`progressInfo.targetCount`, itself derived from `BAND_METRICS` ×
   marks in `useWritingMetrics.ts:61-86`), so a 2-mark and a 10-mark question reach the
   same length sub-score at very different word counts. No over-length penalty here (the
   "too long" nudge stays in Live Insights, `writingAnalysis.ts:144`).
2. **Keywords** `= keywordsTotal > 0 ? keywordsUsed / keywordsTotal : min(1, length)`.
   Falls back to the length sub-score when the prompt has no keywords (same convention as
   the current `progressScore`, `WorkspaceRightPanel.tsx:143-145`), so keyword-free
   questions still progress.
3. **Structure** `= min(1, paragraphCount / expectedParagraphs)`, where
   `expectedParagraphs = maxBand >= 5 ? 3 : maxBand >= 4 ? 2 : 1`. Multiply by `0.7` when
   `longestSentenceWords > 45` (the run-on threshold, `writingAnalysis.ts:87`) — a wall of
   one sentence is structurally weaker.
4. **Variety** `= sentenceCount >= 3 && longestSentenceWords <= 45 ? 1
   : sentenceCount >= 2 ? 0.6 : sentenceCount >= 1 ? 0.3 : 0`. A crude but honest
   "more than one, none of them runaway" check on `analysis.sentenceCount` /
   `analysis.longestSentenceWords`.

The **command-verb / marking-criteria coverage** the brief lists is represented
*mechanically only* — via keyword coverage (sub-score 2) and the tier-scaled
`expectedParagraphs` (sub-score 3). Genuine semantic checking of criteria or verb intent
is **out of scope** (§6); we do not pretend to detect analysis/evaluation in prose.

### 2.3 Combine → score → level

```
raw   = 0.35*length + 0.30*keywords + 0.20*structure + 0.15*variety   // 0..1
score = round(raw * 100)                                              // 0..100
```

**Empty / barely-started must be neutral, not a red alarm.** Level 0 (a calm slate, *not*
band 1 red) is returned whenever `wordCount === 0` **or** `score < 12`. Only once the
draft has real substance does it enter the palette at level 1.

| Condition            | `level` | Palette colour (via helper) | `label`          |
|----------------------|:-------:|-----------------------------|------------------|
| `wordCount === 0`    |  **0**  | slate (neutral, no band)    | Start writing    |
| `score < 12`         |  **0**  | slate (neutral, no band)    | Start writing    |
| `12 ≤ score ≤ 27`    |  **1**  | `getBandHex(1)` red         | Just beginning   |
| `28 ≤ score ≤ 43`    |  **2**  | `getBandHex(2)` orange      | Taking shape     |
| `44 ≤ score ≤ 59`    |  **3**  | `getBandHex(3)` yellow      | Developing       |
| `60 ≤ score ≤ 74`    |  **4**  | `getBandHex(4)` green       | Getting there    |
| `75 ≤ score ≤ 88`    |  **5**  | `getBandHex(5)` blue        | Nearly ready     |
| `89 ≤ score ≤ 100`   |  **6**  | `getBandHex(6)` purple      | Ready to submit  |

Level → colour is resolved **exclusively** through `getReadinessChroma`, which calls the
pinned helpers `getBandHex` / `getBandHexDark` / `getBandConfig`
(`renderUtils.ts:264,265,289`). Level 0 is the one colour *outside* the palette — a
deliberate slate so an empty box reads as "not started", never as "failing".

---

## 3. UI wiring

Readiness is computed once in `hooks/useWritingMetrics.ts` and returned on
`WritingMetrics`, so all three surfaces read the same object (the hook is already the
"single source of truth for everything the workspace says about a draft",
`useWritingMetrics.ts:35-41`).

```ts
// hooks/useWritingMetrics.ts — add to the returned WritingMetrics
readiness: ReadinessResult; // computeDraftReadiness({ analysis, wordCount, targetWordCount:
                            // progressInfo.targetCount, targetWordCountMax: progressInfo.targetCountMax,
                            // keywordsTotal, keywordsUsed, tier: commandTermInfo.tier,
                            // maxBand, expectedTerms })
```

**Exam mode is exempt on every surface** — the writing area already goes deliberately
neutral in exam mode (`Editor.tsx:265-267`) and Live Insights is hidden
(`WorkspaceRightPanel.tsx:447`). Readiness hints must likewise render as neutral / hidden
when `writingMode === 'exam'` so nothing signals scoring under exam conditions.

### 3.1 Surface A — Evaluate / Submit button

- **File:** `components/WorkspaceRightPanel.tsx` — `buttonConfig` `:164-173` and the
  `evaluateAction` button `:294-346`.
- **Change:** replace the fixed indigo `buttonConfig` with a readiness-derived
  gradient/glow/border pulled from `getReadinessChroma(readiness.level).config`
  (`.gradient`, `.glow`, `.border` — all already carry `light:`/`print:` variants).
  Keep the **disabled** and **evaluating** branches exactly as they are
  (`:310-313`). When `readiness.isNeutral` (empty draft, which is also the disabled
  state), keep the current calm indigo/slate accent — so the button only takes palette
  colour once there is something to evaluate.
- **Note on the prior decision:** the current comment (`:151-163`) explains the button was
  deliberately *de*-banded because it once predicted a band from word count. This plan is
  compatible with that intent: the accent now tracks **readiness/completeness**, is
  labelled as such, and is reinforced by the adjacent meter's number — it is not a band
  prediction. Update that comment to describe the readiness colouring rather than delete
  the reasoning.
- **Accessible label travelling with the colour:** extend the existing `title`
  (`:297-303`) and add `aria-label` such as
  `"Evaluate — draft readiness: Getting there, 62%"`. The `<span>Evaluate</span>` text and
  the neighbouring meter (§3.3) carry the meaning; colour is never the sole signal.
- **Motion:** keep the existing `transition-all duration-300` (`:306`); add
  `motion-reduce:transition-none`. No new pulsing.

### 3.2 Surface B — Writing-area ambient hue

- **File:** `components/Editor.tsx` — `chroma` memo `:264-309`, header progress row
  `:604-618`, caret `:939`, footer identity dot/label `:1006-1014`; card wrapper in
  `components/WorkspaceRightPanel.tsx:366-401`.
- **Keep the header's tier-hue identity** (`chroma.background`, `:301`) — that colour says
  "this is a Tier-N question" and is a *different* language from readiness. Readiness is
  layered on as **ambient accents that never touch text**:
  1. **Veil / fill:** feed `readiness.score / 100` (not the separate `progressScore`) into
     the veil lift (`:295`) and the header's white progress bar width (`:611,615`), so the
     surface "fills in" with readiness. Give that header bar `role="progressbar"` +
     `aria-valuenow/min/max` and an `aria-label="Draft readiness"`.
  2. **Caret** (`:939`) and a **soft outer glow** on the card wrapper
     (`WorkspaceRightPanel.tsx:367`) take `getReadinessChroma(level).hex` at low alpha
     (e.g. a `box-shadow` ring). Neutral level 0 → no glow (slate caret).
- **The readiness hue is applied only to border/glow/caret/meter — never to the textarea
  background or the highlight overlay** (`Editor.tsx:936,946`), which keep their theme
  text tokens. Body-text contrast is therefore structurally untouched (see §4).
- **Relabel** the footer's completeness copy so it reads as readiness beside the fixed
  `Band {targetBand} Target` (`:1013`) — e.g. append `· Getting there`. The target-band
  pill itself stays (it is the question's honest goal, not a prediction).
- **Motion:** the existing `transition-*` on veil/footer (`:610,958`) is already
  neutralised by the global `prefers-reduced-motion` rule (`index.css:217-225`); add
  `motion-reduce:` guards on any new transition.

### 3.3 Surface C — Readiness meter (new component)

- **New file:** `components/ReadinessMeter.tsx` — small presentational ring **or** slim
  bar. Props: `{ readiness: ReadinessResult; compact?: boolean }`.
- **Home:** the editor footer, inside `evaluateAction`
  (`WorkspaceRightPanel.tsx:282-348`), immediately left of the Evaluate button, so
  **colour + number + label sit together at the moment of submission**. Reuse
  `PANEL_SURFACE`/pill conventions where appropriate.
- **Renders (colour is never alone):**
  - the ring/bar fill coloured via `getReadinessChroma(level)` (palette for 1..6, slate
    for 0),
  - the **numeric `{score}%`**,
  - the **text label** `{readiness.label}` (e.g. "Getting there"),
  - `role="progressbar"` with `aria-valuenow={score}`, `aria-valuemin={0}`,
    `aria-valuemax={100}`, `aria-label="Draft readiness"`.
- **Neutral (level 0):** slate fill, label "Start writing", no palette colour — so an
  empty box is calm.
- **Motion:** fill width/stroke uses a short `transition` + `motion-reduce:transition-none`;
  no infinite animation. `print:hidden` (a live pre-submission signal has no place on a
  printed page).

---

## 4. Accessibility & theming

- **AA in light & dark:** all palette colour comes from `getBandConfig` /
  `getBandHex(Dark)`, whose `light:` variants and contrast measurements are documented and
  **pinned by `tests/unit/bandColors.test.ts`** (`renderUtils.ts:268-337`, incl. the band-3
  `text-yellow-950` fix). We add **no new hex** except the level-0 slate (decorative
  border/caret only, never behind text). Any place we must put text on a band fill, use
  `config.solidText` (which already special-cases band 3).
- **Never colour-only:** every surface pairs colour with text and/or a number — button
  `aria-label` + adjacent meter, header bar `aria-label="Draft readiness"`, meter
  `{score}% {label}` + `role="progressbar"`.
- **Reduced motion:** the global rule at `index.css:217-225` neutralises animation and
  transition durations; we additionally attach `motion-reduce:transition-none` /
  `motion-reduce:animate-none` (as `Editor.tsx:798` already does) and use **no infinite
  pulse** on any readiness surface.
- **Writing-area contrast is safe by construction:** the readiness hue is confined to the
  card **border/glow, caret, header bar, and meter**. The `<textarea>` background stays
  transparent and its visible text is the highlight overlay using
  `text-[rgb(var(--color-text-primary))] light:text-slate-800` (`Editor.tsx:946`). Because
  no readiness colour is ever painted *under* the glyphs, body-text contrast cannot drop
  below AA in either theme.
- **Print:** the meter and glow are `print:hidden`; the header keeps its existing
  print behaviour. Band configs already ship `print:` variants for anything that survives
  to paper.
- **Exam mode:** neutral/hidden everywhere (see §3), matching the editor's existing
  exam-neutral header (`Editor.tsx:265-267`).

---

## 5. Testing

### New tests
- **`tests/unit/draftReadiness.test.ts`** (pure model):
  - empty draft → `level 0`, `isNeutral true`, `score 0`, label "Start writing" (the
    "no red alarm on an empty box" guarantee);
  - a barely-started draft (`score < 12`) stays neutral, not red;
  - **threshold boundaries** 12/28/44/60/75/89 map to levels 1–6 exactly;
  - **per-question targets:** the *same* word count yields a different level for a 2-mark
    vs a 10-mark prompt (different `targetWordCount`), proving it reads the question's own
    target, not a fixed count;
  - all keywords + target length + enough paragraphs → level 5/6;
  - `keywordsTotal === 0` uses the length fallback and still climbs;
  - a run-on (`longestSentenceWords > 45`) lowers structure/variety sub-scores;
  - `getReadinessChroma(level).hex === getBandHex(level)` for 1..6, and neutral for 0
    (locks the "reuse the canonical palette, define no new band hex" rule).
- **`tests/unit/readinessMeter.test.tsx`** (component): renders `{score}%` + label,
  exposes `role="progressbar"` with correct `aria-value*`, shows the neutral state's
  "Start writing" with no band colour class, and applies the `getBandConfig`-derived class
  for a mid-level draft.

### Must stay green (do not modify their subjects)
- `tests/unit/bandColors.test.ts` — palette/helpers untouched.
- `tests/unit/writingAnalysis.test.ts` — `analyzeText` / `buildWritingInsights` unchanged.
- `tests/unit/liveInsightsPanel.test.tsx` — Live Insights unchanged.
- `tests/unit/verbGateBandCap.test.tsx` and `tests/unit/bandLogic.test.ts` — real
  band/Verb-Gate logic never fed or duplicated by this feature.
- `tests/unit/editorToolbarStrategy.test.tsx`, `tests/unit/editorPasteGuard.test.tsx` —
  Editor edits must not regress these.
- Run `npm run test:all` (lint + unit + type-check); respect the coverage floor in
  `vitest.config.ts`.

---

## 6. Out of scope

- **AI-based live prediction** of band/mark while typing (any per-keystroke model call).
- **Rubric-criterion / marking-criteria NLP** — semantic detection of whether the prose
  actually *analyses*, *evaluates*, or satisfies `prompt.markingCriteria`. Readiness only
  measures mechanical completeness.
- **Command-verb intent detection** beyond the mechanical keyword/structure proxies.
- Any change to `getBandForMark`, `getTargetBand`, the Verb Gate, `getBandForColour`, or
  `BAND_METRICS` — real band logic is read-only here and not even consumed by the model.
- Persisting readiness to storage/Supabase, or surfacing it in reports/PDFs.
- Readiness hints under **exam mode** (kept deliberately neutral).
- Haptics / sound / gamified streaks.

---

## 7. Implementation steps

Each step is independently testable; a later step depends only on the modules named.

1. **Pure model + tests.** Create `utils/draftReadiness.ts`
   (`computeDraftReadiness`, `READINESS_LABELS`, `getReadinessChroma`) and
   `tests/unit/draftReadiness.test.ts`. No UI. *No dependencies.* — **do this first.**
2. **Expose readiness from the metrics hook.** In `hooks/useWritingMetrics.ts` call
   `computeDraftReadiness` with the values it already computes and add `readiness` to the
   returned `WritingMetrics`. *Depends on 1.* This is the single feed for all surfaces and
   lets the existing `progressScore`/veil be unified.
3. **Readiness meter component + tests.** Create `components/ReadinessMeter.tsx` and
   `tests/unit/readinessMeter.test.tsx`. *Depends on 1 (types only).* Can be built in
   parallel with 2.
4. **Wire button + meter (Surfaces A & C).** In `components/WorkspaceRightPanel.tsx`
   consume `readiness` from the hook, colour `buttonConfig` via `getReadinessChroma`
   (keeping disabled/evaluating branches), add `aria-label`, and mount `<ReadinessMeter>`
   in `evaluateAction`. Drop the now-redundant local `progressScore`, passing
   `readiness.score/100` where `progress` is handed to `<Editor>`. *Depends on 2 & 3.*
5. **Wire ambient hue (Surface B).** In `components/Editor.tsx` feed readiness into the
   veil/header-bar/caret, add the card glow (in `WorkspaceRightPanel.tsx` wrapper), give
   the header bar `role="progressbar"` + label, and relabel the footer completeness copy.
   Keep the tier-hue header identity and the exam-mode neutral branch. *Depends on 2;
   independent of 4.*

**Ordering constraints:** 1 → (2, 3) → (4, 5). Steps 4 and 5 are independent of each other
once 2 and 3 land. Every step ends with `npm run test:all` green and the pinned suites in
§5 unmodified.
