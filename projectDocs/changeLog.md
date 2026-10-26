# HSC AI Evaluator - Change Log

## [Unreleased] - 2026-10-26 (Generators calibrated against real HSC papers)

Evidence and rules in `docs/hsc-scenario-conventions.md`.

- **Changed.** The question generator, the manual-question refiner, the marking-guide writer and the sample-answer
  writer see real past HSC questions from the library (`utils/pastPaperCalibration.ts`): from the same course where
  it has any, nearest first (the same dot point, then the topic, then the course, by marks), and from other courses
  where it has none, with the brief limiting what may be taken from them to the craft (stem length, how a stimulus
  is set up and referred to, how the guide words each row), never the content. Paper variants of one question
  count once. The sample-answer writer is now shown the question's marking guide, and, for a full-mark answer,
  how long NESA's own samples at that mark run.
- **Changed.** Every generator that writes a scenario follows the conventions measured across 472 items of the
  2020–2025 papers (`utils/scenarioConventions.ts`): unlocated by default, Australia named only when the question is
  about Australia and then once, an Australian setting signalled by institutions and law rather than cliché (no
  kangaroos, outback, surf or "mate"), people as roles rather than a cast of names, short scenarios, invented
  businesses named only for an extended report, plus a per-course default. The old generators named Australia in
  more than half of Business Studies scenarios (a third in the papers), named thirteen cities where the papers name
  one, invented Geography place names and cast named characters in Legal Studies and Enterprise Computing.
- **Fixed.** The generator modal sent its scenario type as a bare id ("financial", "random"); the model now gets the
  words. The scenario regenerator was given the question alone; it now knows the course.

## [Unreleased] - 2026-10-25 (One band colour per question)

- **Fixed.** A 20-mark DISCUSS was drawn in two colours: the Writing Prompt in its verb tier's blue (Band 5), the
  Syllabus Terms, Marking Guide and Sample Answers in Band 6's purple. A question's band ceiling is its verb's tier
  again, everywhere, the cap the Writing Prompt shows (this withdraws the "extended response reaches Band 6" rule of
  2026-10-24; `projectDocs/calibration-pilot.md` §4).
- **Fixed.** On a guide written in mark ranges, an exemplar could read a band below the row it sits in (a 13/20 in the
  13–16 row, a 5/8 in the 5–6 row): rows were labelled by the band of their top mark, exemplars by their own. A ranged
  guide now gives one band per row, the ceiling at the top, and a mark takes the band of its row
  (`promptBandForMark`, `utils/guideBands.ts`), in the guide, the exemplars, the editors and the feedback. The app's
  own one-row-per-band rubrics read exactly as before. A 2.21.0 data migration and a one-off `schema.sql` step
  re-derive stored bands.
- **Changed.** The verb ribbon and the question picker's tier headings name the tier's band again.

## [Unreleased] - 2026-10-25 (Pastel syllabus-term chips)

- **Changed.** The Syllabus Terms pills are pastel tints of the question's band instead of a neutral pill that turned
  the band's full-strength solid once used. A key term is the band's tint with its `-800` ink from the start, so it
  reads as the question's own word before it is used, and deepens with a tick once the answer uses it. A supporting
  term is a step quieter: near-white with a faint band edge, taking a light tint once used. The ladder's gutters keep
  the band's solid, so the panel still reads as one ladder with the Marking Guide. Every ink clears 4.5:1 on its
  tint in both themes (`.term-pill-*` in `index.css`).

## [Unreleased] - 2026-10-24 (A calibration pilot against NESA-marked responses)

Method, results and recommendations in `projectDocs/calibration-pilot.md`.

- **Fixed.** A question worth more marks than its verb's usual range was held to the length for the top of that
  range. A 20-mark DISCUSS expected 2,250–3,000 characters; NESA's Band 5/6 responses to 2012 Business Studies
  Question 26 run to about 4,400. The live guide told a Band 6-length draft to tighten up, and the rewrite of a strong
  answer was capped below the answer's own length. The range now scales with the marks (4,500–6,000 for a 20-mark
  DISCUSS), as the time and word guides already did.
- **Fixed.** The marker brief stated the verb's unscaled length and time ("1,500–3,000 characters", "9–18 minutes")
  for a 20-mark question. It now states the question's own, and says that length alone earns nothing.
- **Changed.** An extended response (15 marks or more) reaches Band 6 whatever its verb. A 20-mark DISCUSS or ASSESS
  was capped at Band 5, so a perfect answer read "Band 5", while NESA publishes responses to these questions as Band
  5/6 standard. Band 6 is now 17–20 over 20 marks, the top range of NESA's guidelines. Shipped exemplars carry their
  re-derived band; a 2.20.0 data migration and a one-off schema step bring stored ones into line.
- **Changed.** The marker marks a range-based rubric by best fit, as NESA markers do, rather than deducting for each
  flaw.

## [Unreleased] - 2026-10-24 (What the AI costs, and limits that cover it)

Researched and calculated in `projectDocs/cost-model.md`, with the arithmetic in `scripts/costModel.mjs`.

- **Security, cost.** The AI proxy forwarded whatever model, prompt size and output limit the browser sent, and
  metered each call as one unit. It now forwards only the app's own models (refusing any other, or none, before
  anything is spent) and holds a student's call to the sizes the app builds: a prompt of up to 80,000 characters,
  16,384 output tokens and a 4,096-token thinking budget. Teachers and admins keep larger calls. A caller with their
  own key is exempt.
- **Changed.** The free plan's daily markings go from 5 to 3, and the student and teacher AI allowances from 60 and
  400 calls a day to 30 and 200. A marking costs about A$0.07, so five a day let one free account cost more than any
  plan earns. A one-off schema step moves existing databases still at the old defaults, and never runs twice.
- **Changed.** A free-tier marking no longer asks the model for the rewritten answer, which the server already
  strips from a free result. About 9% cheaper, and nothing the student sees changes.
- **Added.** `FREE_TIER_MARKING_MODEL` marks the free tier on a cheaper Gemini model (a quarter of the cost on Gemini
  3 Flash). Off unless set; the cost-model doc says how to test it first.
- **Fixed.** The registry offered `gemini-3.7-flash`, which Google has never released, and used it as the overload
  fallback, so that fallback always failed. It is `gemini-3.8-flash` now. Gemini 3 Flash's cost estimate was five
  times too low.
- **Changed.** Prices: Plus A$12.99 a month or A$99 a year (were A$7.99 and A$59), School A$15 per student a year (was
  A$4). These are the app's fallback prices; the charge is the Stripe Price, so new Prices must be created in Stripe
  and their IDs set (cost-model.md §6).
- **Changed.** Paid plans' daily AI allowance is 150 calls (was 300). That is still about thirty marking sessions a
  day. Pinned to the schema by a test, as the student allowance now is too.

## [Unreleased] - 2026-10-24 (A route to Plus from the header)

- **Added.** `Get Plus` on the header rail for a free student or a guest, wherever a Plus price is on sale. It is
  the crown alone on a phone, with the full sentence as its accessible name. Nobody else sees it: a teacher, an
  admin, a parent and anyone on a paid plan have nothing to buy there. Measured at 320px to 1440px for a
  student, a teacher and an admin: the bar stays 64px and nothing leaves the screen. axe finds nothing in either
  theme.
- **Changed.** Asked about the plan rather than about one locked control (the header, the plan comparison's
  button, the profile's plan card), the upgrade prompt leads with "What Band 6 Plus adds" rather than the
  headline of one feature. Once today's free markings are spent, the header opens it on the daily limit.
- **Fixed.** The note a teacher copies for their administrator named the product "HSC Writing Master" (the
  repository's name), not "Band 6 — HSC Writing Coach", and always priced the seat "a year".

## [Unreleased] - 2026-10-24 (Plans and prices, said plainly to each role)

- **Fixed.** The yearly saving line ("Save 38%") was typed by hand and went stale when a price changed. It is
  now worked out from the two Plus prices on screen, rounded down so it never overstates the saving, and left
  out when the yearly price saves nothing or the two prices disagree about GST. `VITE_PLUS_YEARLY_NOTE` still
  replaces it while the env prices are shown.
- **Fixed.** A parent buying Plus for a child where only one billing period is on sale saw no price before the
  button. The price is stated, and the line under the button names the amount charged.
- **Added.** The School seat picker shows the total for the seats chosen ("A$120 a year for 30 seats"), and a
  seat price Stripe charges monthly is described as monthly rather than "a year".
- **Changed.** A free student's plan card states the free plan in figures (marked answers a day, the feedback,
  question tiers and sample-answer bands, and when the count resets) instead of "limited daily evaluations".
  Staff are told whether class and school reports are included or come with a School licence.
- **Changed.** The upgrade prompt tells a student that a parent or guardian can pay instead, and where to create
  the link code.
- **Changed.** For a parent, the plan comparison marks no column as theirs, Plus is "For one student", the
  payment row says a parent can pay, and a line explains that Plus is bought for a child from the dashboard.
  "Compare plans" in a parent's profile no longer says "You are on Free".
- **Changed.** The past-due banner for a School licence asks for the overdue invoice or the card, since a
  licence may be invoiced against a purchase order, and its button opens the billing portal.

## [Unreleased] - 2026-10-24 (Deleting an account ends its billing)

Deleting an account removed the database rows but never reached Stripe, which parent/guardian billing (schema
§31) made unsafe.

- **Fixed.** Deleting an account first cancels, in Stripe, every subscription the user holds or pays for
  (`POST /api/prepare-account-deletion`). A parent's deletion ends the plan they pay for and the child drops to
  free at once, rather than the child's plan going on charging a deleted parent with no portal to cancel it
  from. A child's deletion ends the plan the parent pays for, rather than the parent paying for an account that
  is gone with no row on their dashboard. A plan already set to end is ended too. If the cancellation fails,
  nothing is deleted.
- **Changed.** A teacher who bought their school's licence is told to set it to end, or ask for it to be moved,
  before deleting their account. Nothing is cancelled in that case; a licence already set to end runs out for
  the school as before.
- **Fixed.** A Stripe event for a subscription whose holder's account has been deleted is acknowledged and left,
  instead of failing the foreign key and answering 500 to every retry. When only the paying parent is gone, the
  child's row is still kept up to date, with no payer named.
- **Changed.** The delete confirmation says that plans are cancelled straight away with no refund.

## [Unreleased] - 2026-10-19 (Focus areas read the way NESA writes them, and stay visible in the light theme)

From a teacher's review of the navigator's focus areas on the new courses, then an audit of all 3,232 shipped
dot points.

- **Fixed.** A chosen focus area was white text on the light theme's white list and picker, so it vanished
  once selected. It takes the theme's text colour.
- **Fixed.** "Aboriginal and Torres Strait Islander Peoples" became two focus areas: the parser split every
  list on every "and". Only the last "and" of a list joins two items now, and a few phrases NESA always names
  together are held as one.
- **Fixed.** NESA's bracketed sub-points are split on their semicolons only, so a sub-point that is a question
  with commas in it stays whole ("what are the major causes of morbidity and mortality, and the life
  expectancy for males, females and the general population?"). A nested bracket is one group, so "(Infrastructure
  as a Service (IaaS); Software as a Service (SaaS))" is not cut at "(IaaS)"; "(UI)", "(G1)" and "option(s)"
  are no longer offered as focus areas.
- **Added.** A series written without "including" becomes focus areas: "Select qualitative and quantitative
  information from texts, diagrams, flow charts, tables, databases, graphs and multimedia resources" gives
  seven. Mid-sentence series are read too ("the movement of glucose, oxygen, carbon dioxide, salts and wastes
  across membranes…"), shared adjectives take their noun ("hypertonic, hypotonic and isotonic solutions"), and
  a semicolon list after a colon is read ("…using criteria. These include: a; b; c"). Only verb-led statements
  are searched for an unmarked series: content written as a noun phrase gave items such as "the concepts of
  Ma'at" and "Isfet", and is left alone.
- **Changed.** A dot point whose list is its focus areas is labelled by its statement: the bracket of
  sub-points, the list after a colon, or a series that ends it ("Select qualitative and quantitative
  information from …") is left to the focus areas instead of being read twice. A series mid-sentence keeps the
  full wording. The description itself is unchanged, so questions and the AI still see all of it.
- **Audit.** Across the shipped courses 150 dot points gain focus areas, and 38 lose one that was never a
  focus area: an abbreviation ("(WTO)", "(ICIP)") or a ratio formula in brackets. A teacher can still set a dot point's focus areas by hand.

## [Unreleased] - 2026-10-19 (Adding a sub-topic makes no AI call unless asked, and the new import read in a browser)

- **Fixed.** "Generate dot points with AI" on Add sub-topic was ticked by default, so a curator who only wanted
  a heading got dot points invented for it. With no AI available the call failed silently after three retries,
  each counted against the circuit breaker (four such sub-topics in a minute blocked every AI feature for two
  minutes). The box is unticked by default, and a failure now says the sub-topic was added without dot points.
  Real dot points go in with "Add dot points".
- **Fixed.** From a visual check of the new tools at 1280px and 390px: "Add more from this syllabus" offered
  only the page's own year (the page lists one year; the syllabus record, now read too, lists both); reading
  NESA pages showed "Working with Gemini" though no AI was asked (`LoadingIndicator` takes `noAi`); "10
  outcomes found" beside an empty paste box now says "from NESA"; a focus area with no content statements
  (HMS Collaborative Investigation) is reported as that rather than as NESA withholding it; preview dot points
  grow to their text (one clipped row showed a few words on a phone); Create a course's faculty guess fits a
  phone's select and its paste note scrolls into view.

## [Unreleased] - 2026-10-19 (The course and topic tools read NESA exactly, and need no AI to set up a course)

A review of the admin tools for creating courses and topics, made after building eleven courses from NESA's
syllabuses by hand. The lesson of that work was that NESA's curriculum site carries every syllabus as data
(each page embeds its CMS record), so the exact wording is there to be read; the tools threw it away and
asked an AI to retype it.

- **Changed. Syllabus URLs are read exactly.** The page reader (`/api/fetch-url`) stripped every `<script>`
  before reading a page, which removed the one block holding the syllabus, and passed the leftover text to an
  AI that paraphrased dot points, dropped their "including" sub-points and cost a paid call. A
  curriculum.nsw.edu.au page is now parsed from its own data (`api/_lib/nesaCurriculum.ts`, a port of the
  seed tooling): focus area, year, outcomes, content groups, statements with their sub-points, electives,
  equations flattened to text (C₆H₁₂O₆), and the syllabus's other focus areas. A syllabus's home page works
  too: the reader follows it to its first focus area. NESA's pages under www.nsw.gov.au/education-and-training/nesa
  are accepted (only that section of the site).
- **Changed. Import a syllabus.** Fetching a curriculum page fills the course name, the year and the outcomes,
  and shows the focus area under "Read from NESA — exact wording, no AI", with a checklist of the rest of the
  syllabus ("Elective focus areas · 11 options" ticks all of them). "Add selected" reads them one at a time,
  names any that fail and keeps the rest; "Review import" goes straight to the editable preview, with a year
  badge per topic, and each topic is filed in its own year. No AI call is made for any of it. Pasted text
  still goes through the AI as before. "Add a topic" reads a NESA page the same way, and warns when the page
  is from the other year.
- **Added. Outcomes from a list, with no AI.** Pasted lines that start with an outcome code (HM-12-01,
  BI-11WS-03, BIO12-12, P1, H10) are read as they stand and filed by the year the code names; only text with
  no codes goes to the AI. This works in the Outcomes editor (now "Read outcomes") and in Create a course,
  which gains "Paste a list of outcomes" and a hint, with a button, when a row's code names the other year.
  A fetched curriculum page fills the Outcomes editor from its own outcomes. None of these needs a paid plan.
- **Added. Dot points by hand.** A curator could put dot points under a sub-topic only by asking an AI to
  invent them. "Add dot points" opens on "Type or paste": one per line, bullets and numbering stripped, lines
  already in the sub-topic skipped, a live preview, no AI and no plan gate. "Suggest with AI" is the old path.
- **Added. A faculty for a new course.** Create a course stored no faculty, so the navigator guessed from the
  name each time. It shows its guess ("From the name: Personal Development, Health and Physical Education")
  and stores it, or the faculty chosen instead.
- **Fixed.** The shipped-course sync added back, at every library version, any shipped course a teacher had
  unticked in the first-run picker or deleted. The browser now records the courses it has been offered and
  the sync adds only new ones.
- **Changed.** The six structure-only courses are listed but not pre-ticked in the first-run picker, which had
  grown to sixteen ticked rows. The URL boxes suggest a curriculum.nsw.edu.au address (educationstandards.nsw.edu.au
  only redirects now) and lose their "experimental" tag.

## [Unreleased] - 2026-10-19 (The rest of five syllabuses, and topics that match within their own year)

Five shipped courses had questions for one slice of their syllabus and nothing for the rest: Modern History
and Ancient History carried one option of each section and (Modern) no Year 11, and Legal Studies,
Economics and English Advanced had no Year 11. The rest of each syllabus is now there as structure, read
from NESA's page data like the new courses, with no questions. Nothing that was there has changed: every
existing topic, question and outcome is identical, and the new topics are added around them.

| Course           | Topics | Dot points | Outcomes | Added                                                                                     |
| ---------------- | ------ | ---------- | -------- | ----------------------------------------------------------------------------------------- |
| Modern History   | 4 → 49 | 48 → 510   | 7 → 15   | Year 11 (all of it), every national study, peace and conflict and change option           |
| Ancient History  | 4 → 54 | 74 → 698   | 15       | Year 11 case studies and nature of ancient history; every society, personality and period |
| Legal Studies    | 7 → 14 | 157 → 290  | 8 → 16   | Year 11, and Legal themes and skills in both years                                        |
| Economics        | 3 → 9  | 131 → 265  | 10 → 20  | Year 11                                                                                   |
| English Advanced | 4 → 7  | 37 → 64    | 6 → 12   | Year 11                                                                                   |

- **Fixed.** A topic name used in both years ("Close study of text", "Working scientifically") could merge
  into the wrong year. The course import matched names within a year; the topic import, its preview, the
  orphan check and the placement step matched names alone, so the preview could promise a merge into the
  Year 12 topic that the import then did not make. They all match by id, then by name within the same year
  (`findMatchingTopic`), and a placement into a Year 11 topic keeps its year.
- **Fixed.** Five Geography inquiry-skills dot points carried raw line breaks from the syllabus document
  ("…by:\n\n\n collecting…"). They read as one line, the list joined with semicolons, NESA's words unchanged.
- **Library version 2.19.0**, so returning browsers pick up the added topics.

## [Unreleased] - 2026-10-19 (Six more courses, structure only, from NESA's current syllabuses)

The next round of seeded courses, picked for how well they suit written, verb-marked answers and how many
students sit them. Each is the syllabus NESA currently publishes on the curriculum site, read from the page
data rather than a summary, and ships its topics, sub-topics, dot points and outcomes with **no questions**:
a teacher fills a dot point with Starter questions or writes their own.

| Course                      | Syllabus (NESA)       | First HSC | Topics (Y11 + Y12) | Dot points | Outcomes |
| --------------------------- | --------------------- | --------- | ------------------ | ---------- | -------- |
| Health and Movement Science | 2023 (replaces PDHPE) | 2026      | 2 + 2              | 69         | 20       |
| Biology                     | 2025                  | 2028      | 4 + 5              | 272        | 21       |
| English Studies             | 2024                  | 2027      | 12 + 13            | 228        | 10       |
| English EAL/D               | 2024                  | 2027      | 3 + 4              | 62         | 12       |
| English Extension 1         | 2024                  | 2027      | 1 + 1              | 26         | 12       |
| History Extension           | 2024                  | 2027      | 0 + 23             | 84         | 4        |

- **Added.** English Studies' elective focus areas (11 per year) and History Extension's 22 case studies are
  topics; English Extension 1's five Literary worlds electives are sub-topics. Left out on purpose: HMS's
  Collaborative Investigation (no content statements), English Extension 2 (a major work, not an exam), and
  History Extension's History project (project rules rather than content); its outcome HX-12-03 is kept.
  Biology follows the 2025 syllabus, as Legal Studies and Economics follow theirs: students now in Year 11 sit
  the 2017 syllabus.
- **Fixed.** "Health and Movement Science" was filed under Science: the faculty guess checked "science"
  before "health". Community and Family Studies, Aboriginal Studies and Dance are recognised too.
- **Fixed.** The shipped-course sync was gated on its own version literal, which had to be bumped by hand
  beside `DATA_VERSION`; a bump that missed it would ship courses no returning browser received. It is gated
  on `DATA_VERSION` now (2.18.0).
- **Tools.** `fetch_nesa.py` finds options-list focus areas and electives, and flattens statements whose text
  is an equation (three Biology statements came out blank). New `build_structure.py` builds a
  structure-only course from a config; the six configs are in `.claude/skills/build-course-data/configs/`.

## [Unreleased] - 2026-10-18 (The rest of the navigator redesign, #151)

- **Fixed.** The syllabus navigator is a `<nav>` landmark ("Syllabus navigator"), so a screen reader can reach it from its landmark list beside the breadcrumb. The question picker's tier runs are named groups that own their questions; their headings were `role="presentation"`, so a screen reader heard twenty questions and none of the six kinds they are sorted into. These were the two parts of #151 (August) still missing from main: that branch's history is unrelated to main's and its navigator predates about 250 PRs, and the rest of it (the cascade notice, the picker's focus return and level names, the fold's focus hand-off, the focus trap's `preventScroll`, the navigator contrast checks) had landed by other routes (#417).

## [Unreleased] - 2026-10-18 (Round four: the purple and the gradients, the cards on a laptop, and the round-three follow-ups)

- **Changed.** The decoration that read as generated rather than designed is gone from the onboarding, the navigator, the data vault and the paywall. The quick start and the user agreement opened on an indigo-to-sky gradient band with a blurred white blob; their headers are the dialog's own surface with a hairline under it, and the text is the normal text colours in both themes. Primary actions are solid indigo (the navigator's Generate and its inline topic button were a gradient and a purple fill), "Manual" is a neutral secondary called "Write a question", and the paywall's buttons and header are solid amber rather than amber-to-orange. Hover lifts (`hover:scale-105` and its kin), coloured glow shadows, the loading overlay's pulsing halo and the brand-gradient progress fills went with them. Band and verb gradients, which say which band something is, stay (#416).
- **Changed.** Sign-in sits on the app's own background. It laid a second, heavier sky over it: an indigo-and-violet wash, two more drifting orbs, a 44px grid masked to the centre and a vignette, the stock backdrop of a generated landing page. What it adds now is the ruling of an HSC writing booklet, faint horizontal lines every 32px. The sign-in button and the fields lost their coloured glows (focus is the indigo border), the AI wait card its frosted blur and the accent spotlight behind it, and an error in the question writer its pulsing dot (#416).
- **Fixed.** The workspace cards' height cap left 180px for what sits above them, from before the verb ribbon was there. The cards start 273px down, so the pair ran about 90px past the bottom of the window and took the Evaluate button with it; on a laptop-height window even a short question did. The reserve is 296px, and an e2e checks both cards end on screen at 1440x760 (#416).
- **Fixed.** In dark mode the staff dashboards' hovers, and a dozen others, painted solid white: `--color-border-secondary` is pure white there and is meant to be used with an alpha. They are `white/10`, as are the dashboards' bare borders and the sparkline baselines. The seven dashboard shells take the `rounded-surface` radius token, "Data Vault (Import/Export/Reorder)" is "Data vault (import, export, reorder)", and the placement table's empty pickers say "Choose a topic first" and "Choose a sub-topic first" instead of a dash (#416).
- **Fixed.** "The upgrade prompt closes from its X" failed about one run in six under load: it sent the upgrade request once, and a request sent before the app is listening is lost. It resends until the prompt is up (#416).

## [Unreleased] - 2026-10-18 (Round three: after sign-in, the staff dashboards, and the workspace cards on a window drag)

- **Fixed.** Dragging the window's bottom edge shuddered the question and writing cards once they reached the bottom of the window. Their height cap came from the window through a resize listener and an effect, two renders after the resize, so each step of the drag painted the pair at the previous step's height before correcting it (measured: every 4px step below the cap, two frames stale). The cap is CSS now (`cappedCardHeight`: the question's height, clamped by `100vh`), so the first layout after a resize is the final one (#415).
- **Fixed.** Importing from the first-run syllabus picker could say "Import sequence failed" while the syllabuses were being added behind it. `importDiscoveredDocs` counted what it added inside a state updater and read the count on the next line; with another courses update queued, React ran the updater later and the count read 0. It is counted before the update now (#413).
- **Changed.** The "Signed in as …" toast is gone from sign-in and the SSO return: it sat over the title and close of the agreement, the quick start and the syllabus picker on a phone, saying what the screen already showed. The agreement's buttons lose their trailing arrows, and the syllabus picker has the quiet tile in place of a gradient one with a hover glow, capped in `dvh` so a phone's browser bars do not cut off its foot (#413).
- **Changed.** The seven staff dashboards (AI usage, student progress, class insights, review queue, billing overview, database health, runtime AI keys) keep their hue as a quiet tinted tile (`toolIconTile` in `utils/adminChrome.ts`) in place of a gradient one, take a 44px close, wrap their header on a phone (the usage title was squeezed to about 80px at 375px) and have sentence-case titles. The syllabus navigator's placeholders and titles are sentence case too ("Select course…") (#414).

## [Unreleased] - 2026-10-18 (Round two: the rest of the authoring dialogs, data waits, the quick start guide)

- **Changed.** The rest of the authoring dialogs share the creator chrome from #409: import a syllabus, add a topic, import a topic (.json), edit outcomes, write starter questions, generate, edit and recalibrate sample answers, focus areas, rename, request a course and quality check. Each lost its gradient Sparkles tile and hand-drawn mesh, took a kicker naming where the thing goes and sentence-case copy, and its AI wait steps now describe what its prompt really asks for. The sample answer generator keeps its target band's colour, which carries meaning; the focus area editor keeps the emerald focus areas wear everywhere else (#412).
- **Fixed.** A creator dialog's footer put the primary action at the TOP of a phone's stack (`flex-col-reverse` over Cancel-then-primary source order), the opposite of what its own comment promised; it is at the bottom, under the thumb. The admin API usage pill sat over every dialog (z 500) and covered that primary button on a phone; it is now under dialogs (`z-usage-pill`, 90) (#412).
- **Fixed.** A dialog that opens straight into an AI wait with its close disabled (the quality check) put focus on the wait card's chart source link, scrolling the body past its title on a phone. A dialog's opening focus now skips anything inside a wait card (#412).
- **Changed.** A local data read in the admin tools (usage, class insights, the review queue, student progress, the database dashboard) shows `DataLoading`, the band ladder and one line after 250ms, instead of the AI wait card titled "Working on it" with steps such as "Formatting JSON". Every spinning icon is `aria-hidden`, and an icon-only control that spins keeps its name and says `aria-busy` (#411).
- **Fixed.** The quick start guide described five things the app does not do: a live band estimate (the readiness meter is deliberately not one), marker notes on the workspace and on generated questions, verb and connector checks in Draft check, an upgrade one band higher (one step since #405), and a Command Term Guide button (it is the command verb). Marking takes under a minute, not a few seconds (#410).
- **Changed.** `accentFillContrast.test.tsx` no longer guards its matchers with a count of real offenders (more than 10), which the conversions above took to 6, a better codebase failing its own guard. It pins each matcher to the spellings it must catch and must leave alone (#412).

## [Unreleased] - 2026-10-18 (Sign-in, the AI waits, and the course and question creators)

- **Changed.** The AI wait card sizes itself to the box it covers. `AiBusyOverlay` and `GlobalLoadingOverlay` are size containers (`.ai-wait-stage`), and the card drops the 2025 results chart (below 44rem), the margin note and engine line (34rem), the step timeline for a one-line current step with a smaller drawing (26rem), the clock (18rem) and the drawing (13rem); below 8rem it is a strip, title and bar. It was a fixed ~600px card, so over a small dialog such as the dot point generator (about 300px) its top and bottom were cut off. The marking wait follows the same tiers (#407).
- **Changed.** A saved session opens on the band ladder, its rungs dipping in turn, instead of a blank page (`BootSplash`). It shows after 400ms, so a fast restore looks as it did (#407).
- **Fixed.** Regenerating a scenario raised the whole-screen wait ("Modelling environment...") over the question card's own, two waits for one action. The scenario is out of the global overlay, and its in-card wait is the shared card rather than a bare spinner (#407).
- **Fixed.** "Continue as guest" spun the Sign in button, because one flag covered both. Each sign-in action has its own busy state, and a busy button says what it is doing ("Signing in…") rather than showing a spinner alone (#408).
- **Added.** Password fields have a show/hide toggle (one name, its state in `aria-pressed`) and say when Caps Lock is on. The sign-in card is 24px a side on a phone, from 40px, and "Set password" lost its trailing arrow (#408).
- **Changed.** The five content creators (create a course, add a sub-topic, generate dot points, generate a question, write a question) share one shell and header (`utils/creatorChrome.ts`, after `FlagContentModal`): a quiet icon tile in place of the gradient Sparkles tiles, a line naming where the thing goes, sentence-case copy, padding that steps down on a phone, and one primary action (#409). "AI Assistant", "Configuration Valid", "Synthesis Target" and "Processing Level" are gone; the wait steps say what the AI is actually asked to do, not "Calibrating Band 6 sample output…".
- **Fixed.** The question generator's mark slider had no name and no visible focus; its tier, band, scenario and verb options are toggle buttons with `aria-pressed`; and four of its seven scenario types were hidden in a 140px scroll box. The sub-topic creator's AI option no longer toggles twice through its wrapper's click. A course outcome's description takes the row's full width on a phone (about 190px wide before) (#409).
- **Fixed.** The syllabus navigator's icon-only buttons were named by their hidden label, so "Add Course" and "Add Sub-Topic" were both "Add" to a screen reader below `2xl`. The title is now the name whenever it contains the label (#409).
- **Changed.** 78 three-dot ellipses in interface copy are the single character, and the Title Case busy labels beside them are sentence case (#409).

## [Unreleased] - 2026-10-18 (The writing cards: question and response headers, the response footer, the ladder gutter, the rewrite step and outcome links)

- **Changed.** On a phone each writing card's header is a title line with plain 44px icons beside or under it (Writing Prompt 116px, Written Response 112px, from about 136px). The context scenario drops its inset box and quote gutter below `sm` and keeps a thin left rule, so it runs 312px wide at 390px, from 222px. The question and scenario are capped at 70ch at every width, so Focus Mode no longer sets them 130 characters a line (#396, restored by #400).
- **Changed.** The response footer is one row from `lg` (words, Saved, target, free count, readiness, Evaluate) and two rows below it, where it took three on a phone. #398 also capped the writing surface's line at 55ch (about 75 letters); on a wide desktop and in Focus Mode that left a third of the card empty, and #404 took the cap off, so the text runs the card's full width again. Every "How to answer" step is one size, and the Focus Mode pill is a row above the cards rather than an overlay over the question (#398).
- **Changed.** The focus picker states its count ("2 focus areas") as a chosen value, not in placeholder ink (`Combobox`'s new `summary`). The Focus mode toggle keeps one name, "Focus mode", with its state in `aria-pressed`, so Focus Mode has a single "Exit focus mode" button (#397, #399).
- **Changed.** A ladder gutter stacks the total under the mark ("11–12", then "/12", then "Band 6"), so the mark keeps its size: on one line "11–12/12" was set at 12px to fit a phone's 56px gutter. A row's edge is drawn inside the row (`.ladder-ring`), under its solid gutter, so a gutter no longer wears a pale band ring at the row's corners; an open exemplar on a phone shows its band as a 4px left edge that follows the corners, where a 4px strip was clipped short of them (#401).
- **Changed.** "Improve your answer" and the marker's rewrite lift a response by ONE step: the next band where it starts within two marks (every step on a question of 12 marks or fewer), otherwise one mark, including in the ceiling band (`getNextLevelTarget`, `MAX_BAND_STEP_MARKS`). It was the first mark of the next band, and full marks from the ceiling band, so long questions jumped: 7/20 to 11/20, 0/25 to 5/25, 17/20 to 20/20. The marker is now sent the exact target for every mark it could award rather than a band ladder, and both rewrite briefs insist the student's own words stay in it, however weak the answer, and that nothing is borrowed from the benchmark samples (#405).
- **Changed.** A question links the outcome it most directly assesses, and a second only when it genuinely assesses two (`MAX_LINKED_OUTCOMES`, `OUTCOME_LINK_RULE`, `capOutcomeLinks` in `utils/outcomeCodes.ts`). The 62 shipped questions that linked three to five were trimmed to one (42) or two (20) from their own codes; the AI auto-link, the background enrichment, the question refiner and the batch generator are told the rule and held to it; and the question card shows two chips at most, in the question's own order. The chips sit on the "Read before you write" line where the footer has the width, and drop to a line of their own where it does not, by a container query on the footer (#406).
- **Fixed.** On a phone the question header's verb chip and its marks/band bar could overlap ("IDENTIFY" at 320px; "CRITICALLY EVALUATE" beside "12 Marks | Band 6" at 390px). Below `sm` the marks and band are chips on the verb's own line, which wraps. The response card's "How to answer" is icon-only below 375px, where "IDENTIFY" ran under it. A workspace-chrome test now checks those lines at 320, 360 and 390px (#402).
- **Fixed.** Merging #397 put back the pre-#396 `PromptDisplay`, `Editor` and `cardChrome`, undoing #396's phone headers and scenario without a conflict; #400 restored them. Every squash since #384 was then checked for added lines missing from `main`, and none other was lost.
- **Changed.** Icon-only panel tools (the guide's edit, the terms' add, AI and refresh, the samples' recalibrate) are 30px tall from `sm`, the height of the pill tools beside them, and stay 44px on a phone. A ladder row's phone inset is 8px, from 6px, and the admin API monitor is a 44px bolt button on a phone that no longer sits over the panels (#397).

## [Unreleased] - 2026-10-17 (Syllabus navigator, and one ladder for syllabus terms, the marking guide and sample answers)

- **Changed.** On a phone, a teacher's navigator hides its per-level edit buttons behind one "Edit syllabus" toggle beside "Hide navigator" (about 830px of buttons before); students see no change. Closed pickers drop their counts and Ready chips below `sm`, so a topic's name is no longer cut to "Core study:…" (#392).
- **Changed.** On a desktop every picker ends at one right edge: each level's buttons sit in a column sized to the widest group the signed-in role sees, and button labels show from `2xl`. The collapsed bar's ancestor crumbs keep 8.5rem from `lg`, so the path reads in full (#392).
- **Changed.** "Active Focus" / "Refine Scope..." is now "Focus" / "All of this syllabus point", and action buttons are 44px on a phone with an accessible name (#392).
- **Changed.** The sample answers panel is redesigned for a phone. The toolbar is one slim row of icons, a closed row keeps a 56px gutter, and an open row is full-bleed: a 4px band strip, a one-line header ("3/3 · Band 2 · 77 words") that is the disclosure, a small "Criterion" link, and icon-only actions. The answer runs 310px wide at 390px, about 37 characters a line where it was about 20 (#393).
- **Changed.** The marking guide and syllabus terms mirror the sample answers ladder: the same phone inset, 56px gutter and icon toolbar (a guide criterion is 270px wide at 390px, from about 210px); one link style, `LADDER_LINK`, for the guide's "Model answer" and the exemplar's "View marking criterion"; and one reading face, `LADDER_READING` (serif, 15px), for a criterion and an exemplar's preview. `LadderRowGutter`'s `phoneGutter` and `AccordionSection`'s `phoneFlush` are opt-in, so the feedback report is unchanged (#394).
- **Fixed.** The sample answer generator no longer wraps the verb in quotes ('DESCRIBE') and no longer clips its Expected Result card on a phone (#393).

## [Unreleased] - 2026-10-17 (The marked-response workflow: rewrite review, marking report and PDF)

- **Fixed.** The marker never said what it changed in the rewrite or why. `evaluateAnswer` asked for `revisedAnswer` as a plain string, so `keyChanges` never arrived: the review's "What changed and why", the report's "What changed" and the PDF's reasons were empty in production, and Regenerate wrote `keyChanges: []`. Marking now asks for `{ text, keyChanges }` (2–4 lines, each what changed and why it earns credit), and so does Regenerate (`improveAnswer`, with a plain-prose fallback for a provider that ignores the schema and a clear error for an unreadable object) (#385).
- **Fixed.** The rewrite's mark and band are worked out once (`rewriteTarget` in `components/feedback/rewriteText.ts`): the reported mark or `getNextLevelTarget`, and the band always from `getBandForMark`. The review header used the model's band unclamped (Band 3 on a DESCRIBE question capped at Band 2), and the saved exemplar would have taken an undefined mark from the object form (#385).
- **Fixed.** The review's "Edits marked" view drew line breaks inside a cut or added run's mark, leaving an empty struck bar, a stranded sentence and an empty green bar at the end of a paragraph. Runs are now cut at every break and only the words are marked (#388).
- **Changed.** The review numbers edits by phrase (`groupEdits` in `utils/textDiff.ts`): changes separated by a kept run of at most two words, with no sentence end or break, are one edit. A 106-word answer went from 16 edits to 11 (#388). On a phone the toolbar, description and footer note give their height back to the page, which grows from about 320px to about 450px (#390).
- **Fixed.** The marking report opened a blank band of up to ~450px under the score placard from `xl`, because its two auto rows shared the reading column's height; the second row is now `1fr` (#384).
- **Changed.** The PDF prints the marker's reasons first under "Why these edits earn the mark", prints up to eight sentence pairs instead of five, and the PDF samples now use one-band edits with bands from the verb's tier, as the app does (#387).
- **Changed.** The marking wait shows the tip for the question's own command verb (`VERB_TIPS`, one per glossary verb) and never another verb's, and on a phone scrolls its loader clear of the sticky header (#386).
- **Changed.** The "Marking complete" and Regenerate "Auto-saved … exemplar" toasts are gone: each fired as a modal opened that already said so, and on a phone covered its header and close button. A saved rewrite's note in the sample library now states the lift and the marker's reasons instead of band boilerplate (#385, #389).

## [Unreleased] - 2026-10-16 (Focus Mode terms, the verb definition row and the prompt card's footer)

- **Fixed.** Focus Mode had no Syllabus terms. It showed the Marking guide and the Sample answers and left the terms out, so a student on a phone who folded the page away to write lost the list of terms the marker rewards. The panel is now `SyllabusTermsPanel`, shared by the reference column and Focus Mode, and sits ahead of the guide as it does in one column.
- **Changed.** The verb definition row above the writing area wears the tier: the verb ribbon's icon for the tier (now `utils/verbTierIcon.ts`, shared with the ribbon) in a tinted tile, a wash of the tier hue running in from a solid rule on the left (`.verb-brief`, firmer in the light theme), and a band-edged "How to answer" button. On a phone the meaning takes the full width under the verb and the button.
- **Changed.** The prompt card's footer is two rows. The actions row has "Read before you write", which takes the row's width, and the wand and flag as square tiles of the same height and edge. Below it the outcome chips sit in an even grid with the ladder gradient fill, so a set of codes fills each line edge to edge. It costs a question with an outcomes row about 33px of card height; the one-line-question ceiling in `workspace-chrome.spec.ts` moves from 520 to 600 to match.
- **Changed.** Focus Mode puts away the creation and curation tools for a teacher or admin as it does for a student: scenario generate and edit, the provenance editor, regenerate and suggest terms, editing the marking guide, and generate, recalibrate or load a sample answer. Permissions are unchanged; the panels are handed the student's role while Focus Mode is on (`panelRole` in `Workspace`).

## [Unreleased] - 2026-10-16 (A student's draft no longer stops a shipped course being refreshed)

- **Fixed.** A shipped course a student had started writing in was never updated. The "unedited copy" test fingerprints the whole course, and a draft (`userDraft`, with `draftElapsedSeconds`) is stored inside that course, so one draft made the copy look edited and the sync kept it as it was. Students who had written in Software Engineering or Enterprise Computing before the NESA rebuild (2.16.0) were left on the old courses. `hashCourse` now leaves those two fields out, and a course with no draft hashes exactly as before, so stored stamps stay valid.
- **Changed.** A refresh now carries each draft and its writing time onto the same question in the newer course (`carryPersonalFields`). If a draft sits on a question the newer course no longer has, the old copy is kept as "(before refresh)" beside the new one, so no words are lost. A copy a teacher has really edited is still kept as it is.
- **Note.** `DATA_VERSION` 2.17.0 and the sync gate move together, so a browser already at 2.16.0, including those that were skipped because of a draft, syncs again on its next load. A copy that is already current is left untouched. Tests in `tests/unit/shippedCourseMigration.test.ts`.

## [Unreleased] - 2026-10-15 (Monetisation follow-ups: forged webhooks, alerts, disputes, privacy, school portal, live prices, seat economics)

- **Fixed.** The Stripe webhook now refuses unsigned events on every deployment, not only production (#366). Before, a Vercel preview with no `STRIPE_WEBHOOK_SECRET` trusted the request body, so a forged `customer.subscription.updated` could grant a paid plan if the preview shared production data. `isDeployedRuntime()` (`VERCEL_ENV` set, or `NODE_ENV=production`) decides; `vercel dev` now needs a signing secret too. Check it on a real preview: an unsigned post should answer 500.
- **Added.** Operator alerts (#365). With `BILLING_ALERT_WEBHOOK_URL` set (Slack, Discord or Mattermost incoming webhook), a new invoice request, a new billing incident, a dispute and a full refund each send one short message. No billing email, ABN, address, note or person's name is ever sent; the alert waits at most 4 seconds and cannot change the response.
- **Added.** Disputes and refunds are recorded (#370). `charge.dispute.created` / `closed` and `charge.refunded` (full refunds) write a `dispute` or `refund` billing incident and alert with the evidence deadline. Nothing is cancelled or refunded and no plan changes. The Billing overview lists open incidents with a **Mark resolved** button (schema §29, `resolve_billing_incident()`). Enable the three events on the Stripe endpoint.
- **Changed.** School staff can open their school's billing portal (#367). `POST /api/customer-portal` takes `scope: 'school'`, and the School licence panel shows **Manage school licence** to teachers and admins of a licensed school, whoever bought it. The server finds the customer from the caller's own school. Anyone who can open it can cancel the licence; see the owner decision in the handoff.
- **Fixed.** A signed-in user could read every school's Stripe subscription id, licence state and AI limit, and any teacher could read every school's licence and member counts (#369). Members now read only their own school's `id`, `name` and plan status, period end and cancel flag; `stripe_subscription_id`, `plan_seats` and `daily_ai_limit` are withheld from the REST API; `list_schools()` and other schools' pool usage are admin-only. **Re-apply `supabase/schema.sql` (§12, §13, §28).**
- **Changed.** Prices come from Stripe (#368). `GET /api/prices` reads the three configured prices and the screens show them with "incl. GST" or "+ GST" taken from the Stripe price's tax behaviour (nothing is said when it is unspecified). The `VITE_*_PRICE_DISPLAY` variables are now only a fallback.
- **Added.** A Seat economics panel in the Billing overview (#371, schema §30). Per licensed school it shows calls per seat per day and the 95th percentile per user per day over 30 or 90 days, and, with `VITE_AI_COST_PER_CALL_AUD` set, projected cost and margin per seat. It changes no quota or price. `projectDocs/seat-economics.md` explains how to read it.

## [Unreleased] - 2026-10-15 (Seed data playbook, a past-paper verifier and the Legal Studies reference set)

- **Added.** `docs/seed-data-playbook.md` records what the October past-paper sessions learned for the next seed revision: which syllabus each course's seed follows and which papers apply, how a past paper gets in (download, extract, verify, map, build, exemplars, review, merge), the conventions that make a past question work (ids, provenance fields, verb choice, the Tier 5 ladder at 20 marks, the verb floor by length, exemplar lengths), the extraction mistakes to expect, a review checklist for model-written exemplars, the quotations a teacher still needs to check, and what is left.
- **Added.** `scripts/verifyPastPaperExtract.mts` checks one year of extracted questions against the `pdftotext` text of NESA's paper and marking guidelines: every string must be word-for-word in the source, and each marking ladder must run from the question's marks down to 1. A bullet in the wrong band that still looks like a valid ladder is the one thing it cannot see, so read long guides against the PDF.
- **Added.** `data/referencePapers/legal-studies-2020-2025-past-papers.json`: 111 written-response parts from the 2020–2025 Legal Studies papers (the 2011 syllabus), including the 25-mark Option essays, with marking ladders re-cut so the lowest rows read as NESA prints them. The Legal Studies seed follows the new 2025 syllabus, so these are calibration, not shippable questions.

## [Unreleased] - 2026-10-15 (A long question can no longer carry a verb that cannot show its marks as bands)

- **Fixed.** A mark is only a band step while a question is short. At 20 marks an Explain (Tier 3) has three bands seven marks apart, so a 14 and a 20 read as the same result; a Tier 5 verb gives NESA's own five bands (17–20 / 13–16 / 9–12 / 5–8 / 1–4). Questions now have a verb floor by length: 7–9 marks need Tier 3 or above, 10–14 marks Tier 4 or above, and 15 or more marks Tier 5 or above. Below 7 marks there is no floor. CONSTRUCT keeps Tier 4 at any length, because a 20-mark writing task is marked on craft and lifting it to Discuss would change the task (`minimumTierForMarks`, `verbFitsLength`, `liftVerbForLength` in `data/commandTerms.ts`).
- **Changed.** The rule is applied where questions are created: the AI generator and the manual composer raise a verb that does not fit before the model sees it (the composer says so and offers the replacement in one tap); `getCommandTermsForMarks` offers only fitting verbs; imported and stored questions are raised on load (`validateAndFixCourses`, `repairPromptFields`); and the seed brief and `docs/dataset-generation-prompt.md` state the floor. The ladder code is unchanged. All shipped questions already satisfy the rule, and a test keeps it so (`tests/unit/verbLength.test.ts`).
- **Note.** An imported or stored question whose verb is raised keeps its stem, so "Explain…" on 20 marks is stored as DISCUSS. That is how the Business Studies and English past papers are already stored.

## [Unreleased] - 2026-10-15 (HSC English 2025 Paper 2 and 2024–25 extended responses for Standard and Advanced)

- **Added.** Eight 20-mark extended-response questions in `HSCEnglishStandard.json` and `HSCEnglishAdvanced.json`, each flagged `isPastHSC` with its year and question number. English Standard: 2025 Paper 2 Module A, Module B and Module C, and the 2025 Paper 1 Section II question on the endurance of the human spirit (`prompt-en-154`–`157`). English Advanced: 2024 Paper 2 Module A (Textual Conversations), Module B (Critical Study of Literature) and Module C (Craft of Writing), and the same 2025 Paper 1 Section II question (`prompt-ea-75`–`78`). English Advanced had no 20-mark question before. Stems, prescribed-text lists and NESA's five-band marking guidelines are copied from the papers.
- **Changed.** These stems are generic ("your prescribed text"), so each is stored as DISCUSS (Module A and B, Section II) or CONSTRUCT (Module C), and the exemplars are written on one real prescribed text each: Pygmalion, A Midsummer Night's Dream, The Crucible, King Richard III with Looking for Richard, Great Expectations and Nineteen Eighty-Four. The two Module C exemplars are original pieces of writing on the paper's own stimulus.
- **Left out.** The 2025 Advanced Paper 2 Module A and B questions (19 text-specific variants), the unseen-text short answers in Paper 1 Section I, and the Advanced 2025 Module C question (it depends on an image), because the paper text does not carry what they need.
- **Note.** Every quotation in the exemplars is eight words or fewer and was checked against a full text where one is free (Project Gutenberg for Pygmalion, A Midsummer Night's Dream and Great Expectations); the Crucible, Richard III and Nineteen Eighty-Four quotations were checked against study-guide copies, so a teacher should check them against the printed text.

## [Unreleased] - 2026-10-15 (2024 and 2025 HSC Geography questions, exam profiles and a reference set)

- **Added.** 20 written-response questions from the 2024 and 2025 HSC Geography papers (the current 2022 syllabus) in `HSCGeography.json`, as `prompt-geo-hsc-<year>-<number>`: parts worth 2–6 marks, the 12-mark part (2025 22(c)) and the 20-mark extended responses (2024 Q25–27, 2025 Q23). Each carries the paper's wording, NESA's marking criteria as the app's ladder, and exemplar answers at several marks, and is placed under the dot point it assesses. The chip reads "HSC 2024 · Q25".
- **Left out.** Questions that rest on a map, photograph or table in the Stimulus Booklet, which the text of the paper does not carry.
- **Note.** The exemplars use real places (Bega Cheese, Tokyo, the Great Barrier Reef, Dharavi) and every figure in them was checked against a named source; anything that could not be confirmed was dropped rather than kept. A teacher should still read the 20-mark answers (2024 Q25 to Q27, 2025 Q23).
- **Added.** `data/referencePapers/` holds the structure and marking guidelines of the 2025 Software Engineering and Enterprise Computing papers and the Geography 2024 and 2025 papers, and `docs/hsc-exam-profiles.md` records what a real paper in each course looks like (mark sizes, verbs, stimulus). The seed brief and generation prompt gain a sample-length rule.

## [Unreleased] - 2026-10-15 (Exam-length time guidance, an exam-standard report, and HSC-shaped generation rules)

- **Fixed.** A question with more marks than its verb's typical range now gets the HSC pace (1.8 minutes a mark) beyond that range instead of the verb's ceiling. A 20-mark DISCUSS had 18 minutes against the 35–40 the paper allows; it now has 36. A question inside its verb's range is exactly as before (`getRecommendedTime`, `tests/unit/recommendedTime.test.ts`).
- **Added.** `npm run content:report` prints, for every shipped course, how far it sits from the shape of a real paper: exam-length questions (15+ marks), 7–10 mark questions, stems that only restate their dot point, stems with no command term, and past-paper questions. `-- --list` names the questions behind each count. It reads `public/courseData` and changes nothing.
- **Changed.** A past paper's marking guide is NESA's own ladder, so the shipped-data check now holds it to being a sound ladder (highest row first, no gaps, full marks down to 1) instead of the app's derived rows (`guideStructureProblem`). NESA's 12-mark (11–12 / 8–10 / 5–7 / 3–4 / 1–2), 15-mark (13–15 / 10–12 / 7–9 / 4–6 / 1–3) and merged-row guides can now be stored as written. English 2024 Q3(a) is restored to its five NESA rows, and its exemplars are re-marked 15, 11 and 5 to sit in them. Generated guides are still held to the app's ladder.
- **Changed.** The LLM seed brief (`utils/llmSeedBrief.ts`) and `docs/dataset-generation-prompt.md` gain an EXAM_STANDARD section: one task per stem, point at the scenario, capitalised counts, exam-form stems (How…, Why…, To what extent…) with the command term to store for each, one exam-length question per topic, and Tier 5 for 20-mark questions because it derives NESA's five bands. The earlier "stem must begin with its verb" rule now allows the exam-form exception.

## [Unreleased] - 2026-10-15 (2020–2025 HSC Business Studies written-response questions, and HSC-style stems)

- **Added.** 90 written-response questions from the 2020–2025 HSC Business Studies papers (the six papers on the current syllabus) in `HSCBusinessStudies.json`, as `prompt-bs-hsc-<year>-<number>`: 73 Section II parts (1–6 marks), 5 Section III business reports and 12 Section IV extended responses (20 marks). Each carries the paper's wording and scenario, NESA's marking criteria as the app's mark ladder, `isPastHSC`, `hscYear` and `hscQuestionNumber`, plus marker notes, common errors and a full/middle/bottom exemplar ladder. Each question sits on the dot point it assesses.
- **Left out.** Three questions whose answer depends on a diagram or chart the text of the paper does not carry: 2022 21(c) (process layouts), 2024 21(b) (product diagram) and 2025 25 (Gantt chart).
- **Changed.** 175 of the 348 existing stems now say "this business" where they named an invented one, drop "in the scenario", and capitalise instruction quantities (ONE, TWO). Verbs, marks, marking guides and exemplars are unchanged.
- **Changed.** Stems that open "How…", "Why…" or "To what extent…" have no verb for the Verb Gate, so they are stored as EXPLAIN, OUTLINE, INTERPRET (Section II) and DISCUSS or ASSESS (the 20-mark questions). Tier 5 at 20 marks derives NESA's five bands (17–20 / 13–16 / 9–12 / 5–8 / 1–4), so every Section III and IV guide uses a Tier 5 verb even where the paper says "Explain" or "Evaluate".
- **Note.** Section IV asks for real case studies. The exemplars use clearly labelled "Hypothetical:" businesses instead, because real-business facts could not be checked. The 20-mark marking-guideline bands of 13 questions (12 in Section IV, 1 in Section III) were re-cut by hand, because the PDF layout had put a bullet under the wrong mark band.

## [Unreleased] - 2026-10-15 (2024 HSC English Standard Paper 2 questions, and HSC-style stems)

- **Added.** The 14 questions of the 2024 HSC English Standard Paper 2 (Module A, 1(a)–1(k); Module B, Q2; Module C, Q3(a) and 3(b)) are in `HSCEnglishStandard.json` as `prompt-en-140`–`153`, each flagged `isPastHSC` with `hscYear: 2024` and its question number, so the "HSC 2024 · Q1(a)" chip shows. Stems and prescribed-text lists are copied from the NESA paper; each question has a marking guide, marker notes, common errors and a full/middle/bottom ladder of exemplars.
- **Changed.** The Verb Gate has no HSC-faithful verb for these stems ("How does your study of…", "To what extent…", "Craft…"), so they are stored as DISCUSS (Module A), ASSESS (Module B), CONSTRUCT (3(a)) and EXPLAIN (3(b)). Tier 5 at 20 marks derives bands 17–20 / 13–16 / 9–12 / 5–8 / 1–4, which is NESA's own ladder for Modules A and B. Tier 4 at 15 marks derives four bands (12–15 / 8–11 / 4–7 / 1–3) against NESA's five (13–15 / 10–12 / 7–9 / 4–6 / 1–3), so 3(a)'s guide is NESA's wording on the app's ladder.
- **Changed.** 104 existing English Standard and Advanced stems now read more like an HSC paper: "invented", "described in the scenario" and "in this scenario" are gone, instruction quantities are capitalised (ONE, TWO), Year 12 module stems point at "your prescribed text", and a 10-mark module stem carries "In your response, make close reference to your prescribed text." Verbs, marks, word counts and rationale clauses are untouched; no exemplar or marking guide changed.
- **Note.** The exemplars for real prescribed texts were written from study guides and public-domain text, not from the printed editions. Each answer's unverified claims were stripped, but a teacher who has the texts should read them (especially 1(c), 1(d), 1(g), 1(h), 1(k)). The 1(k) exemplars are labelled 16 and 10 out of 20: no scene-level evidence could be checked, so none is a full-marks model.

## [Unreleased] - 2026-10-14 (Tiers by audience, and one answer for every lock)

- **Changed.** Tiers are structured by buyer (`projectDocs/tier-structure.md`). The comparison gives each plan an audience line, and adds the class and school reports row and a payment row (card, or invoice against a purchase order where invoicing is on).
- **Changed.** Every lock, chip, tooltip, overlay, prompt CTA and profile upgrade button reads from `describeAccess()`. The per-surface wording is gone. The prompt does not open for a feature the viewer already holds.
- **Changed.** A student is never shown a School route; a student who presses a School lock is told their school provides it. A teacher is never offered Plus.
- **Changed.** A teacher or admin whose school is already licensed is told so, with no seat picker. A teacher not attached to a school is told to ask an admin, with no checkout.
- **Changed.** The billing paths carry the server's machine `code`. `school_licence_held` shows the server's sentence and no portal route. `school_role_required` and `account_lookup_failed` show their sentences.
- **Added.** "Copy a note for your admin" for a teacher who cannot buy a licence (`components/ChampionKit.tsx`, `utils/licenceNote.ts`).
- **Fixed.** The exam-mode lock shows on phones (a compact badge). The prompt header no longer runs a long title under the close button on a phone.
- **Operator.** Re-apply `supabase/schema.sql` §17 (`caller_plan()`): the licence now outranks a personal plan. No new environment variable. `PLAN_FEATURE_OVERRIDES=cohortReports:plus` and `VITE_PLAN_FEATURE_OVERRIDES=cohortReports:plus` restore the earlier behaviour for teachers.
- **Docs.** `projectDocs/tier-structure.md`, `docs/stripesetup.md` ("What each plan includes"), `.env.example`, `projectDocs/monetisation-review-2026-09.md` (§34–39, §5), `projectDocs/paywall-surface-inventory.md` (status note).

## [Unreleased] - 2026-10-14 (Class & school reports are a School feature)

- **Changed.** The Class report (a teacher's classes) and the School report (an administrator's school) are a School-tier feature (`cohortReports`). A teacher holds Plus as a staff perk, so a teacher with no licence now sees the report locked. The student's own progress report stays on Plus. Existing teachers on a deployment that upgrades without config will see this lock.
- **Changed.** A teacher with their own Plus inside a licensed school now holds School, not Plus. The licence outranks the personal plan at sign-in and in `caller_plan()` (schema §17).
- **Added.** `PLAN_FEATURE_OVERRIDES=cohortReports:plus` (and `VITE_` copy) restores the earlier behaviour.
- **Docs.** `docs/stripesetup.md`, `.env.example`, `projectDocs/tier-structure.md`.

## [Unreleased] - 2026-10-14 (One open checkout per user, and billing incidents)

- **Fixed.** Two Checkout Sessions could both stay payable for a day, so a second Upgrade press or a second tab could double-charge (monetisation review §21). Each account now has one payable session: the new one is recorded, and the one it displaces is expired. A double tap returns the same session. Sessions expire 31 to 36 minutes after creation.
- **Fixed.** A personal subscription whose first payment is outstanding (`incomplete`, for example a 3-D Secure step) holds that customer's new purchase for 45 minutes after its last update, the window in which the bank prompt can be answered. A school licence in that state does not hold the school (§22, §36). Nothing that grants access reads `incomplete`.
- **Fixed.** A profile already linked to one Stripe customer is no longer overwritten by another. The plan is still applied, and the mismatch is recorded (§24).
- **Added.** `billing_incidents` records a user holding two live subscriptions, a school licence replaced while live, and a customer mismatch. Nothing is cancelled or refunded automatically. The operator resolves each in the Stripe Dashboard (`docs/stripesetup.md`, "When a billing incident is open").
- **Operator.** Re-apply schema §13: it adds `checkout_sessions` and `billing_incidents`. Until then checkout behaves as before. No environment variable changed. New open findings §34–§37 are recorded in `projectDocs/monetisation-review-2026-09.md`.

## [Unreleased] - 2026-10-14 (Schools can ask for an invoice: the school's request screen)

- **Added.** A teacher or admin at a school can ask for the licence to be invoiced. Under the School seat picker, behind a "Pay by invoice or purchase order" disclosure, the form takes the billing name, accounts email, an Australian address, and optionally the ABN, purchase order number and a note. Once sent, the panel shows the request: pending, approved (the invoice link), or declined (the administrator's note, and the form again). Students see one line that a teacher or admin can ask.
- **Changed.** `SchoolLicencePanel` mounts the form and one sentence. Nothing else in the upgrade prompt or the comparison moved.
- **Operator.** The app's copy of the switch is `VITE_SCHOOL_INVOICE_ENABLED`, read at build time. Set it to `false` and rebuild to hide the route in the app. The route is drawn only when `VITE_STRIPE_SCHOOL_PRICE_ID` is set. No schema change: this needs the `licence_requests` table from §27, which the server half already requires.
- **Not done.** A notification when a request arrives, withdrawing a request, and showing a teacher a colleague's pending request before they send their own. The approval queue is in the Billing overview (see the entry below).
- See `docs/stripesetup.md`, "Invoiced school licences (purchase orders)", and `projectDocs/monetisation-review-2026-09.md` §30.

## [Unreleased] - 2026-10-14 (Approve or decline purchase orders from the Billing overview)

- **Added.** The Billing overview lists pending school invoice requests at the top of "Needs attention", oldest
  first, with the billing details and the working days waited (over three is flagged). Approve opens a confirm step
  that says what the call does, with the payment terms (14, 30, 45 or 60 days); Decline takes an optional note.
  Both call `POST /api/issue-invoice` through `services/invoiceDecisionService.ts`.
- **Changed.** While a decision call is in flight, the decision buttons, Refresh and the close control are disabled,
  and Escape or the backdrop do not close the window. An answer that names a Stripe subscription, or no clear answer,
  keeps Approve off until the request is read again.
- **Operator.** Nothing to configure. The queue needs schema §27 (`licence_requests`); without it the overview says
  the requests were not checked and loads the rest. See `docs/stripesetup.md`, "Deciding a request".
- **Learned.** The confirm step's wording follows what `api/issue-invoice.ts` does, line for line, including that
  a reused Stripe customer has its billing details replaced.

## [Unreleased] - 2026-10-14 (paywall: say what is charged, and match the plan)

- **Changed.** The upgrade prompt states the amount, the renewal and how to stop. It no longer offers "Keep me posted" when nothing is on sale, and it offers no seat picker once checkout has refused because a subscription is live. Paid plans read "No daily limit", not "Unlimited", in the prompt, the comparison and the profile card. The comparison opens with its own header. The free counter at zero opens the daily-limit prompt.
- **Changed.** Every lock chip names its feature, so a `PLAN_FEATURE_OVERRIDES` move reaches the chip, the tooltip and the prompt together.
- **Fixed.** Billing failures show a customer sentence, not the server's operator text (a 503 misconfiguration used to reach the toast verbatim). Profile cards say "Cancelled" or "Payment due", not "Active"; admins are not told their access comes from a school licence; the portal button no longer flashes for perk holders. Paywall controls are 44px on a phone, and the 10px and 11px text a payer must read is 12px.
- **Docs.** `projectDocs/paywall-surface-inventory.md` maps every place a paid feature is locked or advertised, and which audience is offered what.

## [Unreleased] - 2026-10-14 (Checkout return confirms the purchase itself)

- **Fixed.** A customer who paid could be stuck on "refresh if features stay locked" until the webhook landed, and
  refreshing could not help. The return now calls `POST /api/sync-checkout` with the session id first. The server
  asks Stripe about that session and applies the subscription, refusing anything that is not this account's, paid
  and a live subscription. The poll is still the fallback.
- **Changed.** The subscription-applying code moved from `api/stripe-webhook.ts` into `api/_lib/subscriptionSync.ts`,
  shared with the new endpoint. The webhook's behaviour is unchanged, and its existing tests pass without edits.
- **Operator.** Still needs the webhook for renewals, cancellations, failed payments and seat changes (see
  `docs/stripesetup.md`, Step 4). No schema change and no new environment variable.
- See `projectDocs/monetisation-review-2026-09.md` §31.

## [Unreleased] - 2026-10-14 (Admin Billing overview)

- **Added.** Admin Tools → Billing → "Billing Overview". Read-only: paying subscriptions by plan and seats, what
  is ending or renewing in 7 and 30 days, and a "Needs attention" list (past due, unpaid, a renewal the webhook
  never recorded, a checkout that never completed, schools over their seats, a quiet webhook). It also shows the
  last ten webhook events. The page is in the lazy `admin` chunk; the reads are the existing RLS-gated tables,
  paged past PostgREST's row cap. No SQL changed and no money figure is shown.
- **Not done.** Revenue needs a price source of truth, because the app's display prices are not Stripe amounts.

## [Unreleased] - 2026-10-14 (Schools can pay a licence by purchase order: server half)

- **Added.** A teacher or admin attached to a school can request a School licence to be invoiced
  (`POST /api/request-invoice`). A platform admin approves or declines it (`POST /api/issue-invoice`).
  Approval creates a `send_invoice` subscription on the school price and sends the first invoice; the
  existing webhook licenses the school without change. Requests live in `licence_requests`
  (`supabase/schema.sql` §27), with RLS and no client write policy.
- **Added.** `SCHOOL_INVOICE_ENABLED=false` turns both endpoints off (404). Default on.
- **Operator.** Re-apply `supabase/schema.sql` for the new table. Set Stripe's unpaid-invoice behaviour
  and the invoice payment methods as in `docs/stripesetup.md`, "Invoiced school licences".
- **Learned.** The approval refuses on any failed read and never clamps seats. A failed invoice send is
  not tolerated just because the invoice is open.

## [Unreleased] - 2026-10-14 (A school licence reaches its members, and staff hear when it is outgrown)

- **Changed.** A signed-in person's plan is re-read when they return to the tab or the connection comes back,
  at most every five minutes (`PLAN_FRESHNESS_INTERVAL_MS`, `utils/planFreshness.ts`, `hooks/usePlanFreshness.ts`).
  A licence that goes live or lapses reaches the other members of the school without a reload. An unchanged plan
  is silent; a changed one updates the plan fields and is announced once, in the resolved-plan wording.
- **Added.** `my_school_seats()` (schema §13, staff of their own school only, no member data) and the
  `SeatOverageNotice` banner for teachers and admins when members exceed a live licence's seats. Only the
  purchaser is offered Manage subscription; others are told who bought the licence. Dismissible per session.
- **Operator.** Re-apply `supabase/schema.sql` to get `my_school_seats()`. Without it the notice stays hidden.
  No new environment variables. Members beyond seats keep School access; seats are not enforced at sign-in.
- **Found, not fixed.** `list_schools()` answers teachers for every school; `schools_read` lets every signed-in
  account read every school's licence columns. See `projectDocs/monetisation-review-2026-09.md` §5.

## [Unreleased] - 2026-10-14 (Stripe server hardening: one licence per school, no lost webhook events)

- **Fixed.** A school could buy a second School licence, because the duplicate guard is per person. A school that
  already holds a live licence now refuses a second purchase before any payment (409, `school_licence_held`).
- **Fixed.** A webhook whose handler was killed mid-way lost its event: the claim stayed, and Stripe's retry was
  acknowledged as a duplicate. A claim now counts as done only once stamped (`stripe_events.processed_at`). After a
  two-minute lease a retry takes an abandoned claim over. Needs the schema §13 re-apply; without it the old
  behaviour is unchanged.
- **Fixed.** Checkout refused to check for an existing subscription or licence when that lookup failed, and went
  ahead. Those lookups now refuse with 503. A licence that moved with its purchaser's school, and a cancellation
  whose customer link was missing, are both fixed in the webhook.
- **Open.** Two open Checkout Sessions can both complete, and an `incomplete` subscription holds nothing, so a second
  purchase can still get through (monetisation review §21–§22). Unsigned webhooks may be accepted on preview
  deployments (§23). See `projectDocs/monetisation-review-2026-09.md` §16–§27.

## [Unreleased] - 2026-10-14 (CI: the E2E suite runs in parallel)

- **Changed.** The E2E suite is one job per browser project instead of one long job, and no longer waits for
  lint to finish. A pull request's whole pipeline went from about 20 minutes to about 10, and a push to main
  from 35–50 minutes to about 11 (the first 8-leg run on main took 10m39s). The legs come from
  `scripts/e2eMatrix.mjs`; a gate job keeps the check name "E2E Tests"; each leg installs and caches only the
  browser it launches. On CI the log now lists every test with its duration, and video is recorded only from the
  first retry.
- **Fixed.** `openWorkspaceQuestion` failed about one run in seven: the picker walk clicked a disabled question
  (the free tier cannot open tiers above 3) and waited out its budget. It now skips questions the account cannot
  open. Also fixed: a race in `class-analytics-ranking` that read the table while a spinner replaced it.
- **Learned.** Bounding a WebKit click at 10 s in a shared helper made eight Mobile Safari tests fail on the
  loaded runner; helper actions that run on WebKit keep at least 30 s.

## [Unreleased] - 2026-10-14 (A toast's action is reachable by keyboard over a dialog)

- **Fixed.** A toast with an action ("Undo", "Go to it") raised while a dialog was open could be pressed
  with a mouse but not reached with Tab. The toast is portalled to `<body>` at `z-toast`, above the
  improvement review, so it was on screen and on top; the focus trap only knew its own subtree and wrapped
  Tab round the dialog's controls. `useFocusTrap` now takes a marked "companion" region into the cycle
  (dialog controls, then the toast's, then round), and `App` marks the toast's mount with
  `focusTrapCompanion`. No dialog changes.
- **Not loosened.** Only a marked region is exempt: an unmarked portal, or the page behind, is still pulled
  back into the dialog. A toast covered by a higher dialog (confirm, rename, flag sit above it) is skipped,
  by asking the browser what is painted at its centre, so Tab never lands on a control nobody can see.
- **Not done.** After the toast closes with focus on it, focus falls to `<body>` until the next Tab, which
  the trap sends back into the dialog. The toast's countdown also still runs while focus is on it; it only
  pauses for the mouse.

## [Unreleased] - 2026-10-13 (Light-theme surfaces, round 1, and guards for what slipped)

- **Fixed.** The light theme's white slabs were redrawn on the depth ladder, as Plan-FrontendDesignReview
  "A third pass" (findings 77–86) records: the writing card's seams and marking veil (**#318**); the
  profile and progress report (**#319**); the signed-out and reader shells, and the Delete button, which was
  white on white because its class was never defined (**#320**); the staff tools (**#321**).
- **Fixed.** The verb sheet and outcome brief were redrawn as band-washed reading sheets, with band text
  held to AA in all six bands (**#322**). The feedback PDF prints the screen's band ink, meters and
  words-kept figure, and band text on paper clears 4.5:1 (**#323**).
- **Changed.** The marking report was rebuilt around the mark and the next step, and its band placard
  carries ink, not white, where white fell under AA (**#324**).
- **Not on `main` yet.** The improvement review and its revision default of 0 of 6 (**#325**) are on
  `claude/ui-improvement-review`.
- **Changed.** The shared admin chrome moved from `components/admin/` to `utils/adminChrome.ts`. The first CI
  build failed with the staff bundle in the first load (1,922 kB against a 1,900 kB ceiling); this is the fix.
- **Added.** `npm run check:build` runs `vite build`, `check:bundle` and `check:eager-chunks`, then removes
  `dist/`. It is in `test:all`, which never ran the build checks before.
- **Added.** Text over gradients is measured in `light-theme.spec.ts`, against every colour a gradient paints,
  in both themes. The arithmetic is in `tests/e2e/support/gradientMath.ts`, with unit tests.
- **Added.** `light-stark-surfaces.spec.ts` walks computed styles in eight light states and fails a white
  painted slab on a white parent with no edge. Its one allow-list entry is the Plus paywall veil.
- **Fixed.** The guards' first run found two defects still on `main`: the Compare Plans header row
  had no rule (`PlanComparison.tsx`), and the feedback's syllabus terms and command verb were under
  4.5:1 on the modal's wash. The terms are emerald-900 in light and the verb is sky-800 in light.
  The gradient guard also skipped the card headers' ground for a while, so it now reads it.

## [Unreleased] - 2026-10-09 (Verb ribbon animations: smoother on a phone)

- **Fixed.** The ribbon's animations were reported glitchy on an iPhone 15 in Safari. No iPhone was
  to hand, so the causes were taken from what WebKit and a throttled Chromium could show, and each
  was removed rather than tuned:
  - **A mask on the tier strip** (the edge fade) made Safari re-mask the scrolling cards on every
    frame of a swipe. The fades are now two small overlays in the drawer's own colour.
  - **A mask and a permanent layer on the stage and all six cards** (`clip-stable`), and a
    **`mix-blend-mode`** on the mesh texture. Both are gone from the ribbon; the mesh is plain, and
    the aura and mesh round themselves so the corners stay clean.
  - **A 700ms `transition-all` with an overshoot curve on every tier card**, which re-painted the
    card's border width, a blurred shadow and its fill together on each selection. The selected
    tier's ring, edge and glow are now one overlay that fades with `opacity`, and the card is the
    same box in every state.
  - **A 48px `text-shadow` on the 96px verb**, re-rastered on every chip tap. It is now a soft
    gradient behind the word.
  - **A `box-shadow` on the stage** and an aura sized to it, both re-painted on every frame of the
    open and close. The glow is a small sibling layer and the aura and mesh are a fixed size.
- **Fixed.** The ribbon's banner was a dark slab in the light theme, the same as in the dark one,
  above a page of white panels with light headers. The header bar is now themed: white with dark ink
  in the light theme, and unchanged in the dark theme. Its tier tile, selected-verb chip, miniature
  staircase and chevron each have a light and a dark form. The stage below it is still dark in both
  themes, because that is the hero. The ribbon's neutral edge is a themed pair so that a shut ribbon
  has a visible edge on a white page.
- **Fixed.** The ribbon's stage was a near-black slab in the light theme too: 440px of the page's
  darkest colour between a white banner and a white drawer, reported as abrasive. The light theme now
  has a stage palette of its own: a soft slate-50 ground, white scoreboard cells, dark ink, the tier's
  own colour for the light behind the verb and as a faint tint over the whole stage, full-strength
  staircase columns, a tier-coloured edge under the banner, and the tier's darker `-700` shade for
  figures and the current step's name. It was first drawn in pastels and read as washed out, so the
  tints, glows, columns and chips are stronger; how strong is limited by legibility, and a test holds
  the dark and neutral inks at 4.5:1 over the light at its brightest. The dark theme is the stage exactly as it was. Lightening the
  dark ground was not an option, because the tier colours stop being legible on anything much lighter
  than the current near-black.
- **Changed.** The stage's colours now come from one table of custom properties in `index.css`
  (`.ribbon-stage`), one set of values per theme, and the ribbon's class strings no longer name any
  ground or ink of their own. A unit test reads the table back and measures the contrast of every
  pair in both themes.
- **Fixed.** On a phone a tap left `:hover` stuck: cards stayed enlarged and staircase columns
  stayed bright until the next tap elsewhere. Hover styles now only exist where a pointer can hover
  (a new `can-hover:` variant).
- **Changed.** The ribbon answers a finger on the first frame: chips, steps and the header press in
  on touch; double-tap-to-zoom is off across the ribbon (`touch-action: manipulation`); a long press
  no longer selects a label.
- **Changed.** Tier changes no longer dip the stage to black. The outgoing light and glow cross-fade
  with the incoming ones; a new verb arrives from a dim, low start rather than from nothing.
- **Changed.** The panel opens and closes on the iOS sheet curve and on two named properties instead
  of `transition-all`; the staircase waits for the panel to be mostly open before it builds, so the
  moment is seen rather than spent behind the clip.
- **Changed.** The tier strip no longer fights the reader: it is placed instantly when the ribbon
  opens, and tapping another chip on a card already in view no longer slides the strip. A flick at
  either end bounces in the strip and does not chain to the page.
- **Measured.** Production build, Chromium with the 4x CPU throttle, iPhone 15 profile, against the
  previous build: area repainted by a verb-chip tap fell from about 10-12.7 megapixels to about 4.5;
  by opening the ribbon from 35.4 to 19.4; by closing it from 26.7 to 17.3. Total paint time over a
  fixed sequence of seven interactions fell 34% and layer-tree rebuilds 49%. In real WebKit 26 (the
  Playwright build, not an iPhone), the stage previously carried 8 masked elements, 2 blended ones
  and a masked strip, and now carries none. These numbers are about work done, not about what an
  iPhone's GPU does with it.
- **Held by tests.** The unit tests pin the new structure and the rules above (no ungated hover, no
  `transition-all`, no overshoot, no mask or blend on the ribbon). A new end-to-end spec,
  `verb-ribbon-touch.spec.ts`, runs on the phone projects, including real WebKit: tapping moves the
  selection and the strip follows it, nothing is left hovered, the panel folds and unfolds, and the
  stage carries no mask or blend and answers a tap without a zoom.

## [Unreleased] - 2026-10-08 (Verb ribbon becomes the hero)

- **Changed.** The command verb ribbon is now the one loud surface in the workspace, where the
  previous change had made it match the panels around it. It explains the fact that sets a student's
  ceiling — the command verb caps the band — and now shows it: the verb is set at poster scale
  (Inter 900 italic, up to 96px, sized to the word), lit in its tier's colour, with a ceiling
  staircase beside it.
- **New.** The staircase replaces the flat spectrum bar and its dot row. Six columns rise from tier
  1 to tier 6; the ones the verb lets a student reach stand in their tier colours, and the ones
  above the ceiling are hatched and dashed. A dashed line marks the ceiling and the Deep Learning
  Threshold stays as the gate between tiers 3 and 4. Each column is a button for that tier, a much
  larger target than the old dots. When the verb changes, the verb's rule and the ceiling draw in,
  the column flares once, and the light re-tints; nothing loops.
- **Changed.** The stage is dark in both themes, so in the light theme the ribbon reads as a lit
  slab above a white drawer of tier cards, and in the dark theme as a spotlit stage. The stats are a
  scoreboard under the staircase, and all four now show on a phone (the old tray hid "Terms").
- **Changed.** Shut, the header is a dark bar with the tier's tile, a miniature staircase lit to the
  tier, and the selected verb. The strategy brief is set a step larger on the stage.
- **Fixed.** The end-to-end tests located the Evaluate button with a loose pattern that the
  "Evaluate, Synthesise & Create" tier card also matched once its emoji became an icon. They now use
  one shared pattern that matches only the button.
- **Held by tests.** Everything painted on the stage is named `RIBBON_INK_*` and checked: no
  light/dark variant, no theme token, nothing dimmed with opacity, no text tone the dark ground
  cannot carry. The design spec has a section on the hero.

## [Unreleased] - 2026-10-08 (Verb ribbon joins the panel family)

- **Changed.** The command verb ribbon now looks like the other reference panels in the workspace.
  It was the one panel drawn separately: its own glass bar, gradient hairlines above and below it,
  a sentence-case title, a chevron in a circle, and an open state with no surface behind it. It now
  wears the shared panel surface and the accordions' header row — the same height, icon tile, title
  voice and chevron — and opens onto a body with the same padding and rule.
- **Changed.** The selected verb's brief is a quiet card with the tier shown once, by a rule down
  its left edge (the same device as the breadcrumb bar), instead of a full-width wash of the tier
  colour with a blurred blob, a mesh and a large icon tile. The stat tray is a recessed well, one
  radius tighter than the card around it.
- **Changed.** The six tier cards keep their colour but lose the candy: idle headers take a faint
  tint of the tier instead of a solid pastel fill, so the saturated header belongs to the one tier
  being read. The system emoji are replaced by line icons in tiles, so the ladder looks the same on
  a Chromebook, a Mac and a Windows laptop. Idle cards no longer paint a mesh and a gradient nobody
  could see.
- **Fixed.** The strip's edge fades ended in the page colour, which would have been a grey smear on
  a white panel in the light theme. They are now a mask on the strip itself, 1rem wide, with 1rem of
  side padding so the selected card is never faded at rest and its ring is no longer clipped.
- **Fixed.** The spectrum's five boundary gaps are cut in the panel's own surface rather than the
  page colour. The strip is now explicitly positioned, so the selected tier is centred correctly in
  every browser.
- **Phones and tablets.** The header title keeps its whole name at 390px (and at 360px) by easing
  its tracking, with the header height lock unchanged. Below 1024px the stat tray sits under the
  verb's text rather than squeezing beside it, so "Terms" no longer wraps onto a row of its own.

## [Unreleased] - 2026-10-08 (Software Engineering and Enterprise Computing rebuilt from NESA)

- **Added.** Year 11 content for Software Engineering (Programming fundamentals, The object-oriented
  paradigm, Programming mechatronics) and Enterprise Computing (Interactive media and the user
  experience, Principles of cybersecurity, Networking systems and social computing), tagged Year 11
  so they appear under the Year 11 tab of the syllabus navigator, with the NESA Year 11 outcomes
  (SE-11-01 to 09, EC-11-01 to 11). Each new dot point has two questions with HSC-style marking guides.
- **Fixed.** Both courses' Year 12 topics now follow NESA's published Enterprise Computing and
  Software Engineering 11-12 (2022) syllabuses statement by statement, including the "including"
  sub-points. Enterprise Computing used invented outcome codes (EC-01 to 06) and held 41 of 82
  statements; it now holds all 82 with NESA's EC-12-01 to 11 outcomes. Software Engineering gained
  the 8 missing statements and merged duplicate dot points (their questions were kept).
- **Fixed.** Year 11 outcomes in Geography, Ancient History and English Standard are tagged Year 11.
  Data version 2.16.0 brings existing browsers up to date.

## [Unreleased] - 2026-10-08 (NESA fact-check fixes)

- **Fixed.** Checked every shipped course against NESA's published syllabus text. Business Studies,
  Legal Studies, Modern History, Economics, Geography and the English courses match NESA's dot
  points and outcomes; the fixes below are the confirmed differences.
- **Fixed.** 14 command-term definitions now use NESA's Glossary of key words wording (for example
  Calculate, Explain, Contrast, Demonstrate, Apply, Critically analyse/evaluate). Statement and
  Differentiate are not in NESA's glossary and are unchanged.
- **Fixed.** Software Engineering: the Waterfall dot point no longer also names Agile (which has its
  own); the back-end engineering dot point is under Research and planning as in the syllabus; three
  dot points use NESA's wording. Business Studies: "last-in-first-out" typo.
- **Fixed.** Year 11 topics in Ancient History, Geography and English Standard are now tagged Year 11
  so they no longer appear as Year 12 content. Data version 2.15.0 brings existing browsers up to date.
- **Known gaps (not changed).** Software Engineering lacks 8 NESA dot points; Enterprise Computing
  differs from NESA more widely; Economics, Legal Studies, Modern History and Ancient History follow
  the 2024/2025 syllabuses, which Year 12 does not study until Term 4 2027.

## [Unreleased] - 2026-10-08 (Marking guides in HSC marking-guideline style)

- **Fixed.** Marking guides now read like an HSC marking guideline: a ladder with the highest
  mark first, each row a performance descriptor that opens with a capitalised verb in the third
  person ("Provides…", "Demonstrates…", "Identifies…", "Analyses…") and NESA qualifiers, with no
  closing full stop. About 1,300 Geography and Ancient History rows were lower-case fragments,
  and 99 guides had rows written as noun phrases or passives ("one factor is identified"); the
  rows were rewritten, and the stale Software Engineering backup in `projectDocs` (242 additive
  bullet lists) was converted to the same ladder.
- **Fixed.** The generic marking guide for each command verb (shown in the verb guide and given
  to the marker when a question has no guide) ran lowest mark first, with noun-phrase rows. All
  38 now run highest mark first in the same wording.
- **Enforced.** `guideLadderProblem` now also checks the wording of each row, so generation
  retries, question generators and the content audit all reject a guide that is not in HSC style,
  and the retry message names the offending row. `isNonStandardRubric` flags the same guides in the
  Content Audit Studio, so Reformat Guides and Write Marking Guides appear for them. The AI and
  authoring briefs (`llmSeedBrief`, `docs/dataset-generation-prompt.md`) say how rows are worded.
- **Repaired on the way in.** `formatMarkingCriteria` now puts a guide that is purely rows in
  canonical shape (descending, capitalised, no bullets, no closing full stop), and the guides
  loaded from the shared database and saved by contributions go through the same step.
- **Data version 2.14.0.** Browsers that already synced at 2.13.0 missed the course changes made
  since, because the sync only runs when the version changes. It now runs again. The migration
  puts the guides in courses the user owns (their own, edited copies and backups) in canonical
  shape. Unedited copies of shipped courses are left for the sync to replace.

## [Unreleased] - 2026-10-08 (Briefer full-mark answers, held to the word band)

- **Changed.** About 780 full-mark sample answers that ran over the app's word band for their
  mark value were shortened to sit inside it, mostly at 65-90% of the maximum. Each still
  meets the top row of its marking criteria and uses the syllabus terms its question names.
  A brief answer that meets the criteria is preferred. Invented details that a scenario did
  not supply were taken out along the way, and two factual slips were corrected (long service
  leave is state law, not part of the National Employment Standards; the Koowarta case name).
- **Added.** `seedAnswerBandAndGuides.test.ts` fails if a shipped full-mark answer exceeds
  `getFullMarkWordRange`, if a lower-mark sample is longer than a higher one, or if a marking
  guide differs from the ladder the app expects. The band is read from the code, so tuning it
  after testing moves the test with it, and `LENGTH_TOLERANCE` gives a grace margin if needed.

## [Unreleased] - 2026-10-08 (Brief is better: authoring rules follow the word band)

- **Changed.** The authoring brief, the prose prompt and the Gold Standard said sample
  answers should run about 35-60 words per mark. That was longer than the app's own word
  band for a full-mark answer, so courses written from it ran over. All three now say
  that a brief answer which meets the top row of the marking criteria is preferred, and
  quote the band for each mark value from `getFullMarkWordRange`. The band is expected
  to be tuned from testing, and the exported brief follows it.

## [Unreleased] - 2026-10-08 (The navigator shows only the latest version of each course)

- **Changed.** The syllabus navigator now lists only the most recent version of each
  course. Backups of earlier versions made by the shipped-course sync ("… (before
  refresh)") are hidden there for every role. They stay in the library and Data Vault,
  so their content can still be recovered or deleted.
- **Added.** `Course.supersededBy` marks a backup with the id of the course that
  replaced it. Backups made before this field existed are recognised by their
  `-before-refresh` id, so no data migration is needed.

## [Unreleased] - 2026-10-08 (Marking guides, word bands and syllabus terms in the shipped courses)

- **Fixed.** About 90 marking guides in Ancient History, English, Geography, Legal
  Studies and Modern History used the wrong ladder for their verb's tier, and 34
  Software Engineering guides were bullet lists with no mark rows. Every guide now
  has the exact rows the app expects, top row first and descending.
- **Fixed.** `docs/dataset-generation-prompt.md` listed verbs in tiers the app does not
  use, which is where the wrong ladders came from. It is now printed from
  `data/commandTerms.ts`, and `datasetPromptDocTiers.test.ts` keeps it in line.
- **Fixed.** About 1,000 full-mark sample answers were shortened or lengthened to
  sit inside the app's word band (no more than 15% over the maximum), and now use
  every syllabus term the question names. Command verbs and unexplained
  abbreviations were removed from keyword lists, and invented figures that the
  scenarios did not supply were taken out.
- **Fixed.** Thirteen Software Engineering questions had a lower-mark sample longer than
  a higher-mark one, and 34 samples had no feedback.
- **Still to do.** Many full-mark answers sit between the band maximum and 1.5 times it.
  The band is shorter than the roughly 40 words per mark the earlier course changes
  aimed for, so choose which one is right before trimming further. Legal Studies
  statute points and Economics facts still need a specialist check.

## [Unreleased] - 2026-10-08 (Reference depth for Business Studies and Economics; gaps closed in Enterprise Computing and Software Engineering)

- **Upgraded.** Business Studies now has 348 questions, two per dot point, and
  Economics gains a second question on each dot point. Every question has a
  scenario, and full-mark exemplars run at about 40 words per mark, against about
  17 before. Invented businesses are labelled "Hypothetical:".
- **Completed.** Enterprise Computing questions now have marker notes, common
  student errors and a full, middle and bottom sample. Ten verb labels that did not
  match their stems are corrected.
- **Completed.** Software Engineering questions now have marker notes, common
  errors and sample feedback, single-question dot points gain a second question,
  the corrupted 12-mark guide is rewritten, and US spellings are corrected. Some
  samples that shared a mark with another sample on the same question were removed.
- **Not source-checked.** Economics and Business Studies facts were written from
  memory and need a specialist check before students rely on them.

## [Unreleased] - 2026-10-08 (Seed data review corrections)

- **Corrected.** Modern History scenario now says Australia had no independent
  Washington legation until 1940. English Advanced's invented tram-depot text is set
  in 1960, because Sydney's electric trams ended in February 1961. Geography
  scenarios for Tarrin Hollow and Lark Creek are labelled hypothetical, and the
  Kestrel Gorge map is now described. "sulfur" is now "sulphur".
- **Fixed.** Ancient History questions no longer refer to sources they do not
  supply: one drops "drawing on the sources", and the Pliny question now carries a
  paraphrase of Natural History 12.84.
- **Known gaps, not changed here.** Business Studies and Economics have one question
  per dot point, no scenarios and about 17 words per mark. Enterprise Computing has
  one sample answer on 81 of 82 questions and no marker notes. Software Engineering
  lacks marker notes on 72 questions. Ancient History omits the 52 Year 12 depth
  studies.

## [Unreleased] - 2026-10-08 (Reference depth for four courses, and two new courses)

- **Upgraded.** Modern History (100 questions) and English Advanced (74) now carry
  two or more questions per dot point. Every full-mark exemplar is about 40 words
  per mark, against about 30 in the HSC Software Engineering reference, and most
  questions have a scenario.
- **New.** English Standard (139 questions over all seven focus areas, no options)
  and Ancient History (149 questions). Ancient History covers the Year 11 focus
  areas and the Year 12 core study, Cities of Vesuvius. Its 52 Year 12 depth-study
  options are not included yet.
- **Not yet source-checked.** Historical, legal and literary claims in these
  courses were written from memory. A specialist should check them before students
  rely on them.
- **Upgraded.** Legal Studies now has 327 questions over all 157 dot points, two or
  more per dot point. Its NSW statute points were not checked against the consolidated
  Acts, and its outcome links are our own mapping. Check both before students rely on
  them.
- **Corrected.** Reviewer corrections to Ancient History (dates and unsupported claims,
  invented scenarios labelled hypothetical), English scenario years aligned with topic
  years, and Modern History sample-answer bands re-derived from marks.
- **Still one question per dot point.** Business Studies and Economics are the next to
  be upgraded.
- **New.** Geography covers all 162 dot points of the 2022 syllabus, with 333
  questions and two or three per dot point.
- **Returning browsers.** `DATA_VERSION` is now 2.12.0. The shipped-course sync in
  `useSyllabusData` runs for any library saved before 2.12.0, so a browser saved at
  2.11.0 receives Geography, English Standard and Ancient History.
- **Refreshed copies.** `DATA_VERSION` is now 2.13.0. Copies of shipped courses carry
  a `shippedHash` fingerprint. On the next load, an unedited copy is replaced by the
  current shipped version, and an edited copy is kept. A copy saved before fingerprints
  existed cannot be checked for edits. If its content differs from the shipped version,
  it is kept as a backup named "(before refresh)" and the shipped version replaces it.
  Delete the backups once you have checked them.

## [Unreleased] - 2026-10-07 (Analytics windows in hours, and stale seeded courses retired from saved libraries)

- **Analytics windows.** Every class-analytics window now starts from one function,
  `public.analytics_window_start(days)`, which counts hours. The old
  `now() - make_interval(days => n)` moved by an hour whenever a DST change fell
  inside the window, because a day is a calendar day in the session time zone.
  The RLS suite probes that function under UTC and Australia/Sydney, and it fails
  on calendar-day arithmetic. This was checked on a local Postgres 16 cluster.
- **Library version 2.11.0.** A returning browser keeps the library it saved, so the
  GitHub Pages build still showed the retired Biology and template courses, and the
  five new courses never reached it. The migration removes four retired course ids,
  and only those. It then adds each shipped course that the library does not have,
  matched by id. Existing courses, including a teacher's edits to Software
  Engineering or Enterprise Computing, are not overwritten. If a shipped file cannot
  be read, the stored version is not advanced, so the next load retries.

## [Unreleased] - 2026-10-07 (Five new seeded courses, aligned to the NESA syllabuses)

The shared library was seeded with HSC Biology, a Biology and Chemistry pair of
built-in samples, and a template course. Software Engineering and Enterprise
Computing were the only courses worth keeping. The seed now holds those two
plus five courses chosen as the most popular HSC courses that suit a written,
verb-marked coach: Modern History, Legal Studies, Business Studies, Economics
and English Advanced.

- **Removed.** `HSCBiology.json`, its Heredity topic file, `templateCourseData.json`,
  and the two built-in samples in `data/seedData.ts`. `preseededCourses` is now
  an empty list, so a first-time user starts with an empty library and imports
  what they want from the manifest.
- **Added.** Five course files under `public/courseData/`, 547 questions in all,
  each with a full, middle and bottom sample answer (1,641 samples). Topics,
  sub-topics, dot points and outcome codes are taken verbatim from the NESA
  syllabus documents, not written from memory:

  | Course           | Syllabus      | Topics | Sub-topics | Dot points | Outcomes        |
  | ---------------- | ------------- | ------ | ---------- | ---------- | --------------- |
  | Modern History   | 2024          | 4      | 16         | 48         | MH-12-01 to 07  |
  | Legal Studies    | 2025          | 7      | 36         | 157        | LST-12-01 to 08 |
  | Business Studies | Stage 6, 2010 | 4      | 25         | 174        | H1 to H10       |
  | Economics        | 2025          | 3      | 17         | 131        | ECO-12-01 to 10 |
  | English Advanced | 2024          | 4      | 8          | 37         | EAV-12-01 to 06 |

  Every question was checked against the app's command-term mark ranges,
  marking ladders and keyword counts, and each full-mark exemplar uses the key
  terms from its dot point. English Advanced composition tasks use CONSTRUCT,
  because COMPOSE is not one of the app's command terms. The files were
  canonicalised, `npm run content:check` reports nothing, and the unit suite,
  type-check and lint pass.

- **Manifest.** Lists the five courses under HSIE and English, alongside
  Software Engineering and Enterprise Computing.
- **Syllabus timing.** Modern History (2024), Legal Studies (2025) and Economics
  (2025) are new syllabuses that are not yet examined. English Advanced (2024)
  is the current syllabus. Business Studies (2010) is the latest published Stage 6
  syllabus for that subject.
- **Not yet checked.** The questions are written to the standard of each
  syllabus. They have not been compared item by item with past HSC papers.
  Live Supabase databases keep the Biology rows until they are removed there:
  `supabase/seed.mjs` upserts and does not delete.

## [Unreleased] - 2026-09-11 (The Evaluate button was off the screen on a phone)

At 390px — an iPhone 12 — a student who had written an answer could not see the
button that marks it. It sat at x=355–461 in a 390px viewport, and the same at
375 and 320. It is the only way to have an answer marked.

The editor's footer row was `flex` with no wrap, so once the character and word
counts, the band label, the readiness meter and the free-evaluation counter had
taken their width, the action ran off the end of the card. Every ancestor is
`overflow: hidden`, and that is what made it unreachable rather than merely
awkward: a programmatic scroll reaches into such a container, a finger does not.

Both footer rows now wrap below `sm`, each wrapped line right-aligned so the
button lands at the end of a row rather than the start of a new one. Scoped to
below `sm` after measuring — an unscoped `flex-wrap` also fixed the phone widths
but cost 34px of footer height at 640px, where nothing was wrong.

| Width  | Before                  | After     |
| ------ | ----------------------- | --------- |
| 320px  | right 461 — unreachable | right 286 |
| 375px  | right 461 — unreachable | right 341 |
| 390px  | right 461 — unreachable | right 356 |
| 640px  | right 590, height 89    | unchanged |
| 900px  | right 850, height 95    | unchanged |
| 1280px | right 1222, height 95   | unchanged |

### 🔍 Why the suite could not have caught it

`evaluation-flow.spec.ts` clicks that button on Mobile Safari and passes,
because Playwright's `click()` scrolls the element into view first. Auto-scroll
makes a test pass on a control no user could reach, and every click-based test
in the suite shares that blind spot. The new guard measures GEOMETRY and never
clicks: at 320, 375 and 390 the box must already be inside the viewport.

Still open, and deliberately not fixed here: at 320px two header controls
("Copy", "Enter focus mode") are outside the viewport for the same reason. They
live in `CARD_HEADER_BAR`, chrome shared with the question card whose contract
is "same height, same fill, same border on both", so letting it shrink and
scroll needs its own change and its own verification.

## [Unreleased] - 2026-09-11 (Three WCAG AA failures, one pinned by its own test)

An axe sweep — the first in this repo — found three `serious` violations that
had shipped.

**White text failed AA on two band fills.** `bg-orange-600` (band 2) is 3.56:1
in both themes and `bg-green-600` (band 4, dark) is 3.30:1, against the 4.5:1
floor that applies because the chips wearing this pairing render `.t-label`,
12px at weight 500. Green carries far more luminance than its neighbours at the
same step: `blue-600` is 5.17:1 and `purple-600` 5.38:1. Both move to `-700`,
reaching 5.18:1 and 5.02:1. Orange could not be rescued the way band 3's yellow
was, by darkening the text — `text-orange-950` on `bg-orange-600` is only
4.40:1 — so the fill had to move. The tightest adjacent pair, band 1 red
against band 2 orange, goes from CIELAB ΔE 23.3 to 18.8, still well clear of
the ~10 where two fills read as one.

`bandColors.test.ts` had asserted that bands 1, 2, 4, 5 and 6 pair their fill
with white. It never asked whether white was READABLE on them, so it was
pinning the failure in place. It now computes the ratio for all six bands in
both themes, reading hexes from `tailwindcss/colors` at runtime, and
cross-checks itself against band 3's browser-measured figures.

**Two scrollable regions had no keyboard access.** The outcome-chip strip was
`overflow-x-auto` even with no chips in it, leaving a 153px sentence inside
about 100px with the scrollbar hidden and nothing focusable to tab to; it now
scrolls only when it holds chips. And the quick start guide — the panel every
new account reads first — could not be scrolled at all by keyboard, because its
tabs sit above the scroller and its buttons below.

`UserAgreementModal` has the same scrolling body and was deliberately left
alone: its scroller contains the consent checkbox and both buttons, so tabbing
already scrolls it.

## [Unreleased] - 2026-09-11 (The term-coverage pin was measuring an average of a good course and a broken one)

The must-use coverage pin ran over every shipped course at once and reported
85.3% of questions and 38.9% of terms — comfortably inside its bounds, and true
of no course in the library.

| Course                           | Questions with a must-use term | Terms that are must-use |
| -------------------------------- | ------------------------------ | ----------------------- |
| Software Engineering (reference) | 93.4%                          | 40.9%                   |
| Biology                          | 68.4%                          | 23.8%                   |
| Enterprise Computing             | 100.0%                         | 91.5%                   |

Enterprise Computing has all but nine of its terms marked must-use, which is
the panel's two groups saying the same thing — exactly the collapse the upper
bound exists to catch. It passed because Biology's 23.8% pulled the average
back into range.

The range now holds over Software Engineering, the one course through a full
authoring pass. The invariant — no lone command verb, no word the course is
written in — still applies everywhere, because that is a rule about the
matcher. The stale courses are measured and printed rather than asserted on.

### 📌 And the structural gate that did not exist

`CourseSchema` is deliberately forgiving, and was only ever exercised against
hand-written fixtures: the content students receive had no gate at all. A
repair on our own content is not resilience but a defect rendered invisible —
an exemplar whose body fails to parse reaches a student reading "No answer
provided." `courseDataIntegrity.test.ts` holds every course to that structural
bar, verified by corrupting the shipped data and watching it fail.

Two candidate checks were measured and rejected rather than shipped: "every
question is markable" cannot fail, because `repairPromptFields` falls back to
EXPLAIN unconditionally; and verb/mark-range disagreement is not a defect,
because `markRange` is a typical range and a 3-mark JUSTIFY is an ordinary HSC
question.

## [Unreleased] - 2026-09-11 (The review queue's triage score was written by the people being triaged)

The shared library's AI pre-screen scores each submission so a reviewer knows
what to look at first. It ran in the browser, and the browser then wrote the
number it got into the row it was inserting — and RLS lets an author write
their own row. So `quality_score: 100` in devtools sank your own submission to
the bottom of the queue, and skipping the screen entirely did the same thing
with less effort. A moderation signal the moderated party controls is not a
signal.

### The column is the server's now

- **`enforce_quality_score_authority`** (`supabase/schema.sql`) drops
  `quality_score`, `quality_notes` and `quality_screened_at` from any write by
  an end-user session — `auth.uid() is not null`, the same test the status
  trigger already uses. It drops rather than raises, because the same row
  mappers serve the studio's "Sync to Library" and an ordinary save must not
  become an error an author can neither understand nor fix.
- **An edit to the screened text clears the score.** The trigger is installed
  with the content column as an argument (`question` / `answer`), so a verdict
  never outlives the words it was given for — otherwise an author could be
  scored well on one text and submit another underneath it. Edits to anything
  else keep the score.
- **`POST /api/screen-contribution`** is the only writer. It takes a row id,
  reads the stored text back out with the service-role key, screens it with a
  prompt that lives on the server (`api/_lib/qualityScreen.ts`), and patches the
  result in. Nothing that decides the verdict comes from the request: not the
  content, not the wording, not the number.
- **A one-time cleanup nulls every score written under the old rule.** None of
  them can be told from a forged one. It is keyed on the new
  `quality_screened_at`, so it is idempotent and a re-apply of `schema.sql`
  leaves real scores alone — which `03_reapply_guard.sql` now proves, because
  that file exists for exactly this class of mistake.

### Unscored now means something, so it sorts FIRST

The screen fails open: a student has already written the work by the time it
runs, so an AI outage, a spent quota or a missing service key leaves the
contribution saved and unscored rather than lost. That makes "no score" the
statement that the one automatic check never happened and a person is the only
one left — so those items lead the queue instead of trailing it, and the review
queue labels them **Not screened** rather than showing nothing. Structure
(topics, sub-topics, dot points) has no screen to miss and stays at the back.

### Smaller things that fell out of it

- The screen is metered against the student's daily AI budget like any other
  call their action causes, and is **not** gated on a paid plan — screening a
  contribution is overhead the library imposes on a volunteer.
- `screenContentQuality` now has one caller, the studio's own batch screen, so
  it no longer passes `{ studio: false }`. That opt-out existed for the student
  contribution path, which is server-side now.
- The studio's local Quality Check score stays local: it used to ride into the
  row on sync, which is precisely the write that is no longer allowed.
- `getSupabaseAdmin` moved out of `api/_lib/stripe.ts` into its own module, so
  the screening endpoint does not load the Stripe SDK into a cold function.

**Proof, in the suite that runs against real Postgres**: four new blocks in
`supabase/tests/rls_negative_tests.sql` — an author cannot score their own
insert, cannot overwrite the score the server gave them, cannot carry a score
across a rewrite of the screened text, and (positive control) the service-role
path still can.

## [Unreleased] - 2026-09-11 (The shipped term lists, repaired by the studio's own rules)

The audit studio has carried two repairs that need no AI for a while — Tidy
Terms removes what is not a syllabus term, Add Terms appends the ones the dot
point and the question are built on — and the shipped library had never been
run through either. Both ran over `public/courseData`:

- **99 entries removed across 58 questions.** Connectives a student was being
  told to weave in ("therefore", "consequently"), a bare "Technique", and the
  other lone words the subject is written in.
- **151 terms added across 123 questions**, in the syllabus's own casing and
  appended after whatever a curator already wrote: "primary data", "ethical
  issues", "safe work practices", "peer review", "Torres Strait Islander
  Peoples", "scientific knowledge".

No AI produced any of this: every added term is lifted from the dot point or
the question, and every removed one failed a rule the app already enforces on
new content. What changed is only `keywords`; the run was verified to
re-serialise the files byte-identically apart from those lines.

### 📌 The regression pin earned its keep

`syllabusTermCoverage.test.ts` failed on the repair, which is exactly the job it
was added for: questions carrying at least one must-use term moved 77.3% →
**85.4%**, and the must-use share of all terms 35.1% → **40.3%**. The move is
legitimate by construction — Add Terms appends terms taken from the question's
own sources, and a term from those sources is must-use by definition — so the
bounds are re-baselined in this commit, with the reason written next to them.
The ceiling that matters did not move: past half, "must-use" would have stopped
distinguishing anything.

## [Unreleased] - 2026-09-11 (The matcher was rebuilding itself on every keystroke)

Benchmarking the new must-use classifier to decide whether it needed a cache
found the cost was never the classifier: it was the matcher underneath it, and
the bill had been going to the writing area all along.

| Measured, ten-term question                                 | Before | After      |
| ----------------------------------------------------------- | ------ | ---------- |
| `getKeywordVariants`, one three-word term                   | 472µs  | **0.2µs**  |
| `createKeywordRegex`, whole list                            | 6.5ms  | **5.7µs**  |
| One must-use classification (10 terms × 5 sources)          | 24.7ms | **0.07ms** |
| A question switch, across the five surfaces that show terms | ~124ms | **0.36ms** |

`getKeywordVariants` expands a term through hyphen swaps × spelling swaps ×
inflections and then runs every derived form back through the spelling swaps
again. It is pure, it is called with the same handful of curated terms all day,
and nothing remembered the answer. `renderEditorHighlights` rebuilds its regex
on EVERY render, so a student typing into a ten-term question paid 6.5ms per
keystroke to re-derive a regex identical to the one it had just thrown away.

Both are now memoised behind a bounded map — bounded because the audit studio
walks thousands of terms in one session, and past the cap the oldest entry is
the one it has finished with.

**Three ways a cache like this lies, each now pinned by a test:**

- **A shared mutable array.** The cache holds one variant list per keyword and
  the function is exported, so a caller that sorted or pushed to what it got
  back would be editing the answer every later caller receives — silent
  corruption in the matcher that decides what a student is credited for. It
  hands out a copy.
- **A key collision.** The regex memo keys on the term LIST, joined on NUL —
  the one character a syllabus term cannot contain. Joined on a space,
  `["automated unit testing"]` and `["automated", "unit", "testing"]` are the
  same key and the second silently inherits the first's regex.
- **Leaked regex state.** The memo holds the alternation SOURCE, never a
  compiled regex: a compiled one carries `lastIndex`, and the callers mix
  `.test()` (which advances it) with `.split()` and `.exec()`. Every call still
  gets its own `RegExp`; building one from a cached source is microseconds.

## [Unreleased] - 2026-09-11 (The same terms, said the same way, wherever you meet them)

The must-use split reached the panel, the exemplar brief, the marker, the
coverage chip, the PDF, the nudges and readiness. Two surfaces that show the
SAME terms to the SAME student were still showing them as one undifferentiated
set — which is the distinction the panel exists to make, unmade twice on the
same screen.

### 📊 The metrics dashboard's term tracker

Every term is a pill here, and they were ordered used-then-missed with nothing
to say which mattered. Must-use terms now lead inside each group, carry the
same bookmark the panel gives them, and the count splits the two kinds apart
(`1/2 key · 0/1 more`) on the same rule the panel uses — only where both kinds
exist. The `Syllabus %` tile still measures coverage of the whole list, which
is what it has always meant; its tooltip now says how much of that is the terms
the question names.

### 🗂 The question card's filler list

With no scenario to fill it, the card lists the question's terms "to weave in"
— the one surface a student in Focus Mode sees at all, since the panel is gone
there. It printed every term identically. Must-use terms now lead and carry the
mark; supporting terms are left unmarked rather than dressed as something they
are not.

### ✍️ Our own generator learned the rule we tell external models

`llmSeedBrief` tells an external LLM to write a must-use term in the same words
its source uses, because the app re-derives the split by matching terms back
against those sources. `keywordInstruction` — what the app's OWN keyword
generation and enrichment send — never said it, so the app could produce
"automated testing methodologies" for a question about "automated unit testing"
and then fail to see that the question was built on it. It now states the
must-use-first convention, the same-words rule, and the weak-lone-term
exclusions the sanitiser already enforces.

The audit's **Off-Syllabus Terms** description was also still describing the
narrower rule it had before the last change; it now names what it actually
strips (any command verb in any form, a lone subject-wallpaper word) and what
it leaves alone (a phrase built on one of those words).

## [Unreleased] - 2026-09-10 (Every surface counts the terms the same way)

The must-use split had reached the terms panel and the exemplar writer. Four
surfaces still counted every term equally — the coverage chip, the live nudge,
draft readiness and the printed report — and so did the marker. A student could
be told by one surface that a term is what the question is built on and by the
next that it is worth exactly as much as any other word on the list.

### 🎯 What each surface does now

- **The coverage chip** reads `1/2 key · 0/1 more` where the question has terms
  of both kinds, and stays the single `2/9 used` where it does not. Nothing to
  separate, nothing separated.
- **The live nudge** names the terms the question is built on first, and says
  so when they are what it is naming: "The question is built on automated unit
  testing, test data — work them in" rather than "Weave in 3 more syllabus
  terms". Same nudge, better aim — no new line on screen.
- **Draft readiness** weights a must-use term double inside its coverage
  sub-score. Flat coverage said a draft that had reached for two supporting
  terms was as ready as one that had answered the question in its own
  vocabulary, and readiness is the app's answer to "is this worth marking yet?".
- **The printed report** lists unused must-use terms first — on paper there is
  no tooltip to explain that some terms matter more, so the order has to — and
  renames the line when everything it shows is a term the question names.
- **The marker** gets the two lists rather than one, and one narrow rule with
  them: name the missing must-use terms as a content gap where the response did
  NOT earn full marks, never at full marks, and never move the mark for the
  presence or absence of a term. The rubric decides the mark; this decides what
  the feedback explains.

The metrics dashboard is deliberately untouched.

### 📐 Readiness was re-checked, not assumed

The readiness levels were calibrated against the exemplar library, and changing
a sub-score that is 30% of the number moves every draft a little. Re-run over
808 library samples: half the scores move at all, by a mean of **+1.06** points,
worst case ±5. The two anchors the thresholds were set on are intact — a weak
answer sits at **53 → 53**, a complete one at **82 → 85**, which moves toward
the documented ~85 rather than away. **No threshold changed.**

### 🧱 One helper, not five filters

`splitSyllabusTerms` returns the classification as two lists in list order,
which is the shape every surface that weights terms actually wants. The exemplar
brief, the marker block, the metrics hook and the report all read it, so there
is one definition of "the terms this question is built on" rather than five
filters that agree until one of them is edited.

## [Unreleased] - 2026-09-10 (A must-use term has to be a term)

The two entries below built a must-use/supporting split and then leaned on it —
the panel groups by it, the exemplar brief is written on it. Measuring what it
had actually promoted across the shipped library found the rule was too
generous in one specific way: **a lone word in the question stem got in on the
strength of the stem alone.**

56% of must-use terms are single words. Most are real (`sql`, `agile`,
`phenotype`, `front-end`), and the tail was not: `design`, `testing`,
`performance`, `patterns`, `trends` — and `evaluate` ×4 and `evaluating` ×4,
which are command verbs. So the panel told a student that "Evaluate" is a
syllabus term to weave in, and the exemplar brief told the model to build a
full-mark answer around it. 40 of 418 questions carry at least one.

### 🎯 The guard applies everywhere, not just to headings

The generic-word guard existed already but ran only against a topic or
sub-topic name, on the reasoning that a heading is the whole course's
wallpaper. A question stem is wallpaper too, for this purpose: a Software
Engineering question says "security" because every question in the subject
does. `isWeakLoneTerm` now rejects a keyword that IS a course-wallpaper word or
a command verb in any inflected form, from any source. A PHRASE containing a
verb is untouched — the syllabus writes "evaluating test data", and the subject
matter is in the noun.

Over the shipped library this demotes 31 terms and costs almost nothing:
questions carrying at least one must-use term go 77.5% → **77.3%**, and the
must-use share of all terms 36.4% → **35.1%**.

### 🧹 One definition, at generation as well as repair

`isSyllabusTerm` gates both what the AI is allowed to return
(`sanitiseKeywords`) and what the studio's Tidy Terms strips
(`dropNonSyllabusTerms`). It dropped only the question's OWN verb, which is why
"evaluate" survived on a DISCUSS question. It now applies the same weak-lone
rule, so the app stops writing terms its own audit would remove.

### 🔍 The exemplar flag now measures something, and is visible

`thin-coverage` fired below 40% of EVERY listed term — wrong twice over: a
supporting term ("bioethics" on a CRISPR question) is not one a model answer
has to contain, and an exemplar can clear 40% while missing every term the
question is built on. It now asks the only content question mechanics can
honestly ask: did the top-band answer use the terms the question, its scenario
and its dot point name themselves? Two or more missing, because one is a
judgement call and two is a pattern — **13 of 259** band-5+ exemplars, against
34 under the old rule, and the two sets barely overlap.

It is also a **warning** rather than a note. Only warnings reach
`promptHasExemplarMismatch`, and only that reaches the studio's Exemplar
Mismatch filter, so as an info flag this check had never been visible to
anyone.

### 📌 Pinned against the real library

`syllabusTermCoverage.test.ts` runs the classifier over `public/courseData` and
holds two different kinds of line: an invariant that never needs re-baselining
(no must-use term is a lone verb or wallpaper word) and deliberately wide
ranges for the two aggregate shares, so a stemmer tweak that silently moves a
fifth of every terms list fails a test instead of quietly changing what the
panel means.

## [Unreleased] - 2026-09-10 (Exemplars written on the terms, and an export that can seed more)

The follow-up to the entry below, in the two places that entry left alone: the
model answers a student reads next to the terms panel, and the file a teacher
hands an external LLM to write a course.

### 🎯 A sample answer is written ON the question's terms

The brief that goes to the model said `Syllabus terms: about 4` and never named
one. So an exemplar was written from the question's wording alone, and the
Syllabus Terms panel beside it could list nine terms the model answer never
touched — a student reading both is told two different things, and the audit's
own `thin-coverage` check exists because that happens.

The scope brief now carries the terms themselves, split the way the panel
splits them:

- **Must-use** — named by the question, its scenario, its dot point, its
  sub-topic or its topic. A full-mark exemplar uses every one, each doing real
  work in a sentence rather than listed.
- **Supporting** — used where they add precision the answer has earned.

The split carries the mark, which is the part that makes it a ladder rather
than a checklist: a 3/6 answer takes its terms from the must-use list first and
falls back on general language for the rest, and the terms it leaves out are
part of why it earns 3. Nothing is bolted onto an answer that has not earned
it. The same brief drives the revise-to-another-mark path, so a ladder built by
revision matches one built by generation.

The syllabus above the question travels with the request — `Workspace` passes
topic, sub-topic and dot point down to both exemplar modals, and the audit
studio's batch passes the dot point its tree node already carries — so a term
the syllabus names but the question does not is still a must-use term.

### 📤 An export that can seed the next course

A teacher filling a subject with an external LLM hands it a file. The file was
a bare array of courses: the model could see the SHAPE, and had to guess every
rule the shape does not carry — which verbs are legal and at what marks, how a
marking guide is written line by line, what belongs on a keywords list.

Exports now carry those rules with them, under `_instructions_for_llm`, from
`utils/llmSeedBrief.ts`. The verb list is DERIVED from `data/commandTerms.ts`
rather than restated, so it cannot drift from the tiers, band ceilings and time
guides the app actually enforces. The import path already unwrapped that
envelope (`analyzeAndSanitizeImportData`), so a file that has been out to a
model and back imports exactly as it left — which the round-trip test pins.

The brief states the term rule the app now depends on: **write a must-use term
in the same words its source uses.** The panel re-derives the split by matching
each term back against those five sources, so a model that writes "automated
testing methodologies" for a question about "automated unit testing" has
produced a term the app cannot see the question is built on.

The same block fills the Import screen's LLM template, which until now was a
stub — `{ ROLE: '...' }` and an empty array — plus the shape an empty file has
to state rather than demonstrate. `docs/dataset-generation-prompt.md` keeps the
prose version for writing a subject from nothing, and now says so.

## [Unreleased] - 2026-09-10 (The must-use terms a question names itself)

The Syllabus Terms panel splits its chips into the terms an answer HAS to
contain and the ones that would merely strengthen it. That split was decided
against the dot point and nothing else — and the dot point is the one place a
question's own vocabulary often is not.

Reported from use: a question asking to "assess the effectiveness of an
automated unit testing methodology compared to manual ad-hoc testing", filed
under a dot point about applying testing methodologies, named both terms in its
own stem and neither in the dot point. So every term on its list — including
the two the question is built on — was shown as merely supporting, and the
must-use group the panel exists to make visible was empty.

### 🎯 Every level of the question's context

`utils/syllabusTermSource.ts` reads all five: the question, its scenario, the
dot point, the sub-topic and the topic, strongest first. The chip says which
one names it ("Named in the question", "Named in the syllabus dot point"),
because those are not the same claim on a student's answer.

Over the 418 shipped questions that carry a terms list:

|                                           | Before | After |
| ----------------------------------------- | ------ | ----- |
| Questions with at least one must-use term | 56.7%  | 77.5% |
| Terms marked must-use                     | 21.7%  | 36.4% |

The split still separates: two thirds of all terms remain supporting, which is
right — "Credibility", "Bias" and "Peer review" on a question about assessing a
Wikipedia article are answer vocabulary, and nothing names them.

**Two matchers, and both are needed.** The shared keyword matcher knows what a
stem cannot: initialisms ("multi-factor authentication" ↔ "MFA"), British and
American spellings, and the coordination ellipsis a syllabus writes
("supervised and unsupervised learning"). A stem run over both sides knows the
one thing it cannot: `textContainsKeyword` inflects a phrase as one string, so
it bends only the last word and only once — "automated unit testing" yields
"automated unit test" but never "automated unit tests", which is how a scenario
that says "a suite of automated unit tests" failed to name the term the
question was written on. Stemming stays out of the shared matcher deliberately:
that one drives highlighting and the coverage meter, where a false positive
credits a student for a term they never wrote.

**A heading is the whole course's wallpaper.** A sub-topic called "Testing and
debugging" sits above every question in it, so it corroborates a phrase but
must not promote a bare "testing" — the same judgement `syllabusTermGaps.ts`
already makes for single words, so that list is now shared rather than copied.
Headings decided 8 promotions in total; the question decided 675.

## [Unreleased] - 2026-09-09 (Terms the question is about, guaranteed on its list)

The follow-up to the term work, and the direction the previous entry recorded
as not mechanically detectable. It is — but not by requiring all three sources
of a question to agree. The rule that works is asymmetric.

### 🎯 Missing Terms

A term the syllabus dot point and the question are both built on is what the
question is ABOUT, and a student told which terms to use should be told that
one. `utils/syllabusTermGaps.ts` finds them; the studio flags them as **Missing
Terms**, names them on the row badge, and **Add Terms** appends them — a local
edit, no AI, like Tidy Terms beside it.

**The rule is asymmetric, and the asymmetry is the whole design.** Measured over
the 417 shipped questions:

| What must use the term                               | Flagged |
| ---------------------------------------------------- | ------- |
| Dot point + question                                 | 78%     |
| Dot point + question + scenario                      | 14%     |
| Phrase: dot point + either. Lone word: all three     | 34%     |
| **The same, minus words too generic to stand alone** | **29%** |

The 78% is almost all VERBS — "Modify", "Select", "develop", "record". Dot
points open with an instruction and so do questions, so single words agree for
reasons that have nothing to do with subject matter. Requiring all three fixes
that and breaks something else: a well-written scenario PARAPHRASES. The
thirteen shipped questions about big data have it in the dot point and the
question, and their scenarios say "billions of data points" and "a large influx
of data" — so the strict rule cannot see the very term that prompted the check.

Subject matter lives in noun phrases; the verbs hide among single words. So a
phrase needs the dot point plus either the question or the scenario, and a lone
word needs all three. That finds "big data", "primary data", "peer review",
"alternative splicing", "ethical issues", "safe work practices" and "Torres
Strait Islander Peoples", at 1.2 terms per flagged question, and leaves
"Select" and "record" alone.

Five things the shipped content forced:

- **Longest run wins.** Taking adjacent PAIRS shredded "Torres Strait Islander
  Peoples" into three overlapping fragments of one name.
- **Punctuation ends a phrase.** Flattening it ran "primary, secondary,
  tertiary structures" together into a phrase the syllabus never wrote.
- **Whole words.** Substring matching read "model" as present in "modelling".
- **Command verbs in every form.** `commandTermsList` holds "EVALUATE" and dot
  points write "evaluating test data", so the participle escaped and the term
  offered was the instruction glued to its subject.
- **A course's own wallpaper is not a term.** All three sources of a Software
  Engineering question say "software", "development" and "project", so agreeing
  across them proved nothing: 22 of the 30 terms the lone-word branch offered
  were words like those. They are held in a SECOND list, consulted only where a
  single word asks to stand as a term — putting them in the phrase-building
  stop list would have deleted "big data" and "data security" with them.

Terms are added in the syllabus's own casing, appended after whatever a curator
already wrote; nothing already on a list is touched.

## [Unreleased] - 2026-09-09 (A guide the studio could not see was broken, and terms that were never terms)

### 🩹 A marking guide whose bands run together read as well-formed

Reported from use: non-standard marking guides had every button that could fix
them disabled, on questions the navigator showed were plainly wrong.

`isNonStandardRubric` read only the START of each line. Nine of the shipped
guides are written with their bands run together on ONE line —
"…as demonstrated in the investigation.4 marks: Provides an accurate
analysis…3 marks: Describes…" — so it saw exactly one band, which cannot be out
of order and cannot be absent, and passed them. That verdict disabled both
repairs: "Reformat Guides" needs this predicate, and "Write Marking Guides"
needs it or a missing guide. A curator who could see the guide was wrong had
nothing to press.

The scan now finds bands anywhere in the text. A band mid-line must carry a
colon and one at the start of a line need not, which is the asymmetry that
keeps "award 1 mark for each correct point" inside a band description from
reading as a band of its own. Re-run over all 418 shipped guides: **nine newly
flagged, no other verdict changed.**

### 🧹 Syllabus Terms that were not syllabus terms

`keywordInstruction` has always told the model to exclude "generic academic
words …, the command verb and instruction words". The first two were enforced
by `sanitiseKeywords`; instruction words never were. So 25 of the 418 shipped
questions carry a Syllabus Terms list containing the command verb ("Assess"),
an over-long phrase, or — most of them — connectives: a student reading the
panel is told to make sure their answer contains the word "therefore".

Three parts:

- `GENERIC_KEYWORD_STOPWORDS` gains the connectives, so the sanitiser matches
  the rule it has always stated.
- `isSyllabusTerm` and `dropNonSyllabusTerms` split that judgement out of
  `sanitiseKeywords`, which keeps its twelve-term cap. The cap is a preference
  about newly written lists; applied to a curated list of nineteen it would
  throw away seven real terms, so the studio's repair only ever REMOVES.
- The studio gains an **Off-Syllabus Terms** filter, a row badge, and a
  **Tidy Terms** action — the one repair on that screen needing no AI, so it
  runs as a single local edit rather than through the batch runner, whose
  1.5s-per-task provider pacing would spend five minutes on two hundred writes
  to IndexedDB.

### 📐 What was measured and rejected

The ask was to flag when key words from a prompt and scenario are missing from
its Syllabus Terms list. Four mechanical formulations were tried against the
shipped library:

| Rule                                                                 | Flagged              |
| -------------------------------------------------------------------- | -------------------- |
| Syllabus words from the dot point, present in the question, unlisted | mostly command verbs |
| A listed term absent from the question/scenario                      | 400/418              |
| A listed term absent from question, scenario, guide AND exemplars    | 325/418              |
| A term used elsewhere in the course, in this question, unlisted      | 301/418              |

All noise, and for a good reason: the panel is a scaffold for the ANSWER, so
its terms are not supposed to appear in the question. "Bioethics" is exactly
right for a CRISPR ethics question that never uses the word. Deciding which
terms a question is missing needs to know which terms matter, which is a
judgement rather than a rule — the AI quality screen's job, not a regex's. What
shipped instead is the inverse defect, which IS mechanical because the app
already defines it.

## [Unreleased] - 2026-09-09 (The two things a backgrounded batch still needed)

Letting a batch be walked away from left two loose ends, both flagged at the
time and both closed here.

### 🔔 A run behind a closed studio is visible in the header

Nothing stopped an admin starting a two-hundred question batch, closing the
studio, and forgetting it existed — it spends AI quota and writes to the
library for ten minutes, and the only sign of it was a transient notice they
may not have been looking at.

The Admin tools control now carries a pulsing mark while a run is in flight,
and the studio's own entry in that menu carries a "Running" pill. Both are
driven by the run state the studio already reports to `App` — a boolean, not a
count, deliberately: reporting progress up to the composition root would
re-render the whole app once per completed task for the length of the run, and
the count is a click away in the studio and in the notices themselves.

The mark is a suffix, never a rename. Everything that selects the tools menu —
the e2e specs included — matches on its name, so the trigger reads
"Admin tools — a content audit batch is running" and the menu entry keeps its
label exactly and takes the state on `aria-describedby`, which is the right
ARIA slot for something true right now that will not be true later.

### 🪶 The step notices hold one slot instead of filling the queue

`useToast` holds four toasts at five seconds each. A step notice every second
or two fills that, starves everything else the app has to say for the length of
the run, and still shows the reader only every third step.

`showToast` takes an optional `replaceKey` naming a SLOT rather than a message:
a second toast with the same key updates the one already holding that slot.
Crucially it keeps the held toast's id and duration — `App` keys the visible
`<Toast>` by id, so the message changes under a countdown that carries on
running rather than restarting. That is the difference between a notice that
shows the latest step and then goes away, and one that refreshes its own five
seconds forever and never lets anything else on screen. The audit studio's
per-step notices are the first user; the behaviour is unchanged for every
existing call, which passes no key.

`tests/unit/backgroundBatchVisibility.test.tsx` covers both: the header marking
a run without renaming anything, and a keyed toast holding one slot across
fifty steps while a quota warning raised in the middle of them still gets
shown.

## [Unreleased] - 2026-09-09 (A batch you can walk away from)

The audit studio would not let go of you while a batch was running: Close was
disabled and Escape was blocked, so a two-hundred question run held an admin on
one screen for ten minutes. The reason was real — walking away left a run
spending AI quota and writing to the library with its progress log and its Stop
control gone from the screen — and the answer was wrong. The fix is not to hold
someone there; it is to keep telling them what is happening and to leave a way
back.

### 🚪 Close it, and the run carries on

Close and Escape work during a run now. Three things had to be true for that to
be safe rather than merely possible:

**The run has to survive the close.** `App.tsx` unmounts the studio when it
closes, and `useBatchRun` aborts on unmount — so simply enabling the button
would have made "close" quietly mean "cancel", which is worse than not offering
it. The studio reports its run state to its host (`onRunStateChange`), which
keeps it mounted, rendering nothing, until the run ends. It stays unmounted
when idle, so a closed studio still costs nothing: it is `buildAuditTree` over
1,500 nodes on every change to the library.

**Each finished step reports.** The batch runner already writes a line per
task; on screen that lands in the processing log, which is where it belongs —
a toast per step there would sit on the studio's own Stop button for the length
of the run (§5: a transient notice never sits on a control). Off screen there
is no log, so the same line becomes the notice, carrying the count so far:
"Scoring quality: Explain how DNA replication… (12 of 200)". Keyed on tasks
accounted for rather than on the log, because the runner republishes progress
several times per task and only one of those is a step finishing.

**There is a way back.** The notice that ends a run — complete, stopped, halted
or finished with failures — carries an "Open studio" control when the studio is
closed. Reopening finds the same run still in it, with the log, the progress
bar and Stop where they were, and the tree still expanded as it was left.

**The step notices are deliberately plain.** `useToast` gives an actionable
toast fourteen seconds instead of five and protects it from being dropped when
the queue is full; both are right for an offer someone must read and decide
about, and both are wrong for a notice arriving every second or two. The first
version put the reopen control on every step notice AND on the one raised when
leaving — and the leaving notice then sat on screen while the entire run went
past behind it, with not one step ever shown. Found by driving it in a browser,
not in the diff.

`tests/unit/contentAuditStudioRobustness.test.tsx` swaps its "disables Close
while a batch is in flight" test — which stood for the old decision — for the
new contract: the run can be left, the host is told it is still going, the
leaving notice explains it, and the step notices arrive once the studio is off
screen.

## [Unreleased] - 2026-09-09 (The tree keeps its promise about arrow keys, and a long run says how long)

### ⌨ The audit tree is a keyboard widget

It has said `role="tree"` since it was built, which is a promise about arrow
keys that nothing kept — and the DOM underneath was worse than silent. Every
row carries two buttons, so Tab walked a keyboard user through three thousand
stops to cross the shipped library, and there was no other way in.

The buttons are out of the tab order and the tree is one stop with roving focus
inside it, which is both the ARIA pattern and the faster way to work:

| Key           | What it does                                                       |
| ------------- | ------------------------------------------------------------------ |
| ↑ ↓           | The previous / next row on screen                                  |
| → / ←         | Open a branch, or step into it; fold it, or step out to the parent |
| Home / End    | The first / last row on screen                                     |
| Space         | Tick the row (cascading, exactly as a click does)                  |
| Shift + Space | Extend the selection from the last row ticked                      |

Under a search or a filter every shown row is already open, so ← there means
"out to the parent" for the whole depth rather than doing nothing visible.

Two details worth keeping. The ring is drawn on the ROW, not on the element
that holds focus: focus sits on the `treeitem`, which also contains the whole
subtree, and outlining that draws a box around a hundred rows. And the row that
takes focus must claim it only for itself — React's `onFocus` is `focusin` and
bubbles, so the first version left a ring on every ancestor back to the faculty
band.

**`useFocusTrap`'s selector was wrong in a way this surface makes load-bearing.**
It read `button:not([disabled])` and `[tabindex]:not([tabindex="-1"])` as
alternatives, so a `<button tabindex="-1">` — which a browser will never Tab to
— counted as a tab stop. With three thousand of them now in one dialog, the
trap's idea of "the last focusable" would have been a control Tab cannot reach,
its wrap-around would never fire, and Tab would walk out of the dialog. The
exclusion now applies to every entry in the list.

### ⏳ A long run says how much longer

A batch is paced at 1.5s between calls and runs one at a time, so two hundred
questions is upwards of ten minutes. The honest question is "can I go and do
something else", and a bar creeping along answers it only by being watched.
The progress row now carries an estimate beside the count, from elapsed time
over tasks finished. It stays quiet until two have finished: one sample is not
an average, and a figure that swings between wild numbers on every update is
worse than none.

`tests/unit/auditTreeKeyboard.test.tsx` covers the single tab stop, each key,
and the estimate's thresholds.

## [Unreleased] - 2026-09-09 (Pick up what a run dropped, keep your place, and select a run of rows)

The second pass over the Content Audit Studio, from the same source as the
first: using it. Three things that cost an admin time on every long session.

### 🔁 A failed task is a thing you can run again

`runBatchOperations` recorded a failure as a line of prose in its log and
nothing else, so a run that ended "184 succeeded, 16 failed" left the sixteen
recoverable only by reading a scrolling terminal, matching task descriptions
back to questions by eye, and rebuilding the selection by hand. Failures are
usually the transient half of a long run — a rate limit, a truncated response —
and a second attempt clears most of them.

`BatchProgress` now carries `failedTaskIds`, `useBatchRun` passes them out on
the outcome, and the studio keeps the failed tasks so the footer can offer
**Retry Failed (n)**. The retry goes through the same engine picker as any
other run, so an admin whose batch was rate-limited on Pro can drop to Flash
and finish the remainder without touching the tree. Keeping the tasks is safe
because each one already resolves its question through `coursesRef` at action
time rather than from anything captured when the batch was assembled — the same
property that let "Fix All Gaps" draft an exemplar against the marking guide it
had just written.

A new run clears what the last one left, and closing the studio forgets it: a
retry offered against a library that has moved on is worse than no offer.

### 📌 Faculty and course rows pin while you scroll

Expanded, the shipped library is around 1,500 rows. Scroll into the middle of
one and the screen is a list of dot points and questions with nothing saying
which course, let alone which faculty, they belong to — and the answer is
hundreds of rows back up. The two levels a reader loses first now stay on
screen; topics and sub-topics stay in the flow, because four pinned bands would
be most of a short window.

Row heights moved from padding to fixed values (44px for a faculty band, 36px
for everything else — the heights those rows already had) because a pinned
course has to know how tall the band above it is. A pinned row also needs a
ground of its own: the row's own fill is a translucent tint, and left
transparent the rows sliding under it read straight through.

### ⇧ Shift-click takes everything between

Selecting a topic's worth of questions was one click per row on a screen whose
whole job is running one action over a lot of content. Shift-clicking a second
row now takes every row on screen between it and the last one ticked, cascading
into each the way a plain tick does.

It only ever ADDS. File managers move the anchor's meaning around on a
shift-click, and getting that subtly wrong here would deselect work an admin
had spent minutes assembling; extending is the useful half and it cannot lose
anything. The anchor stays put, so a second shift-click reaches from the same
place.

`tests/unit/auditBatchRetry.test.tsx` covers the retry offer, its clearing on
success, and the three shift-click cases; `tests/unit/batchProcessor.test.ts`
pins the failed-id reporting. Checked on screen at 1600px in both themes.

## [Unreleased] - 2026-09-09 (A faculty at a time, and a screen that is not mostly empty)

Two things came back from actually working in the Content Audit Studio. Its
scope was courses, so "fix the science subjects" meant ticking each one and
hoping none was missed. And on the wide window an admin runs it on, the screen
was three full-width bands stacked up — header, filter rail, action row — each
holding its content out at the left and right edges, so the middle of every
band, and the middle of every tree row, was empty.

### 🏫 Faculty is the top of the tree

Courses now sit under the faculty a school files them in, and a faculty row
selects, collapses and reports on the lot. `utils/subjectAreas.ts` is the one
definition of what a faculty is: its name, its icon, its colours, and the rule
for filing a course under one. Two copies were folded into it — the icon and
colour maps in `ManifestImportModal` and the private `detectSubjectArea` inside
`useSyllabusData` — so the importer and the studio can no longer file the same
course two different ways.

A course's own `subject` wins where it has one; where it does not (the shipped
course JSON carries none — it is attached at import time from the manifest) the
course NAME decides, so a library assembled any other way is still grouped
rather than landing wholesale in "Other". An unrecognised recorded value falls
back to the name too, so one typo in a course's metadata does not strand it
away from its subject.

A faculty is a grouping, not a sixth syllabus level: it has no id in the data
model and no `courseId` of its own, so `Clear Questions` resolves a selected
faculty to the courses under it rather than pretending otherwise, and
`Export JSON` — which needs exactly one course or topic — stays disabled on one.

### 📐 A control rail, and readouts in a column

The filters left the header. Ten of them wrapped onto three lines up there and
pushed the tree off the bottom of a short window, which is why that band was
capped at 42vh with a scrollbar of its own. They are rows in a 17rem rail
beside the tree now, grouped into what the studio can generate and what it can
only flag, with their counts in one column you can read down. Below `md` the
rail lies down into a line that scrolls sideways.

In the tree, a branch's coverage figure was pinned to the far right of the
window with nothing between it and the name — about 1,100px of nothing per row
at 1600px. The name column is bounded now and the readouts sit in a fixed
column, and the space between them carries the branch's own gap tally: how many
dot points under here have no question, how many questions have no marking
guide, no sample, no outcome. That was the one thing this screen could not
answer without expanding every branch or toggling each filter in turn.

The coverage pill became a bar, at a fixed width so the column compares; the
header lost half its height with the rail gone; and the header, the tree and
the action row now share one 1800px grid rather than each spreading to its own
edges.

### 🎨 Colour that means the gap

The seven batch buttons were seven saturated fills — indigo, sky, amber, pink,
purple, teal, rose — chosen per button and matching nothing, beside a gradient
`Fix All Gaps` and a red `Clear Questions`. Nine filled buttons in a row with
no hierarchy, and the same gap red on its chip, red on its row badge and indigo
on the button that repairs it. They are quiet now and take their tone from
`AUDIT_FILTERS`, so chip, badge, tally dot and button are one colour per gap,
and the one filled button left is the one that runs everything.

### 🔎 Smaller things that were in the way

- **`Select All Filtered` works after a plain search.** It used to need a chip;
  after a search you ticked each row by hand. It takes only rows that matched in
  their own right, never the ancestors shown as the path to them — the
  difference between clearing three questions and clearing the topic they sit in.
- **The selection says what it is**, not just how big: "1 faculty · 2 courses ·
  5 questions". 47 could be one course or forty-seven questions, and those are
  very different batch runs.
- **One name for the studio.** The menu that opens it said "Syllabus Audit
  Studio"; its own title, its docs and its tests all say "Content Audit Studio".
- **A tile with no classes on it.** `ManifestImportModal`'s subject tile built
  its fill and border with `colourClass.split('')[1]` — a split on the empty
  string, so those were single characters and Tailwind rendered nothing. The
  shared tile string is applied whole.

`tests/unit/subjectAreas.test.ts` and `tests/unit/auditFacultyGrouping.test.tsx`
pin the filing rule, the grouping, the cascade, the faculty-to-courses
resolution before a destructive action, and the search selection. Checked on
screen at 700, 1600 and 2560px, in both themes.

## [Unreleased] - 2026-09-07 (A roll you can read, and take someone off)

The follow-up the previous entry left open. Wiring `enrol_in_class` gave a
teacher a way to build a class and no way to correct one: enrolment upserts, so
a mistyped username became a permanent member — counted in the cohort's
averages, visible in its figures, for the life of the class. And nobody could
see the roll at all, because `list_my_classes` returns a member COUNT: a teacher
could be told they had 28 students and never learn which 28.

### 🗄 Schema §24

Two functions, both on the same rule as `enrol_in_class` — a class's own staff,
which admins pass too:

- **`list_class_members`** — the roll, by username, display name and role.
  SECURITY DEFINER because §19 narrowed `profiles_read` to `can_view_student`,
  and a class's staff must be able to see a member who has not submitted
  anything yet. That student is exactly the one a teacher is looking for.
- **`remove_from_class`** — the undo. Removing someone who is not on the roll is
  a no-op rather than an error (the caller's intent is already satisfied, and a
  second click after a slow first one should not read as a failure), while an
  unknown username raises. So does the class's OWNER: they live on
  `classes.owner_id` rather than in `class_members`, so a delete would affect
  zero rows and look like it had worked. Reassigning a class is `create_class`,
  which is admin-gated for the reason §19 gives.

Nothing here alters a table, so an existing deployment just runs the section.

### 👥 The roll on screen

Class Insights shows who is enrolled while the roll controls are open, with
co-teachers marked, and a remove control on each. Removal goes through the
shared `ConfirmationModal` and says what it costs: the student's marked work is
kept, but it stops counting towards this class's figures and their progress
disappears from the teacher's view. A database predating §24 simply shows no
roll, and enrolment keeps working.

### ✅ Tested where it actually runs

`supabase/tests/class_roll_tests.sql`, wired into the CI job beside the other
two SQL suites. **`rls_negative_tests.sql` is refusals by construction** — every
block there expects the privileged action to fail — which is the right shape for
an authorisation boundary and the wrong one for a feature: a function that
raised for everyone would pass every test in that file. So the refusals go there
(reading and removing from a class you do not teach) and the behaviour goes in
its own file: the roll names its members, removing a non-member is a no-op,
removal empties the roll, and the owner and an unknown username both raise.

Both suites were run against a real Postgres 16 before pushing, in CI's exact
order on a clean database, along with the schema re-apply guard.

## [Unreleased] - 2026-09-07 (The half of class record-keeping that was never wired)

A review of the Supabase-only surfaces — user, teacher and school record
keeping, and the visualisations over them. Every commit touching them since #159
had been a cross-cutting sweep (typography, tokens, toasts); none was about what
they do.

### 🏫 The database could keep class records. The app could not.

Schema §19 gave classes everything: the `classes` and `class_members` tables,
RLS on both, `can_view_class`, and two functions — `create_class` (admin-only,
because owning a class is what grants sight of student work) and
`enrol_in_class` (open to the class's own staff, "once an admin has made you the
owner, managing your roll is your job"). Both revoked from `public` and granted
deliberately.

**No client code has ever called either.** Only the read side was wired.

That is not cosmetic. `visible_student_ids` resolves a teacher's cohort THROUGH
class membership, so a teacher with no class gets an empty Class Insights, an
empty cohort heatmap and an empty Student Progress roster — a dashboard of zeros
that no amount of student work will ever fill. Only an admin, who bypasses class
scoping, saw anything. The demo seeder already knew: it writes `class_members`
directly with a service-role key, under the comment "a teacher with no class
sees nothing" — a key no real deployment's admin has in a browser. And
`CohortBreakdown` has been telling teachers their students must be "enrolled in
a class you teach" while offering no way to enrol one.

Both halves are wired now, each in the surface the schema's own access rules
point at:

- **Admins create classes** in the Usage Dashboard, beside the school
  management that was already there — school, name, owning teacher, year — and
  can seed a roll.
- **Teachers manage their own roll** from Class Insights: add a student, or a
  co-teacher, by username.

Add-only, deliberately: the database has no removal function, and a button
cannot rely on one that does not exist on every deployment. Recorded as a
follow-up rather than faked.

### 🫥 Zeros that explain themselves

A teacher who teaches no class no longer gets four zeros and an empty table. The
panel says so: these figures count students enrolled in classes you own, an
administrator creates classes and names their owner, and once yours exists you
can add students here. An empty screen is a place to act from.

### 📈 Charts you can read a number off

Every chart was accessible and correctly formed — single-hue sequential heatmap
with documented contrast reasoning and a passing contrast test, thin marks,
`role="img"` carrying the raw values. None had a hover layer, so a teacher could
see the shape of a term's work without being able to say which week the dip
started.

- **Cohort activity** gains a crosshair and a per-day readout, with one hit band
  per day — at 620px over 365 days the mark itself is 1.7px, so the target has
  to be the band. The readout replaces the summary while hovering rather than
  competing with it.
- **Weekly trajectories** and the **student band trend** gain per-point targets
  at twice the mark's radius, naming the week or the attempt, its date and its
  value.

### 🗓 A date that read as the day before

The cohort chart's buckets are UTC date strings. `new Date('2026-09-07')` is UTC
midnight, which renders as **6 September** for every reader west of Greenwich —
which is every Australian user. The new day labels are built from the ISO parts
instead. The student band trend is the opposite case and treated as such: those
are real instants, so they render in the reader's own timezone.

### 🔤 Two buttons called "Create"

The admin dashboard grew a second one. Now "Create school" and "Create class".

## [Unreleased] - 2026-09-07 (Dead code, and a gate so it stays dead)

`Plan-NextImprovements-2.md` had two code items left on it. Both are now closed,
one of them by deciding not to do it.

### 🧹 Four modules nothing imported, one of them worse than dead

The plan named `hooks/useRetry.ts`. A proper sweep found four, and the largest
was the problem: `utils/importBackupUtils.ts` (7,892 bytes) is a complete,
unwired snapshot/rollback/merge/diff implementation — a second answer to
questions `storageUtils.createBackup`, `restoreBackup` and `dataManagerUtils`'
`mergeOrAddTopic` already answer in the shipping code, where a rolling backup
is written after every successful save. Dead code is a tax; a dead _duplicate_
of live logic is a trap, because wiring it up would give the app two merge
semantics.

Also removed: `data/hscData.ts` (a deprecation shim preserving compatibility
with no importer), `components/Import.tsx` (39 bytes — one `lucide-react`
import and nothing else), and the unused `useFormDirty` export.

### 🚧 The sweep is a gate now

The plan filed this as "worth a sweep when something else is open in those
files", which is how it sat there: a sweep that has to be remembered is a sweep
that stops happening. `npm run check:dead-code`
(`scripts/findOrphanModules.mjs`) fails on any module under `components/`,
`hooks/`, `services/`, `utils/`, `data/`, `pdf/` or `api/` that nothing
imports. It runs in `test:all` and in CI beside `check:eager-reads`.

A module reachable only from a test counts as live — under test is not unused.
Entry points are exempt, because nothing imports the root of a graph.

`tests/unit/findOrphanModules.test.ts` holds the guard in both directions, and
earned its place immediately: the first version of the scanner matched
`from '…'`, `import(…)` and `require(…)` but **not** a bare
`import './x'` side-effect import, so it would have reported a live module as
dead. A false negative leaves dead code; a false positive deletes working code.

### 📉 A keyword lexicon, priced and declined

The plan's item 7 — the matcher cannot double a final consonant that is not
`-l`, so `commit` → "committed" and `grep` → "grepped" miss — asked for "a small
lexicon of doubling verbs".

Priced against every keyword the app ships (1,517 distinct terms across the
three courses), that lexicon buys **two keywords**: `commit` (1 use) and `grep`
(2 uses). `control` and `model` are already covered by the existing `-l` rule.
Three occurrences in the whole library, against a hand-maintained word list
every future curator would have to know to extend.

The earlier impression that this was bigger came from pattern-matching
consonant-vowel-consonant endings, which catches 117 keywords — almost all
nouns (`gametes`, `codon`, `comparison`) that never take `-ing`/`-ed`. Doubling
is a verb rule and the keyword library is mostly nouns. Closed with the number
rather than left open.

### 🗑 The duplicate course file at the repo root

`HSCEnterpriseComputing09122025.json`, 195KB. Re-measured rather than taken on
trust: 82 questions, every one of them already in the `public/courseData/` copy,
and the only code that names that filename (`supabase/demoSeed.mjs`) reads it
from `public/courseData/`. Deleted.

## [Unreleased] - 2026-09-07 (A batch run you can always leave)

The audit studio pass ended at the studio's own door. This one follows the
batch machinery out of it — the shared runner, the other surface that drives it,
and the review queue the studio pushes into.

### 🔒 A modal you could not close, ever

`StarterQuestionsModal` decided whether a run was still going with
`progress && !progress.isComplete`. `isComplete` does not mean "the run has
ended"; it means "every task is accounted for", and a run that was **stopped**
or **halted by the provider** ends with tasks unattempted, so it is false and
stays false.

The result, reproduced before it was fixed: after pressing Stop, the close
button is disabled, the Stop button is still on screen and now does nothing, the
Done button never appears, and `onClose` can never fire. The only way out is to
reload the page — losing nothing already written, but with no way to know that.
A bad API key or an exhausted daily quota reaches the same dead end without the
user pressing anything, and this modal is offered to a teacher straight after a
syllabus import.

The run is over when the runner returns, which it always does. That is now what
the modal asks, and a stopped run gets the same "Done" as a finished one,
because both end with questions written and a person who needs to leave.

### 🧩 One owner for the run lifecycle

`hooks/useBatchRun.ts`. The two batch surfaces had each grown their own version
of "is a run in flight?" and only one of them was right. The hook holds the
AbortController, the running and stopping flags, the progress, and the abort on
unmount — so a surface that forgets any of them is no longer possible to write.
`ContentAuditModal` moved onto it too, losing its own copy.

### ⏱ Stop now means stop, and the first task starts at once

The runner's 1.5s don't-burst-the-provider gap was a bare `setTimeout` that
nothing could interrupt, so pressing Stop meant sitting out the remainder before
anything acknowledged it — twice over at concurrency 2, where both workers are
asleep in it. The wait races the abort signal now.

It also ran _before_ the first task, which is a gap against a request that has
not been made. Every batch paid 1.5s before starting, including the one-task
batches that are the studio's common case. Pacing is a gap between calls, so the
first call of each worker skips it; with the workers started together the gap
never staggered them anyway, it only ever paced them one after another.

### 🚪 The review queue's other two ways out

Escape was guarded while a decision was in flight. The close button and the
backdrop were not — the same defect the audit studio had, in the surface the
studio pushes into. A click on either walked away from a running **Approve All**
that then kept publishing to the shared library with nothing on screen to show
it or stop it. All three now read one `canClose`.

And since holding a reviewer in the modal is only fair if the modal says how
long is left, Approve All counts: "Approving… 12 of 200" rather than an
indefinite "Approving…".

### 🔤 A write path into course data that was typed `any`

`StarterQuestionsModal`'s `updateCourses` prop took `(draft: any) => void`, so
every lookup inside its Immer write was unchecked — against a real
`Updater<Course[]>` on the other side of the prop. Typed.

## [Unreleased] - 2026-09-07 (The audit studio, read end to end)

A reliability, performance and design pass over the Syllabus Audit Studio
(`components/admin/ContentAuditModal.tsx` and `components/admin/contentAudit/`).

### 🔁 One definition of every gap, because three had already drifted

The predicate for "this question has no marking guide" existed three times: in
the header's chip counts, in the tree's filter, and in "Select All Filtered".
The third copy was three filters behind the other two — `verbNotInQuestion`,
`flagged` and `exemplarMismatch` matched nothing in it, so clicking Select All
Filtered under any of those chips selected zero items and then reported
"Selected 0 items for optimisation" as though that were the answer.

`AUDIT_FILTERS` in `auditModel.ts` is now the single declaration — id, label,
tooltip, colour tone and predicate — and the chips, the counts, the row badges
and the selection all read it. A filter can no longer exist in one of them.

`unEnriched` came out with the same sweep. It had a predicate, a count and a
select branch, and no chip ever rendered it, so nothing could reach it.

### 🗣 One name per thing

The same gap was called three names on one screen: the chip said "No Marking
Guide", the row badge said "No Rubric", the button said "Rubrics". The rest of
the app only ever says "Marking Guide". The studio now uses one wording per gap
throughout, and the buttons lead with the verb — "Write Marking Guides (8)",
"Draft Samples (5)", "Re-mark Samples (12)", "Score Quality (40)" — so a button
says what a click does rather than naming the noun it acts on.

### 🚪 A running batch can no longer be walked away from

Escape was already blocked during a run. The close button was not: clicking it
left the batch running with its progress log and its Stop control gone from the
screen, still spending AI quota and still writing to the library. Close is now
disabled while a batch is in flight, and an unmount aborts the run rather than
leaving tasks writing into a component that no longer exists.

### 📮 The repair queue survives a reload

Repairs land in IndexedDB immediately; the record of which ones still need
pushing to the shared library lived only in a ref. An admin who repaired fifty
questions and then refreshed lost that record with no warning — the repairs were
safe, but nothing knew they were unpushed. The outbox is now persisted, and an
entry whose question has since been deleted is discarded on restore rather than
failing every future sync forever (only a successful push clears one).

### 📊 A quality score that could reach the review queue

`makeScreeningTask` wrote `qualityScore` to the prompt and queued nothing, while
its own comment said the score was "carried to the shared library on sync so
reviewers can triage" and `handleSyncToLibrary` went to the trouble of packing
it. Since the outbox decides what is ever pushed, a question that was only
screened could never take its score anywhere. Screening now queues the question.

### ⏱ Tasks read the library as it is, not as it was

A batch task captured `courses` and its own tree node when the batch was
assembled, then ran minutes later. Under "Fix All Gaps" that meant the
sample-answer task drafted its exemplar from a copy of the question that
predated the marking guide the same run had just written for it. Tasks now
resolve the question at action time, which also lets them fail cleanly when it
was deleted mid-run instead of skipping silently.

### ⚡ Four things that were being recomputed for no reason

- `promptHasExemplarMismatch` word-counts and keyword-scans every sample answer
  (~800 across the shipped courses) and ran from both the counts and the filter,
  on every change to `courses` — which during a batch is once per completed
  task. Memoised on the prompt object, so Immer's identity does the invalidating.
- The command-verb regex was compiled once per prompt per rebuild. There are
  about thirty distinct verbs; it is cached by verb, with the `g` flag dropped
  so a shared instance has no `lastIndex` to carry between calls.
- Each keystroke in the search box re-filtered ~1,500 nodes and redrew all of
  them. The query is deferred, the needle is lowercased once instead of per
  node, and the row is a memoised component keyed on node identity.
- Toggling a filter wrote every id in the library into `expandedIds`. Expansion
  under a search or filter is derived instead — which also stops the toggle
  permanently destroying whatever the admin had collapsed.

### ♿ The tree says what it is

`role="tree"` / `treeitem` / `group`, with `aria-level`, `aria-expanded` and
`aria-selected`; `aria-pressed` on the filter chips; a labelled search field; a
real `role="progressbar"`; and the processing log as a `role="log"` live region.

### 🧭 Smaller things the pass turned up

- `progress.currentTask` was computed by the batch runner and thrown away. On a
  200-question run the bar moved and nothing said which question it was on.
- A filter chip reading 0 was still clickable, and only ever led to the "No
  items found" screen. It stays on the rail — that it reads 0 is information —
  but disabled.
- The empty state said "No items found / Refine your search or filters" whether
  the library was empty, the search matched nothing, or a chip had nothing left
  to show. Three situations, one shrug; now three answers and a way out of each.
- After "Clear Questions" removed 40 questions, the footer's selection figure
  still counted them. Selected ids are pruned to nodes that still exist.
- The recalibration log said "Band 4 rules" for what is a command verb's
  cognitive tier.
- The chips carried no light-theme colours, so the whole rail sat at
  `text-*-400` on white.

### 🎨 Two accessories off the header

Measured against `.claude/skills/frontend-design`. The tracked-out eyebrow
("Content Overview", `tracking-[0.5em]`, hairline beside it) said nothing the
title under it did not, and the gradient tile held a generic pulse-line glyph —
the stock AI-product mark, in the position the skill reserves for the most
characteristic thing in the subject's world. That position now belongs to the
coverage dial, which is live syllabus data. The blurb was rewritten from
"perform bulk synthesis to align content with NESA performance standards" into
what the screen actually does, and "Content Units"/"Proof Data" went back to
being questions and sample answers.

## [Unreleased] - 2026-09-02 (Holistic-rewrite mode, and a band-stacking bug)

### 🧾 A legend for markers that are not on the page

Where a rewrite reworks the response throughout, "What Changed" prints a
sentence saying so instead of a row list. It was still printing the −/+ colour
key above that sentence — a key to two colours that appeared nowhere. The legend
now goes with the rows, and in holistic mode the heading, the stats and the
message span the page instead of leaving the heading in a narrow column with
the sentence wrapping awkwardly beside it.

### 📐 Two columns that end level

`balanceLastColumn` only acted when the second column was entirely empty. A band
whose columns merely ended at very different depths left the space under the
shallower one dead, because the full-width band after it starts below the
deeper. It now evens any ragged last page, cutting the page's block sequence
wherever the two halves come closest — never between a heading and its body, or
between the halves of a bound pair.

**And a bug that came with it.** The depth recomputation after balancing was
seeded at zero and REPLACED the page's recorded extent, so a band that ended on
a page it placed nothing on wiped every earlier band off it and the next band
printed straight over content already there. Taking the maximum with the
existing value fixed the overprint but kept the band's own pre-balance depth,
so the evening-out bought nothing. The depth is now recomputed from the band's
own placements and floored by a snapshot taken before the band ran.

### 🔤 The metric says which terms, not just how many

"2 of 4 key terms" is a scoreboard: it says how many without saying which, so a
report whose commentary praises the student's terminology can look like it
contradicts its own metric. Under the response, the report now names the
syllabus terms still missing — computed with the same matcher that produced the
count, so the two cannot disagree.

Worth recording: the matcher was probed against the terms in the review before
anything was changed, and it already caught every one — `biometric login`,
`biometrics`, `high contrast`, `password`. The count was right; what was missing
was the list behind it.

## [Unreleased] - 2026-09-02 (Band calibration on short questions, and export polish)

### 🎯 A short question's band is a proportion now, not a countdown

`getBandForMark` gave full marks the verb's ceiling band and took one band off
for each mark dropped. On a question with enough marks to spread across the
range that is right. On a short one it is not: a 4-mark tier-6 question scoring
1 came out at **Band 3 "Developing"** — a quarter of the marks, described as
work no standards-based reading puts above Band 2.

At or below `PROPORTIONAL_MARK_CEILING` (4 marks) the band now follows the
fraction of marks earned. Above it the original ladder stands, so nothing
changes for the 5-, 6- and 8-mark questions that make up most of the bank.

| 4-mark, tier 6 | was    | now        |
| -------------- | ------ | ---------- |
| 1/4            | Band 3 | **Band 2** |
| 2/4            | Band 4 | **Band 3** |
| 3/4            | Band 5 | **Band 5** |
| 4/4            | Band 6 | Band 6     |

Full marks still reach the verb's ceiling under both rules. This moves the band
shown against existing evaluations of short questions, and the exemplar targets
derived from them.

### 🔤 A term written out in full now matches the acronym a student writes

A keyword curated as "multi-factor authentication" never matched "MFA" in a
response, so a report whose commentary praised the student's use of MFA could
show **2 of 7 key terms**. `getKeywordVariants` now derives the initialism of a
multi-word term. Three letters minimum, stop words dropped, and never an
ordinary English word — "intelligent systems" must not derive "IS", and
"customer analysis needs" must not credit every "can" in the response.

### 🎨 Export polish

**Syllabus terms are teal, not emerald.** Adopting the green/red diff convention
put two greens on the page meaning different things — "this is a syllabus term"
and "the rewrite added this". The terms move to the neighbouring hue; the diff
keeps the green.

**A legend under "What Changed"** says what − and + mean, once, for the reader
who does not arrive with the convention and for anyone holding a greyscale
photocopy.

**The footer is #4B5563.** It was #6B7280, which clears WCAG AA on a screen;
this is a print-first document and toner lays down lighter than the same grey
on a display.

**The evidence ticks** centre on the cap height of the line beside them rather
than hanging off its baseline.

## [Unreleased] - 2026-09-02 (Formatting review follow-ups)

### 📐 Structural and accessibility fixes to the exported report

A formatting review of the export raised thirteen points. Several described the
pre-redesign build and were already resolved (the "Band 6 —" title, the
watermark, "Assessment Score", the unstructured diff). These are the ones that
were still live.

**A diff pair could be split across the column boundary.** The sentence a
student wrote and the sentence it became are one thought in two blocks, and the
flow — and then the column balancer — were free to put them in different
columns. `keepWithNext` binds them: the flow reserves both, the balancer will
not break between them, and neither half is split internally. A new fixture
(`D-edited-band4`) exercises a rewrite that edits in places rather than
wholesale, so the sample set actually produces a multi-row diff list — none of
the previous three did, which is why the defect survived.

**A section could be torn in half.** Next Steps printed its heading and one tick
box at the foot of a column with the other three arriving at the head of the
next, above an unrelated card: correct column-major flow that reads as three
orphaned checkboxes under nothing. A heading now moves with everything it
introduces, whenever the section would fit a column of its own.

**Green and red for the diff.** Additions were drawn in the band accent, which
made them amber on a Band 3 report and purple on a Band 6 one — a diff in
colours nobody reads as a diff. Additions are green-700, cuts are red-700, each
on a soft tint of its own, and the pair's two tints meet so it reads as one
card. This is the one place the band accent does not mean attainment, and it is
worth the exception.

**One accent per document.** The improved response was framed in the EXEMPLAR's
band colour, putting a second hue on the page — purple beside a green result
strip — for a fact its heading already states in words. It now takes the
report's own accent.

**The footer was failing WCAG AA.** The disclaimer — the line that says this is
practice feedback and not a NESA result — was 6pt in #9CA3AF, about 2.3:1 on
white. It is 7pt in #6B7280 (4.8:1), and the page-number line 7.5pt.

**Shrink to save a page.** `chooseScale` took the largest scale that merely fit
the page budget, so a report needing 1.05 pages printed as two. It now takes the
fewest pages first and the largest scale that reaches that count — sample C went
from three pages to two.

**Also:** a wrapped line that is nothing but a closing full stop is rejoined to
the line before it (the wrap's doing, not the text's); Strong Evidence takes
ticks rather than solid squares, so it and the Next Steps boxes read as one
system in two states; heading icons are centred on the cap height of the
uppercase text rather than on its line box; and the watermark, when asked for,
draws at 4% rather than 6%.

## [Unreleased] - 2026-09-02 (The exported report is a document now)

### 📄 A design for the marking-feedback PDF

The export had the right content and no document design. Three samples
(`npm run samples:pdf`) showed it: pages between a quarter and seven-eighths
blank, the three things a reader opens the file for carrying no more weight
than an aside, and four unrelated meanings sharing one green on a Band 4
report. `projectDocs/Plan-PdfExportDesign.md` records the findings; this is
the work.

**Half the paper was blank for one reason.** `splitOversized` only split a
breakable block taller than a _whole_ column, and neither flow function split
at a boundary — so a 70mm paragraph arriving with 40mm of column left moved
whole and the 40mm was lost. `splitToFit` (`pdf/layout.ts`) now splits prose at
the boundary with three-line orphan and two-line widow minimums, and
`balanceLastColumn` evens the last page of a two-column band so a short report
stops leaving its right-hand column empty. One sample's second page went from
86% white to the best-filled page in the file.

**The question, the response and the rewrite are the document.** The question
sits in a bounding box at 14pt bold with the syllabus trail beneath it, where
it belongs — the trail says where the question came from, which is context a
reader wants after the question rather than in front of it. The student's
response and the improved response are framed as a matched pair, so the
comparison the whole report builds towards is one a reader can actually make.

**One colour, one meaning.** The band accent (now read from the app's own
`BAND_HEX_DARK` rather than a literal map that had already drifted at Band 4)
means attainment and nothing else; emerald means a syllabus term and appears
only in the prose; rose means something to fix; slate is structure. The command
verb is coloured in the question alone — it used to be coloured wherever it
occurred, so "explaining" and "explained" came out indigo in the commentary.

**"What changed" is readable.** Edits are still found at word level, where they
are accurate, then widened to the sentence each fell in, where they can be read
and acted on. The −/+ marker moved into the gutter, so a change that wraps
marks every line of itself rather than only the first. Where a rewrite reworks
the response throughout, the section says so instead of printing a truncated
quotation from each side and letting it pose as a comparison. The retention
figure ("23% of your own writing kept") is gone: accurate, demoralising, and
always low for a rewrite a band up.

**Everything else.** Section headings take the app's own display voice —
uppercase, bold, sheared into an oblique — with a vector icon each
(`pdf/icons.ts`). The score box is a full-width result strip reading RESULT,
not "Assessment Score" ("assessment" carries weight in an HSC year, and this is
practice marking); it names the band as well as numbering it. The masthead
became content rather than page chrome, so its ~20mm is spent once instead of
on every page, and continuation pages carry a one-line running head. Marker's
notes span the full width and grow into whatever space they land in. The
watermark is opt-in. Multi-page reports carry bookmarks.

## [Unreleased] - 2026-08-23 (A unit round-trips now, and the Studio fits the screen)

### 🗑️ Clear Questions, keep everything else

The Content Audit Studio had no delete action at all — its footer was AI
generation buttons only. A teacher who wanted to wipe a topic's questions and
regenerate them from scratch had no way to do it short of deleting and
rebuilding the topic, sub-topics and dot points by hand.

Selecting a course, topic, sub-topic or dot point in the tree now exposes a
"Clear Questions" button in the footer. It empties every `prompts` array
reachable under the selection — `clearQuestionsInScope`
(`utils/stateUtils.ts`), the same Immer-`produce` idiom as the existing
`deleteSyllabusItem` — without touching the Topic/SubTopic/DotPoint objects
themselves, their names, ids, or `focusAreas`. The confirmation dialog names
the scope and a live-computed question count before anything is deleted
("Delete all 42 questions under «Cell Biology»? … you can reimport questions
into this exact structure afterward."), and multiple selected scopes are
each cleared and summed into one toast. Structure survives specifically so a
cleared topic is ready to receive questions again immediately — including
straight back through the import below.

### 📤📥 Export a unit, edit it, reimport it — cleanly

Exporting a single topic as JSON existed already, but only via the Data
Manager's Export tab — a different modal a teacher had to already know
about. The Studio now has its own "Export JSON" button, scoped to whatever
single course or topic is selected, using the same filename convention as
the Data Manager's export flow.

Reimporting that file — or one hand-edited by an external tool — now shows a
merge plan before anything is applied, not just validation counts: which
existing topic it will land on (or that it will create a new one), how many
sub-topics/dot points/questions are new versus matched-and-updated. The
matched-vs-new counts come from `previewTopicMergePlan`
(`utils/dataManagerUtils.ts`), which walks the same id-then-normalized-text
matching the merge engine itself uses, without running the merge. The
preview is prunable, too: a sub-topic or dot point the external edit got
wrong can be dropped before committing, matching the parity bar the AI-text
import (`TopicSyllabusImportModal`) already set. An "Import JSON…" entry
point on the Studio's header opens this same `TopicImportModal`, pre-scoped
to the selected node's course, so exporting, editing and reimporting a unit
no longer means leaving the Studio.

Along the way, a real merge gap is fixed: `mergeDotPointCollections` merged
a dot point's `description` and recursed into its `prompts`, but never
merged `focusAreas` — an externally-edited focus area silently reverted to
whatever was already there on reimport. Merging now follows the same
"imported value wins when present" rule the rest of the merge engine uses,
so a unit really does round-trip losslessly: export it, edit prompts,
focus areas or anything else, reimport, and the edits land on the existing
nodes with no duplicates.

A second gap surfaced only by actually driving the round trip end-to-end:
`buildTopicExportPayload` returns a `Course[]` — one course wrapping one
topic, the same shape `ExportFlow.tsx` has always produced for a
single-topic export — but `TopicImportModal`'s file handler accepted only a
bare `Topic` object, so exporting a topic from the Studio and immediately
reimporting that exact file failed with "The imported file is not a valid
single topic object." It now unwraps a `Course[]` of that shape (one
course, one topic) the same way it already accepts a bare topic, so the
Studio's own Export → Import round trip — and any file exported the same
way elsewhere — works without a manual reshape.

### 📐 The Studio's header and footer stopped falling off the bottom of the screen

Content Audit Studio rendered as `fixed inset-0` with an unbounded header
(hero row + a wrapping filter-chip bar) and an unbounded footer (engine
selector + up to nine action buttons), both `flex-shrink-0` with no
`max-height` of their own. Once header and footer together exceeded the
viewport — a laptop at reduced window height, a tiled half-screen window,
browser zoom above 100%, or just enough filter chips wrapping to three or
four lines — the tree in between was squeezed toward nothing and the
overflow was not reachable by any scrollbar: nothing above the fixed box
scrolls, and the box itself doesn't grow.

The header and footer now cap their own height and scroll internally
(`custom-scrollbar`, the same treatment the tree already had), and the
outer dialog carries `overflow-y-auto` as a fallback so the whole Studio
becomes page-scrollable rather than clipping if header and footer content
ever still outgrows the cap together. Every control — search, filters,
tree rows, and the footer's action buttons — stays reachable by scrolling
at any viewport height.

## [Unreleased] - 2026-08-20 (The cognitive spectrum)

### 🌈 A traffic light became a spectrum

The verb ribbon's footer bar filled to `tier / 6` in one flat tier colour, with
six coloured dots beside it. Six dots and a one-colour bar is a traffic light,
and it is not what a ladder of thinking looks like.

It is one continuous six-colour wash now — red through purple, every stop
`getBandHex(1…6)` and nothing else — painted twice: once at low opacity across
the whole width, so the tiers a student has not reached read as _ahead of them_
rather than as empty track, and once at full strength, revealed as far as their
tier. The reveal is `clip-path: inset()`, deliberately not `width`: a percentage
width rescales a gradient into that width, so at tier 3 all six colours would be
squeezed into half a bar and every colour would move whenever the question
changed.

### 📐 Two halves of the same diagram, on two different scales

The bar filled to `tier / 6` while the six dots were laid out by
`justify-between` — which puts each dot wherever the six label texts happen to
leave it. Five of those six labels are `hidden` below `sm`, so on a phone **the
dots moved depending on which tier was current**. At tier 3 the bar was filled
to 50% and the third dot sat at roughly 40%.

One geometry now: band _i_ owns `[(i-1)/6, i/6]` and its dot sits at the centre
of that band, so filling to `tier / 6` lights band _tier_ whole with its dot
inside the lit region. The four "measurement ticks" are gone with it: they sat
at 16 / 38.7 / 61.3 / 84%, which are none of the five boundaries between six
tiers, and there was no tick at the 50% the Deep Learning Threshold crosses.
Five real boundaries replace them, cut in the page's own background colour so
they read as gaps in the spectrum; the 3/4 one is wider, because that is the
threshold, and the dashed rule now descends into it.

Both defects have been in the file since the repository's initial import. The
six commits that touched this footer since changed text tokens and contrast
ratios only.

### 🔤 One cue line, in words, instead of a fifth vocabulary

The four span labels above the bar — `Basic Recall`, `Explain & Compare`,
`Analyse & Apply`, `Evaluate & Create` — named spans of the ladder rather than
tiers, so nothing could derive them, and two of the four were paraphrases that
had drifted from the `TIER_GROUPS` title they came from. They are one live
`role="status"` line now, and every fragment of it is sourced: the tier's own
title and subtitle, `getTierTargetBand`, `getBandName`. Colour is never the only
signal (DesignSpec §2), so the level is stated in words as well as in hue — and
"Band Cap" is the wording, because that is what the stat tray above it and
`projectDocs/commandVerbs.md` already call this number.

It is polite, not assertive: changing question is ordinary navigation, and
assertive interrupts a student mid-sentence. It renders in the no-verb state
too — a live region has to exist before it can change — and in that state it
still names no tier.

The live region is the **lede only** — "Tier 4 · Analyse & Apply · Band Cap 4 ·
Sound". A `status` re-announces its whole content every time that content
changes, and the whole cue runs to about 140 characters, so putting the subtitle
inside it meant reading a full prose sentence aloud on every question change on
top of the part that actually changed. The subtitle stays in the line, visible,
unhidden and readable at will — while the tier strip above is shut it is the
only copy of it in the document — and is simply outside the region that speaks.

### 🔋 One infinite animation out, one 900ms flare in

The current step's dot carried `animate-ping`, which is `1s … infinite`, on a
component that is mounted for the entire session: it animated behind every
student for as long as they wrote. It is replaced by `tier-ignite`, a one-shot
bloom over the band just reached, keyed on the tier so React replays it on each
change and then it stops. The net budget is **one infinite animation removed,
one one-shot added**.

The dot has its own bloom, `dot-bloom`, rather than sharing the bar's. A flare
built for a bar segment is `scaleY(2.4)` with no matching `scaleX`, and on a
`rounded-full` child that is not a halo, it is a vertical teardrop — held for
900ms every time the question changes. `dotBloom` scales uniformly, at the same
duration on the same curve, so the dot and its band still ignite as one event.

`tierIgnite`'s final frame is `opacity: 0`, and that is load-bearing rather than
tidy: the reduced-motion block in `index.css` sets `animation-duration: 0.01ms`
and `animation-iteration-count: 1`, which does not skip an animation — it runs
it once, instantly, and lands on its final frame. A flare ending at `0.85` would
burn a permanent bloom into the bar for exactly the readers who asked for no
motion. Nothing here uses `requestAnimationFrame`, so the global block covers
the rest.

### 🕯️ Smaller things, mostly light-theme

- The Deep Learning Threshold's rule was `border-slate-300/30` on a near-white
  page — the one annotation here naming something a student could not deduce,
  invisible in half the app. The contrast suite walks text nodes and cannot see
  a border, which is why nothing reported it.
- `components/CognitiveSpectrum.tsx` is deleted. It was imported nowhere, and it
  held a hard-coded fourth copy of the six tier colours in a `switch` — the
  exact drift `tests/unit/bandColors.test.ts` exists to prevent, in a component
  that owned this feature's name. `renderUtils.ts` no longer points at it.
- The track is `h-3`: eight pixels is too thin to read a six-colour spectrum in.
- The cue line's bottom margin is `mb-7`. The threshold chip hangs above the dot
  row into that margin, and between about 640px and 900px — wide enough for the
  chip to be shown, narrow enough for the cue to run to two full lines — `mb-5`
  left it 8px under the text and it read as the end of the sentence. Neither
  sweep of the redesign could see it: the chip is `hidden sm:block`, so it is
  invisible at 375px and 320px, and the cue is one line by 1400px.
- `workspace-chrome.spec.ts` identified the paste guard by a phrase from its
  body — `/own words/i` across every `status` region on the page. The cue line
  is a `status` region too and tier 2's subtitle ends "in your own words", so
  the filter matched two elements. It matches the banner's own heading now.

### 📏 The scale labels come back, derived — and the leap is drawn

The four labels the section above records as deleted are back, above the
spectrum, as a **scale rail**. Two of them, verbatim.

That section called them span labels and said nothing could derive them. **That
was wrong, and it is why they looked underivable.** `Explain & Compare` is
byte-identical to `TIER_GROUPS[2].title` and `Analyse & Apply` to
`TIER_GROUPS[3].title`; `Basic Recall` and `Evaluate & Create` are paraphrases
of `TIER_GROUPS[0].title` and `TIER_GROUPS[5].title`. The row was four **tier**
titles — tiers 1, 3, 4 and 6 — with tiers 2 and 5 dropped, laid out by
`justify-between`, which put none of them over the tier it named.

Those four tiers are the floor, the ceiling, and the two sides of the Deep
Learning Threshold. So the rail names the two **spans** they bound rather than
the four rungs — naming the rungs again is what the dot row below already does
from `tierShortLabel` — and that is the only partition of the six tiers this
app's own logic supports: the 3/4 boundary is where `getBandForMark` stops being
able to return Band 4, and it is the Verb Gate's Band 3 cap.

The words are `Remember & List – Explain & Compare` and `Analyse & Apply –
Evaluate, Synthesise & Create`, from `TIER_GROUPS`, dropping to
`Remember – Explain` / `Analyse – Evaluate` below `xl`. **"Basic Recall" does
not come back**: it exists nowhere in the data, and typing it into the footer
again would be the fifth hand-written copy this whole series exists to kill. The
derived equivalent is `Remember & List`.

The rail costs the footer **no height**. It is `absolute` in the band of air the
threshold chip already hangs in — `RIBBON_TIMELINE_CUE`'s `mb-7`, whose middle
the chip occupies and whose two ends were empty.

**The leap from Band 3 to Band 4 is drawn three ways**, none of them new
pedagogy:

- The spectrum runs continuously through four 2px boundaries and is **cut** at
  the fifth, an 8px slot. A step up in kind, not degree, said in the only
  language a bar has. At tier 3 the leading edge comes to rest inside the slot —
  the playhead stops at the gate.
- The rail states `Band Caps 1–3` and `Band Caps 4–6` on the two shoulders, from
  `getTierTargetBand`, in the two adjoining tiers' own colours. The leap as a
  number, in the app's own unit.
- The cue line's tail names which side the reader is on.

### ✂️ The cue's prose subtitle is gone, and it was never the only copy

The cue used to end with the tier's full prose subtitle, 44–96 characters about
the tier. It ends with 32 characters of structure instead — `Above` or `Below
the Deep Learning Threshold` — which points at the marker on the bar 20px below
it. The live region is untouched, byte for byte.

The section above says the footer's copy of the subtitle was "the only copy of
it in the document" while the tier strip was shut. **That was never true.** The
strip has no shut state of its own: it and the footer are siblings under the
same `overflow-hidden` wrapper inside the same `inert`-gated panel, so
`RIBBON_TIER_SUBTITLE` renders `group.subtitle` for every tier whenever the cue
is on screen at all. Deleting the footer's copy loses nothing that was ever
reachable.

One consequence worth recording, because the last entry in the list above turns
on it: the phrase "in your own words" — tier 2's subtitle — is no longer in the
footer at all. The `workspace-chrome.spec.ts` filter stays, because
`getByRole('status')` still matches more than one node on that page, but the
comment explaining it named a collision that had already stopped existing when
it was written (the subtitle sat outside the `role="status"` span from the
start).

## [Unreleased] - 2026-08-14 (The verb ribbon, and the reason it was never seen)

### 🧭 The reference disappeared at the moment there was something to explain

The command verb hierarchy — the panel that says what a DESCRIBE question is
asking for, what it caps you at, and how long to spend on it — lived inside the
expanded syllabus navigator. Choosing a question folds that navigator down to a
breadcrumb, so picking a question destroyed the reference explaining that
question's command verb, at the exact instant there was a verb to explain. It
came back only if the student pressed "Change", and it came back as a fresh
mount: which is why the component's own "a deliberate collapse survives the next
question" logic, comment and all, could never once have run. The state it
remembered was thrown away by the remount every time.

It renders from one place now, in both navigator states, and it is **shut** in
the folded one. Folding the navigator buys a calm page above the writing
surface, and seven hundred pixels of reference unfolding into that space would
hand straight back what the fold just bought. Beside the syllabus dropdowns,
where the page is a chooser rather than a writing surface, nothing changes.

**Worth recording, because nobody will rediscover it:** this is also why no
end-to-end test had ever rendered the component. Every spec reaches the
workspace by selecting a question, and selecting a question removed the ribbon
from the page. Five contrast defects had been sitting inside it, in the open,
for as long as the suite has existed.

### ⌨️ Fifty controls inside a panel the interface said was shut

The collapsed ribbon was `max-h-0 opacity-0 overflow-hidden`, which is a visual
collapse and nothing else. Six tier headers, thirty-eight verb chips and six
timeline steps — fifty controls — stayed in the tab order and in the
accessibility tree behind a panel the UI had told the reader was closed. It is
`inert` while shut now, with the toggle and the panel wired together by
`aria-controls`, which is the pattern three other disclosures in this codebase
already had.

The animation was guessing, too. `max-h-[1600px]` on a panel about 700px tall
meant the first half of every collapse travelled through height the element does
not occupy, so the ribbon appeared to hang and then snap. A `grid-rows` `1fr`/
`0fr` transition animates to whatever the content actually needs and has no
number in it to get wrong.

### 🎨 A gradient wall in a glass app, and the white text it forced

The bar was a full-bleed tier gradient, which is why everything on it had to be
white: white text, a white-alpha tile, a white-alpha chip. On tier 3 — the
yellow one — that white text was **1.92:1**. The tier still colours the ribbon;
it does it from a 36px tile and a 2px underline instead, the same argument the
header rail settled a fortnight ago. Edge-lighting rather than a wall, and the
bar has a light theme for the first time.

`getBandConfig` has returned a `solidText` field for years for exactly this, and
two other components already paired the two. The ribbon hard-coded `text-white`
in three places; it asks the config now. One pairing turned out to be wrong at
the source: `text-yellow-900` on the light theme's `amber-500` measures
**4.04:1**, so band 3's `solidText` moved to `-950` — a shared token, which also
repairs the band chip in the syllabus breadcrumb and the tier chip in the
question list, and is pinned with the measurement so the next tidy-up has to
argue with a number.

Two more things a keyboard user could not see: the tier cards' focus ring was
white alpha on `amber-100`, which is nothing, and the five cards that are not
the selected verb's tier were dimmed to `opacity-50` — taking their subtitles,
and the 32 verb buttons under them, to 2.72:1. Both fixed, and the second one
twice: dimming less was not enough on its own, because opacity composites text
towards its background rather than scaling the ratio.

### 🔢 The same number, twice, six inches apart, under two names

The detail card printed `Band 3` on the chip beside the verb and `Band Cap 3` in
the tray. Not a coincidence and not a bug that could ever have shown itself:
**`getTierTargetBand(tier)` is `tier`, always** — every tier group's `maxBand`
equals its own tier number, and `bandColors.test.ts` pins that as an invariant.
Any screen showing both is showing one number twice. The chip names the rung of
the ladder now (`Tier 3 · Explain`), the band statement stays in the tray, and
the explanation of "Band Cap" — previously a `title` on a `<div>` with no
`tabindex`, so unreachable by keyboard and absent on touch — is a line of text.

The footer's six step labels were a fourth hand-written copy of the tier names
and had drifted at two of them. `tierShortLabel` exists because this had already
happened twice in the admin tools, and both times the wrong label named another
tier from the same table, so it read as self-consistent. They are derived now.
The four tray numbers are set in the telemetry face, as marks are everywhere
else.

And the verb lookup was exact-case, against a map keyed in capitals. A verb
stored or generated as `Describe` matched nothing, and a miss here does not show
the wrong verb — it shows no verb at all: no detail card, no tier highlight, no
progress. It tries the upper case too.

### ↔️ A ladder that said neither what it was nor where it ended

Six 260px cards overflow at nearly every width and `scrollbar-hide` removed the
only sign that they do, so half the ladder simply was not there for anyone who
did not think to drag it. There are edge fades now, in a wrapper that had been
sitting empty. The scroller is a named group, because forty-four buttons in a
flat list said nothing about being one ladder from tier 1 to tier 6. Snapping
went from mandatory to proximity, since three separate things scroll this strip
and mandatory snapping argued with two of them. The auto-scroll also honours
`prefers-reduced-motion`, which the CSS could not do for it — that property does
not govern the JavaScript `behavior` option.

### ✅ And the contrast suite can finally see it

With the ribbon on the page in the state the suite reaches, opening it in the
preamble takes the light-theme audit from 53 measurable text nodes to 137. It
failed on the first run, with seven readings below the 4.5 floor, and every one
was an opacity laid over a colour that was fine without it: the "Band n ceiling"
eyebrows at 2.97:1, the timeline's step labels at 2.66:1, the "Deep Learning
Threshold" marker at 2.56:1 — a dark-theme grey on a white pill. The parity
invariant found a fourth in `StrategyTip`, shared with the editor, where a
`light:text-slate-500` was overriding `--color-text-muted` and making the light
theme lighter than the theme had asked for. All now measure between 6.35:1 and
17:1. No exclusion was added and no floor was moved.

What the suite still cannot say is worth stating: anything over a gradient comes
back unassessable, which covers the tier underline and the current card's
header, and anything on a saturated tier fill is measured but not gated. The
tier-coloured text in this component is still partly on the honour system.

## [Unreleased] - 2026-08-14 (The header answers to the theme)

### 🎨 The one surface everybody sees was the one that ignored the theme

For as long as it has existed the app header was a full-bleed
`indigo-600 → sky-500` gradient with white text laid over it. White on a
gradient is not a mistake — it reads identically whichever theme you are in —
but it meant the bar at the top of every screen was the only surface in the
application that never noticed a student had chosen the light theme. It is now
the same translucent token glass as everything else, with a light value and a
`dark:` partner for every colour on it, and content scrolls _under_ it rather
than behind a wall.

The brand did not go; it moved. `from-indigo-600 to-sky-500` came off a
1600×80px bar and onto the 40px wordmark tile, which is roughly the proportion
it should always have had. Removing it altogether was considered and rejected: a
first-run user meets that gradient on the charter gate and again on the
quick-start guide, so abolishing it in the header alone would have orphaned the
identity everywhere else.

**Worth recording, because the design spec will tell the next reader otherwise:
indigo was never the Band 6 colour.** `BAND_HEX[6]` is `#a855f7`, purple, and
Band 5 is `#3b82f6`; the editor's mastery glow reads those directly. The header
was never spending a colour the reward uses. DesignSpec §2's tier table still
lists `#6366f1` for Tier 6 and is simply stale — correcting it is a separate
change with its own reviewers.

### 🧭 Eight admin buttons, all dressed the same, in front of everybody's work

An admin on a Supabase deployment met eight admin and moderator controls on the
rail, every one of them carrying an identical class string, with the two storage
tools four buttons apart because the moderation group had been dropped into the
middle of the admin group. Counting the rest of the bar, that was twelve tab
stops before any content.

They now sit behind a single control, grouped Library, Moderation and AI so the
two storage tools are finally next to each other. It is a non-modal popover
built on the pattern the design spec already names for the purpose: it does not
trap focus, because the page behind it is still live and Tab is expected to walk
out of it; it takes Escape on the capture phase so one press cannot close both
it and whatever sits beneath it; and it puts focus back on the trigger itself,
since the hook that usually does that is the one it must not use. Four controls
stay on the rail — the trigger, help, the theme toggle and the profile.

### 📉 The header told you the API was healthy, and two other things already had

A pill on the rail reported API state and storage mode in black italic capitals.
API health is rendered unconditionally by the bottom-left health chip, with three
states and an error count, and again by the blocked-countdown banner; the
header's version was the least informative of the three and the only reader of
the `apiStatus` prop, so both are gone.

Storage mode is genuinely worth knowing and is now told without a breakpoint —
in the profile button's tooltip and in the tools popover's footer — where the old
pill was `hidden lg:flex` and so disappeared exactly when the screen was
smallest. The one thing that was promoted rather than demoted is the failure:
when storage has actually broken, a red chip sits on the rail at every width,
announced when it appears. Work that is not saving is the worst thing this
application can do quietly, and it was previously a word inside a pill nobody
could see on a phone.

### 📐 A header that is the same height on every screen and for every role

The bar was a _minimum_ height over a row that wrapped below `sm`, so an admin on
a narrow screen got a two-row header and everyone else got a one-row one. It is
`sticky`, which means each of those heights reflowed the entire page beneath it,
and the layout constants have been reserving space for a height the header never
promised. With eight buttons behind one control there was nothing left to push
down, so it is now 64px flat and the row never wraps.

Two things had been leaning on the wrapping without anybody noticing. The
storage-error chip is 147px with its label, which a 360px rail cannot spare —
it would have broken the header in precisely the failure it exists to announce —
so below `lg` it keeps its warning triangle and drops its words, with the full
sentence moving to its accessible name. And the wordmark's `whitespace-nowrap`
turned out to stop a label breaking in half without stopping it painting out of
its box: measured at 360px it was printing the sub-label straight across the
buttons. The sub-label now steps aside on a phone and both lines clip. Checked by
hand at four widths, in both themes, for all three roles, and again with storage
forced into failure.

### ⏭️ There was no way past the header, and no main region to reach

A search for `<main` across this repository returned nothing. `<header>` was the
application's only landmark, so a keyboard user Tabbed through every header
control before reaching the writing surface, on every single page load, and a
screen reader had no region to jump to. The content container is now a `<main>`,
and an anchor that stays invisible until focus reaches it offers to skip
straight there. The landmark carries `tabIndex={-1}`, without which the link
would scroll the page and leave focus behind — sending the next Tab back into
the header the reader had just asked to skip.

This was not in the brief for the redesign. It was the most valuable thing in it.

### ✅ And the contrast suite can finally see the bar

The end-to-end contrast audit had always skipped the header, because a
background painted by an absolutely-positioned child made every reading wrong by
construction. A bar that paints its own colour can be measured, so the exclusion
is gone and six readings appear where there were none. All clear the AA floor;
the sub-label is the close one at 4.72:1 against white, against 4.5 required.
The whole redesign is now something the suite defends rather than something it
was told not to look at.

## [Unreleased] - 2026-08-13 (Toasts that can be acted on)

### 🔔 A message about something you would want to do now lets you do it

Several flows ended in a toast describing exactly the next thing — "Merged into
HSC Physics", "84 syllabus points have no question yet" — with no way to get
there. `showToast` takes an optional action, and a toast carrying one stays 14
seconds rather than 5: five is fine for "Saved.", and not enough to read an
offer, decide, and reach for the button.

Two uses, both replacing something worse:

- **The starter-questions offer is a toast now**, not a modal that opened itself
  at the user. Asking "shall I write 84 questions?" with a full dialog is heavy
  for a question often answered "not now"; the offer sits in the corner and
  opens the dialog only if taken.
- **Merging a syllabus into a course that is not on screen** offers "Go to it".
  The navigator deliberately stays put in that case, so the message named a
  place the person could not reach from it.

### 📊 The picker's render cost, measured rather than assumed

The coverage chips walk every dot point of every course, which looked like a
problem worth optimising. It is not, and the measurement says so: with a
deliberately large library — 30 courses, 5,400 dot points — keydown to the frame
after paint is a **median 29 ms**, which is inside one frame of the two-frame
floor the measurement itself imposes. Curator (chips on) against student (chips
off) differs by about 4 ms, and only in rendering: the memo means coverage is
not recomputed while typing at all.

No change made. Recorded here because the obvious optimisation would have been
wasted work, and the next person to look at it deserves the numbers rather than
the hunch.

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

- A **"What changed"** section: the scale of the revision (_67 words added · 29
  cut · 52% of your own writing kept_), then each edit as a `−` was / `+` now
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
  reserved one _line_ of the following block, but everything reaching the flow
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

The improvement is briefed as an _edit_ of the student's own response, so the
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
  - A summary strip — _67 added · 29 cut · 52% of your words kept_. The
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
  `Band 6 (7-8 marks): Comprehensive analysis…` was stored as the words _before_
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
