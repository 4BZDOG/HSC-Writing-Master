# HSC AI Evaluator - Change Log

## [Unreleased] - 2026-08-13 (Keyboard, focus and a remount bug)

### 🐛 Components declared inside render bodies

A component defined in a render body is a brand-new component type on every
render, so React unmounts and remounts it — throwing away DOM state, and with it
focus. A sweep of the component layer found five, all now at module scope:

- `RailNode`, `StepHeader` and `ActionButton` in the navigator (below).
- `NavButton` in the Data Vault, which remounted all three tabs whenever
  anything in the vault changed.
- `QuickPick` in the recalibration dialog, which remounted its four selection
  shortcuts on every checkbox tick.

The last two close over state, so they take it as props rather than moving
verbatim. There are none left.

### 🐛 The navigator remounted every button on every render

`RailNode`, `StepHeader` and `ActionButton` were declared **inside**
`PromptSelector`, which makes each a brand-new component type on every render.
React therefore unmounted and remounted every rail node and every action button
whenever anything in the picker changed — a keystroke in a search box, a path
change, an attempt history arriving. None of them read component state, so they
are now at module scope: a move, not a rewrite.

Two consequences, one of them the reason this was found at all. Focus vanished
after closing any dialog opened from the navigator, because the button that
opened it no longer existed by the time focus was handed back — verified in the
browser, where the opener's DOM node was a different object after the modal
closed, and is now the same one.

### ⌨️ Two thirds of the app's dialogs did not trap focus

`useFocusTrap` existed and nine dialogs used it. Thirty did not — so Tab walked
straight out of them into the page behind, over a scrim, in a document their
`aria-modal` had told a screen reader to ignore. The authoring path and the
high-traffic student dialogs now use it too, and carry `role="dialog"`,
`aria-modal` and an accessible name: course creation, both syllabus imports, the
outcomes editor, starter questions, sub-topic creation, rename, confirm, the
question generator, the sample-answer generator, the flag dialog and the
profile.

Two flaws in the hook itself, exposed by wiring it to dialogs that use
`autoFocus`:

- **It fought `autoFocus`.** React applies `autoFocus` while committing, before
  any effect runs, so the trap's "focus the first control" moved focus off the
  field a dialog had asked for and onto the ✕ in the corner. It now leaves focus
  alone when it is already inside the dialog.
- **It could restore focus to a dead node.** The opener was read in the effect,
  by which time `autoFocus` may already have moved focus into the dialog — so
  the "opener" was one of the dialog's own fields, and closing restored focus to
  a node that no longer existed, dropping it to `<body>`. The opener is now
  captured during render, before the commit, and the restore is deferred one
  frame so the surface that owns the dialog has finished re-rendering.

### ⌨️ …and the remaining eighteen

Every dialog in the app now traps focus. The seventeen left over — the audit
studio, class insights, the database dashboard, the review queue, student
progress, AI usage, the runtime-key dialog, the data vault, both file imports,
the quality check, recalibration, both sample-answer editors, the focus-area
editor, the dot-point generator and the marking result — carry the same
`role="dialog"`, `aria-modal` and accessible name.

`GlobalLoadingOverlay` is the one deliberate exception: it is a scrim with
nothing to focus, not a dialog.

### 🛟 Two more places that could lose typed work

The discard guard now covers **Create New Course** (a name and two tabs of
outcomes) and **Manual Question** (a hand-written question — typing nobody wants
to do twice). Same rule as the import modals: while there is something to lose
the backdrop is inert, and Escape, ✕ and Cancel ask once.

## [Unreleased] - 2026-08-12 (From a syllabus to a course worth showing)

### 💾 An unfinished import survives a crash

The discard guard stops a stray click from throwing a pasted syllabus away. It
does nothing about the tab dying, the laptop sleeping, or a session timing out
mid-paste — and this is the workflow where an admin puts twenty minutes of
attention into a text box. The import modals now snapshot themselves to
IndexedDB **as the user types**, because "save on close" is the one moment that
does not happen when a tab dies. The analysed structure is included, so a crash
after a five-topic analysis does not cost those five AI calls again.

The draft is **offered, never applied**: someone opening the modal to start
something new must not find last week's paste already in it. The banner says how
old it is, because "3 minutes ago" is obviously the crash you just had and
"2 days ago" is obviously not. Drafts expire after a week, are cleared when the
import completes, and are cleared when the form is emptied on purpose.

### ✨ Starter questions: the step that makes a seeded course usable

An imported syllabus is topics, sub-topics and dot points with **no questions** —
the one thing a student opens the app for. Filling that in meant the admin audit
studio (a separate tool, built for auditing an existing library) or the picker,
one dot point at a time; for a 90-dot-point syllabus neither is a plausible way
to finish.

The import now ends by offering one question per empty syllabus point, for the
course it just imported into. Its marks and command verb come from the dot
point's **own wording** — NESA writes the demand into the syllabus, so
"identify" is a two-mark ask and "critically evaluate" is not, and generating
everything at one weight would produce a course whose marks say nothing.

Nothing runs until the button is pressed: this spends real AI budget per dot
point, so the count and the scope are on screen before the decision. The run
reports progress, can be stopped part-way keeping what it wrote, and skips dot
points that already have a question — so running it twice costs nothing.

### 📊 Coverage on the picker

A syllabus tree with no questions looks identical to a finished one, so "which
of my courses are ready to show someone" could only be answered by clicking
through every topic. Course and topic rows now carry a coverage chip — a
percentage, or "Ready" — with the exact counts in its tooltip, because the
number that matters when finishing a course is how many are left. Curators only:
a student cannot act on it, and a half-built course reads to them as a broken
one.

### 🐛 The offer could have targeted the wrong course

Merging a syllabus into a course that is **not** the one on screen leaves the
navigator where it was, so the starter-questions offer would have counted the
empty dot points of whatever course the person happened to be looking at — and
written questions into it. The offer now holds the imported course id
explicitly.

## [Unreleased] - 2026-08-12 (Seeding a course you can trust)

Seeding is the workflow that decides what a new user sees first, so this pass
is about not losing an admin's work, not shipping the parser's mistakes as
content, and not having to do the job twice.

### 🛟 A stray click no longer throws away a pasted syllabus

The import modals hold twenty minutes of attention — pasted NESA text, split
across tabs, analysed and pruned — in component state with nowhere else to live,
and every one of them closed on a click anywhere outside the panel. The dark
area is large and it is exactly where the pointer travels between the page and
the dialog. One miss cost the lot, with no warning and no undo.

While there is work in progress the backdrop stops being a close button at all —
a stray click should be inert, not merely survivable — and the deliberate ways
out (Escape, ✕, Cancel) ask once, naming what is about to go ("this import —
6 topics, 84 dot points"). With nothing entered, everything closes immediately
as it always did. Applies to the course import, the topic import and the
outcomes editor.

### ✏️ The preview is editable, not just prunable

It could only delete, so a topic the parser named "Module 5 – 5 Module" had to
be imported wrong and renamed afterwards, and a mangled dot point had to be
deleted and retyped in the Vault. Every name and dot point in the structure
preview is now editable in place — this is the text question generation later
reads, so it is worth more here than anywhere else. Names edited away to nothing
are refused rather than creating a topic called "" that no picker can select;
emptied dot points are simply dropped.

### 🗓️ A Year 11 course can be seeded in one pass

The course-level syllabus import had no year control, so it could only ever
produce Year 12 content — a Year 11 course had to be built through the topic
picker one topic at a time, which is the opposite of what that modal is for. A
NESA document is one year's, and the whole import now follows the year chosen
beside the course name (opening on the navigator's).

### 🐛 Two courses could end up with the same name

`CourseCreatorModal` has refused a duplicate course name since it was written,
because import matching pairs courses BY NAME and two "HSC Biology" entries
split a subject across records that look identical in every picker. The syllabus
import — the path seeding actually uses — did not check at all. It now refuses,
and points at the "Import Into" dropdown, which is what the person wanted.

Also: analysing several topics reports progress ("Analysing 3 of 8…") instead of
one indefinite spinner over what is one AI call per topic.

## [Unreleased] - 2026-08-12 (Reading a page is not an AI call)

### 🐛 The URL field reported an AI usage error for every failure

`/api/fetch-url` reads a page server-side; asking the model to go and look with
googleSearch grounding is the fallback for deployments that have no such
endpoint, and it costs a separate quota the free tier exhausts almost at once.
Which of the two ran was decided by testing the error's **text** for the word
"fetch" — and the reader's own commonest message is "Failed to fetch the URL: …".
So every blocked page, DNS failure and TLS error the reader reported was read as
"there is no reader here", fell through to the model, and came back as an AI
usage error about a call nobody asked for, with the real reason discarded.

The distinction is carried by a type now. A `PageReaderError` means the reader
answered and that answer is the outcome; only a 404/405 or an unreachable
endpoint falls through. When the AI fallback is genuinely the thing that fails,
the message says what was being attempted, so "daily AI limit reached" after
pressing **Fetch** no longer reads as though reading a web page costs an AI call
by design.

Three things around it:

- A NESA page that refuses automated readers (401/403/429) now says so and says
  what to do — "open it in your browser and paste the text in" — instead of
  "try again later", which was advice that could never come good.
- The failure appears **under the URL field**. It used to render in the modal's
  error block at the bottom of a scrolling body, so pressing Fetch at the top
  showed a spinner stopping and nothing else.
- One `UrlFetchField` behind all three surfaces: bare domains are normalised,
  **Enter** submits, and the supported hosts are named up front rather than
  discovered through a refusal.

### 🎯 The NESA outcomes page, read in one go

A NESA outcomes page lists Year 11 and Year 12 together, so the outcomes editor
now holds both years on tabs and each parsed outcome goes to the year the page
put it under. One the page did not place goes to the tab in front of the user —
never silently to Year 12, which would be a guess wearing the default's clothes.
The editor reports what it did ("Added 10 Year 11 and 9 Year 12 outcomes,
skipping 3 already in the list") rather than just changing.

Repeated outcome codes are flagged on the row and left out on save, in both
outcome editors: a question links to an outcome **by code**, so two rows sharing
one make every link through it ambiguous.

### 🧭 Creating content says where it is going

Nothing in the creation path used to name the year, and the topic list is
already filtered to it — so an admin filling Year 11 saw an empty list with no
clue that it was empty because of where they were standing.

- Adding a topic says "New topic in Year 11 of HSC Biology", and a clashing name
  says which year it clashes in — the same name in the other year is legitimate,
  and "already exists" alone reads as a bug when it is the right answer for a
  different year.
- **Add Topic from Syllabus** names the year in its subtitle.
- Adding a sub-topic names the topic it will be added to.

Also deleted `TopicCreatorModal` and `SyllabusItemCreatorModal`: the topic
picker builds topics through an inline panel, and nothing had called
`onAddTopic` since. Two components and a modal id that could still be
maintained, diverge, and mislead the next person reading the creation path.

## [Unreleased] - 2026-08-12 (Outcomes belong to a year too)

### 🎯 A Year 11 question is no longer offered HSC outcomes

The year split gave topics a year and left outcomes behind: `CourseOutcome.year`
existed in the type but nothing wrote it, nothing synced it, and no surface read
it. BI-11-01 is not BI-12-01, and the enrichment pass writes `linkedOutcomes`
without anyone reviewing it — so a Year 11 question would quietly acquire HSC
outcomes.

- **The outcomes editor has a tab per year**, opening on the one the navigator
  is showing. Its code examples follow the tab, because NESA puts the year
  inside the code and an editor showing `SE-12-01` while Year 11 is on screen
  invites the wrong syllabus to be pasted in.
- **Two filters, deliberately.** `outcomesForYear` is lenient — it filters only
  once a course labels at least one outcome, so every course that predates the
  split still shows all of its outcomes in both years. `outcomesOfYear` is
  exact, and the editor uses that one: through the lenient filter, an unlabelled
  course answers "all of them" for Year 11, and saving would have stamped every
  HSC outcome `year11` and emptied Year 12 in a single click.
- Question generation, manual questions, prompt enrichment and the admin audit's
  batch tasks all narrow to the question's own year. The workspace shows the
  year's outcomes **plus any the question is already linked to**, so a cross-year
  link is visible and fixable rather than silently blank.
- `supabase/schema.sql` §23 adds `course_outcomes.year`, with the same NULL =
  Year 12 rule and the same tolerance as §22: the client asks for the column and
  asks again without it if refused.

### 🧭 Both years' outcomes are entered where the course is defined

**Create New Course** now has a tab per year in its outcomes section. That is
load-bearing rather than convenient: the navigator's year control needs content
to be selectable, and a brand-new course has none — so before this, a teacher
setting up "HSC Physics" could not enter the Year 11 outcomes at all until they
had created a Year 11 topic to make the year reachable. The header count sums
both tabs, so collapsing the section after filling in Year 11 does not read as
lost work, and each tab's code example follows its year.

### 🐛 A pasted Year 11 syllabus split itself across both years

`handleStartFullSyllabusImport` tagged the topics it built with the year on
screen and left the outcomes from the same paste untagged. A NESA document
carries both together, so a Year 11 syllabus filed its structure in Year 11 and
its outcomes in Year 12 — where they became the outcomes offered to every HSC
question in the course. Both now carry the year, and the merge keys on code
**and** year.

The audit studio counts links against each question's own year too: a Year 11
question carrying an HSC outcome code now shows "No Outcomes" instead of
counting as linked, which is the one thing the audit exists to surface — and its
own linking task repairs it correctly, because that task narrows to the year as
well.

### 🐛 Two years' content could be merged into one topic

- `seed.mjs` and `export.mjs` never carried `year` at all, so seeding a course
  with Year 11 topics filed them as HSC and exporting lost the distinction —
  the year now round-trips through `courseData/*.json`.
- Importing a course matched topics by name across years. NSW syllabuses reuse
  module names between Year 11 and Year 12 ("Working Scientifically" is both),
  so an imported Year 11 topic would be folded into the HSC topic sharing its
  name and its content would appear under the wrong year. Name matching is now
  confined to one year; ids still match wherever they are.
- Imported outcomes were deduped by code alone, so a Year 11 set could be lost
  to an HSC set on any course whose codes do not carry the year.

## [Unreleased] - 2026-08-11 (Year 11 and Year 12 under one course name)

### 📚 Two syllabuses, one course

A NSW senior course is not one syllabus a student walks through over two years.
Year 11 (Preliminary) and Year 12 (HSC) have entirely separate topics,
sub-topics and syllabus points; the only thing they share is the course name.
The app now models that as two populations of topics inside **one** `Course`,
chosen by a control beside the course picker — rather than as two courses,
which would double every course list and split a teacher's material in two
places. Full note in `projectDocs/syllabusYears.md`.

- **The absence of a year means Year 12**, and that is why nothing needed
  migrating: every topic authored before this is HSC content, a saved path
  restores where it was, an older export imports where it belongs, and a NULL
  column says the same thing as a missing JSON field. The corollary is a rule
  the code follows everywhere — only ever write `'year11'`.
- **An empty year is offered, not hidden.** A reader sees Year 11 listed with
  "No content yet" and cannot select it; a stale path asking for an empty year
  falls back to one with content. A **curator can** select it, because
  otherwise the feature could never be populated: every empty year would bounce
  back to Year 12, including the one someone was trying to fill.
- Everything created or imported while a year is on screen belongs to it — new
  topics, pasted NESA syllabus text, imported topic files. An imported file
  that declares its own year keeps it.
- `DATA_VERSION` → 2.6.0 for two additive optional fields (`Topic.year`,
  `CourseOutcome.year`). No migration step, for the reason above.
- `supabase/schema.sql` §22 adds `topics.year`. The client asks for the column
  and **asks again without it** if the request is refused — that one request is
  the whole curriculum, so a deployment that has not applied §22 keeps all its
  content and simply does not sync the year.

### 🐛 A shared Year 11 question would never have opened

`resolveAssignmentPath` returned a path with no year, so a shared Year 11
question resolved to Year 12, where the navigator filters its own topic out.
The year is now read off the topic the link already names — no wire-format
change, and old links keep working.

### 🐛 A topic created in an empty Year 11 landed in Year 12

Found by driving the real app rather than by a test: the navigator resolved the
year one way (`allowEmpty`, so a curator can stand in an empty year) and the
creation path resolved it another, so the first Year 11 topic anyone made
appeared in the HSC list. All three surfaces now go through one
`activeSyllabusYear`, and the rule is pinned by a test.

### 🐛 The year control announced its own emptiness as part of its name

The closed control draws the selected option's label, so "Empty — add the first
topic" rode up into it and read as part of the year's name. The note now
appears only on a row that can never be selected; a curator gets the same
message with more room, from the empty state under the topic picker.

### 🧹 Two outcome editors could write a non-text field

`handleOutcomeChange(index, field: keyof CourseOutcome, value: string)` accepted
any key of the outcome, including the new `year`, from a text input. Narrowed to
the two fields those editors actually edit.

## [Unreleased] - 2026-08-08 (paywalling the upgrade, and printing it)

### 🔒 The rewrite was gated on the wrong switch

The rewritten answer inside a marking result was withheld only when
`FREE_TIER_FEEDBACK_SUMMARY_ONLY` was on. That switch governs feedback
**detail**; the rewrite is the `answerUpgrades` feature in its own right. So a
deployment that opened feedback to the free tier — `FREE_TIER_FULL_FEEDBACK=true`,
a documented option and the one a school pilot reaches for — handed every free
account the paid rewrite, and with it the whole improvement review now built on
top of it.

- `redactPaidFeedback` takes a **scope**: `feedbackDetail` and `rewrite` are
  decided separately, and both default to withholding so a caller that forgets
  to say what it means keeps the paywall on.
- `api/gemini.ts` resolves the caller's plan **once** per request (shared with
  the paid-feature gate, which used to look it up independently) and gates the
  rewrite on `answerUpgrades`. An unresolvable plan falls back to the
  `unlimited` verdict already in hand rather than to "entitled":
  `resolveCallerPlan` is fail-open by design, so treating null as entitled would
  reopen the hole on any deployment whose `caller_plan` RPC is missing, while
  failing hard would strip rewrites from paying customers for the same reason.
- The meter failing open no longer opens the paywall — a count and a plan are
  different questions.
- Client-side, the lock is applied in **one** place that every consumer reads:
  the rendered exemplar, the buttons, the comparison and the exported PDF. A
  rewrite can outlive the entitlement that produced it (a cached result, a
  session open when the plan lapsed), and a paid asset should not depend on
  which of four call sites remembered to check.

### ✨ The PDF shows what changed

The exported report carried the improved response as a block of prose, leaving
the student to work out which words earned the mark by eye.

- A **"What changed"** section: the scale of the revision (*67 words added · 29
  cut · 52% of your own writing kept*), then each edit as a `−` was / `+` now
  pair.
- A list rather than inline marking, because the page's text engine draws whole
  wrapped lines in a single style — an inline diff on paper would mean a
  word-placement engine. Every row carries a `−`/`+` prefix as well as colour,
  so the page survives the greyscale printer most schools have.
- Capped at 14 edits, with a line saying how many more are in the app.
- Absent entirely when the rewrite is withheld, when nothing changed, or when
  there is no student answer to compare against.

### 🐛 Two print bugs found on the way

- **A heading could be orphaned at the foot of a column.** Keep-with-next
  reserved one *line* of the following block, but everything reaching the flow
  has already been through `splitOversized` and moves as a unit — so a heading
  that fit alongside one reserved line stayed put while its whole body jumped to
  the next column ("IMPROVED RESPONSE" at the foot of one column, the response
  itself at the head of the next). It now reserves the body's full height.
- **A list item drew only its first run.** `measureBlock` has always reserved
  height for all of them, so a multi-run item — exactly what the change list
  needed — was measured at full height and drawn missing everything after the
  first line, leaving a gap on the page.

## [Unreleased] - 2026-08-08 (hardening the improvement review)

### 🐛 The comparison was missing from the path students actually take

Two things produce a rewrite: pressing "Improve my answer", and ordinary
marking — `evaluateAnswer` is briefed to return the student's answer lifted one
mark, and that arrives inside the evaluation result. Only the first could open
the diff, so the student who simply submitted an answer and read their feedback
never saw the comparison at all. The marking rewrite carries no target of its
own, so it is derived the way the model was briefed: one mark up, through the
Verb Gate.

### 🐛 Escape closed two dialogs at once

Every dismissible overlay listens on `window`, so they share a target and
`stopPropagation` cannot arbitrate between them — one press closed the
improvement diff **and** the feedback modal underneath it. `useEscapeKey` now
keeps a stack and only the topmost surface responds. A dialog that has detached
its handler mid-operation (so Escape cannot abandon an in-flight AI call)
correctly lets the press fall through to the surface beneath.

### 🛡️ The rewrite is cleaned before anyone sees it

"Return only the improved answer text" is an instruction, not a guarantee.

- A rewrite wrapped in a **code fence**, opened with **"Here is the improved
  answer:"**, or headed with a **restated mark** is stripped back to the answer.
  Left in, all of it landed in the student's draft on "use this version", and
  every word of it read as an addition in the diff, drowning the change that
  actually earned the mark. Deliberately conservative — an opening sentence that
  happens to contain a colon survives.
- An **empty rewrite is a failed call**, not a result. It used to be saved into
  the question's library as a blank exemplar (where it could evict a real one)
  and opened a review of nothing; it now surfaces as an error like any other AI
  failure.
- The marking rewrite goes through the same cleaner, since it is saved as an
  exemplar too. A withheld (free-tier) rewrite stays empty rather than being
  invented.
- The diff strips **markdown** as well as tags, so a model that returns
  `**cache hit ratio**` no longer reports a term the student already used as an
  addition.

### ✨ Reading a long comparison

- **Step through the changes** — "3 of 11", forward and back, wrapping at each
  end, with the focused change ringed (a ring, not a different colour, so
  "where am I" never competes with "what kind of change is this"). A deletion
  and the insertion replacing it count as **one** change, because that is how a
  reader sees them. The scroll is guarded: no `scrollIntoView`, or a reduced-
  motion preference, must never turn the button into a thrown error.
- **"No changes" is stated, not implied.** An identical rewrite says so, drops
  the mark-uplift claim from the header ("Your answer, unchanged"), and hides
  "Use this version" — a button that silently does nothing is worse than no
  button.
- The dialog is announced as one: `role="dialog"`, `aria-modal`, and a label
  pointing at its own heading.

## [Unreleased] - 2026-08-08 (the improvement review)

### ✨ "Your answer, improved" — as a marked-up diff

The improvement is briefed as an *edit* of the student's own response, so the
only reading that makes sense is a comparison. Reading it as a fresh block of
prose hides the handful of words that earned the extra mark, which is the one
thing the student came for.

- A new **word-level diff** (`utils/textDiff.ts`): LCS over tokens, computed on
  the pruned middle after common prefixes and suffixes are peeled off, with a
  size guard that degrades to a wholesale replacement rather than allocating a
  matrix for a pathological input. Tokens are compared ignoring case and
  punctuation — a sentence that only gained a full stop is not a rewritten
  sentence — but each side keeps its own surface form, so joining the segments
  reproduces either text **exactly**. That losslessness is load-bearing: "use
  this version" must hand back text the student actually read.
- **`ImprovementReviewModal` is now a real surface.** It was fully built and
  never mounted anywhere, which is why "Regenerate" had nowhere to show its
  result. It opens on its own the moment an upgrade lands, and again from
  "Compare with mine" on the feedback screen.
  - **Marked up**: one flowing text, added words underlined in green, cut words
    struck through in red, everything unmarked the student's own.
  - **Side by side**: their original with the cuts, the revision with the
    additions, each column counting its own words.
  - A summary strip — *67 added · 29 cut · 52% of your words kept*. The
    retention figure is how a student can tell at a glance whether the AI
    actually followed its brief.
  - **The syllabus terms the revision brought in** are named, because that is
    usually what the extra mark was for.
  - Colour is never the only cue: additions are underlined, cuts struck
    through, and both carry titles.
- `useGemini` now carries the upgrade as one `AnswerImprovement` value rather
  than three loose strings, so the header can never label one revision with
  another's mark.

### 🐛 The upgrade CTA a free account could never reach

The Improved Response section only rendered when there was rewrite text — but
the proxy withholds that text for a plan without answer upgrades, so the section
vanished, taking with it the one button that sells the feature. A free account
now gets the section in a locked state: no exemplar, a plain description of what
Plus does, and a working call to action.

### ✨ Recalibration is a choice, not all-or-nothing

Recalibration is metered marking — one evaluation per sample — so re-marking
eight exemplars to fix the one that looks wrong spent seven credits for nothing.
A picker now lists the samples with quick picks for **All / None / AI only /
Band mismatch**, states the cost up front, and defaults to the mismatched set
(stored band disagreeing with the Verb Gate — the drift recalibration exists to
repair). It also **merges by id** rather than replacing the array, which is what
made a narrowed selection possible: the old assignment would have deleted every
sample the teacher did not choose, and already dropped any exemplar added while
a batch was running.

### 💄 Batch generation and the rename trap

- A finished batch now **opens the Sample Answers panel** and the group it just
  wrote to. The panel defaults to folded, so a teacher who generated five
  exemplars had nothing to show for it but a toast.
- Leaving the tab **mid-batch** now warns. Escape and the backdrop were already
  blocked; a browser navigation was not, and it threw away every call still to
  land.
- **Renaming a dot point no longer changes its focus areas behind your back.**
  Focus areas are read from the dot point's wording, so editing it rewrites
  them — and they are what a generated question is narrowed to. The rename
  dialog now shows the before and after and offers to keep the current list
  (by pinning it as an override). Silent when the list is already hand-set,
  because that case is already immune.

## [Unreleased] - 2026-08-08 (quality of life)

### ✨ Build a whole ladder of exemplars in one pass

The sample-answer generator took one mark at a time, so a teacher covering six
performance levels opened the same modal six times.

- Marks are a **multi-selection** now. The batch runs sequentially from the
  lowest mark up, each answer lands in the library as it is written, and the
  button reports "Writing 3 of 5 — 4/8".
- **"Complete the ladder"** selects one mark for every band with no exemplar yet.
- Each answer is written **with sight of the ones below it**. `generateSampleAnswer`
  has always accepted the existing answers and never used them; it now briefs the
  model to make the new answer visibly separable from them, which is the
  difference between a ladder and five versions of the same answer.
- A failure no longer loses the batch: whatever succeeded is saved, the modal
  says which marks failed and why, and re-arms with only those still selected.
- Band **coverage is derived**, not read off the sample. A stored band travels
  with imported and legacy exemplars and can disagree with the Verb Gate, so the
  coverage strip was claiming bands that no sample demonstrates and the
  suggestion pointed at a band already covered.

### ✨ Focus areas can be fixed by hand

The "including …" list under a dot point is read out of syllabus prose by a
heuristic. It splits a single named concept on its "and", keeps a trailing
clause that was never a list item, and misses lists written in a shape it does
not know — and because that list narrows what a generated question is about, a
bad reading is not cosmetic.

- `DotPoint.focusAreas` stores a teacher's list, edited in a new dialog off the
  navigator. Add, rename, reorder, remove; **saving an empty list is a valid
  answer** — it says this dot point has no sub-parts and silences a bad reading.
  Absent means "read the description", which is every existing dot point, and
  "Reset to automatic" returns to that.
- The editor is offered even when the parser found **nothing**, which is the case
  a teacher most often needs to fix.
- One resolution, shared: `getFocusAreas` is what the navigator, the question
  generator and the AI's keyword grounding all read, so a fix made in the
  navigator is the list the generator uses. An active focus that the edit
  removed is dropped rather than left narrowing questions to a deleted phrase.

### ✨ "Student + AI" exemplars are labelled as their own thing

An AI sample that is a lift of the student's own response carries their
structure and voice; one written from scratch does not. Both were filed under
the same grey "AI Model" chip. `SampleAnswer.derivedFromStudent` now separates
them, and the library gives the student-derived ones their own violet
person-plus-sparkle badge.

### 💄 The sign-in screen is the same design in both themes

It painted an opaque base over the app's animated background and then laid two
`mix-blend-screen` blobs on top. Screen blending against a near-white ground is
a no-op, so the light theme resolved to a flat sheet of #f8fafc while the dark
theme got its aurora.

- A shared `AuthBackdrop` (sign-in and password reset) composes four layers —
  a brand wash, exam-paper ruling, two drifting orbs, and a vignette that seats
  the card — with **each theme's colours declared separately** in `index.css`
  rather than left to a blend mode that only works on one of them.
- The light card gets a real border and a cool shadow so it reads as a card
  rather than dissolving into the page.
- The `blob` keyframes moved from an inline `<style>` inside `AnimatedBackground`
  into the stylesheet: any other component using them silently depended on that
  one being mounted.
- The exemplar carousel counter reads "2/3" rather than a bare "2".

### 🗃️ Data

`DATA_VERSION` → 2.5.0 for two additive optional fields (`DotPoint.focusAreas`,
`SampleAnswer.derivedFromStudent`). No migration step: absent means exactly what
its absence meant before.

## [Unreleased] - 2026-08-08

### ✨ The improved response is now the student's answer, one mark higher

Generated sample answers were already nicely graduated — a 2/6 sample is short,
a 6/6 sample is not. The rewrite a student got back after submitting their own
work was not: it came back at full-exemplar length even when it was only worth
one more mark, in a voice that was nothing like theirs.

- **It targets the next MARK, not the next band.** `getNextLevelTarget` is the
  single definition, and the AI brief, the saved exemplar's mark, the on-screen
  header and the PDF heading all read it from there. Aiming a whole band higher
  was what licensed a four-times-longer answer; on some questions it also
  resolved to a mark at or below the one the student had already earned, so the
  "improvement" was saved to the library worth no more than the original.
- **It is briefed as an edit, not a fresh answer.** Keep the student's
  sentences, sequence, vocabulary and register; make the smallest set of changes
  that earns the extra mark; do not restructure or add sections they never
  attempted. The marker's own list of what was missing is passed in as the brief
  for that edit — previously only the overall summary was, so the model guessed
  at the gap and wrote a new answer around its guess.
- **The length ceiling is anchored to what the student wrote** — the smaller of
  the target mark's scope and their own length plus a working margin. A student
  who wrote three lines gets back four lines. A student who padded gets back
  something shorter.
- **"Regenerate" now visibly does something.** It saved a new exemplar to the
  library and left the response on screen untouched, so the button read as
  broken. It also only appeared while the student was below the band ceiling,
  which hid it from anyone sitting one mark short inside the top band.

### 🐛 Marking guides render as the descending ladder again

A guide from manual entry or the AI Draft button often arrived as one
undifferentiated block instead of the descending HSC rows.

- **The prompt was showing the model an escaped newline.** The example rows in
  the marking-criteria instruction were joined with `'\\n'`, so the model was
  shown the two literal characters backslash-n as its row separator and copied
  them into its answer — one physical line no parser could split. The examples
  now use real line breaks, and every rubric instruction ends with an explicit
  rule against literal `\n`, run-on rows, tables and preamble.
- **`formatMarkingCriteria` repairs the shapes that still get through**: escaped
  newlines, fenced code blocks, markdown tables, band-led rows
  (`Band 6 (7-8 marks): …`) and rubrics that arrived as one run-on paragraph.
  Because the accordion normalises at render, guides already saved in a
  library are repaired too. Rows are only split after sentence-ending
  punctuation, so a mark value quoted mid-sentence is left alone.
- **It runs at the AI boundary, not just on import.** The manual composer puts
  the model's rubric straight into an editable textarea, so a malformed guide
  was what the teacher reviewed and saved. `generateRubricForPrompt` and
  `reviseRubricForPrompt` return free text with no schema to lean on, and now
  normalise their output too.
- **Two parser bugs in the accordion.** A row written as
  `Band 6 (7-8 marks): Comprehensive analysis…` was stored as the words *before*
  the bracket, silently discarding the criteria; and such a row closed itself
  off, so a wrapped continuation line beneath it was dropped entirely. Band-led
  rows also placed themselves with an inline `(band / 6) × totalMarks` that
  ignored the verb's tier ceiling — they now use `markForBand` like everything
  else.

## [Unreleased] - 2026-08-05

### ✨ Self-service password reset

The last gap in the auth story. "Forgot your password?" on the sign-in screen
emails a link; the link returns to a screen that asks for a new password and
signs the user in once it is set.

- **The link had to be told apart from an SSO sign-in.** Under PKCE a recovery
  return and an OAuth return are both a bare `?code=` — indistinguishable. The
  app would have consumed the recovery as a sign-in, logging the user straight
  in and never showing the form, so "reset my password" would appear to do
  nothing at all. The reset email therefore carries its own marker
  (`?mode=reset`) and detection is a URL read, not a race between
  `PASSWORD_RECOVERY` and `SIGNED_IN`. `handleOAuthCallback` refuses a recovery
  return as a backstop.
- **The confirmation does not reveal whether an account exists.** Supabase
  returns success for an unknown address on purpose; "no account with that
  email" would turn the form into a way to discover who has one, which here is a
  roster of students. The panel says "if an account exists for …", and there is
  a test pinning that wording. A rate limit is the one failure surfaced, because
  it is the one the user can act on.
- **The allowlist is deliberately NOT applied to a reset request.** An account
  created before the allowlist was set can still sign in with its password, so
  refusing to reset it would lock out the one person the feature exists for.
  There is no relay risk: Supabase sends nothing to an address with no account.
- **Cancelling signs out.** The link establishes a session before the user
  chooses anything, so on a shared computer walking away would leave whoever
  opened the email signed in.
- Expired and already-used links — much the commonest failure, and the one whose
  native wording explains nothing — say so and point back to the sign-in screen.
- The new-password rules are the sign-up rules, shared rather than restated: a
  password accepted at registration and refused at reset is the sort of
  inconsistency people report as "it will not let me back in".
- Two Supabase settings are required, and both are now documented where someone
  configuring a deployment will meet them: the `?mode=reset` redirect URL must
  be on the allowlist, or the link lands on the Site URL and signs the user in
  without asking for anything.
- **Follow-up fixes from reviewing the above.** The marker was matched as a
  literal `?mode=reset` prefix, so it was only found when Supabase happened to
  put it first — `?code=…&mode=reset` fell through to the OAuth path and
  reintroduced the exact silent sign-in the marker exists to prevent. It is now
  matched as a parameter wherever it appears (and `?mode=resetting` no longer
  counts). Cancelling also cleared the URL only _after_ awaiting `signOut`: a
  rejected sign-out was harmless, but a hung one left the marker in place, so
  every reload returned to a reset screen whose session was dead. The clear now
  happens before any await.

### 🔒 Closed the two SSO gaps self-registration exposed

Adding a domain allowlist to sign-up made it obvious that the SSO path had none,
and that the two must be one rule.

- **The allowlist now governs both routes.** `VITE_ALLOWED_EMAIL_DOMAINS`
  replaces the sign-up-only `VITE_SIGNUP_ALLOWED_DOMAINS` (still read as a
  fallback) and is enforced in `handleOAuthCallback` as well as `signUp`.
  Restricting one door and not the other restricts nothing: a MULTI-TENANT Entra
  registration — the account type a school needs so its students can sign in —
  accepts any Microsoft work or school account in the world, and each one landed
  here as a `student` with a daily AI budget on the deployment's provider key.
  A rejected sign-in drops the Supabase session (otherwise a refresh walks past
  the check) and now says so: `App.tsx` swallowed every callback error, which
  was survivable while they were all transient but would have made a deliberate
  refusal look like a broken app.
  Be clear on what this is: the `auth.users` row exists by the time the app sees
  it, so this refuses the SESSION. The authoritative control is a single-tenant
  Entra registration; `DEPLOYMENT.md` now recommends that rather than
  multi-tenant.
- **The account picker applies to every provider.** `prompt: 'select_account'`
  was sent to Google alone — missing the one a NSW DoE school actually uses. On
  a shared classroom PC the second student to sit down was signed straight into
  the first student's account, with their drafts and their marks, no prompt and
  nothing to notice.

### ✨ Self-registration

The app could sign people in but never register them: `signUp` appeared nowhere,
so every account had to be hand-made in the Supabase dashboard. There is now a
**Create one** link on the login page.

- `authService.signUp()` distinguishes the two outcomes Supabase can return, and
  the UI branches on them. With email confirmation off a session comes back and
  the user is logged straight in (through the ordinary login path, so streaks,
  school plan and onboarding state are applied rather than a second hand-built
  `User` drifting from it). With confirmation on there is a user and **no**
  session, the account is inert until the emailed link is followed, and the form
  is replaced by a notice naming the address.
- Detects Supabase's anti-enumeration response. Re-registering an existing
  address returns a normal-looking user with an EMPTY `identities` array rather
  than an error — untreated, the app says "check your email" about a mail that
  is never sent, which is the most confusing outcome available here.
- Policy lives in `services/signupPolicy.ts` and is enforced in **both** the form
  and the service, because a rule checked only in the form is a suggestion a
  direct call ignores. `VITE_ALLOWED_EMAIL_DOMAINS` restricts registration by
  email domain (sub-domains included; look-alikes like
  `fakeeducation.nsw.gov.au` are refused, which a naive `endsWith` would let in),
  and `VITE_ENABLE_SIGNUP=false` removes the feature.
- **Set the allowlist before deploying publicly.** A new account is created as a
  `student` and a student carries a 60-call daily AI budget spent against the
  deployment's provider key, so open registration hands AI spend to whoever
  finds the URL.
- Supabase's raw auth errors are restated for someone creating a school account
  ("Signups not allowed for this instance" → who to ask; a rate limit → wait a
  minute), with unrecognised messages passed through rather than replaced.
- Password fields carry `autocomplete="new-password"` so a password manager
  offers to generate one instead of filling in the old one — the shared
  `InputField` had `current-password` hard-coded for every password input.
- Password reset landed alongside this (see above), so the account lifecycle is
  now self-service end to end for password accounts.

### 🔒 The §19 class-scoping hole, one table over

`profiles_read` was still `id = auth.uid() or is_reviewer()` after §19 re-scoped
`responses` and `response_events`. A teacher who taught no class could
`supabase.from('profiles').select('username, display_name')` from a browser
console — with the anon key that ships in the bundle — and get every account in
the database. Not a list of opaque ids: `handle_new_user` defaults `username` to
the email local part, so on a DoE deployment that is `firstname.lastname` for
every student in the school.

- Re-scoped onto `can_view_student()` in §19, alongside the other two.
- Reproduced on Postgres 16 first (a class-less teacher read every other profile
  row, usernames printed) and confirmed closed after, with the caller's own row
  still readable — sign-in resolves the role through that read, so failing
  closed must not mean failing blind.
- **Why it outlived the first fix:** the direct-select assertions added with §19
  name `responses` and `response_events` specifically, so nothing failed when a
  third table stayed unscoped. The tests now assert on `profiles` too, negative
  and positive. Verified they fail against the old policy before being trusted.
  42 RLS assertions, up from 39.

### 🔒 `sourcemap: 'hidden'` never stopped the source being published

'hidden' only drops the `//# sourceMappingURL=` comment. Vite still wrote
`dist/assets/*.js.map`, and both deploy paths publish `dist/` wholesale — at a
name derived from the bundle's own filename.

- Confirmed by serving a real build and fetching one: HTTP 200, 2.4 MB, and
  `sourcesContent` handed back `utils/permissions.ts` complete with its
  comments. 18 maps, 8.8 MB, the whole application recoverable.
- Production now emits none, which is what the repo already assumed — nothing
  uploads them anywhere. `dist/` drops from ~16 MB to 7.5 MB.
  `BUILD_SOURCEMAPS=true` brings them back for an error-tracker upload.
- The guard test asserts `false`, not `'hidden'` — anything that writes a map
  file is the regression, since nothing deletes it before deploying.

### 🔒 A half-configured deployment no longer fails open

The AI proxy degrades to "allow everything" when `SUPABASE_URL` /
`SUPABASE_ANON_KEY` are unset. Right for a deployment with no Supabase at all;
wrong for one that has the `VITE_` pair and missed the unprefixed one — real
logins and real quotas in the UI, `/api/gemini` serving anyone with the URL.

- The asymmetry is detectable server-side (a hosting platform puts every project
  variable in the function environment; the prefix only tells Vite what to
  bundle) and is always a mistake, never a choice. It now returns **503** naming
  both missing variables instead of serving the call.
- Production only — the same asymmetry locally exposes nothing, and refusing
  would break `npm run dev` for Supabase sign-in without server vars.

### 🔑 SSO buttons now match what the deployment actually enabled

The login page drew Google, Microsoft and GitHub whenever Supabase was
configured. A provider only works once enabled in the Supabase dashboard, and a
new project has none enabled — so the default deployment showed three buttons
that each redirected the student away and came back with "Unsupported provider".

- `VITE_OAUTH_PROVIDERS` picks the list (or `none`). Unset keeps all three, so
  no working deployment loses a login method; an empty value is treated as unset
  rather than as `none`; unknown names are dropped; order follows the config.
- A disabled provider now says which provider, that an administrator enables it
  in Supabase, and that email/password still works.
- Worth recording that Microsoft/Entra SSO was **already** wired end to end —
  service call, callback handler, button, tests. It just wasn't selectable per
  deployment. `VITE_OAUTH_PROVIDERS=azure` is still the cleanest answer to a
  class rollover — self-registration (above) covers account creation, but only
  SSO also removes the password-reset gap.

### 📄 Documentation caught up with all of the above

- **`docs/privacy-for-schools.md`** — a Cross-border processing section: every
  engine is offshore, so answer text leaves Australia on every marking call
  whatever the database region. Per-engine endpoints and jurisdictions, plus the
  two that need more than a table row (OpenRouter is a broker, so the upstream
  processor depends on the slug; Kimi K3 is China-operated, not US). Also
  corrected an unqualified "never used to train any AI model" — true for the
  paid API tiers, not for the free OpenRouter router — and moved practice
  answers out of `profiles` into `responses` in the data table.
- **`SUPABASE_SETUP.md`** — Step 5 told you to click a **Sign Up** button that
  did not exist at the time. Rewritten around the three routes an account can
  now take (self-registration, SSO, or the dashboard), with the password-reset
  gap stated where someone planning a class will meet it. Adds class-scoped
  visibility to what the schema creates.
- **`DEPLOYMENT.md`** — the pre-flight proxy check now reads a 503 as
  half-configured rather than lumping it in with "open"; the SSO section covers
  `VITE_OAUTH_PROVIDERS`.
- **`VERCEL_SETUP.md`** — an "all four, or none" note on the Supabase variables,
  and the install command corrected to `npm ci` to match `vercel.json`.

---

## [2.4.2] - 2026-07-26

### 🩺 A failed boot now says what went wrong, instead of showing a black screen

A second black-screen report came in that could not be reproduced from any clean
state — all three roles, three consecutive visits, with and without a loaded
curriculum library, on a Pages-identical build. The underlying problem was that
the app had no way to tell anyone what it hit: `index.html` carried no
diagnostics, so ANY failure before React mounts left an empty `#root` on a dark
body — a black rectangle, no message, no recovery.

- **Boot watchdog in `index.html`** — plain JS, before the bundle, no imports of
  its own, so it survives whatever the bundle fails to do. It captures the first
  `error` / `unhandledrejection` (capture phase, so failed script and stylesheet
  fetches are seen too) and, if `#root` is still empty, replaces the void with a
  readable panel: what failed, which file, a "Reload fresh" button that clears
  HTTP/service-worker caches and reloads cache-busted, and "Copy error details"
  for reporting. It **never** touches IndexedDB or localStorage — a student's
  drafts are not ours to clear while debugging a load failure.
- **Stale-chunk auto-recovery** — `vite:preloadError` (raised when a hashed
  chunk 404s, which is what a cached `index.html` from an earlier deploy causes)
  triggers one cache-busted reload, guarded by a sessionStorage flag so it can
  never loop. On the second failure the watchdog explains instead.
- **Mount signal** — `index.tsx` calls `window.__band6BootOk()` after two
  animation frames, so a render that throws still counts as a failed boot rather
  than a successful one.
- Verified by deleting a chunk from a built site to force the exact 404: the
  panel appears naming the missing file. And verified silent on a healthy boot
  past its 12s deadline, on a return visit, and on the `?fresh=` URL the
  recovery button navigates to — a false positive here would be worse than the
  bug.

---

## [2.4.1] - 2026-07-26

### 🛡️ Two CI checks so the blank-page class cannot ship again

Every existing gate was green while the deployed site rendered nothing — dev serves modules unbundled, `vite build` succeeds (it is a runtime ordering fault), Vitest resolves modules individually and the e2e suite runs against the dev server. Full write-up: `projectDocs/bundleSafety.md`.

- **`npm run check:bundle`** — parses the REAL build output, builds the chunk import graph, finds cycles, and fails if any chunk reads an imported binding at its top level from a chunk that imports it back. Validated by running it against the broken commit, where it reported all three constants and exited non-zero. Runs after the build in both `build.yml` and `deploy-pages.yml`.
- **`npm run check:eager-reads`** — scans the sources for module-scope reads of imported values, i.e. the latent version of the same hazard, and runs in the lint job. Structurally-safe cases (dynamically-imported `seedData`, the `index.tsx` entry) are listed with reasons rather than ignored.
- **Swept the codebase with it and fixed the one latent instance it found**: `components/PlanComparison.tsx` built its price-line object at module scope from `PLAN_PRICING`, one component import away from the identical crash.
- Added the rule to the feature skill's gotchas, where future work will meet it.

### 🐛 Fixed: blank page in production (GitHub Pages)

`Uncaught ReferenceError: Cannot access 'Cs' before initialization` at `legalContent.ts` — the whole app rendered nothing on the deployed build, while dev, Vitest, the build itself and the e2e suite were all green.

- **Cause: a cross-chunk temporal-dead-zone read.** `data/legalContent.ts` interpolated the free-tier limits into the Terms of Use _at module scope_, importing them from `services/entitlements.ts`. `EvaluationDisplay.tsx` imports the marking disclaimer from the same content file, so Rollup placed `legalContent` in the `workspace` chunk while `entitlements` stayed in the entry chunk. The two chunks import each other, so `workspace` executed first and read `FREE_TIER_EVAL_LIMIT` (minified to `Cs`) before the entry chunk had initialised it. Vite serves modules unbundled in dev, so the cycle only exists in a production build.
- **Fix, in two parts, neither of which depends on bundler behaviour.** The limit numbers moved to `services/planLimits.ts`, a module with no imports (re-exported from `entitlements.ts`, so every existing call site is unchanged). And the Terms and Privacy Notice are now built by `getLegalDocuments()` on first call rather than at module load, so no imported value is read while any module is still initialising.
- **Fixed the same latent bug in `utils/planComparison.ts`**, where `FREE_PARTIAL` / `PAID_FULL` were module-level objects interpolating the same constants. Now built on demand.
- **Regression guards** in `tests/unit/legalContent.test.ts`: the content file must not import from `services/entitlements`, must not export a module-level `LEGAL_DOCUMENTS`, must not interpolate a limit above the builders, and `planLimits.ts` must stay import-free. The hazard and the reasoning are written up in `projectDocs/agreements.md`.
- Verified by loading the actual GitHub-Pages-style build (`DEPLOY_BASE_PATH`) in a browser: no console errors, the Terms render with the limits correctly interpolated, and the derived plan table renders.

---

## [2.4.0] - 2026-07-26

### 📜 User agreements, first-login quick start, and an honest plan comparison

Three surfaces students and teachers were missing, built content-first so they can be rewritten and expanded without touching a component. See `projectDocs/agreements.md` for the maintenance guide.

- **A user agreement with a charter in front of it.** Signed-in users must accept before reaching the workspace; the workspace is not rendered at all until they do, and there is always a Sign out escape. Students read six plain-English points — the marker is an AI and not your grade, copying sample answers into assessed work is misconduct, your teacher can see your attempts, keep personal details out, flag bad content, one account per person. Teachers read their own version covering duty of care over student data, copyright, and what approving a contribution actually publishes. The full Terms of Use and Privacy Notice expand inside the same dialog, with a section rail to jump to a clause.
- **Versioned acceptance.** Bump `AGREEMENT_VERSION`, add a changelog entry, and everyone re-accepts with a "what changed" summary. A test fails the build if the version moves without one. Acceptance also re-prompts when a student is promoted to staff — the staff charter covers responsibilities the student one never mentioned.
- **Guests are never blocked.** Same charter, dismissible, recorded locally. A read-only trial that persists nothing is not the moment to demand a signature.
- **Quick start guide** with separate tracks for students, teachers and guests. Opens once on a new account, re-openable from the header lifebuoy and the profile. Paid-feature notes appear only for accounts that lack the feature, so a teacher holding Plus is never told to buy what they have.
- **Free vs Plus vs School comparison derived from `services/entitlements.ts`**, not hand-written — a table maintained separately from the gates it describes eventually lies. Tests assert no cell claims a feature its plan does not unlock. Features the free tier holds partially (tiers 1–3, Bands 1–3, summary feedback) show their real limit rather than a misleading cross.
- **The AI marking disclaimer now travels with the mark.** One constant, shown under the mark on screen and in the footer of every page of an exported PDF. An exported report can end up in a folder beside real assessment records, so every page says what it is.
- **"Your data" in the profile** — download everything we hold about your account as JSON (profile, preferences, progress, agreement record, responses _and their marking_), or delete the account outright via `delete_my_account()`, which derives its target from `auth.uid()` and takes no user-id parameter. The Privacy Notice promised access, export and erasure; now the product provides them. Contributed library content survives with authorship unlinked, and the notice says so.
- **Agreement acceptance report** for admins in the AI Usage Dashboard: how many accounts have accepted the current version, and who has not. Hides itself when the RPC is absent rather than reporting a false zero.
- **Publisher identity is deployment-configurable** (`VITE_LEGAL_ENTITY_NAME`, `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_JURISDICTION`), so a school can put its own name and contact on the agreement without a code change.
- Schema §15 (acceptance columns + admin report) and §16 (self-service deletion), both idempotent and both written as soft additions — an unmigrated database degrades to re-prompting rather than failing profile saves.

---

## [2.3.23] - 2026-07-25

### 🖼️ Focus Mode — stale paint on the way out

- **Scoped the Safari `-webkit-mask` in `.clip-stable` to Safari.** The mask exists to stop Safari flashing square corners on rounded, composited cards. In Chromium it buys nothing and costs an extra composited mask layer that is not reliably invalidated when the element is resized or re-parented — which is exactly what leaving Focus Mode does to a screenful of these cards. Now behind `@supports (-webkit-hyphens: none)`.
- **Stopped animating `all` across the Focus Mode layout change.** The page content wrapper only changes padding (now `transition-[padding]`), and the workspace grid's transition is gone entirely — `grid-template-columns` cannot interpolate between `none` and a 12-column track list, so `transition-all` there animated nothing while keeping every composited card in motion for half a second as whole columns appeared and disappeared.
- **Re-measure after the toggle.** Entering or leaving Focus Mode adds or removes columns, so the cross-card height sync (ResizeObserver) and the viewport height cap (a `resize` listener) now get a nudge two frames after the switch, rather than relying on a measurement that may never fire.

### ✍️ Workspace — less chrome, more question

- **Card headers centre their content vertically.** The two headers are height-synced, so whichever is shorter is stretched to match the other; pinned to the top, the surplus read as a slab of empty band colour under the toolbar. Centred, the stretch looks deliberate.
- **The empty "Context Scenario" panel is no longer shown to students.** A question with no scenario spent ~130px of a height-capped card on "No scenario provided." Curators still see it (they can add one); students, Exam Mode and Focus Mode do not. When the question stands alone it is centred in the card rather than left floating at the top.

---

## [2.3.22] - 2026-07-25

### 📏 Sample answers now show the right _size_, not just the right content

- **Sample-answer length is briefed from the target mark, not the verb's full range.** `generateSampleAnswer` was passing the command verb's whole `charRange` (e.g. 800–1800 characters for an APPLY question) no matter which mark the sample was for, so a 2/4 sample came back at full-mark length — teaching students to write four times too much for the marks on offer. The request now carries a mark-scaled scope brief: the NESA structure guide for that exact mark (`getStructureGuide`), a character band interpolated for the question's total marks (`getExpectedCharRange`) and scaled by the mark awarded, a matching syllabus-term count, and an explicit instruction that a lower mark means _less material_ rather than a full-length answer worded badly.
- **`reviseSampleAnswer` gets the same brief.** Re-targeting a sample to a different mark previously carried no length guidance at all, so a revision kept the original's size. It now resizes to the target mark's scope.
- Regression tests cover the low-mark brief, the 1-mark vs full-mark ceiling gap, and the revision path.

### 🎨 Evaluation feedback — a tighter top section

- **Rebalanced the score/metrics dashboard.** The score placard used to stretch to match a tall right-hand column, leaving a large field of empty gradient between the score and the Export button. The metric tiles and the Band Goal card now put their icon inline with the label instead of floating it in its own row, so the column is compact and the placard sits close to its natural height; the placard also carries a slim marks-awarded meter.
- **Fixed the band caption that read as a modifier.** "2 bands to go · LIMITED" implied the band name belonged to the goal; the current band's name is now a caption under the meter ("Now Band 2 · Limited"), and the placard's pill states "Band 2 · Limited".
- **Tidied the question header.** The syllabus trail, verb/marks chips and question now sit on one rhythm with the cards' left edge (previously indented 8px out of alignment), and the oversized gap between the question and the dashboard is gone.

---

## [2.3.21] - 2026-07-07

### 🐛 Fix

- **`sanitiseKeywords` no longer mangles terms that start with a digit.** The list-marker strip (`/^[-•*\d.\s]+/`) also matched leading digits and dots, so an AI-suggested keyword like "3D printing" became "D printing" and "1st law of thermodynamics" became "st law of thermodynamics". Narrowed the pattern to strip only genuine list markers (`- `, `• `, `1. `, `2) `), preserving the term's first character. Regression test added. (Found in a review of the recent keyword/band/mode work — the rest of that work reviewed clean.)

---

## [2.3.20] - 2026-07-06

### 🛠️ Admin AI Engine selector — discoverable

- **Surfaced the AI Engine selector inside the Runtime AI Keys admin modal.** The engine picker (Marking & reasoning / Generation & parsing dropdowns) only lived in the floating bottom-right API-telemetry pill — which is collapsed by default and easy to miss, and the Runtime AI Keys modal literally told admins to go find it elsewhere. It now renders directly under the key fields in that modal (its natural home: keys + which model each key drives, in one place), while still mirroring in the telemetry widget. Extracted to a shared `components/admin/AiEngineSelector.tsx` so both mounts stay in sync. **No behaviour change to gating:** it requires the `admin` role (a Guest login never sees it) and **does not require Supabase** — locally, sign in with the `admin` demo account (dev builds, or `VITE_ENABLE_DEMO_AUTH=true`); with Supabase, any profile whose role is `admin`.

---

## [2.3.19] - 2026-07-06

### 📐 A single, NESA-honest band model

- **Reconciled the tier / band / marks "black box" onto one defensible inference.** NESA performance bands are a _course-level_ standard — NESA never publishes a band for an individual question, and there's no official verb→band rule. For questions the app authors or generates (not lifted from a NESA paper) the model now states its inference plainly and derives _everything_ from one source: **the command verb's cognitive demand sets a band ceiling** (`getTierTargetBand`), **marks set the expected depth** (markRange / word targets), and **the marking guide sets the band awarded** (`getBandForMark`), capped at the ceiling. The pedagogy — a response can only demonstrate the standard of thinking the task actually calls for, so a DESCRIBE answer can't evidence the Band 4-6 analysis it never asked for — is documented in `commandTerms.ts`.
- **Removed the contradictory hand-authored `targetBands` field.** Every command verb carried a loose range string (e.g. DESCRIBE `"2-5"`) that disagreed with the operative ceiling the rest of the app derives (Band 3) — the actual source of the "orange ribbon / yellow prompt" class of bug. The field is gone from the type and all 39 verbs; the Command Verb Hierarchy ribbon and the command-term guide now show a derived **"Band Ceiling · Band X"** (with a tooltip explaining the cognitive-demand cap) instead of the stale range, so the reference can never drift from marking again.
- **Added `getVerbBandCeiling(verb)`** and locked the model with an invariant test: for every tier, a full-mark response is marked _exactly_ at the declared ceiling and never above it at any mark ratio — the one guard that keeps marking, live feedback, colour and copy in agreement.

---

## [2.3.18] - 2026-07-06

### 🎯 Band-colour consistency — robust, app-wide

- **One helper, one colour per verb, everywhere.** The tier-vs-band colour clash could recur anywhere that fed a raw cognitive tier into `getBandConfig` (which maps its argument as a _band_). Added a single self-documenting helper — **`getTierBandConfig(tier)`** (colour of a tier's target band) in `renderUtils` — and routed every remaining tier-coloured surface through it, so a verb like DESCRIBE is its Band-3 yellow everywhere: the verb-hierarchy ribbon, the question picker (`PromptSelector` + `Combobox`), the command-term guide, the live-metrics logic-connector pills, the **prompt-generator** and **manual-prompt** authoring modals, and the teacher **Class Insights** / **Student Progress** analytics. Also fixed a latent trap: `AnswerMetricsDisplay`'s colour prop was named `tier` but only ever received a _band_ — renamed to `band` and documented. Locked in with `getTierBandConfig` tests (colours as the target band, never the tier index).

### 🧭 Syllabus navigator → breadcrumb

- **The picker folds away once you've chosen, so the screen belongs to the writing.** After a student selects a course → … → question, the tall syllabus navigator (and the command-verb reference ribbon) now collapse into a single elegant **breadcrumb bar** (`SyllabusNavBar`): the path, the selected question with its verb badge, marks and target band, and a **Change** button — all tinted in the question's band colour. It stays fully live: click any level to jump back and re-choose (which re-opens the navigator ready at that level), or **Change** to re-open with the selection intact; a **Collapse to breadcrumb** control folds it back. The navigator auto-collapses the moment a question is picked and re-opens whenever the selection is cleared, and the workspace's own breadcrumb is suppressed while the bar is showing so there's no duplication. Focus Mode is unaffected.

---

## [2.3.17] - 2026-07-06

### 🎯 Band-colour consistency (follow-up)

- **A verb is now one colour everywhere.** After 2.3.16 keyed the prompt/writing-area/metrics to a question's _target band_, the surfaces still coloured by raw _cognitive tier_ stood out — e.g. DESCRIBE showed **orange** (Tier 2) in the Command Verb Hierarchy ribbon and the question picker, but **yellow** (Band 3) in the prompt and response. Added `getTierTargetBand(tier)` (a tier's band ceiling, mark-independent) and switched every remaining tier-coloured, student-facing surface to the target-band colour: the **verb-hierarchy ribbon** (header, tier cards, cognitive-step dots), the **question picker** (`PromptSelector` option chips + `Combobox` rows), the **command-term guide** popup, and the **logic-connector** pills in the live metrics. DESCRIBE is now Band 3 yellow top to bottom. Admin/authoring tier-pickers (prompt generator, manual prompt) keep tier colours — there the tier itself is what you're choosing. Covered by `getTierTargetBand` tests (tier→band mapping, agreement with `getTargetBand` at full marks).

---

## [2.3.16] - 2026-07-06

### 🎯 Band-coherent live feedback

- **One predefined colour per band, everywhere — and the student writes toward it.** Every question now has a single "target band" (`getTargetBand` in `commandTerms.ts` — the ceiling a full-mark response reaches, set by the verb's cognitive tier), and one canonical colour palette (`BAND_HEX` / `BAND_HEX_DARK` / `getBandHex` in `renderUtils.ts`, the exact hex equivalents of `getBandConfig`'s Tailwind classes). Previously the editor painted its progress with a _different_ hex set (amber/emerald/sky/indigo) than the band colours used elsewhere (yellow/green/blue/purple), and the prompt was coloured by cognitive tier while the metrics were coloured by band — so one question showed up to three different colours. Now the **prompt header, writing area, metrics target and keyword pills all render in the question's target-band colour**. A Band 3 question is yellow top to bottom; a Band 5 question is blue; and so on.
- **The writing area "fills in" the band colour as you write.** Instead of cycling through unrelated hues (red → orange → …) as progress rose — which flashed "Band 1" at a student on an easy question — the editor header is now always painted in the target band's colour, with a dark veil that lifts as the response develops. A blank page is a dim version of the band colour; a complete answer is the full vivid band colour with a matching glow. The header/footer now read "Band X · <descriptor>" and "…% → Band X", so the destination is explicit.
- **Prompt design reflects the band.** The prompt header is now coloured by target band (not raw tier) and carries an explicit **"Band X" target badge** next to the marks/time, so the difficulty a student is working toward is stated up front and matches the writing surface.

### 🔑 Better syllabus keywords

- **Higher-signal keyword lists (AI).** The enrichment and "regenerate/suggest keywords" prompts were rewritten to ask, as an HSC marker, for the _specific syllabus terminology a Band-X response must use_ — concise technical noun-phrases (1–3 words), subject-specific concepts/processes/structures/named examples only, band- and mark-aware, excluding the command verb and generic filler. All AI keyword output now passes a shared `sanitiseKeywords` guard (trims list markers, drops the verb and generic stop-words like "process"/"factor"/"important", removes case-insensitive duplicates, rejects over-long phrases, caps at 12).
- **Clearer keyword display.** The reference-panel and live-metrics term lists now show a **"used / total" count badge** and colour used terms in the target-band colour (was a generic emerald), with a "Weave these in for a Band X response" framing — so it's obvious which high-value terms are still missing.

Covered by `tests/unit/bandColors.test.ts` (palette is distinct + clamped, `getTargetBand` tier→band mapping, `sanitiseKeywords`). Full suite 389 passing; verified end-to-end in-app (dim→vivid convergence on the shared band colour, unified prompt/editor/metrics/keywords).

---

## [2.3.15] - 2026-07-06

### ✍️ Student Writing Area

- **Two writing modes — Coach & Exam** (`WritingMode` in `types.ts`, session-level state in `App.tsx`, threaded through Workspace → RightPanel → Editor / metrics). A segmented **Coach / Exam** toggle sits in the editor header. **Coach Mode** (default) is the full assisted experience: live keyword/verb highlighting, live insights, syllabus-term tracker, logic connectors, band-progress "phase", and worked exemplars. **Exam Mode** simulates HSC exam conditions — highlighting off, insights/term-tracker/connectors hidden, marking guide + grade standards + reference materials hidden, exemplars hidden, and the recommended-time **countdown auto-starts**. The editor wears a calm neutral "exam booklet" header (red EXAM badge, "no assistance"), the metrics strip down to Mode + Words + Timer, the Evaluate button goes neutral (its colour no longer hints at the predicted band), and bold/italic formatting is dropped. Covered by `tests/unit/writingModes.test.tsx` (Coach highlights / Exam doesn't / toggle present).

### 🐛 Fixes

- **The "Indexing context…" freeze** — auto-enrichment (fetching a prompt's missing scenario / keywords / outcomes on selection) was surfaced through the **blocking full-screen loading modal**, so whenever the AI was slow or unreachable the whole workspace locked up behind it. Enrichment is a background task and no longer blocks: it was removed from the global overlay and now shows as a subtle, non-blocking **"Enhancing"** chip in the prompt header, so a student can start writing immediately.

- **Focus Mode ambience now actually renders** — the 2.3.14 backdrop was painted on the page background, but the always-on `AnimatedBackground` draws an opaque base over it, so it never showed. Moved the effect into `AnimatedBackground` as a `.focus-ambient` layer (above the base, below all content) that fades in via the `body.focus-mode` class — a soft accent glow plus an edge vignette that draws the eye to the centred writing surface, in both themes.

---

## [2.3.14] - 2026-07-06

### ✍️ Student Writing Area

- **Fixed the flickering keyword / verb highlighting (root cause)** — the live overlay that paints keyword and command-verb highlights over the writing area, and the prompt panel that bolds the same terms, both decided which text fragments were matches by calling `regex.test(fragment)` on a **shared global (`/gi`) regex**. `RegExp.test()` on a `/g` regex is stateful — its `lastIndex` carries between calls — so every _other_ occurrence of a repeated term silently failed to highlight (e.g. three "cell"s, only the 1st and 3rd lit up). Replaced the stateful re-test with a stateless index-parity check on the `String.split` output (the single capturing group already places matches at the odd indices), so **every** occurrence now highlights in both the editor overlay (`renderEditorHighlights`) and the prompt renderer (`renderFormattedText`). Locked in with a new `renderUtils` test file (repeated keywords, repeated verbs, mixed, case/plural variants, and content-preservation — 6 cases). **Responsiveness**: the overlay's span tree is now memoised so it only rebuilds when the text / keywords / verb actually change (long answers no longer rebuild the whole tree on every keystroke), and the overlay is marked `aria-hidden` so screen readers read the real textarea once instead of the duplicated visual layer.

- **Focus Mode visual pass** — Focus Mode now reads as a distinct, immersive space: a soft, theme-aware ambient gradient is painted on the page background (`body.focus-mode`, on the backmost layer so it can never tint content), and a floating, glassmorphic **"Focus Mode · ESC"** pill (top-centre) makes the exit obvious and discoverable (complementing the header toggle and the Esc shortcut added in 2.3.13). Extra top padding keeps the pill clear of the prompt. Full suite 378 passing; verified end-to-end in the running app (highlighting, live insights, focus entry/exit).

---

## [2.3.13] - 2026-07-06

### ✍️ Student Writing Area

- **Writing area & Focus Mode polish** — a pass over the student writing surface for correctness and premium feel. **Focus Mode** now exits on **Esc** (the universal "exit fullscreen" gesture), working even while the caret is in the textarea; both the toggle and the Evaluate button expose their keyboard shortcuts via tooltips (⌘/Ctrl+Shift+F, Esc, ⌘/Ctrl+Enter). **Correctness**: the editor header no longer reports impossible values like "106% Complete" — the progress label and bar are clamped to 100% (the un-clamped score still drives the exemplar colour glow); the floating **Evaluate** button no longer covers a student's last lines — the editor body reserves bottom space for it; and the **Bold/Italic/List** toolbar buttons now restore focus and place the caret sensibly (inside the markers / after the bullet) instead of losing the cursor. **Metrics dashboard**: the timer shows red at `00:00` (was reverting to blue), Reset also stops a running timer, Play is disabled once time is up, and the char/word counts read singular at 1 ("1 Word"). **Accessibility**: the previously icon-only timer play/pause, reset, and metrics collapse controls gained `aria-label`/`title` (+ `aria-expanded`), and the zoom buttons disable at their 12–32px limits. Full suite 372 passing.

---

## [2.3.12] - 2026-07-05

### 🔐 Moderation

- **Structural write-path (UI)**: wires up the contribute→moderate flow whose backend landed in v2.3.11, so it's now usable end-to-end. **Authoring** — in Supabase mode, creating a topic / sub-topic / dot point also pushes it to the shared library as `pending` (best-effort; silently skipped for guests or when the parent isn't in the library yet), via new `saveTopicContribution` / `saveSubTopicContribution` / `saveDotPointContribution` service functions with pure, unit-tested row mappers. **Moderation** — the Review Queue now lists pending structure alongside questions and sample answers: a new **Structure** filter, kind badges/icons, and approve/reject routed through the reviewer-gated `set_structure_status` RPC (`fetchModerationQueue` fetches pending topics/sub-topics/dot points; `toQueueItems` folds them in, unscored, sorted after AI-scored items). Full suite 372 passing.

---

## [2.3.11] - 2026-07-05

### 🔐 Moderation

- **Structural write-path + moderation (backend)**: the syllabus **structure** (topics / sub-topics / dot points) now enters the same contribute→moderate model as prompts, so user-authored structure can be pushed to the shared library and approved by a reviewer instead of living only in local storage. Schema: `status` + `created_by` (+ `updated_at`) added to the three structural tables (idempotent; existing seeded structure backfilled to `approved`, `seed.mjs` now seeds `approved`); the `enforce_content_status_authority` trigger and status-gated RLS (visible-if-approved-or-own-or-reviewer; own-insert/edit) extended to them; and a single reviewer-gated `set_structure_status(kind, id, status)` RPC (kind-allowlisted, moderation-states only) for approve/reject. Fixed a **latent bug** surfaced by this work: `topics` was in the `updated_at` trigger list without an `updated_at` column, so any topic UPDATE errored — the column is now present on all three tables and the trigger coverage made consistent. Service: `submitToLibrary` generalised to the structural tables and a `moderateStructure` wrapper added (`services/contributionService.ts`). Verified end-to-end on Postgres — the RLS negative suite grew to **14 checks** (all pass), covering no-read-regression for approved structure, blocked self-publish, reviewer-gated moderation, and kind validation. **Next**: the UI wiring (a "submit to library" action in the structure creators and structural items in the Review Queue) — the enforcement + service API are done.

---

## [2.3.10] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress — band trend over time**: the Student Progress modal now shows a **band-over-time sparkline** for a student, so a teacher sees improvement (or slippage), not just a current snapshot. Backed by a new **append-only `response_events`** history table (schema §4-adjacent) — `responses` still keeps only the latest attempt per prompt, while every evaluation now also appends a tiny event (mark/band/word count, no draft text). The client writes it **best-effort** alongside the responses upsert (a lost event only shortens the trend, never the mark); the table is append-only by RLS (own-insert; own-or-reviewer read; **no update/delete**). `get_student_progress` returns the recent band trend (last 100 scored events in the window, oldest→newest), and the modal renders it as an accessible SVG sparkline (raw band sequence in the `aria-label`, band-3 struggling threshold marked) with a first→last delta. Geometry is a pure, unit-tested helper (`utils/classAnalytics.ts` → `sparklinePoints`). Validated against Postgres: schema applies clean, the RLS negative suite still passes 11/11, cross-user event inserts are blocked, and the trend returns the correct ascending sequence. The trend is empty until history accrues (it only records going forward).

---

## [2.3.9] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress — roster picker**: the Student Progress modal now opens to a **clickable roster** of the students who've submitted marked responses in the window (username, response count, average band, and a compact "last active" label), so a teacher can pick from a list instead of remembering exact usernames — the direct username lookup stays as a fallback, and a "Back to students" link returns to the list. Reads a new reviewer-gated **`get_response_students(p_days)`** RPC (attempts desc; exposes only usernames + aggregates, the same identities reviewers already see in the Review Queue / Usage Dashboard). The roster refreshes with the 30d/90d/1y window and loads non-blocking (a slow/empty roster never holds up a direct lookup). "Last active" formatting is a pure, unit-tested helper (`utils/classAnalytics.ts` → `formatLastActive`). Validated against Postgres (correct ordering + aggregates; non-reviewer blocked).

---

## [2.3.8] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress** (roadmap → Student Progress across cognitive tiers): a new reviewer-gated modal (header line-chart icon, `components/admin/StudentProgressModal.tsx`) that profiles one student across the six cognitive tiers. A teacher enters a username and window (30d/90d/1y); the new reviewer-gated **`get_student_progress(p_username, p_days)`** RPC returns that student's per-verb aggregates (server-side — only counts/averages, never raw work; addressed by username, errors on unknown user), which are folded into the tier ladder client-side. Shows headline tiles (attempts, average band), a **per-tier profile** (Recall → Evaluate, each an accessible band bar filled to band ÷ 6 with the band + attempt count as text, blank where un-attempted), and a per-verb detail table. The folding is a pure, unit-tested function (`utils/classAnalytics.ts` → `foldVerbsIntoTiers`, attempt-weighted band per tier). Gated to reviewers (admin + teacher) + Supabase mode. Validated against Postgres: correct per-student isolation, unknown-user error, non-reviewer block.

---

## [2.3.7] - 2026-07-05

### 📊 Teacher Tools

- **Class Insights — topic breakdown**: the cohort weakness view now toggles between **By verb** and **By topic**, so a teacher can see not just which command verbs but which modules a class is struggling with (e.g. "Data Structures" drawing band ≤ 3). `get_class_analytics` gained a `byTopic` aggregation (responses → prompts → dot points → sub-topics → topics, joined and grouped server-side) alongside `byVerb`; both dimensions share a `label` shape so the client ranks them through one path. The ranking util generalised from `rankVerbWeakness` to `rankByWeakness` (tier enrichment now opt-in — verbs carry a cognitive tier, topics don't). Validated against Postgres (correct per-topic aggregation via the four-table join). Verb/topic tests updated; suite green.

---

## [2.3.6] - 2026-07-05

### 📊 Teacher Tools

- **Class Insights** (roadmap → Teacher-facing class analytics / Weakness Heatmap): a new reviewer-gated panel (header bar-chart icon, `components/admin/ClassInsightsModal.tsx`) that turns the persisted `responses` (v2.3.5) into a read on where a cohort is struggling. Cohort headline tiles (marked attempts, active students, average band) plus a **per-command-verb table ranked weakest-first** — attempts, distinct students, average band, and a colour-coded "struggling (band ≤ 3)" rate bar, each verb tagged with its cognitive tier. A 30d / 90d / 1y window selector. Reads a new **reviewer-gated `get_class_analytics(p_days)`** RPC (clamped 1–365 days) that aggregates responses joined to prompts **server-side**, so no raw student work is transferred — only counts and averages. The ranking is a pure, unit-tested module (`utils/classAnalytics.ts` → `rankVerbWeakness`). Gated to reviewers (admin + teacher) and Supabase mode; local mode shows a "requires Supabase" explainer. Validated end-to-end against Postgres (correct verb aggregation + averages; non-reviewers blocked).

---

## [2.3.5] - 2026-07-05

### 📊 Data

- **Persist responses** (roadmap → Mid-term): student attempts and their AI feedback are now written to the previously-unused `responses` table — the substrate every longitudinal feature needs (progress-over-time, weakness heatmaps), which is why it lands first. On each completed evaluation the app upserts one row per `(student, prompt)` (new `uq_responses_user_prompt` index) with the draft, word count, overall mark/band and the full evaluation JSON; a thumbs-up/down on the AI feedback is mirrored onto the same row. All writes go through a new **best-effort** `services/responseService.ts` that no-ops in local mode (no server identity to attribute to), for guests, and for prompts with no shared-library row — and swallows its own failures so persistence never blocks or disrupts marking. Writes are confined to the caller's own rows by the existing `responses_write` RLS policy; reviewers may read all for analytics (both verified against Postgres). The row mapping is a pure, unit-tested function.

---

## [2.3.4] - 2026-07-05

### 🔔 Quota UX

- **Quota-exhaustion notification** (roadmap → Mid-term): users are now nudged as their daily AI allowance runs low instead of hitting a silent 429 wall. The proxy echoes the caller's post-call usage on every authenticated response (an additive `__quota` field, mirroring the `__keyOverride` convention and ignored by provider-response consumers) and on the 429 body, so the client learns its budget without an extra round trip. `aiCore` feeds each snapshot to a new `services/quotaNotifier.ts`, which raises an **in-app toast at 80% (info) and 100% (error)** — deduped **once per threshold per UTC day** via `localStorage` so it nudges rather than nags, and resetting when the day rolls (matching the server's midnight-UTC reset). The threshold logic is a pure, unit-tested module (`utils/quotaWarnings.ts`: crossing the highest fresh threshold, so a jump straight past 100% still surfaces the "reached" warning). No effect in local mode (no identities to meter).

### 🎨 UX Fixes

- **Command Verb Hierarchy ribbon**: fixed the square-corner flash on animation — the scaling tier cards and the fade-in active-verb hero card now carry `clip-stable` (the compositing hint the rest of the app already uses), so their `rounded-[32px]` mask applies from the first frame. Also fixed a dead easing class (`cubic-bezier(...)` was being emitted as invalid utility tokens); the tier-card focus transition now uses the intended spring curve via `ease-[cubic-bezier(0.34,1.56,0.64,1)]`.
- **Review Queue modal**: added the missing `clip-stable` to its panel — it was the one admin modal whose rounded border flashed square during the open animation (the other admin modals already had it).

---

## [2.3.3] - 2026-07-05

### 🛠️ Admin Tooling

- **AI Usage Dashboard — per-engine breakdown**: completes the roadmap's _Dashboard depth_ item. The proxy now attributes each call to the engine that served it, so the dashboard shows a **Spend by engine — last 7 days** table (calls + estimated cost per model, dearest-first, with a total) and the **Est. Cost Today** tile switches from a bounded range to an **exact** figure once attributed data exists (it still falls back to the range on an un-migrated database or before any calls). A new **reporting-only** `ai_model_usage` table (schema §11) is incremented by a `record_ai_model_usage()` RPC the proxy calls **best-effort** after a quota unit is spent — deliberately kept separate from `consume_ai_quota()` so it can never block a request or affect a budget (a blank/oversized model tag is ignored; a missing RPC or transient failure is swallowed). Reads through the new reviewer-gated `get_ai_model_usage_report(p_days)` (clamped 1–31 days). Pricing/aggregation stay in the pure, unit-tested `utils/usageReport.ts` (`aggregateModelCosts`), and the proxy path is covered in `tests/unit/proxyQuota.test.ts` (records on allow/fail-open, never on 429/401, skips when no model tag). Rows for models absent from the registry still show, labelled by their raw provider string at zero cost.

---

## [2.3.2] - 2026-07-05

### 🛠️ Admin Tooling

- **AI Usage Dashboard — spend depth**: the dashboard now turns raw call counts into money and a portable report (roadmap → Near-term → _Dashboard depth_). A new **Est. Cost Today** headline tile estimates the day's spend as `calls × per-call price`; because the quota counter records calls (not which model served each), the figure is honestly presented as a **range bounded by the active basic and reasoning engines**, labelled with those engines. A header **CSV export** button downloads the full reviewer-gated usage report (`hsc_ai_usage_<utc-day>.csv`, columns Day/Username/Role/Calls/Limit/Override, newest day first). Per-call prices live in the engine registry (`services/aiModels.ts` → `estCostPerCall`, a blended estimate for a marking-sized exchange at Jan-2026 list prices) so a new model carries its own price. The cost/CSV logic is a pure, unit-tested module (`utils/usageReport.ts`: `usageReportToCsv`, `estimateCostRange`, `formatUsd`/`formatCostRange`). A true **per-model breakdown** remains — it needs the proxy to attribute each call to its engine (a follow-up `ai_model_usage` table); noted in the roadmap.

---

## [2.3.1] - 2026-07-04

### 🤖 Models

- **Open-source models via OpenRouter**: a new provider adapter (`api/_lib/openrouter.ts`) fronts OpenRouter's OpenAI-compatible endpoint, so one `OPENROUTER_API_KEY` unlocks the whole open-model catalogue. Four are seeded in the engine registry — **GLM 4.6**, **DeepSeek V3**, **Qwen 2.5 72B** and **Llama 3.3 70B** — and appear in the admin AI Engine selector alongside Gemini and Claude; adding more is a one-line `services/aiModels.ts` edit (any OpenRouter slug). The adapter mirrors the Anthropic one: it translates the app's Gemini-shaped requests into the OpenAI chat format (JSON mode enforced by a system message for broad model compatibility) and maps the response back into the `{ text, candidates, usageMetadata }` envelope, so nothing else in the app changes. The key threads through the same server env + runtime-key-modal paths as the other providers, and the Runtime AI Keys modal now has an OpenRouter field with a link to `openrouter.ai/keys`.

### 🛠️ Admin Tooling

- **Runtime AI Keys (local testing)**: a new admin-only header modal (`components/admin/RuntimeKeyModal.tsx`, key icon) lets you paste a Gemini and/or Anthropic key at runtime to exercise the models without editing `.env.local` and restarting. The key is held in `sessionStorage` (per-tab, cleared on close) and threaded to the proxy as a **per-request override** (`__keyOverride`, merged over the server env key in `runAiProxy` and stripped before it reaches any provider SDK). It never replaces the server key for other users and does **not** lift the proxy's auth or daily-quota gates — supplying a key you already hold can't expose the server key. The field masks the current key, previews reveal on demand, and a warning frames it as a testing affordance (prefer `.env.local` for anything long-lived). Model selection stays where it was — the **AI Engine** selector in the API telemetry widget.

---

## [2.3.0] - 2026-07-04

### 🔐 Roles & Access

- **Teacher Role Split**: Teachers no longer inherit full admin. A distinct `teacher` app role (mapped from the Supabase `teacher` role) keeps content curation and the Review Queue but loses the Database Manager, Data Vault, Content Audit Studio, API monitor and dev tools. Capability helpers live in `utils/permissions.ts` (`canCurateContent` / `canModerate` / `isSystemAdmin`), mirroring the schema's `is_reviewer()` / `is_admin()` split. Added a `teacher`/`teacher` demo account.

### 🛠️ Admin Tooling

- **Content Audit Studio — Batch Engine**: every bulk run can now target an explicitly chosen AI engine (App Default, Gemini Flash/Pro, Claude Sonnet/Haiku) via a non-persistent override in `aiConfig`; the active engine shows as a chip in the processing log.
- **Fix All Gaps**: one batch that fills every gap in the selection — questions for empty dot points, missing/non-standard rubrics, unlinked outcomes, missing samples — composed from the same per-node task builders as the single actions.
- **Honest Buttons + Inline Flags**: batch buttons show the exact target count for the current selection and disable at zero; tree rows carry colour-coded data-quality badges (No Questions / No Rubric / Rubric ⚠ / No Samples / No Outcomes) so problems are visible while browsing.
- **Batch Reliability**: `runBatchOperations` emits progress immediately (the footer used to look idle — with clickable buttons — until the first task settled); Stop now drains the in-flight task before the UI reports stopped; progress accounts for failed tasks; end-of-run summary toast.
- **Sync to Shared Library**: in Supabase mode the studio tracks every prompt its batch runs repair and offers a "Sync to Library (N)" push — each touched prompt (plus its sample answers) goes through the sanctioned `contributionService` write path as `pending`, so studio repairs flow through the same review queue as user submissions instead of staying trapped in local IndexedDB. Failed pushes stay queued for retry.
- **AI Usage Dashboard**: a dedicated admin surface (header gauge icon, `components/admin/UsageDashboard.tsx`) for monitoring and adjusting AI spend. Headline tiles (calls today across all users, active users, the admin's own remaining budget), a zero-filled 7-day call trend, and a per-user "today" table where every user's usage shows as a bounded `used/limit` meter with **inline** per-user override editing (set or clear a personal daily limit without leaving the row). A fallback editor adjusts any user who hasn't called the AI today, and the group (role) daily limits are editable in the same view. Reads through a new reviewer-gated `get_ai_usage_report(p_days)` RPC (schema §11, clamped 1–31 days) and writes through the existing admin-gated quota RPCs. Gated to system admins and to Supabase mode — local mode shows a "requires Supabase" explainer since there are no user identities to meter.

### 🐛 Fixes

- **Database Manager**: uploaded backups get their own key instead of being silently swallowed by (or overwriting) the daily auto-backup; Force Sync/Restore report real write status instead of always claiming success; restores run through the full migrate/validate/recalculate import pipeline; imported snapshots show an "Imported" badge and time, sorted newest-first.
- **Generator Modals**: target bands are capped by the verb tier everywhere (generator, editor, defaults); the sample-answer generator resets its mark when reopened for a different prompt; unusual marks/verb pairings get a non-blocking advisory; Manual Entry previews the actual verb tier the AI will target.
- **Audit Studio**: generating a question for a dot point without a `prompts` array no longer crashes; "Select All Filtered" respects the search query instead of selecting across the whole library.

### 🎨 UX

- All admin `window.confirm()` prompts replaced with the app's styled `ConfirmationModal` (which now closes on Escape and nests safely inside other overlays); Escape closes the admin modals when idle (never mid-operation); Review Queue gained a pending count, kind filters and full-text expansion before deciding; the Data Browser can switch object stores in place; the audit tree gained Expand/Collapse All and Clear Selection.

### 🔎 Quality Screening & Review Flow

- **Screen Quality (audit studio)**: new batch action that AI-scores every selected question (0–100, via the same `screenContentQuality` pre-screen used for user contributions) and stores the score + notes on the prompt. Scored content shows a colour-coded inline `AI n` badge (notes on hover), a **Low Quality** filter chip (< 50) joins the gap filters, and stored scores ride along when repairs sync to the shared library so the review queue can triage them.
- **Review Queue context**: sample answers now show their parent question ("For: …", fetched via a PostgREST embed) so reviewers judge answers in context rather than blind.
- **Approve All (visible)**: bulk-approve everything currently listed — respecting the kind filter — behind a confirmation dialog; failures stay in the queue. Built for clearing a checked batch of audit-studio repairs.
- **Self-hosted fonts**: Inter/JetBrains Mono/Newsreader now bundle via `@fontsource` instead of a runtime fonts.googleapis.com request — the app makes zero external requests, so typography renders on restrictive school networks and offline.

### 🏭 Production Hardening

- **AI Usage Quotas (per user + per group)**: the AI proxy now enforces server-side daily budgets (schema §11). Each proxied call atomically spends one unit of the caller's allowance — per-user override (`set_user_ai_quota`) beats the role/group default (`ai_quota_limits`: admin 1000 / teacher 400 / student 60) — and an exhausted budget returns 429 _before_ the paid provider is contacted. The client fast-fails hard-limit 429s (no wasted retries) and surfaces the reset time; admins manage limits and see their own usage in the API telemetry widget's new **Daily AI Quotas** panel. Fails open (with a logged warning) if the schema migration hasn't been applied, so a code-first deploy can't brick AI features; the auth gate still blocks anonymous spending.

- **Compiled Tailwind**: styling is now built into the bundle (`tailwind.config.js` + `index.css`, ported verbatim from the former inline CDN config and `<style>` block). The `cdn.tailwindcss.com` runtime script — explicitly not for production use — and the dead CDN import map are gone: the app renders fully styled offline/behind restrictive networks, `index.html` dropped from 13.5 kB to 1.8 kB, and the only remaining external request is the gracefully-degrading Google Fonts import.
- **Demo Auth Opt-In**: production builds refuse the local demo accounts (admin/teacher/user) with an actionable error unless `VITE_ENABLE_DEMO_AUTH=true` is set — a deploy that forgot its Supabase env vars no longer silently ships a working `admin`/`admin` login. Dev builds are unaffected; guest access (read-only, local-only) is never gated; the login page only advertises demo accounts when they actually work.

---

## [2.2.3] - 2026-06-30

### 🐛 Fixes

- **Ribbon Corner Flash**: Eliminated the square-corner artifact that flashed before the rounded corners settled when the writing progression ribbon (Editor header) animated. Added a `.clip-stable` utility that promotes rounded `overflow-hidden` surfaces to their own compositing layer up front, so the radius clip applies from the first frame. The Editor/Prompt headers and footers now also carry explicit matching corner radii as a fallback.
- **Cut-off Borders**: Removed the redundant `rounded-3xl overflow-hidden` wrapper around the Syllabus Reference panel that was clipping the inner accordion cards' rounded borders at the corners.
- **Project-wide Clip Stabilisation**: Extended `.clip-stable` to the remaining animated rounded `overflow-hidden` surfaces so they no longer flash square corners on entrance/transition — the Writing Metrics dashboard, Sample Answers and Marking Guide accordions, the gradient-header modals (Evaluation Result, Improvement Review, Outcome Detail, Command Term Guide, Sample Answer Generator), the Command Verb Hierarchy card, the Login card, and the idle/empty-state card.
- **Full Modal Uniformity**: Completed the pass across every remaining `animate-fade-in-up` modal panel (creators, importers, generators, the Data Manager, User Profile, Database Dashboard, confirmation/rename dialogs) and the Data Manager course-reorder cards, so all dialogs share the same flash-free rounded-corner entrance. Verified safe — each modal's only `position: fixed` element is its backdrop overlay, and embedded dropdowns are absolutely positioned, so promoting the panel to its own layer affects no fixed descendants.

- **Scrollbar Styling**: Fixed the `.custom-scrollbar` rule — the track was declared twice (the second actually styling the thumb) and there was no default thumb rule, so dark-theme panels fell back to the chunky native scrollbar. Slim themed thumbs now render in both themes, with hover states and Firefox (`scrollbar-width`/`scrollbar-color`) support. Also defined the missing `.scrollbar-hide` utility that the main workspace column, breadcrumb rail and verb-hierarchy carousel relied on (it isn't part of the Tailwind CDN build, so native scrollbars had been leaking through).

### ♿ Accessibility

- **Keyboard Focus Rings**: Replaced the blanket `outline: none !important` (which silently failed WCAG 2.4.7 — keyboard users had no visible focus anywhere) with a `:focus-visible` accent ring. Pointer interaction stays ring-free, so the mouse-driven look is unchanged.
- **Icon Button Labels**: Added `aria-label`s to icon-only modal close buttons that lacked them (and the Manifest search-clear button), so screen readers announce a purpose instead of an unlabelled button.
- **More Icon Labels**: Extended the audit to the remaining icon-only controls — the focus-mode toggle (now also `aria-pressed`), Sample Answers prev/next, Marking Guide save/cancel, the keyword add button, the prompt enrich-error dismiss, profile save, and the database back button.

### 🎨 Design

- **Border Consistency**: Normalised faint `border-white/5` outlines and dividers up to `border-white/10` across the main user-facing flow — the Prompt card footer and outcome chips, the Evaluation Result modal header, the Sample Answers dividers, the Breadcrumb bar, and the idle-state card. The dense admin/data-manager tools were intentionally left on their own consistent `/5` scale.
- **Glow Rendering Fix**: The band `glow` tokens are colour-only Tailwind shadow classes (`shadow-{color}/25`), which set the shadow colour but render nothing without a paired shadow-size utility. The Editor card, Prompt card and Command Term Guide modal were setting a glow with no size, so the signature chromatic glow never appeared; added `shadow-2xl` so it renders. Also gave the Evaluate button a resting `shadow-xl` so its band-coloured haptic glow shows before hover, not only on it.
- **Dead Opacity Modifiers**: Removed ~38 `border-opacity-*`/`bg-opacity-*` (and `hover:`/`light:` variants) utility classes across 12 components. Every band colour token (`getBandConfig`, `getStatusColor`) uses Tailwind's modern slash-alpha syntax (e.g. `border-purple-500/50`), which bakes the alpha in directly — the separate legacy opacity-modifier utilities only affect non-slash colours, so every one of these was a confirmed no-op (decorative dead code implying a hover/selection effect that never fired). Pure cleanup, zero visual change.
- **Broken Hover Interpolation**: Fixed `hover:${tierConfig.bg}` in the Command Verb Hierarchy tier-filter pills — interpolating a multi-class token string directly after a `hover:` prefix only scopes the _first_ class to hover; the trailing `light:`/`print:` classes lost their `hover:` condition and were rendering unconditionally, tinting the pill's background at all times in light mode instead of only on hover.

### 🛠️ Stacking / Layering

- **Invisible Confirmation Dialog**: `DataManagerModal` (`z-[500]`) opens the shared `ConfirmationModal` for its "Clear All Data" / "Reset to Default" prompts from buttons inside itself, but `ConfirmationModal` (and `RenameModal`, the other globally-triggered dialog) was only `z-50` — well below Data Manager's own overlay. The confirmation for a destructive, irreversible action was rendering completely invisible and unclickable behind the still-open Data Manager. Raised both to `z-[2200]`, above every other overlay in the app, since they can be invoked from inside any other modal.

### ⏱️ Timer / Calculation Fixes

- **Writing Timer Churn + Stuck Icon**: The writing-time countdown effect listed `remainingTime` in its own dependency array, tearing down and recreating the `setInterval` on every single tick instead of running one persistent interval. It also never reset `isTimerActive` when the countdown reached 0:00, so the Pause icon kept showing after the timer had stopped — a paused-looking control that was actually already finished. Rewritten to a single stable interval that stops itself and flips back to Play at zero.
- **NaN% Guard**: The writing-progress percentage (in both the editor ribbon and the metrics dashboard) divided word count by a target word count derived from `prompt.totalMarks`. A malformed/zero-mark prompt would make that target 0, turning the ratio into `NaN`/`Infinity` and rendering "NaN%". Both call sites now floor the target at 1.

---

## [2.2.1] - 2025-05-23

### 🚀 Features

- **Gemini 3 Pro Integration**: Upgraded evaluation and generation to `gemini-3-pro-preview`.
- **Thinking Config**: Enabled reasoning budgets (up to 8k tokens) for complex marking tasks.
- **Vault Maintenance**: Integrated "Data Vault" into the primary selector for rapid data access.
- **Syllabus Audit v2**: Enhanced validation logic for "Complete" vs "Incomplete" curriculum points.

### 🎨 Design

- **Mesh Overlays**: Added cubic SVG textures to all major header surfaces.
- **Chromatic Progression**: The Editor's theme now dynamically shifts through a quality-based color scale.
- **Luminous Progress**: Refactored the Analysis Progress Bar with segmented high-density tracking and live micro-logs.

### 🔧 Maintenance

- **Documentation Audit**: Synchronized all `projectDocs` to reflect the final architectural state.
- **TypeScript Fixes**: Resolved inheritance issues in `ErrorBoundary` and type assertions in the Library system.
- **Data Integrity**: Implemented a "Repair Verbs" migration to fix mismatched verbs in imported datasets.

---

## [2.2.0] - 2025-05-22

### 🚀 Features

- **Strict Band Logic**: Implemented deterministic math for Band calculation based on Cognitive Tiers.
- **Time Machine**: Added Snapshot preview and restore capabilities to the Database Dashboard.
- **XP System**: Simulated Leveling/XP system for user engagement.

## [2.1.0] - 2025-05-18

### 🚀 Features

- **Admin Audit Studio**: First iteration of the bulk-processing dashboard.
- **Quality Check API**: Added dedicated endpoint for reviewing question/code quality.

## [2.0.0] - 2025-05-15

### 🛠️ Architecture

- **IndexedDB Migration**: Full data persistence layer using `idb`.
- **API Guard**: Circuit breaker implementation to handle rate limits and errors.
