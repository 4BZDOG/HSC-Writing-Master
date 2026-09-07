# The next set, second pass

Prepared after #205 and #206. The approach that worked last time — sweep the
data and the code that reads it, then read what the count actually points at —
is repeated here, including where it embarrassed me.

**Four sweeps came back clean, and that is worth recording so nobody re-runs
them.** Zero TODO/FIXME/HACK markers. No empty `catch` blocks anywhere in
`components`, `services`, `hooks`, `utils` or `api`. An accessibility pass over
five screens — login, the agreement gate, the quick-start guide, the syllabus
navigator and the workspace — found no control without an accessible name, no
unlabelled field, no `img` without `alt`, no duplicate DOM id and no missing
`lang`. Quota enforcement is wired (`api/gemini.ts:191`).

So this set is mostly **content**, not code. That is the honest state of the
repository.

## The count that was wrong, and why it is written down

The first measurement said **64% of marking guides are not a descending
ladder**. That number is wrong, and the mistake is the same shape as the one
this project has made before: it was measured on the raw JSON, and the app
never sees the raw JSON. `formatMarkingCriteria` runs as a Zod transform on
every import and repairs mangled line breaks — the shipped files contain

```
-
2
marks: Constructs a clear, testable hypothesis…
```

which the transform rejoins into `- 2 marks: …`. Measured on what the app
actually stores, the figure is **31%**, and half the apparent problem was a
function doing its job.

## Content

### 1. 110 questions have a marking guide with no mark ladder — MEDIUM

26% of the 418. Not mangled formatting — genuinely prose:

> For full marks, the response must: - Clearly state that sex-linked
> inheritance involves genes on sex chromosomes…

`MarkingCriteriaAccordion` exists to render the descending HSC ladder, one row
per mark value, worst to best. A paragraph in that panel is not the thing the
panel is for, and a student comparing their answer against it cannot see what
separates 4 marks from 5.

The Content Audit already has a `reviseRubrics` bulk action for exactly this.
This is a curator pass with an existing tool, not new code.

### 2. 18 questions have the ladder upside down — LOW

4%, worst-first (`1 mark: … 2 marks: …`). Same tool, same pass, and the audit
already flags them under "Non-Std Rubric" — they are simply mixed in with the
110 above, which is why splitting the count mattered.

### 3. 134 questions declare no syllabus outcome — MEDIUM

32%. Distinct from the bug fixed in #206: those seventeen had links that failed
to resolve, and now none do. These have no links at all, so the
"What's Assessed" panel is correctly absent — there is nothing to show. The
audit's `linkOutcomes` bulk action fills them.

### 4. The two unreferenced course copies — DECISION NEEDED

Measured rather than assumed, and they need opposite answers.

`HSCEnterpriseComputing09122025.json` at the repo root: 82 prompts, **zero
questions not already in `public/courseData/`**. A pure duplicate, loaded by
nothing, all 82 still carrying fields retired in #206. **Safe to delete.**

**Re-measured independently and deleted** (195KB). The count held — 82
questions in each copy, none unique to the root one — and the only reference to
that filename anywhere is `supabase/demoSeed.mjs`, which reads it from
`public/courseData/`, not the root.

`projectDocs/HSCSoftwareEngineering_AllTopics.json`: 242 prompts, of which
**117 exist nowhere else** — whole sub-topics the shipped course does not cover
(Software automation, Data visualisation, Data science, Intelligent systems).
It is not a superset either: the shipped course has 59 questions it lacks. Two
divergent forks, so there is no newer one to keep. **Do not delete** without
deciding what happens to those 117 first.

### 5. 70% of sample answers claim a band the Verb Gate does not give them

Carried forward unchanged. `RecalibrateSamplesModal` already detects it and
what a student sees is derived at render, so the cost is a warning that stops
reading as a warning. A curator pass.

## Code

### 6. The PDF export is still set in Inter — REFRAMED, and smaller

Written when the app was Plex throughout. It is now Plex for prose and UI and
**Inter for display** — the wordmark, the two card headings and the section
headings — at the spec owner's call, so the PDF's Inter is no longer simply
wrong. What remains is narrower: the export sets its BODY text in Inter where
the app sets body in Plex, while the two now agree on the display face.

That is a smaller and more arguable question than "the app contradicts itself",
and it still costs a pagination pass against the PDF samples to answer, so it
stays open rather than being done on the way past.

### 7. The keyword matcher still cannot double a consonant that is not -l — CLOSED, MEASURED

`commit` → "committed", `grep` → "grepped", `plot` → "plotted" all miss. #205
reused the existing, guarded `-l`/`-ll` rule rather than adding a blanket CVC
rule, because a blanket rule derives "codonned" and "relationshipped" from two
of the commonest nouns in the data. Closing the rest needs a small lexicon of
doubling verbs, not a wider regex.

**Then the lexicon was priced, and it does not pay.** Checked against every
keyword the app actually ships — 1,517 distinct terms across Biology, Software
Engineering and Enterprise Computing — a doubling-verb list matches **two**:
`commit` (1 use) and `grep` (2 uses). `control` and `model`, the other two
candidates, are already covered by the existing `-l` rule. So the whole benefit
is three keyword occurrences in the library, against a hand-maintained lexicon
that every future curator would have to know to extend.

The first sweep for this looked worse than it is because it pattern-matched
consonant-vowel-consonant endings and caught 117 keywords — almost all nouns
(`gametes`, `codon`, `comparison`), which do not take `-ing`/`-ed` at all.
Doubling is a verb rule; the keyword library is mostly nouns. **Closed. Reopen
only if a course arrives whose terminology is verb-heavy.**

### 8. `hooks/useRetry.ts` is 140 lines nobody imports — DONE, AND GATED

The sweep found four modules rather than one, and one of them was worse than
dead. `utils/importBackupUtils.ts` (7,892 bytes) is a complete, unwired
snapshot/rollback/merge/diff implementation — a second answer to questions
`storageUtils.createBackup`, `restoreBackup` and `dataManagerUtils`'
`mergeOrAddTopic` already answer in the shipping code. Wiring it up would have
given the app two merge semantics; leaving it there invited exactly that.

Removed: `hooks/useRetry.ts`, `utils/importBackupUtils.ts`, `data/hscData.ts`
(a deprecation shim preserving compatibility with no importer),
`components/Import.tsx` (39 bytes — a single `lucide-react` import and nothing
else), and the unused `useFormDirty` export from `hooks/useUnsavedChanges.ts`.

**"Worth a sweep when something else is open in those files" is why this sat
here**, so the sweep is now a gate: `npm run check:dead-code`
(`scripts/findOrphanModules.mjs`), in `test:all` and in CI beside
`check:eager-reads`. A module reachable only from a test counts as live — under
test is not unused. `tests/unit/findOrphanModules.test.ts` holds it in both
directions, and earned that immediately: the first version of the scanner
missed bare `import './x'` side-effect imports and would have condemned a live
module.

## Carried over, still open and re-verified

- **Middle-dot meta strings: 65.** A copywriting decision.
- **`font-bold` 308, `rounded-2xl` 154.** Per-site reading, not a codemod.
- **The writing surface's 114-character measure** — a typing surface, not a
  reading one, so a different question from the report column.
- **The header band-ladder's proportion**, my call in #205.
- **`prerequisiteKnowledge` and `relatedTopics`** on 4% of questions each.

## Suggested order

3 and 1 are the two a student would actually feel, and both are curator passes
with tools that already exist. 6 has shrunk since this was written — see the
note there — so the content work is now the whole of the useful list. 4 needs a
decision from the owner before anything can be done with it.

## What is left after the code items were cleared

7 is closed with a number, 8 is done and gated, and half of 4 is deleted. Every
remaining item is either **content** — 1, 2, 3 and 5, all curator passes through
the Content Audit Studio's existing bulk actions, all of which spend real AI
budget on the owner's own library — or a **decision only the owner can make**:

- **4, the second half.** `projectDocs/HSCSoftwareEngineering_AllTopics.json`
  holds 117 questions that exist nowhere else, in whole sub-topics the shipped
  course does not cover (Software automation, Data visualisation, Data science,
  Intelligent systems), while the shipped course has 59 the file lacks. Two
  divergent forks with no newer one to keep. Nothing can be deleted or merged
  until someone decides whether those 117 are wanted.
- **6, the PDF body face**, which costs a pagination pass against the PDF
  samples to answer either way.
