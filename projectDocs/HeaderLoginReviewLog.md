# Header and sign-in review — change log

A running record of the review of the page header and the signed-out screens
(sign-in, sign-up, password reset), and the follow-ups it produced. One section
per merged pull request, newest last. Each entry says what was wrong, what
changed, and how it was checked, so the next pass does not re-derive it.

## PR #273 — Stop trimming sign-in passwords, and let the sign-in page fit a short screen

**Sign-in**

- **Bug:** sign-in `.trim()`med the password while sign-up stored it as typed,
  so a password with a leading or trailing space could be created and never
  used. The password is now sent as typed; only the emptiness check trims.
- The page centred with `justify-center`, which pushed a column taller than the
  viewport off the top — at 1280×720 the band mark was cut off with no way to
  scroll to it. It now centres with `my-auto`.
- Empty fields are named under the field (`aria-invalid`, `aria-describedby`)
  instead of one "Required fields missing." line; "Invalid credentials. Access
  denied." became a plain sentence.
- The busy submit button and the phone-width SSO buttons had no accessible
  name; both have one.
- Demo-account chips fill the form and say the password is the username.
- Disclaimer 10px → 12px; muted text given light-theme partners; the local copy
  of `MeshOverlay` replaced with the shared one.

**Password reset** — now shares the sign-in brand block (`AuthBrand`) and
layout; it had a different mark and wordmark. Errors use `role="alert"`.

**Theme and header**

- The last theme is stored (`STORAGE_KEYS.THEME`) and applied by an inline
  script in `index.html` before first paint; the sign-in screen was always dark.
- The sign-in toast reads "Signed in as …", not "Auth session active: …".
- The avatar initial is upper-case and never blank; a failed theme save is no
  longer an unhandled rejection.

**Checked:** `npm run test:all` (2,597 unit tests), 26 Chromium e2e tests
(agreement gate, axe on sign-in, light theme, workspace chrome), production
build and `check:bundle`. Deployed to GitHub Pages by the merge.

## PR #274 — One field, one button, and errors that say what actually went wrong

**Bug — every sign-in failure blamed the password.** `supabaseLogin` turned
every Supabase error into "Invalid username or password", so a student who was
offline, rate-limited or had not yet followed their confirmation link was told
their password was wrong. `describeSignInError` in `services/authService.ts`
now words each of those with its own remedy; only a genuine rejection keeps the
credential wording, and `LoginPage` shows anything else as it arrives. The
offline check is deliberately narrower than `isTransientAuthError` (which also
counts a missing status), so a doubtful case still reads as a rejection.

**Shared pieces** — `components/AuthField.tsx` and `utils/authChrome.ts`
(`AUTH_PAGE`, `AUTH_COLUMN`, `AUTH_CARD`, `AUTH_PRIMARY_BUTTON`,
`AUTH_TEXT_LINK`). The primary button was copied five times across the two
pages and the reset page's field had drifted: no `aria-invalid`, no link from
the field to its error, no focus glow. Both pages now use the same field.

- The field's error state no longer stacks two backgrounds (`bg-black/50` and
  `bg-red-500/[0.02]` on one element); the light theme gets its own error and
  focus fills.
- Text links were `indigo-400` in both themes — about 3:1 on the white card.
  They take `indigo-700` in the light theme.
- The primary button animates only the properties that change, not
  `transition-all`.

**Screen readers** — every mode of the card has a heading (sign-in's is
visually hidden), and when the card's contents change — a mode switch, or a
form replaced by its "check your email" panel — focus moves to the new heading.
Before, pressing "Create one" swapped the form silently.

**Signed-out screens** — the corner API health dot renders only when signed in.
It reports on an AI connection nobody on the sign-in page can use, and at phone
width it covered the disclaimer and the demo chips.

**Also fixed** — a stale comment in `AuthBrand` from PR #273 that described a
`headingLevel` prop the component never had.

**Checked:** `npm run test:all` (2,606 unit tests, including new
`authServiceSignInErrors.test.ts` and additions to the sign-in, sign-up and
reset UI tests), Chromium e2e for the agreement gate and accessibility specs,
and screenshots of both themes at 1280px and 375px.

## PR #275 — The header at 320px, a mark that is not a heading, and deploys that say when they did nothing

**Header**

- **Tools menu alignment.** Every tool name in the admin/teacher popover was
  centred under a left-aligned group label. The panel set `text-left`, but a
  `<button>` does not inherit `text-align` (the user-agent sheet centres it), so
  it never reached the rows. `HEADER_MENU_ITEM` now carries `text-left` itself.
- **Wordmark at 320px.** With an admin's four controls the rail leaves the
  wordmark about 30px, and `truncate` painted "B…". Below 360px it is now
  visually hidden (`max-[359px]:sr-only`) and stays the page's `<h1>`; the
  gradient tile carries the brand at that width. 360px is where it fits whole.

**Evaluation result** — the overall mark was an `<h1>`: a second level-one
heading on the page, under the panel's own `<h2>`, read aloud as "15 slash 20".
It is a `<p>`; the slash is drawn for the eye and "out of" is spoken for the ear.

**Deploy reporting** — the Vercel production job and the Netlify job in
`build.yml` both go green having deployed nothing while their secrets are unset.
The Vercel job's `::notice::` is now a `::warning::` (matching Netlify), and both
write "Nothing was deployed to …" to the run summary. GitHub Pages remains the
only live deployment.

**Checked:** `npm run test:all` (2,609 unit tests, including new cases in
`appHeaderChrome.test.tsx` and `feedbackSummaryChrome.test.tsx`), Chromium e2e
for report column, workspace chrome, accessibility and the evaluation flow, and
screenshots of the header and open tools menu at 320, 360 and 1280px.

## PR #276 — AI waits that draw the work, teach something, and tell the truth about time

The brief: make the AI loading spinners and the glowing background more
elegant, detailed, varied, engaging, informative and whimsical.

**What was there.** Every AI wait showed the same three rings (a ping, a dashed
orbit, a spinning arc) around an icon, a checklist of invented pipeline steps
("Optimising heuristic constraints…", "Verifying output integrity…"), a bar
that crept to 98% and sat there, and the task type in monospace. The marking
wait rotated made-up hints ("Calibrating with benchmarks…") over the real
progress events after five seconds. The background was four circles on one
10-second keyframe, two seconds apart, so the whole sky lurched the same way
every ten seconds.

**The drawing (`components/AiWaitGlyph.tsx`)** — each task draws its own work:

- *Marking*: the band ladder, the app's own mark, with a marker's caret hopping
  between bands on a random walk that leans to the middle, weighing where the
  response sits.
- *Writing*: handwriting on ruled exam paper with a red margin. Each page is a
  new generated scribble (humps, loops, tall strokes, descenders, slanted),
  written word by word.
- *Reading*: lines of text with a highlighter picking out different words each
  pass.
- *Anything else*: the ladder lighting up band by band.

Randomness only picks shapes; the motion is CSS (transform and dash-offset).
Under reduced motion nothing ticks and each glyph shows its finished drawing.

**The card (`components/LoadingIndicator.tsx`)**

- Steps in plain words ("Checking what the command verb asks for", "Weighing up
  a band"), drawn as a short timeline, with the current step given to screen
  readers once rather than the whole list read out on every change.
- An honest clock: elapsed time; "usually about Ns" only when the caller gave
  an estimate; past it, "Taking longer than usual. Still working." and an
  indeterminate bar, instead of a bar parked at 98%.
- A note about HSC writing (`utils/waitTips.ts`), chosen for who is waiting —
  command-verb advice for a student waiting on a mark, question-design advice
  for a teacher generating one — set as a marker's margin comment in Newsreader
  italic. It rotates every nine seconds, starts at a random note, and sits
  outside the live region so it is never announced on its own clock.
- "Working with {engine}" in a sentence, not the task type in monospace.
- Errors read "The AI request did not finish" and the reason, not "System
  Interruption".

**The marking wait (`components/EvaluationProgressBar.tsx`)** — the same
ladder and notes, but its status line is the real event stream: it says when it
is retrying or which model it has switched to, and no longer paints invented
hints over those states.

**The aurora (`components/AmbientAurora.tsx`, `index.css`)** — five orbs in
the band palette's cool end (with one low Band 4 emerald), each on its own path
and its own long clock (29–61s) from a random starting point, turned and
stretched unevenly so they bloom rather than slide. Orbs are radial gradients,
not blurred circles: at these sizes an 80–130px `filter: blur` is rasterised in
tiles, which showed as hard vertical seams. The sign-in backdrop uses the same
component. While any AI wait is on screen the aurora leans in — brighter and a
little closer — via `body.ai-busy` (`utils/aiBusySignal.ts`, reference counted
so overlapping waits end in either order).

**Checked:** `npm run test:all`, new `aiWaitCard.test.tsx` and
`ambientAurora.test.tsx`; Chromium e2e for the evaluation flow, accessibility,
light theme and quota specs; screenshots of every glyph in both themes, under
reduced motion, and of the aurora idle and busy.

## PR #277 — Let the answered steps of the syllabus navigator step back

The brief: improve the syllabus navigator's design, styling and polish, in the
same way as the header, sign-in and AI waits.

**What was there.** Each answered step of the navigator (course, year, topic,
sub-topic, syllabus point) was a tinted card holding a tinted control — five of
them, blue, purple, teal, pink, amber — so once three or four steps were
answered they were the loudest thing on screen and the one step still open had
to shout over them. A chosen step showed only its answer, so a stack of answers
did not say which question each one answered. The only count anywhere was
questions per sub-topic. The folded bar scrolled its path to the end, which at
1280px cut the course name to "logy (Advanced)" with nothing to say more was
there.

**Answered steps step back**

- `Combobox` gains `appearance="quiet"`: a chosen value sits on a neutral
  surface, and the level's hue stays on the option's own tile and on the open
  state. Other pickers in the app are unchanged (default `filled`).
- An answered step is a single row — no card around the control.
- Each chosen row carries a small caption naming its level (Course, Topic,
  Sub-topic, Syllabus point, Question), from `sm` up.
- The question row keeps its tier colour: that colour means the question's
  cognitive tier.
- The open step loses its `scale-[1.01]`, which resampled its text.

**One source for level colour** — `LEVEL_TILE` in `utils/levelColors.ts`
supplies every level tile. The sub-topic tile had been hand-written indigo
while the picker, the rail and `levelColors` all said teal.

**Counts that help choose**

- Topics show how many sub-topics they hold.
- Sub-topics and syllabus points show how many questions they hold, and say
  "No questions yet" rather than nothing (an earlier test pinned the silence;
  it now pins the sentence, with the reason).
- Counts use the muted voice. The focus-area count was emerald, which is the
  rail's "done" colour and nothing else.
- A chosen syllabus point shows its statement alone (`renderSelected`), since
  the question step directly below counts its own questions, and ends in an
  ellipsis instead of running under the chevron on a phone.

**The folded bar** — from `sm` up, crumbs shrink to fit (each truncated with
its full name in the title, the deepest giving way last) instead of scrolling;
on a phone they keep their width and scroll to the deepest, as before. Either
way the path fades at whichever edge still overflows.

**Words** — "Collapse to breadcrumb" (the mechanism) is "Hide navigator";
the open step's "Syllabus Content" is "Syllabus point", as its caption and the
breadcrumb call it.

**Checked:** `npm run test:all` (new `navigatorPolish.test.tsx`, additions to
`levelColors.test.ts`, one updated assertion in `syllabusYear.test.tsx`);
Chromium e2e for workspace chrome, light theme, accessibility, verb ribbon and
no-clipped-text (22 of 22); screenshots of every step, open and closed, in both
themes at 1280px and at 390px.

## PR #278 — Tell a student the length the marker expects, and find the words they wrote

The brief: find bugs and refinements in the writing prompt, the writing area
and the live stats, which work together.

**Bug — the live word guide contradicted the marker.** The guide under the
draft took its length from the question's band ceiling
(`BAND_METRICS[band].min × marks`), and a command verb caps the band. A 4-mark
DESCRIBE (Band 2 at most) was therefore "about 32 words", while the marking
prompt told the AI a full-mark answer to the same question runs 80-120, and the
sample-answer generator was told the same. A student following the guide wrote
a third of what the marker was looking for. `getFullMarkWordRange` in
`data/commandTerms.ts` is now the one length: `getStructureGuide` builds its
"(Approx a-b words)" from it, and `useWritingMetrics` reads it. The length
messages say "full-mark length" instead of "Band 2 length".

**Bug — a term written as a gerund missed the student's own word.** The
matcher turned the syllabus term "unwinding" into "unwind" and stopped there,
so "helicase unwinds the helix" was told to "weave in unwinding". The stem of
an -ing or -ed term is now inflected in turn ("unwinds", "tested" → "tests",
"computing" → "computes"), still refusing look-alikes ("wound", "window").

**Refinement — "Ready to submit" agrees with the draft check.** Length is 35%
of the readiness score, so a draft twelve words short could read "Ready to
submit" beside a check asking for twelve more words. The top label now waits
for the length and for every term the question names; the score is unchanged.
The boundary test that pinned "89 → Ready to submit" with a short draft now
pins it with a full-length one, and two new cases pin the gate.

**Smaller fixes**

- The Evaluate button's shortcut chip always read ⌘↵ — a Mac key on the
  Windows and ChromeOS machines most NSW schools issue — at 9px. It now reads
  Ctrl ↵ or ⌘ ↵ for the platform, at 10px, and the title names the right key.
- The target pill read "Band 2 Target · Limited", which put the band's
  descriptor next to "target" as though the goal were limited, and wrapped at
  1280px. It reads "Band 2 target" on one line; the descriptor is in the title.
- A student whose question enrichment failed saw "Context Enrichment Failed:
  AI Service Unavailable after 16s: Server is missing GEMINI_API_KEY
  configuration." They are now told they can still write and be marked;
  curators still see the cause.
- "No specific outcomes linked." was cut to "No specific outcomes link…" in the
  prompt card's footer at every desktop width; "No outcomes linked" fits.

**Looked at and left** — the timer (counts up, pauses after three idle
minutes, restores per question, does not charge for reading a restored draft)
and the automatic question enrichment (one call when a question without a
scenario opens, not on typing) both behave as their comments say.

**Checked:** `npm run test:all` (new `writingSurfaceFixes.test.ts`, updated
readiness, editor and outcome-chip assertions); Chromium e2e for the evaluation
flow, workspace chrome, light theme, accessibility and no-clipped-text (26 of
26); screenshots before and after with a typed response and the draft check
open, both themes, 1280px and 390px.

## PR #279 — Show each question's own ceiling on the grade ladder, and give exemplars a length

The brief: the sample answers and the marking placards (Grade Standards and the
Marking Guide in the reference rail).

**Grade Standards showed six equal rungs.** A command verb caps the band a
question can reach — a DESCRIBE question tops out at Band 2 — but the panel
listed all six NESA band descriptors in full colour, Band 6 first. A student on
a DESCRIBE question read four descriptors they could not earn before reaching
their own. The ladder stays whole (seeing the rungs above is how a student
learns what the verb holds back), but:

- rungs above the question's ceiling lose their tinted fill and say "Beyond
  what a describe question can reach" — the fill, not the ink, so the text
  stays above AA in the light theme;
- the ceiling carries a "Top band for this question" badge and a ring;
- the panel's subtitle says "This question reaches Band N" while it is shut.

**Bug — Grade Standards was missing on most topics.** The panel rendered
only when the topic carried its own band descriptors, and only the three
seeded demo topics did. On any topic imported or loaded from the shared
library it was simply absent (reported from the live site on a phone). It now
falls back to NESA's general band descriptors
(`NESA_PERFORMANCE_BAND_DESCRIPTORS`), which were already in the app.

**The Marking Guide's subtitle said "Top level: Band 2" over an empty
panel**, as though a guide existed and topped out there. It now says "Not
written yet" until there is one, and "Written to Band N" once there is.

**Exemplars state their length.** The first thing a student does with an
exemplar is hold their draft against it, and the word guide under the draft
(PR #278) counts in words — so each exemplar's header now says how many words it
runs to, beside its mark. "4/4 Marks" became "4/4 marks", and the 9px "2/3"
position counter is 11px.

**Checked:** `npm run test:all` (new cases in `workspaceReferenceRail.test.tsx`
and `manyExemplarsAndQuestions.test.tsx`; one assertion reworded for the new
subtitle); screenshots of the ladder and the exemplar header in both themes at
1280px.

## PR #280 — Show the whole verb ladder at laptop width, and say what each rung allows

The brief: the command verb hierarchy ribbon.

**The top of the ladder was off-screen.** The six tier cards sat in a strip
that scrolled at every width. At 1280px — the width the page is mostly used at
— the fifth tier (Discuss, Assess & Justify) was cut in half and the sixth
(Evaluate, Synthesise & Create) was not on screen at all: the two rungs the
ladder exists to show a student they are climbing toward. From `xl` the strip
is a six-column grid (189px a column at 1216px of content, which holds the
longest chip, DIFFERENTIATE). The edge fades hide where nothing scrolls. In a
column that narrow the emoji beside the name left the name 90px and clipped
"REMEMBER" mid-letter, so from `xl` the emoji stands above the name, and the
headers share a floor so every subtitle starts on one line. Below `xl` the
strip scrolls and centres the current tier exactly as before.

**"Band 2" read as a target.** Each tier card showed "Band N" under its name,
with the word "ceiling" hidden for screen readers only — so the limit was the
meaning, and only listeners were told it. The cards now read "Up to Band N" to
everyone, and the hidden word is gone.

**Smaller fixes** — the detail tray's time read "4-7m" beside a "Marks"
figure, where "m" could be either; it reads "4–7 min", and every range in the
tray uses an en dash. On a phone the "Tier 2 · Define" chip broke after its
dot; it stays whole and the row wraps instead.

**Checked:** `npm run test:all` (updated accessible-name matches in
`verbRibbonChrome.test.tsx` and `commandVerbHierarchy.test.tsx`, and a new case
pinning the six-column layout); Chromium e2e for the verb ribbon, light theme,
no-clipped-text, workspace chrome and accessibility (22 of 22); screenshots at
1280px and 1440px in both themes and at 390px.
