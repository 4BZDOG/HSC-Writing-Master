# The next set: improvements and bug fixes

Prepared by sweeping the shipped course data and the code that reads it. Every
number below is from a probe that can be re-run; where a count turned out to be
noise rather than a finding, that is said so rather than quietly dropped.

Nothing here is speculative housekeeping. The codebase carries **zero**
TODO/FIXME/HACK markers, and the lint suppressions that exist are legitimate
(`exhaustive-deps` on five effects, `no-explicit-any` on provider payloads), so
the leads came from data and behaviour, not from comments.

## Bugs

### 1. Seventeen questions silently lose "What's Assessed" — HIGH

`ReferenceMaterials.tsx:141`:

```ts
courseOutcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code));
```

`Array.includes` is exact equality. Seventeen Software Engineering prompts store
the outcome as the whole statement rather than the code:

```
"SE-12-04: evaluates practices to safely and securely collect, use and store data"
```

against a course that defines `code: "SE-12-04"`. Nothing matches, and because
the section is gated on `linkedOutcomes.length > 0` the panel does not render
empty — **it vanishes**, with no message. A student on those questions is never
shown the standards they are marked against, and nothing anywhere says so.

| Course               | prompts declaring outcomes | panel vanishes |
| -------------------- | -------------------------- | -------------- |
| HSC Biology          | 19                         | 0              |
| Enterprise Computing | 82                         | 0              |
| Software Engineering | 184                        | **17**         |

Partial resolution is 0, so this is all-or-nothing per prompt.

Worth fixing in two places, not one. The shipped data is repairable, but these
courses arrive by import and by AI generation, so the same malformed shape can
come back tomorrow: normalise `linkedOutcomes` to bare codes in the import
path (`utils/dataManagerUtils.ts`, with a `DATA_VERSION` migration), and repair
the seventeen.

### 2. Two prompts share one id — HIGH

`prompt-1763110000005-eeeee05` appears twice in Software Engineering, under
_Secure software architecture → Designing software_ and again under
_Secure software architecture → Developing secure code_. Same id, and the same
question text ("Explain how a 'race condition' can occur in a web application…"),
4 marks, EXPLAIN both times. It is the only duplicated question text in all
three courses.

A prompt id is the key for React lists, the IndexedDB record, `resetKey` on the
reference accordions, and per-question progress. Two rows sharing one is a
correctness problem regardless of which copy a curator wants to keep — so this
needs a decision about which sub-topic it belongs to, then a delete.

## Improvements

### 3. Six authored fields nobody can read — MEDIUM

These are on `Prompt` in `types.ts`, validated by Zod, merged on import,
round-tripped through Supabase — and rendered nowhere, sent to no model, and
absent from `services/aiSchemas.ts`. They are not AI output; they are authored
content that has no reader.

| Field                    | prompts carrying it (of 419) |
| ------------------------ | ---------------------------- |
| `targetPerformanceBands` | 154 (37%)                    |
| `markerNotes`            | 126 (30%)                    |
| `estimatedTime`          | 126 (30%)                    |
| `commonStudentErrors`    | 119 (28%)                    |
| `prerequisiteKnowledge`  | 15 (4%)                      |
| `relatedTopics`          | 15 (4%)                      |
| `highlightedQuestion`    | 0                            |

`markerNotes` in `components/PdfExportOptions.tsx` is a **different thing** — an
export toggle for the AI's marking notes, not this field. Checked, so the next
reader does not mistake one for the other.

The two with obvious value to a student are `commonStudentErrors` ("what people
get wrong here") and `markerNotes`; `estimatedTime` is the kind of thing the
workspace already has a place for. `highlightedQuestion` is dead in every
shipped course and only appears in `data/seedData.ts` — it predates
`renderFormattedText` deriving the emphasis itself, and should go.

This is a decision about scope, not a defect: surface them or delete them, but
they should not keep costing schema, migration and merge code while nobody
reads them.

### 4. Nothing audits "the verb is absent from its own question" — MEDIUM

The gap that let twelve mis-tagged prompts ship in #205. `extractCommandVerb`
already exists and already agreed with all twelve; the Content Audit simply
never asks the question. A rule there catches the next one at authoring time
rather than at review time.

## Data hygiene

### 5. 70% of sample answers claim a band the Verb Gate does not give them

576 of 823. `RecalibrateSamplesModal` already detects exactly this
(`mismatched: sample.band !== derivedBand`) and offers the fix, and what a
student sees is derived at render — so this is not a hidden defect. The cost is
that a warning shown on 70% of exemplars stops reading as a warning, and
`SampleAnswerRevisionModal` colours its header from the stale value.

A curator pass with the existing tool, rather than new code.

### 6. 188 target bands above their own question's ceiling

`targetPerformanceBands` entries naming a band the question's verb cannot
reach — e.g. band 3 and 4 on an OUTLINE question that caps at 2. Inert today
**because nothing renders the field**, which is finding 3. It stops being inert
the moment finding 3 surfaces it, so the two should be sequenced together.

## Carried over, still open

From `Plan-FrontendDesignReview.md`, re-verified against the current tree:

- **The PDF export is still set in Inter** while the app is IBM Plex Sans
  (`pdf/fontLoader.ts`, `public/fonts/Inter-{Regular,Bold}.ttf`). Swapping the
  TTFs changes line breaks and pagination on every export, so it needs a
  verification pass against the PDF samples.
- **Middle-dot meta strings: 65.** A copywriting decision, not a styling one.
- **`font-bold` 308** (down from 560) **and `rounded-2xl` 154** (from 236).
  Both need per-site reading, not a codemod.
- **The writing surface's 114-character measure** — a live typing surface rather
  than a reading one, so a different question from the report column.
- **The header band-ladder's proportion.** At 40px the report's true ratio is
  about 1.6px tall, so the header rungs are deliberately thicker than the
  ladder really is. My call in #205; the spec's owner may want it different.
- **Consonant doubling that is not an `-l`** ("commit" → "committed", "grep" →
  "grepped") is still uncovered by the keyword matcher. Needs a lexicon rather
  than a wider regex, since a blanket CVC rule derives "codonned" and
  "relationshipped" from two of the commonest nouns in the data.

## Suggested order

1 and 2 first: both are correctness, both are small, and 1 is invisible to the
student it fails. Then 4, because it is the guard that stops 1's cousin
recurring. Then 3 and 6 together, since 6 only matters once 3 lands. 5 is a
curator pass whenever convenient.
