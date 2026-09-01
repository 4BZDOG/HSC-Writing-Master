# PDF Export — Design & Usability Plan

_The marking-feedback report produced by `pdf/` when a student response is
evaluated. Written against three rendered samples (`npm run samples:pdf`).
British/Australian English throughout._

## Context

The exported report has the right content. A teacher gets the question, the
student's own answer, a mark with its band, a commentary, evidence, next steps,
a criterion-by-criterion breakdown, a rewritten answer and a change list — all
of it accurate, all of it selectable vector text with an embedded Inter.

What it does not yet have is a document design. Three problems compound:
pages are between a quarter and seven-eighths empty because the flow abandons
column space; the three things a reader actually opens the file for (the
question, their answer, the better answer) carry the same visual weight as the
smallest aside; and colour is overloaded, with the same green meaning "Band 4",
"strong evidence", "syllabus key term" and "words the rewrite added" on a single
page.

This plan makes the report look like the thing it is: a marked script a student
reads once and works from, and a teacher prints, annotates and hands back.

## How the samples were produced

`npm run samples:pdf -- --png` renders `.pdf-samples/` from three fixtures in
`scripts/pdfSamples/fixtures.ts`, chosen because the exporter behaves
differently at each length:

| Sample | Question                                            | Result      | Pages |
| ------ | --------------------------------------------------- | ----------- | ----- |
| A      | 6-mark EXPLAIN, response + rewrite + marker's notes | 4/6, Band 4 | 2     |
| B      | 2-mark IDENTIFY, no rewrite                         | 1/2, Band 2 | 1     |
| C      | 8-mark EVALUATE, ~300-word essay + rewrite          | 5/8, Band 5 | 3     |

The generator runs the real `exportEvaluationPdf`, embeds the real Inter, and
writes real PDFs — it is not a mock. Keep using it: every design regression this
exporter has had was invisible to the unit tests, which pin what the layout
engine _computes_, never how the page _reads_.

## Findings

### F1 — Half the paper is blank, and the cause is a single missing split

Ink coverage of the body area, measured from 50dpi greyscale renders:

| Sample / page | Left column has ink on | Right column |
| ------------- | ---------------------- | ------------ |
| A p1          | 54% of rows            | 40%          |
| A p2          | 54%                    | 24%          |
| B p1          | 41%                    | **2%**       |
| C p1          | 58%                    | 37%          |
| C p2          | **28%**                | **0%**       |
| C p3          | 52%                    | 37%          |

Sample C page 2 is 86% white. Sample B never uses its right column at all.

The root cause is in `pdf/layout.ts`. `splitOversized` only splits a breakable
block when the block is taller than a **whole column**; neither `flowColumnBand`
nor `flowSpanBand` splits anything at a boundary. So a 70mm breakable paragraph
with 40mm of column left does not fill that 40mm — it moves whole, and the 40mm
is lost. Every ragged column in every sample is this one behaviour.

Two secondary causes stack on top of it:

- The score summary is a single-column block sitting immediately before a
  full-width band, so the column beside it is structurally guaranteed to be
  empty. Visible in all three samples.
- A column band that ends mid-column hands `flowBlocks` a `deepestPerPage`
  that the next full-width band stacks below, abandoning the other column.

### F2 — Sixteen per cent of every page is chrome, repeated verbatim

`headerReserve(1)` is ≈19.8mm and sits under a 10mm margin; the footer takes 8mm
over another 10mm. That is 47.8mm of 297mm before a word of content, on **every**
page — and continuation pages repeat the full brand block (title, subtitle,
instruction line, rule) identically. A running head would give back ~13mm a page.

### F3 — The three heroes are not heroed

The question is 12.5pt, the student response 9.5pt, the improved response 9.5pt.
Each is introduced by the same 8.5pt grey uppercase heading used for "What
changed". The improved response — the highest-value thing in the file, and the
only part that shows a student what a better answer looks like — is
typographically the _least_ prominent block on page 2. Nothing is panelled,
tinted or boxed; the only differentiation is a 0.9mm accent bar.

### F4 — Colour means four different things at once

- `bandColor(4)` in `pdf/buildBlocks.ts` returns emerald `#059669`. The app's
  `BAND_HEX_DARK[4]` is green `#16a34a`. Band 4 is the one band where the PDF
  and the screen disagree.
- That emerald is a shade away from `COLORS.emerald` `#047857`, used for the
  "Strong Evidence" bullets, for the criterion meter's "strong" fill, and for
  the diff's added words. On a Band 4 report, four unrelated meanings share one
  green.
- `bandColor(5)` `#2563eb`, `COLORS.accent` `#4f46e5` and `COLORS.verb`
  `#4338ca` are three near-identical blues meaning band, structure and command
  verb. A Band 5 report is the same collision in blue.
- `buildBlocks.ts` hand-writes the whole band palette, which the project's own
  house rule forbids: band colour comes from `getBandConfig()` / `BAND_HEX*` in
  `utils/renderUtils.ts`, never from literals.

### F5 — Keyword and verb highlighting is applied too widely and too narrowly

`parseInlineSpans` colours the command verb wherever it occurs in the whole
document. In sample A, "explaining", "explain", "explained" and "EXPLAIN" are
indigo in the commentary, the tip, the next steps _and_ the criterion feedback —
places where the word is ordinary English, not the question's command term.
Sample B colours "purpose", "purposes" and "identifies" in nearly every
sentence. Measured 7–11% of body words carry colour, and they cluster.

At the same time criterion **titles** are drawn from `block.label` as plain
text and get no highlighting at all, so the same syllabus term is emerald in a
criterion's feedback and black in the heading directly above it.

### F6 — "What changed" is the weakest section and the most expensive

It takes ~55% of page 2 in sample A and ~45% of page 3 in sample C. Three
separate problems:

- **The rows are unreadable.** They are word-run fragments that ignore sentence
  boundaries: `− this response I will evaluate how well current practices` /
  `+ data management, but`. A student cannot act on that.
- **A real bug.** The `−`/`+` marker is part of the run's _text_, so only the
  first wrapped line carries it. A change whose added text spans a paragraph
  break prints its continuation as an unmarked bold green line that reads as a
  heading — reproduced in sample A ("Visual encoding") and sample C ("On
  informed consent, the"). It also defeats the greyscale fallback the marker
  exists to provide.
- **The statistic discourages.** "23% of your own writing kept" (A) and "21%"
  (C) are what `summariseDiff` reports for a rewrite one band up. It is
  accurate, demoralising, and contradicts the promise the app makes on screen.

### F7 — Smaller things worth fixing in passing

- The default title is `Band 6 — HSC Writing Coach`, so a Band 2 report opens
  with "Band 6" as the largest text on the page.
- The header's instruction line repeats verb / marks / band, which the meta line
  under "Question" and the score box each state again.
- The 46° watermark sits behind the student response and the improved response
  on every page at 0.06 opacity — legible enough to interfere, and redundant
  beside the footer's disclaimer and export ID.
- Marker's notes land in whatever column is left over: in sample A that is five
  short half-width rules in the right column. Not room to write a sentence.
- `BAND_NAMES` ("Sound", "Excellent") is used on screen and nowhere in the PDF,
  so the report says "Band 4" and leaves the reader to know the scale.
- No document outline, so a three-page report has no bookmarks.

## Design direction

One rule underneath all of it: **each colour means exactly one thing per
report.**

| Colour                             | Means               | Where it may appear                                                |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Band accent (from `BAND_HEX_DARK`) | attainment          | result strip, band ladder, improved-response panel, diff additions |
| Emerald `#065f46`                  | a syllabus key term | inline in the question, the response, the rewrite                  |
| Rose `#be123c`                     | something to fix    | next-step ticks, diff deletions                                    |
| Slate / neutral                    | structure           | rules, panels, bullets, headings, meters                           |

"Strong Evidence" loses its emerald and takes ink headings with neutral bullets;
the criterion meters go neutral-to-band rather than emerald/indigo/rose. That
removes every collision in F4 without adding a colour.

Page architecture, in order:

1. **Question card** — full width, faint band tint, rounded. Eyebrow row carries
   the verb chip, the mark total and the syllabus trail; the question sits at
   15pt, the largest body text in the document.
2. **Result strip** — full width, three cells: the mark at 30pt, then
   `BAND 4 · SOUND` over the ladder, then the metrics. Full width kills the
   guaranteed-empty column of F1.
3. **Your response** — full-width tinted panel, headed with its own word count.
4. **Analysis** — the existing two-column band: tip, commentary, evidence, next
   steps, criteria.
5. **Improved response** — full-width panel styled as the twin of "Your
   response", with a band-coloured header bar carrying the target mark and band
   name, so the two invite comparison.
6. **What changed** — two columns, capped at a third of a page.
7. **Marker's notes** — full width, always last, never less than 55mm of rules.

Typography gains a real scale. Today three sizes carry meaning; the report needs
six, so a reader can rank what they are looking at without reading it.

## Steps

| Step | Summary                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 1    | Split breakable blocks at the column boundary in `flowBlocks`, with widow/orphan minimums — fixes F1     |
| 2    | Make the score summary a full-width result strip: mark, band name, ladder, metrics                       |
| 3    | Running head on pages 2+; page-1 header keeps the full block — fixes F2                                  |
| 4    | Single band palette read from `utils/renderUtils.ts`; retire the literals in `buildBlocks.ts` — fixes F4 |
| 5    | Apply the one-meaning-per-colour table; re-tone meters, strengths, diff rows                             |
| 6    | Panel + type scale for the question, the response and the rewrite — fixes F3                             |
| 7    | Scope keyword/verb highlighting; route criterion titles through `richRun` — fixes F5                     |
| 8    | Rebuild "What changed": sentence-level pairs, gutter markers, honest stat — fixes F6                     |
| 9    | Marker's notes full width with a floor height; drop or gate the watermark                                |
| 10   | Title, band name, document outline, metadata tidy — fixes F7                                             |
| 11   | Changelog entry                                                                                          |

### Step 1 — split at the column boundary

`pdf/layout.ts`. Today `splitOversized` runs once, before the flow, and only
splits blocks taller than a whole column. Move the capability into the flow:
when a `breakable` block does not fit the remaining space, split it there and
carry the remainder to the next column.

Reuse `splitParagraph` / `splitCriterion` — they already slice `wrapped`,
`wrappedRich`, padding and heights consistently, which is the part that must not
be re-derived. `splitOversized` stays for the pre-pass; the flow calls the same
two helpers with `remaining` instead of `columnHeight`.

Guard rails, or the fix trades whitespace for worse typography:

- Never leave fewer than **3 lines** at the foot of a column or carry fewer than
  **2 lines** to the top of the next.
- If the split cannot satisfy both, move the block whole, as now.
- A heading still moves with the block beneath it (`requiredHeight` is unchanged).
- `splitCriterion` must keep the chip and the meter with the first fragment.

Extend `tests/unit/pdfLayout.test.ts`: a breakable paragraph that half-fits gets
split; one that would orphan a line does not; total measured height is
conserved across the split; and the existing whole-document flow assertions
still hold.

### Step 2 — the result strip

`pdf/buildBlocks.ts` marks the `scoreSummary` block `fullWidth: true`;
`drawScoreSummary` in `pdf/exportEvaluation.ts` lays it out as three cells
rather than a label/chip pair, and reads its width from `fullContentWidth(geo)`
like the other spanning blocks. `SCORE_SUMMARY` in `pdf/types.ts` gains the cell
proportions so the measurer and the drawer cannot disagree.

Add the band name from `getBandName()`. `bandScaleMax` behaviour is unchanged.

### Step 3 — running head

`headerReserve(pScale)` becomes `headerReserve(pScale, isFirstPage)`; the
continuation form is a single 7.5pt line plus a rule (~7mm). `computeGeometry`
already takes `headerHeight`, but it is computed once per document, so this step
also means geometry is resolved per page — the smallest change is to reserve the
first-page height globally and let continuation pages start higher via a
`contentTopFor(page)` helper on `ColumnGeometry`.

Note for whoever runs it: this changes column height per page, which the flow
assumes is constant. Either accept the simpler version (keep the reserve
constant, draw only a compact head on later pages, and gain the visual quiet
without the 13mm) or do the geometry properly — decide before starting, and say
which in the commit.

### Step 4 — one band palette

Delete the literal map in `bandColor` and read `BAND_HEX_DARK` from
`utils/renderUtils.ts`, converting hex to the RGB triple the exporter uses. Band
4 changes from emerald to green as a result — that is the point. Add a unit test
asserting every band in the PDF matches `BAND_HEX_DARK`, so the two cannot drift
again.

### Step 7 — highlighting scope

`pdf/inline.ts` keeps its matcher (sharing the app's `createKeywordRegex` is
right and must stay). What changes is where `buildBlocks` asks for highlighting:

- Verb colour: the question block only.
- Keyword colour: question, student response, improved response — the three
  places where "did I use the term?" is the reader's actual question. The
  commentary and criteria carry the marker's own `**bold**` and should not
  compete with it.
- Criterion titles move from `label` to a `richRun`, so a term is not emerald in
  the feedback and black in the title above it.

### Step 8 — "What changed"

Three changes, in `utils/textDiff.ts` and `pdf/buildBlocks.ts`:

- Add `sentenceChanges(original, revised)` beside `groupedChanges`. Pair the
  original sentence with its rewrite, so a row is a before/after a student can
  read. Cap at 5 pairs and say how many were left out.
- Draw `−` / `+` as a gutter glyph in `drawBlock`'s list-item branch, the way
  `checkbox` already draws its box, instead of prefixing the run text. That
  fixes the unmarked continuation line and keeps the greyscale fallback the
  marker exists for. Collapse newlines inside a change to a space.
- Replace the retention percentage with a count of rewritten sentences.
  `summariseDiff` keeps `retention` — the on-screen comparison uses it — but the
  PDF stops printing a number that reads as a rebuke.

## Verification

```bash
npm run samples:pdf -- --png     # render, then look at .pdf-samples/*.png
npm run test:all                 # lint + unit + type-check
```

Each step is done when, on all three samples:

- No page's body area is less than half inked, and no column is empty while a
  later page carries content. (The 50dpi ink measurement above is the check;
  re-run it rather than eyeballing.)
- Every colour on the page maps to exactly one row of the meaning table.
- The question, the response and the rewrite are the three largest, most
  strongly framed elements.
- The greyscale render (`pdftoppm -gray`) still distinguishes additions from
  deletions and reached bands from unreached ones.
- Page count does not grow: A stays at 2, B at 1, C at 3 or fewer.
