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

## PR 4 — AI waits that draw the work, teach something, and tell the truth about time

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
