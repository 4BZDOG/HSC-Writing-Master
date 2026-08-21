# Plan — Formula & Scientific/Humanities Notation Rendering

Status: draft for implementation. Single workstream, but touches shared
render infrastructure used by every screen in the app — read the whole
"Architecture decision" section before editing anything.

---

## Architecture decision (why, not just what)

**The PDF export pipeline already solved half of this problem, and the
screen renderer never caught up.**

`pdf/text.ts`'s `toText()` (used by every PDF export via `pdf/inline.ts`)
already implements a LaTeX-ish shorthand: `\frac{a}{b}`, `\sqrt{x}`,
`^{...}`/`^token`, `_{...}`/`_digits`, and a symbol table of ~30 backslash
tokens (`\times`, `\pm`, `\le`, `\to`, `\alpha`...`\Omega`, `\sum`, `\sqrt`)
that convert to Unicode. Its own file header literally documents this:
`toText(): app markup (**bold**, ^sup, _sub, \frac, LaTeX-ish symbols) ->
selectable Unicode`. This was built for the printed report, confirmed
working, and already has a passing test suite (`tests/unit/pdfText.test.ts`).

`utils/renderUtils.ts`'s `renderFormattedText()` — the function used by
**every** question, scenario, rubric, feedback, and sample-answer render
site on screen — only has bare, brace-less `^word`/`_word` regexes and no
`\frac`/`\sqrt`/symbol-token support at all. Result: a teacher who types
`\pi r^2` or `\frac{PV}{nR}` sees it print beautifully but display as raw
backslash text on screen — a worse bug than "no formula support", because
it's a visible disagreement between two things a teacher already trusts.

**Decision: extract the shared, DOM-free conversion logic into one pure
module (`utils/mathNotation.ts`) that both `pdf/text.ts` and
`utils/renderUtils.ts` import.** This is the same principle already stated
elsewhere in this codebase for the keyword matcher ("two matchers would
drift... a term highlighted on screen but black on the printout is a
disagreement a student notices and a teacher cannot explain" —
`pdf/inline.ts` header comment) — apply it here too.

Two things get genuinely new, better treatment on screen (not just parity
with PDF, because screen has real DOM/CSS that PDF's flat Unicode text
cannot match):
- **Fractions**: PDF is forced to flatten `\frac{a}{b}` to the string
  `"a/b"` (no stacked-fraction glyph exists in plain Unicode). On screen we
  render a real stacked fraction (numerator / rule / denominator) using
  plain Tailwind, matching this app's "beautifully display" requirement far
  better than inline "a/b" text would.
- **Vectors**: new `\vec{v}` support (physics velocity/force/field
  notation) via a Unicode combining arrow, not present in either pipeline
  today.

**No storage/schema/Zod/DATA_VERSION change is needed.** Confirmed:
`Prompt.question`, `Prompt.scenario`, `Prompt.markingCriteria`, and
`SampleAnswer.answer` (`types.ts:80`) are already plain `z.string()` fields
(`utils/dataManagerUtils.ts:520,533,549`). This feature is additive *syntax*
inside content that was always free-form text — unlike the scenario-image
feature on this branch, there is no new field shape to migrate.

---

## New shared module: `utils/mathNotation.ts`

Pure functions, no DOM, no React — mirrors the existing "no DOM, safe to
unit-test under Node" convention already stated at the top of `pdf/text.ts`.
Ported from `pdf/text.ts` lines 13-142 with additions:

```ts
// utils/mathNotation.ts

/** Backslash-token -> Unicode. Ported from pdf/text.ts's SYMBOLS, plus new
 *  entries for chemistry equilibrium arrows, physics/economics operators,
 *  and extension-maths set notation (see task list item 2 for the full
 *  rationale per addition). */
export const MATH_SYMBOLS: Record<string, string> = {
  // ...existing 30 entries verbatim from pdf/text.ts SYMBOLS (lines 54-94)...
  '\\rightleftharpoons': '⇌', // chemical equilibrium
  '\\leftrightarrow': '↔',    // resonance structures
  '\\propto': '∝',            // physics/economics proportionality
  '\\perp': '⊥',              // geometry/physics perpendicular
  '\\parallel': '∥',
  '\\angle': '∠',             // geometry / geography bearings
  '\\partial': '∂',           // physics/economics partial derivatives
  '\\int': '∫',                // extension maths
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\cup': '∪',
  '\\cap': '∩',
};

/** Unicode superscript/subscript glyph tables — ported verbatim from
 *  pdf/text.ts's SUPERSCRIPTS/SUBSCRIPTS (needed there for degradeToAscii's
 *  invert() and for plain-text flattening in cleanMarkdown, below). */
export const SUPERSCRIPT_UNICODE: Record<string, string> = { /* ... */ };
export const SUBSCRIPT_UNICODE: Record<string, string> = { /* ... */ };

const mapEach = (token: string, table: Record<string, string>): string =>
  Array.from(token).map((ch) => table[ch] ?? ch).join('');

/** \sqrt{x} -> √x ; \sqrt x -> √x. Ported verbatim from pdf/text.ts:114-116. */
export const expandSqrt = (text: string): string => { /* ... */ };

/** \frac{a}{b} -> a/b (also \frac12 -> 1/2). PDF-only concern (no stacked
 *  fraction possible in flat text) — the screen renderer deliberately does
 *  NOT call this; it renders \frac{}{} structurally instead (see
 *  renderUtils.ts). Also used by cleanMarkdown for the same reason (plain
 *  text has the same flattening constraint as PDF). Ported verbatim from
 *  pdf/text.ts:111-112. */
export const expandFracToSlash = (text: string): string => { /* ... */ };

/** \vec{v} -> v followed by a combining arrow-above (U+20D7), e.g. "v⃗".
 *  NEW — physics vector notation, absent from both pipelines today. */
export const expandVector = (text: string): string =>
  text.replace(/\\vec\{([^{}]*)\}/g, (_m, inner: string) => `${inner}⃗`);

/** Longest-token-first symbol replace, so \le doesn't get eaten mid-\leq.
 *  Ported verbatim from pdf/text.ts:118-123. */
export const expandMathSymbolTokens = (text: string): string => { /* ... */ };

/** ^{...} / ^token -> Unicode superscript glyphs (mappable chars only —
 *  keeps the carat form otherwise, e.g. `x^abc` stays `x^abc`, pinned by
 *  the existing pdfText.test.ts case). Ported verbatim from
 *  pdf/text.ts:129-135. */
export const expandSuperscriptsToUnicode = (text: string): string => { /* ... */ };

/** _{...} / _digits -> Unicode subscript glyphs. Ported verbatim from
 *  pdf/text.ts:137-139. */
export const expandSubscriptsToUnicode = (text: string): string => { /* ... */ };
```

---

## `pdf/text.ts` changes — de-duplicate, preserve exact behaviour

`toText()` keeps its **exact existing step order** (frac → sqrt → symbols →
emphasis-strip → superscripts → subscripts) — only the *source* of each
step's logic moves to the shared module; add `expandVector` as a new step
between sqrt and symbols:

```ts
import {
  MATH_SYMBOLS,
  SUPERSCRIPT_UNICODE,
  SUBSCRIPT_UNICODE,
  expandFracToSlash,
  expandSqrt,
  expandVector,
  expandMathSymbolTokens,
  expandSuperscriptsToUnicode,
  expandSubscriptsToUnicode,
} from '../utils/mathNotation';

export const toText = (input: string): string => {
  if (!input) return '';
  let s = input;
  s = expandFracToSlash(s);
  s = expandSqrt(s);
  s = expandVector(s);            // new step
  s = expandMathSymbolTokens(s);

  // Strip markdown emphasis markers but keep the inner text (unchanged,
  // stays local — this is PDF-specific plain-text flattening).
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(?<![A-Za-z0-9])(\*|_)(?=\S)([^*_]+?)(?<=\S)\1(?![A-Za-z0-9])/g, '$2');

  s = expandSuperscriptsToUnicode(s);
  s = expandSubscriptsToUnicode(s);
  return s;
};
```

Delete the now-duplicated `SYMBOLS`, `SUPERSCRIPTS`, `SUBSCRIPTS` local
consts and the inline `\frac`/`\sqrt`/symbol-loop/sup/sub replace lines —
`degradeToAscii`'s `invert(SUPERSCRIPTS)`/`invert(SUBSCRIPTS)` calls now use
the imported `SUPERSCRIPT_UNICODE`/`SUBSCRIPT_UNICODE`.

**Must keep `tests/unit/pdfText.test.ts` passing unmodified** — it is the
behavioural contract for this refactor (e.g. `toText('x^abc')` must stay
`'x^abc'`, not become garbled). This is a pure move, not a logic change; if
any test fails, the port introduced a behavioural drift and must be fixed,
not the test.

---

## `utils/renderUtils.ts` changes — teach the screen renderer the same syntax

### 1. Pre-pass in `renderFormattedText` (screen display)

At the top of `renderFormattedText`, before line-splitting, expand
`\sqrt`, `\vec`, and symbol tokens — but **not** `\frac` (handled
structurally below) and **not** sup/sub (kept as literal `^`/`_` for the
existing/extended `<sup>`/`<sub>` DOM step, which has better fidelity than
PDF's Unicode-table approach since it can wrap arbitrary content):

```ts
import { expandSqrt, expandVector, expandMathSymbolTokens } from './mathNotation';

export const renderFormattedText = (
  text: string,
  keywords?: string[],
  commandVerb?: PromptVerb
): React.ReactNode => {
  if (!text) return text;
  const expanded = expandMathSymbolTokens(expandVector(expandSqrt(text)));
  // ...use `expanded` in place of `text` for the rest of the function
  // (line-splitting, table parsing, etc. — unchanged otherwise).
};
```

### 2. Widen superscript/subscript regex to accept brace groups

Current regexes only match bare alnum/hyphen (`^2`, `_2`) — no support for
`Ca^{2+}` (ion charges) or `log_{10}` (log bases), both common in HSC
Chemistry/Physics/Extension Maths:

```ts
const REGEX_SUPERSCRIPT = new RegExp('(\\^\\{[^{}]*\\}|\\^[a-zA-Z0-9+\\-()]+)', 'g');
const REGEX_SUBSCRIPT = new RegExp('(_\\{[^{}]*\\}|_[a-zA-Z0-9+\\-()]+)', 'g');
```

In the two split-handling blocks (currently `part.slice(1)`), branch on
whether the match is brace-form or bare-form:

```ts
const inner = part.startsWith('^{') || part.startsWith('_{')
  ? part.slice(2, -1)
  : part.slice(1);
```

Note: on screen, unlike PDF, letters inside a subscript/superscript are
fully supported (real `<sub>`/`<sup>` tags, not a restricted Unicode glyph
table) — `V_max`, `k_B`, `x_i` all "just work" without needing the brace
form; braces are only required when the content includes `+`/`-` combined
with other chars beyond the widened bare-form class, or spaces.

### 3. New structural fraction step in `processInlineFormatting`

Add as a new leading check (step "0", before Bold), so `\frac{a}{b}`
anywhere in prose, inside a table cell, or inside a heading renders as a
real stacked fraction rather than literal backslash text:

```ts
const REGEX_FRACTION = new RegExp('(\\\\frac\\{[^{}]*\\}\\{[^{}]*\\})', 'g');

// inside processRecursively, before the Bold check:
if (segment.match(REGEX_FRACTION)) {
  const parts = segment.split(REGEX_FRACTION);
  if (parts.length > 1) {
    return parts
      .map((part, i) => {
        const m = part.match(/^\\frac\{([^{}]*)\}\{([^{}]*)\}$/);
        if (m) {
          const [, num, den] = m;
          return React.createElement(
            'span',
            {
              key: `f${path}.${i}`,
              className:
                'inline-flex flex-col items-center align-middle mx-0.5 text-center leading-none',
            },
            React.createElement(
              'span',
              { className: 'px-0.5 text-[0.78em] border-b border-current' },
              processRecursively(num, `${path}.${i}.n`)
            ),
            React.createElement(
              'span',
              { className: 'px-0.5 text-[0.78em]' },
              processRecursively(den, `${path}.${i}.d`)
            )
          );
        }
        return processRecursively(part, `${path}.${i}`);
      })
      .flat();
  }
}
```

Numerator/denominator are recursed through `processRecursively`, so nested
symbols (`\frac{Δv}{Δt}` — already expanded to `Δ` by the pre-pass),
keywords, or a nested superscript inside a fraction all still resolve.

### 4. `cleanMarkdown` — plain-text paths ("Use this answer" / clipboard copy)

`cleanMarkdown` (used by `SampleAnswersAccordion.tsx` for "Use Sample" /
"Copy" and `ImprovementReviewModal.tsx`) currently leaves LaTeX-ish syntax
untouched, so copying a Band-6 chemistry sample answer into the student's
own editable answer would paste raw `\frac{...}`/`\pi`/`^2` text. Add the
full plain-text flatten (order matches `pdf/text.ts`'s `toText`, since both
have the same "flat string" constraint):

```ts
import {
  expandFracToSlash,
  expandSqrt,
  expandVector,
  expandMathSymbolTokens,
  expandSuperscriptsToUnicode,
  expandSubscriptsToUnicode,
} from './mathNotation';

export const cleanMarkdown = (text: string): string => {
  if (!text) return '';
  let cleaned = text;
  // ...existing bold/italic/header/code-marker stripping (unchanged)...
  cleaned = expandFracToSlash(cleaned);
  cleaned = expandSqrt(cleaned);
  cleaned = expandVector(cleaned);
  cleaned = expandMathSymbolTokens(cleaned);
  cleaned = expandSuperscriptsToUnicode(cleaned);
  cleaned = expandSubscriptsToUnicode(cleaned);
  return cleaned;
};
```

### 5. Deliberately out of scope: `renderEditorHighlights` (the live-typing overlay)

**Do not** apply any of the above to `renderEditorHighlights` (`Editor.tsx`
line 224). That function paints a coloured overlay `<div>` stacked
pixel-perfectly over a transparent `<textarea>` — the file's own existing
comments are explicit that this must stay "layout-neutral" (no
padding/margin/font-weight changes) or the overlay drifts out of alignment.
Any character-count-changing substitution (`\pi` → `π` is 3 chars → 1) would
break that alignment far worse than a class change would. Students typing
`\pi r^2` during a timed answer will see the literal characters while
typing; the beautified version appears once the answer is displayed
elsewhere (`EvaluationDisplay.tsx`'s `renderFormattedText(userAnswer, ...)`
call, line 725) after submission. This is a deliberate, documented
trade-off — flag to a human if live-typing preview turns out to matter.

---

## Error handling — degrades gracefully by construction

No parser, no `JSON.parse`, no `eval` — every step above is a bounded
regex substitution or split. Malformed input (unterminated brace, unknown
backslash token, e.g. `x^{unterminated` or `\framble{x}`) simply fails to
match and passes through as literal text — it cannot throw. This matches
the house "never let malformed input take down a render" convention
(`apiGuard`/`safeJsonParse`) without needing an explicit try/catch, because
the failure mode is structurally "no match, show raw text" rather than an
exception. No new defensive wrapper is required, but note in code review
that this guarantee is what makes it safe, so a future edit doesn't
introduce a genuinely-throwing step (e.g. a real LaTeX parser) without
re-adding one.

---

## Admin/teacher authoring UX — `components/MathSymbolToolbar.tsx` (new)

Lightweight insert-symbol helper — **not** a WYSIWYG editor. A teacher who
doesn't know the `\alpha`/`\frac{}{}` shorthand can still get symbols by
clicking a button; a teacher who does know it can just type it (the render
pipeline above already supports it with no UI needed).

```tsx
// components/MathSymbolToolbar.tsx
interface MathSymbolToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}
```

Behaviour:
- A horizontally-scrollable row of small pill buttons (house style:
  `hover:scale-105 active:scale-95 transition-transform`,
  `text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))] px-2 py-1`)
  for direct-insert literal symbols: `π × ÷ ± ≤ ≥ ≠ ≈ → ⇌ ° √ Δ Ω μ ∑ ∫ ∠`.
  Clicking splices the literal Unicode character at
  `textareaRef.current.selectionStart`/`selectionEnd`, calls `onChange`,
  and restores focus/cursor position after the inserted character.
- Four "wrap" buttons — `x²` (superscript), `x₂` (subscript), `a⁄b`
  (fraction), `v⃗` (vector) — wrap the current selection (or insert an empty
  placeholder and position the cursor inside it, if nothing is selected)
  with `^{ }`, `_{ }`, `\frac{ }{ }`, `\vec{ }` respectively.
- Pure textarea DOM manipulation, no new dependency — matches the existing
  paste-handling pattern already in `components/ScenarioImageUploader.tsx`.

### Wiring — one instance per curator-facing textarea

- `components/PromptDisplay.tsx`: above the question-edit `<textarea>`
  (line ~672) and above the scenario-edit `<textarea>` (line ~795).
- `components/MarkingCriteriaAccordion.tsx`: above the criteria-edit
  `<textarea>` (line ~304).
- `components/ManualPromptModal.tsx`: above each of the three
  preview-step textareas — `manual-preview-question` (line ~801),
  `manual-preview-scenario` (line ~848), `manual-preview-criteria`
  (line ~868).

### Explicitly out of scope for this pass

`hooks/`-level wiring into `Editor.tsx` (the student's live answer
textarea) — students in Physics/Chemistry/Economics would plausibly also
want this toolbar, but it's a distinct surface (exam-mode constraints,
different keyboard/timing UX) and the requirement's emphasis is on
authored content (questions/rubrics/samples), not live student input.
Note this explicitly, as a candidate follow-up, so it isn't silently
assumed covered.

---

## Humanities coverage — confirm what's genuinely new vs already covered

Per the requirement's own framing ("elegantly incorporate the broad
spectrum... humanities like economics and geography"):
- **Diagrams/graphs (economics supply-demand curves, geography maps)**:
  already covered by the scenario image carousel shipped earlier on this
  branch (`components/ScenarioCarousel.tsx`, `scenarioImage` field) — no
  duplication here.
- **Tables (geography data, economics comparison tables)**: already
  supported — `utils/renderUtils.ts` has a working markdown pipe-table
  parser (`parseTable`/`renderTable`, lines 714-881) reachable from
  `renderFormattedText` today. No new work needed.
- **Degree/percentage/bearing symbols (geography), Greek letters
  (economics elasticity notation), ∂ (marginal analysis), ∝
  (proportionality)**: covered by the `MATH_SYMBOLS` table additions above
  (`\deg` already existed; `\partial`, `\propto`, `\angle` are new).
- Genuinely new work for humanities is therefore just the symbol-table
  additions — no new component.

---

## Task list

1. New file `utils/mathNotation.ts`: port `MATH_SYMBOLS` (+ new entries),
   `SUPERSCRIPT_UNICODE`, `SUBSCRIPT_UNICODE`, `expandSqrt`,
   `expandFracToSlash`, `expandMathSymbolTokens`,
   `expandSuperscriptsToUnicode`, `expandSubscriptsToUnicode` verbatim from
   `pdf/text.ts`; add new `expandVector`.
2. Edit `pdf/text.ts`: import from `utils/mathNotation.ts`, delete the
   duplicated local tables/logic, keep `toText()`'s exact step order (add
   `expandVector` as a new step between sqrt and symbols). Re-run
   `npm test -- tests/unit/pdfText.test.ts` — must pass unmodified.
3. Edit `utils/renderUtils.ts`:
   a. Add the pre-pass (`expandSqrt`/`expandVector`/`expandMathSymbolTokens`)
      to the top of `renderFormattedText`.
   b. Widen `REGEX_SUPERSCRIPT`/`REGEX_SUBSCRIPT` to accept `{...}` groups;
      update the two split-handling blocks to strip brace vs bare markers.
   c. Add the new Fraction step (step 0) to `processInlineFormatting`.
   d. Extend `cleanMarkdown` with the full plain-text flatten (frac, sqrt,
      vector, symbols, sup/sub-to-unicode).
4. New file `components/MathSymbolToolbar.tsx`: insert/wrap toolbar per the
   spec above.
5. Wire `MathSymbolToolbar` into the 5 curator textareas listed above:
   `components/PromptDisplay.tsx` (x2), `components/
   MarkingCriteriaAccordion.tsx` (x1), `components/ManualPromptModal.tsx`
   (x3).
6. Manually sanity-check in the dev server: create/edit a question with
   `\pi r^2`, `\frac{PV}{nR}`, `H_2O \rightleftharpoons H^+ + OH^-`,
   `\vec{F} = m\vec{a}`; confirm it displays correctly in
   `PromptDisplay.tsx`, in `EvaluationDisplay.tsx`'s feedback panels, and
   exports correctly via the PDF report (confirm screen and PDF now agree,
   closing the original drift).
7. Confirm `npm run test:all` passes with no regressions to existing
   keyword-highlighting behaviour (the widened subscript character class is
   the one place existing matches could theoretically shift — see note in
   step 3b of the renderUtils section).

---

## Tests to run

- `npm test -- tests/unit/pdfText.test.ts` — must keep passing unmodified
  (behavioural contract for the `pdf/text.ts` refactor).
- `npm test -- tests/unit/renderUtils.test.tsx` — must keep passing
  unmodified (existing keyword/verb highlighting behaviour must not
  regress from the widened sup/sub regex or the new pre-pass).
- `npm test -- tests/unit/markdownTables.test.tsx` — must keep passing
  (table parsing must be unaffected by the pre-pass running before
  line-splitting).
- New unit test recommended: `tests/unit/mathNotation.test.ts` — port the
  relevant cases from `pdfText.test.ts` (frac, sqrt, symbol tokens, sup/sub
  mappable-vs-not) as direct tests of the extracted pure functions, plus
  new cases for `expandVector` and the new `MATH_SYMBOLS` entries
  (`\rightleftharpoons`, `\partial`, `\propto`, etc.).
- New unit test recommended: extend `tests/unit/renderUtils.test.tsx` with
  cases for: `\pi r^2` rendering a real `<sup>`, `\frac{a}{b}` rendering
  the stacked-fraction structure (two nested `<span>`s), `Ca^{2+}`
  rendering via the brace form, and `\rightleftharpoons` rendering as `⇌`
  inline text.
- New unit test recommended: `tests/unit/mathSymbolToolbar.test.tsx` —
  render the toolbar, click a symbol button, assert `onChange` is called
  with the symbol spliced at the cursor position; click a wrap button with
  a selection, assert the selection is wrapped correctly.
- `npm run type-check`.
- `npm run test:all` before considering the change done.

---

## Summary of files touched

**New:** `utils/mathNotation.ts`, `components/MathSymbolToolbar.tsx`,
`tests/unit/mathNotation.test.ts` (recommended),
`tests/unit/mathSymbolToolbar.test.tsx` (recommended).

**Edited:** `pdf/text.ts`, `utils/renderUtils.ts`,
`components/PromptDisplay.tsx`, `components/MarkingCriteriaAccordion.tsx`,
`components/ManualPromptModal.tsx`, `tests/unit/renderUtils.test.tsx`
(extended, not replaced).

**Explicitly not touched:** `types.ts`, `utils/dataManagerUtils.ts`,
`utils/storageUtils.ts` (no schema/storage/DATA_VERSION change — confirmed
additive syntax inside existing string fields), `hooks/Editor.tsx`'s
`renderEditorHighlights` call site (live-typing overlay stays raw-text by
design), `supabase/schema.sql` (no new columns needed).
