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

## Where this is implemented

| Surface | What it does |
|---|---|
| `components/SampleAnswersAccordion.tsx` | One row per mark level, one exemplar shown at a time. Within a level, a chip per exemplar labelled by source and word count (`sourceLabel`, `wordCountOf`), sorted by `byTrustworthiness`, with the tail behind `+N more` (`VISIBLE_VARIANTS`). The folded panel header states levels **and** total exemplars. |
| `components/Combobox.tsx` | Optional `group` on an option renders a sticky heading wherever the group changes. Options must arrive pre-sorted by group. |
| `components/PromptSelector.tsx` | Questions grouped by cognitive tier (`TIER_GROUPS` title + target band) and sorted tier-then-marks, so a long list reads as a handful of named runs. Search already matches verb, marks, band and HSC paper via `searchText`. |

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

## What to do next, if volume keeps growing

- **Personal ordering.** Once a student has attempted a dot point, surface the
  question one tier above their last result first, and mark attempted questions
  in the picker. The data exists (`services/responseService.ts`); nothing reads
  it here yet.
- **Near-duplicate detection at generation time.** The cheapest fix for "five
  AI variations on the same shape" is not to store the fifth. A similarity
  check in `SampleAnswerGeneratorModal` before a batch is written would keep
  the level genuinely varied rather than merely well-labelled.
- **A "one of each kind" default.** When a level holds several exemplars from
  the same source, lead with one per source and fold the duplicates within a
  source, rather than folding by position.
