# Live Draft-Readiness Hint — Verification

Branch: `claude/live-band-hint-styling`
Verifier pass: independent review of the implemented feature against
`projectDocs/live-readiness-hint-plan.md`, the repo house rules, and accessibility.
Date: 2026-08-30. No feature code was changed by this pass.

---

## 1. Verdict

**Sound to merge, with one design-guardrail fix strongly recommended first — not a
correctness blocker.** The feature is honest, well-scoped and cleanly layered: no real
band/verb logic is recomputed or fed by readiness, all colour delegates to the canonical
palette (the only new hex is a documented off-palette slate for level 0), empty drafts and
exam mode stay neutral on every surface, colour never travels without a number/label/aria,
the readiness hue is confined to glow/caret/meter and never sits under body text, and the
score is provably finite 0..100 so the veil width and `aria-valuenow` cannot break. The
full suite is green (2095 tests, plus lint + type-check + eager-read check) and the six new
suites assert real behaviour.

**The one real issue:** the level-3 readiness label is `"Developing"`, which is _identical_
to `BAND_NAMES[3] = "Developing"` (`utils/renderUtils.ts:257`). The plan and code both claim
the labels are "deliberately DISTINCT from `BAND_NAMES` so no surface can ever be read as
naming a band" — this one is not. It is user-visible: the editor footer renders the band
name via `chroma.name` (`Editor.tsx:1052`, `getBandName(targetBand)`) right beside the
appended readiness label, so a Band-3-target question can read `Band 3 Target · Developing ·
Developing`. Because the feature's entire raison d'être is "never read as a band", this
level-3 label should be renamed (e.g. "Coming along" / "Building") before shipping. Everything
else checks out.

CONFIRMED: 9 · COULD NOT CONFIRM: 0 · INCORRECT: 1 (claim 9, the label-distinctness half).

---

## 2. Verification table

| #   | Claim                                                                                                      | Result        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | No real band/verb logic recalculated, bypassed, or fed by readiness; `maxBand` is an input, not recomputed | **CONFIRMED** | `utils/draftReadiness.ts:29-30` imports only `TextAnalysis` + palette helpers (`getBandConfig/getBandHex/getBandHexDark`); `getBandForMark`/`getBandForColour`/Verb Gate appear only in the doc comment (`:16`). `maxBand` is an input used solely for `expectedParagraphs` (`:147`). The one real-band call is the pre-existing `getBandForMark` in `hooks/useWritingMetrics.ts:71-74`, whose result is passed _in_ as `maxBand`.                     |
| 2   | Canonical palette reuse; only new hex is a slate ≠ any band hex; no hard-coded band colour in the surfaces | **CONFIRMED** | `getReadinessChroma` delegates 1..6 to `getBandHex/HexDark/Config` (`draftReadiness.ts:215-220`); level 0 = `#64748b` slate (`:177`), which is none of `BAND_HEX` (`renderUtils.ts:236-243`). Locked by `draftReadiness.test.ts:353-372`. ReadinessMeter/Editor/WorkspaceRightPanel read colour only through `getReadinessChroma` / `chroma.config.*` — no band hex/Tailwind class is inlined for readiness.                                           |
| 3   | Empty / barely-started is neutral, never band-1 red, on every surface                                      | **CONFIRMED** | `resolveLevel` returns 0 when `wordCount===0` OR `score<12` (`draftReadiness.ts:115-116`). Button: `readiness.isNeutral` → `neutralConfig` (`WorkspaceRightPanel.tsx:160`); meter: slate gradient (`ReadinessMeter.tsx:57` via level-0 config); caret & glow: `readinessAccent` is `null` when neutral (`Editor.tsx:328`); footer word gated on `!readiness.isNeutral` (`Editor.tsx:1055`). Header white bar is white-on-tier-hue (not a band colour). |
| 4   | Exam mode shows no readiness anywhere                                                                      | **CONFIRMED** | Button stays neutral (`WorkspaceRightPanel.tsx:160`, `isExamMode` guard); meter not mounted (`:297` `{!isExamMode && …}`); `readinessAccent` null in exam (`Editor.tsx:328`) → no glow/caret tint; footer word gated on `!isExamMode` (`Editor.tsx:1055`); exam header branch has no progressbar (`Editor.tsx:623-629`). Covered by tests `workspaceReadinessButton.test.tsx:126-132`, `editorReadinessHint.test.tsx:76-82`.                           |
| 5   | Colour never travels alone (a11y)                                                                          | **CONFIRMED** | Meter: `role="progressbar"` + `aria-value*` + visible `%`/label (`ReadinessMeter.tsx:44-63`). Button: honest `aria-label` (label+%) only when coloured, else `undefined` → visible "Evaluate" (`WorkspaceRightPanel.tsx:305-309`, colour branch `:159-171`). Header bar: `role="progressbar"` + `aria-label="Draft readiness"` + visible `%` (`Editor.tsx:635-649`).                                                                                   |
| 6   | Readiness colour never under body text                                                                     | **CONFIRMED** | Hue confined to card glow (`Editor.tsx:578`), caret (`:977`), meter fill, and footer chip. Visible text is the overlay using theme tokens `text-[rgb(var(--color-text-primary))] light:text-slate-800` (`Editor.tsx:983`); textarea itself is `text-transparent` (`:970`). Header bg (`chroma.background`) and the radial glow (`:899`) use the tier `chroma.accent`, unchanged by readiness.                                                          |
| 7   | Reduced motion + print                                                                                     | **CONFIRMED** | Meter `print:hidden` (`ReadinessMeter.tsx:36`) and fill `motion-reduce:transition-none` (`:57`); button readiness shadow carries `motion-reduce:transition-none` (`WorkspaceRightPanel.tsx:167`); card glow rides the existing box-shadow transition neutralised by the global rule (`index.css:217`); header bar transition is pre-existing and covered by the same global rule.                                                                      |
| 8   | Tier identity preserved (base hue not morphed by readiness)                                                | **CONFIRMED** | `chroma.background`/`accent` derive from `verbTier` only (`Editor.tsx:295-309`); `readinessAccent` is a separate memo adding only `hex`+`glow` (`:327-331`). Readiness feeds the veil _lift_ (dark overlay opacity) but never the base tier colour.                                                                                                                                                                                                    |
| 9   | British/Australian English; labels DISTINCT from `BAND_NAMES`                                              | **INCORRECT** | Spelling is clean (no Americanisms in new prose/comments; "colour"/"analyse" observed). **But** `READINESS_LABELS[3]="Developing"` (`draftReadiness.ts:86`) equals `BAND_NAMES[3]="Developing"` (`renderUtils.ts:257`) — the distinctness guarantee is violated, and the collision is surfaced in the same footer as `getBandName` (see §3).                                                                                                           |
| 10  | Single source of truth                                                                                     | **CONFIRMED** | `readiness` computed once in `useWritingMetrics.ts:117-141`; WorkspaceRightPanel reads it for button + meter and passes `progress={readiness.score/100}` and `readiness={readiness}` to Editor (`:402-403`). All surfaces read the one object.                                                                                                                                                                                                         |

---

## 3. Problems hunt

**A. Level-3 readiness label collides with a band name — needs a human decision.**
`READINESS_LABELS[3] = "Developing"` is exactly `BAND_NAMES[3]`. This is the only place the
"never read as a band" guardrail actually leaks, and it is visible: `Editor.tsx:1050-1057`
renders `Band {targetBand} Target · {chroma.name}` (where `chroma.name = getBandName(...)`)
immediately followed by `· {readiness.label}`. For a Band-3-target question the footer can
read `Band 3 Target · Developing · Developing`. Recommend renaming the level-3 label to a
completeness word that is not in `BAND_NAMES` (e.g. "Coming along", "Building", "Filling
out"). Low-risk change (one string in `draftReadiness.ts` + the two test assertions at
`draftReadiness.test.ts:160` and the score-44 case). **Recommended before merge**; not a
correctness bug.

**B. Two progressbars both announce "Draft readiness" — minor a11y note.**
The editor header bar has `aria-label="Draft readiness"` (`Editor.tsx:641`) and the meter has
`aria-label="Draft readiness: {label}, {score}%"` (`ReadinessMeter.tsx:50`). A screen-reader
user browsing the region meets two progressbars whose names both begin "Draft readiness" and
which report the same value from different scales (the header rounds `progress*100`; the meter
shows `score`). They are distinguishable by the meter's suffix, so this is not a blocker, but
consider giving the header bar a distinct name (e.g. "Draft fill level") so the two are
unambiguous. For a human to weigh.

**C. Header white bar fills slightly even at neutral — acceptable.**
The header bar's `aria-valuenow`/width track `progress` (= `score/100`), not `level`, so at
level 0 with `score` up to 11 it shows a small white fill and announces e.g. "8". The colour
is white-on-tier-hue (never a band/readiness hue), so it is not a colour leak, and the meter
beside it says "Start writing / 8%" consistently. No change needed; noted for completeness.

**D. NaN / range safety — verified safe.** `computeDraftReadiness` builds `score` from
`clamp01`ed sub-scores × fixed weights, rounded (`draftReadiness.ts:156-157`); the length
denominator is guarded (`targetWordCount>0 ? … : 100`, `:135`) and the hook's `targetCount`
is `Math.max(1, …)` (`useWritingMetrics.ts:80`). `score` is always finite 0..100, so
`readiness.score/100` (veil width) and `aria-valuenow` cannot be NaN/out of range.

**E. Tests are meaningful; no trivial passers.** The six new suites assert real behaviour
— exact threshold boundaries (12/28/44/60/75/89), per-question-target divergence, keyword
fallback, run-on penalty, palette delegation, neutral-not-red, exam-mode suppression on both
surfaces, and the honest button aria-label. Re-ran them: **66 passed**.

**F. Pinned suites' subjects not modified.** `git diff --name-only main...HEAD` touches only
the six feature files (+ plan + 5 new tests). `renderUtils.ts`, `data/commandTerms.ts`,
`utils/writingAnalysis.ts`, `components/LiveInsights.tsx` are untouched — so `bandColors`,
`writingAnalysis`, `liveInsightsPanel`, `verbGateBandCap`, `bandLogic` subjects are unchanged.
`Editor.tsx` (subject of `editorToolbarStrategy`/`editorPasteGuard`) is modified but only
additively (readiness accent, caret tint, footer word, header aria); both suites pass.

---

## 4. Test results

- **Targeted suites** — `npx vitest run tests/unit/draftReadiness.test.ts
readinessMeter.test.tsx writingMetricsReadiness.test.ts workspaceReadinessButton.test.tsx
editorReadinessHint.test.tsx bandColors.test.ts`:
  **6 files / 66 tests passed.**
- **`npm run test:all`** (lint + full vitest + `type-check` + `type-check:tests` +
  `check:eager-reads`):
  **PASS.** ESLint clean; **204 test files / 2095 tests passed**; `tsc --noEmit` clean for
  both app and test configs; no unexplained eager module-init reads.

No commit was made.

---

## 5. Post-verification fix

The one INCORRECT finding (claim 9 — `READINESS_LABELS[3] = "Developing"` colliding
with `BAND_NAMES[3]`, which could render `Band 3 Target · Developing · Developing` in the
editor footer) was fixed on this branch:

- `utils/draftReadiness.ts` — the level-3 readiness label is now **"Coming along"**, which
  is distinct from every `BAND_NAMES` entry and fits the completeness sequence (Just
  beginning → Taking shape → Coming along → Getting there → Nearly ready → Ready to submit).
- `tests/unit/draftReadiness.test.ts` — updated the level-3 assertion and added a guard test
  (`no readiness label collides with a BAND_NAMES entry`) so the "never read as a band"
  invariant is now pinned and cannot silently regress.

The secondary note (two `role="progressbar"` elements both named "Draft readiness" — the
editor header fill bar and the meter) is left as-is and accepted: their accessible names
differ (the meter's is `Draft readiness: <label>, <n>%`), they report the same signal, and
neither renders in exam mode. Not a blocker.
