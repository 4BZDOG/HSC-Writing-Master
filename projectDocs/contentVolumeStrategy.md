# Content volume: keeping a growing library usable

The library grows in two directions, and both of them degrade the student
experience long before anyone notices the content is "too good":

1. **Many sample answers at the same mark level.** One click of *Generate*
   drops a batch onto a single mark, recalibration adds more, and every
   contributed student response lands there too.
2. **Many questions under one syllabus dot point.** A dot point is the natural
   place to hang questions, so a well-curated one accumulates a dozen or more.

Neither is a content problem — more exemplars and more questions are the
product working. They are *presentation* problems, and the failure mode is the
same in both: a flat list of near-identical rows, where nothing on screen says
what distinguishes one row from the next, so the only way to choose is to read
them all. A student who has to read five exemplars to discover that four were
AI variations on the same shape has been charged four readings for nothing.

## The principle

**Name what varies, order by what is most useful, and fold the tail.**

Not "show fewer things". Hiding content a teacher deliberately curated is its
own failure, and a cap that silently drops the sixth exemplar makes the library
untrustworthy. Everything stays reachable; what changes is that the first
screen answers *which of these do I want* without being read end to end.

Three moves, in this order:

1. **Distinguish.** Every item carries the one attribute that most separates it
   from its neighbours. For an exemplar at a fixed mark that is provenance and
   length ("Official · 142w"); the mark and band are constant within the level,
   so repeating them tells the reader nothing. For a question it is the
   command term's cognitive tier — the thing that actually changes what writing
   it demands.
2. **Order by confidence.** The item most students should read first comes
   first, and the order is stable rather than reflecting the order things were
   generated in. Exemplars: verified HSC exemplar → real student response →
   AI rewrite of a student response → clean-room AI. Questions: tier ascending,
   so the list climbs the ladder rather than starting wherever the curator
   happened to start.
3. **Fold the tail.** Past a small threshold the remainder collapses behind a
   single explicit control that states what is behind it ("+2 more"), never a
   silent truncation. Stepping past the fold by any other route opens it.

## The fourth move: let the reader narrow, never the app

Distinguishing, ordering and folding all work on the reader who is *still
deciding*. They do nothing for the reader who already knows what they want: a
student with fifteen minutes wants the short questions, a student revising
Section III wants the extended ones, a teacher building a trial paper wants the
real HSC ones. Grouping still makes them scroll past everything else to find
them.

So the picker gains a **refinement strip** — but on the same terms as the rest
of this strategy, which is what separates it from a cap:

- **Only a person sets it.** It opens at the widest possible range and stays
  there until someone moves it. Nothing is filtered by default, ever.
- **It states what it is holding back**, in the count line (`8 of 20 shown`) and
  again as named chips when its controls are collapsed. A shortened list whose
  cause has scrolled out of sight is how a picker comes to look broken.
- **It is reversible in one click**, and it never removes anything — including
  the currently selected question, which is pinned into the list whatever the
  filter says, because the picker must not show a placeholder while the
  workspace beside it displays that very question.
- **Its axes come from the content.** Bounds are derived from the questions
  present, so a dot point spanning 3–8 marks gets a 3–8 slider rather than a
  1–20 one with dead space at both ends. An axis every question shares is not a
  choice, so no control is drawn for it; a dot point with a single tier and a
  single mark value gets no strip at all.
- **It appears only where scanning has stopped working** — the same threshold as
  the picker's own search box (`SEARCH_THRESHOLD`, 7). One rule, not two.

Difficulty here means the **cognitive tier of the command term**, not the mark
value. A 6-mark *Describe* is longer than a 4-mark *Evaluate*; only the second
demands judgement. Marks are offered as their own separate axis, labelled
*Length*, because the reader choosing on time is asking a different question
from the reader choosing on difficulty and should not have to answer both at
once.

## The fifth move: don't produce the duplicate in the first place

Everything above makes a crowded level *readable*. None of it makes the fifth
exemplar *worth reading*. Two changes address the cause rather than the
presentation:

1. **The generator can now see what it already wrote.** `generateSampleAnswer`
   was given only the current batch, so a second batch at 6/6 was written in
   ignorance of the first — the model was never told not to repeat it. It now
   reads the question's saved exemplars too, and the ones at the *same mark* get
   their own instruction: a different example, structure or emphasis, not a
   paraphrase.
2. **What comes back is checked, and a repeat is held back rather than saved.**
   Held back, not dropped: the answer is shown beside the exemplar it repeats,
   with how much they overlap, and keeping it is one click. A silent discard
   would make the library lie about what it produced, which is the same failure
   as a silent cap — so the modal refuses to close or to generate again over an
   undecided one.

Only same-mark exemplars are compared. A 4/6 that closely resembles the 6/6 is
the ladder being tight, which is frequently correct and is a different question
entirely.

## Where this is implemented

| Surface | What it does |
|---|---|
| `components/SampleAnswersAccordion.tsx` | One row per mark level, one exemplar shown at a time. Within a level, a chip per exemplar labelled by source and word count (`sourceLabel`, `wordCountOf`), sorted by `byTrustworthiness`, with the tail behind `+N more` (`VISIBLE_VARIANTS`). The folded panel header states levels **and** total exemplars. |
| `components/Combobox.tsx` | Optional `group` on an option renders a sticky heading wherever the group changes. Options must arrive pre-sorted by group. |
| `components/PromptSelector.tsx` | Questions grouped by cognitive tier (`TIER_GROUPS` title + target band) and sorted tier-then-marks, so a long list reads as a handful of named runs. Search already matches verb, marks, band and HSC paper via `searchText`. Holds the refinement filter, resets it when the dot point changes, and pins the selected question into the filtered list. |
| `utils/questionFilter.ts` | The filter model, as pure functions: `describeQuestions` (bounds from content), `widestFilter`, `clampFilter` (re-fit when the questions change), `matchesFilter` / `applyQuestionFilter` (with the pinned selection), `isFilterActive` and `summariseFilter` (the collapsed-state chips). |
| `components/QuestionFilterBar.tsx` | The strip itself: count line, collapsed summary chips, difficulty and length sliders, a Past-HSC toggle where the dot point holds any, Clear, and the "nothing matches those settings" explanation in place of an empty picker. |
| `services/geminiService.ts` | `generateSampleAnswer` now reads the question's SAVED exemplars as well as the caller's batch, and gives the ones at the same mark their own brief ("a genuinely different response of the same quality, not a paraphrase"). Previously a second batch at 6/6 was written with no sight of the first — the mechanism by which a level accumulated variations. |
| `utils/answerSimilarity.ts` | Jaccard overlap over word BIGRAMS (`answerSimilarity`, `findNearDuplicate`). Unigrams are useless here: two answers to one question necessarily share their vocabulary. Bigrams carry phrasing, which is what a paraphrase preserves. Tags stripped, so stored mark-up does not register as difference. |
| `components/SampleAnswerGeneratorModal.tsx` | Compares each generated answer against the exemplars at ITS OWN mark (a 4/6 resembling the 6/6 is a tight ladder, not a duplicate). A repeat is held back — never written, never silently dropped — and shown beside the exemplar it repeats with its overlap, for Keep or Discard. The modal will not close or generate again over an undecided one. |
| `components/RangeSlider.tsx` | Two-handled range built from two native `input[type=range]`s, so arrow keys, Home/End and screen-reader announcement come from the platform. Handles cannot cross. Paint is in `.dual-range` (`index.css`), tinted from `currentColor` so one Tailwind class themes the control. |

## What was considered and rejected

- **A hard cap on exemplars per level.** Makes the library lie about its own
  contents, and the sixth exemplar is often the contributed student one that a
  teacher most wants seen.
- **Auto-selecting "the best" exemplar and hiding the rest.** The comparison
  between a Band 4 and a Band 6 answer *is* the teaching; collapsing it to one
  answer removes the thing the panel exists for.
- **Paginating the question picker.** Pagination answers "how do I get to item
  30" — nobody's question. The reader's question is "which kind of question is
  this", which grouping answers and page numbers do not.
- **A difficulty filter that starts narrowed** (e.g. defaulting to the reader's
  own level). It would mean a teacher generates a question and cannot find it,
  with nothing on screen admitting a filter is on. The strip starts wide and
  says so.
- **One combined "difficulty" number folding tier and marks together.** The two
  answer different questions — "how hard is this to think about" and "how long
  will this take me" — and a single number would let neither be asked.

## What to do next, if volume keeps growing

- **Personal ordering.** Once a student has attempted a dot point, surface the
  question one tier above their last result first, and mark attempted questions
  in the picker. The data exists (`services/responseService.ts`); nothing reads
  it here yet. It is the last of the three original follow-ups still open, and
  the most valuable: it is the only one that makes a long list shorter *for this
  reader* without anyone having to set anything.
- **A "one of each kind" default.** When a level holds several exemplars from
  the same source, lead with one per source and fold the duplicates within a
  source, rather than folding by position.
- **Calibrating the similarity threshold on real content.** 0.5 bigram overlap
  was chosen conservatively: a near-verbatim rewrite of a 25-word answer scores
  ~0.64, while a genuinely different answer to the same question scored 0.00 in
  testing. It will therefore miss two answers of the same *shape* written in
  different words. Widening it is only worth doing against a corpus of real
  generated batches — a check that cries wolf is one a teacher learns to
  dismiss, which is worse than one that occasionally stays quiet.
