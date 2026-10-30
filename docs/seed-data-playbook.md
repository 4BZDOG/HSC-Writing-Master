# Seed data playbook

What to know before revising the shipped course data in `public/courseData/`. It
records how past HSC questions got into the seed, the conventions that make them work,
the mistakes made on the way, and what is left. Written at the end of the October 2026
past-paper sessions (PRs #357–#362); read it before the next one.

Related: `docs/hsc-exam-profiles.md` (what a real paper looks like per course),
`docs/dataset-generation-prompt.md` (the brief for AI-written content),
`data/referencePapers/README.md` (the calibration set), `npm run content:report`.

## 1. Where the seed stands

| Course               | Syllabus the seed follows      | Past HSC questions in the seed                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Studies     | 2010 (still current)           | 93 from 2020–2025: Section II parts, Section III report, Section IV (`prompt-bs-hsc-…`); Section II full-mark exemplars are NESA's marking-guideline sample answers                                                                   | The three diagram and chart questions (2022 21(c), 2024 21(b), 2025 25) carry their stimulus as an image                                                                                                                                                                                                                                           |
| Geography            | 2022                           | 20 from 2024–2025 (`prompt-geo-hsc-…`)                                                                                                                                                                                                | Parts that need the Stimulus Booklet are in `data/referencePapers/` only                                                                                                                                                                                                                                                                           |
| English Standard     | 2024 syllabus (first HSC 2027) | 2024 Paper 2 (`prompt-en-140`–`153`), 2024 Paper 1 Section II (`232`), 2025 Paper 2 and Paper 1 Section II (`154`–`157`), 2019–2023 Paper 1 Section II and Paper 2 (`158`–`231`): 64 questions after per-text parts were consolidated | The papers are the 2017 syllabus; module names match, so they map straight on. 2019–2023 Paper 1 Section I is in `data/referencePapers/` only. Parts the paper sets once per prescribed text with the same wording are held as one question on "your prescribed text" (2021 Q2, 2022 Q6, and 2024 Q1 by concept), their exemplars labelled by text |
| English Advanced     | 2024 syllabus (first HSC 2027) | 68: Common Module 2019–2025 (shared with Standard, `prompt-ea-78`, `95`–`113`); questions set once for all texts (`75`–`77`, `79`–`94`); text-specific Module A and B parts on the public-domain texts and pairs (`114`–`142`)        | Text-specific parts on texts not in the public domain (37) still to add; 2021 1(c) and 2022 1(a)–(b) left out because NESA withheld their extracts                                                                                                                                                                                                 |
| Software Engineering | 2022                           | 14 from 2025 (`prompt-se-hsc-2025-…`), with NESA's published full-mark responses and stimulus screenshots                                                                                                                             | Wording from NESA's online past exam (fam.hsconline.nesa.nsw.edu.au); only written short- and long-response parts (no diagram, tick-box, dropdown, matching or spreadsheet items)                                                                                                                                                                  |
| Enterprise Computing | 2022                           | 13 from 2025 (`prompt-ec-hsc-2025-…`), as above                                                                                                                                                                                       | As above                                                                                                                                                                                                                                                                                                                                           |
| Legal Studies        | 2025 (new; not examined yet)   | none                                                                                                                                                                                                                                  | 2020–2025 papers are the **2011** syllabus: kept in `data/referencePapers/` as calibration                                                                                                                                                                                                                                                         |
| Economics            | 2025 (new)                     | none                                                                                                                                                                                                                                  | Wait for the new-syllabus work                                                                                                                                                                                                                                                                                                                     |
| Modern History       | 2024 (new)                     | none                                                                                                                                                                                                                                  | As above                                                                                                                                                                                                                                                                                                                                           |
| Ancient History      | 2024 (new)                     | none                                                                                                                                                                                                                                  | As above                                                                                                                                                                                                                                                                                                                                           |

Structure-only courses (October 2026, no questions yet): Health and Movement Science (2023, first HSC 2026),
Biology (2025, first HSC 2028), English Studies, English EAL/D, English Extension 1 and History Extension (all
2024, first HSC 2027). Built with `build_structure.py` from the configs in
`.claude/skills/build-course-data/configs/`. The same month, the rest of the Modern History, Ancient History,
Legal Studies, Economics and English Advanced syllabuses (Year 11, and every option) went in as structure
beside the existing questions, with `build_structure.py --append-to`.

**Rule used throughout:** ship only questions from the exams that apply to the syllabus
the seed follows. A paper from an older syllabus is a guide for style, marks and ladders,
not content to ship. Before a course is worked on, check which syllabus its seed follows
(the "Syllabus timing" note in `projectDocs/changeLog.md` lists the timing) and which papers match it. The
first Legal Studies pass ran on the wrong assumption and had to stop. Confirm each
syllabus's first HSC year on NESA's syllabus page rather than trusting this table.

## 2. How a past paper gets in

1. **Download** the paper and marking guidelines from NESA:
   `https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/<subject>/<year>`
   lists PDFs under `/sites/default/files/noindex/<yyyy-mm>/<year>-hsc-<subject>[-mg].pdf`.
   Some Paper 1s are withheld for copyright at first and published later as a copyright-cleared
   file (English Standard 2024 Paper 1 appeared as `2024-hsc-english-std-paper-1-cc.pdf`), so check the
   year's page again before calling a question unavailable.
   Convert with `pdftotext -layout`.
2. **Extract** each written-response part to JSON: number, section, marks, stem,
   stimulus, assessed-on bullets, criteria rows, sample answer, answers-could-include.
   A Haiku agent per year works, with the brief demanding word-for-word copying and a
   `skipped` list for anything that needs an image.
3. **Verify** with `npx tsx scripts/verifyPastPaperExtract.mts <paper.txt> <mg.txt> <extract.json>`.
   It checks every string is in the source and that each ladder runs from the total
   down to 1. Then read the long questions' bands against the PDF by eye (section 5).
4. **Map** each question to the dot point it assesses (a Haiku agent with the course's
   dot points, then read the result).
5. **Build** the question: `prompt-<course>-hsc-<year>-<number>`, the stem verbatim,
   NESA's ladder as `markingCriteria`, the stimulus and "Your answer will be assessed on…"
   in `scenario`, the paper's heading in `hscSection`, `linkedOutcomes` copied from the
   other prompts under that dot point.
6. **Write exemplars** (Haiku writers, three answers per question: full, middle, bottom;
   20 / 12 / 5 for a 20-mark question). Each writer returns `_sources` and `_unverified`.
7. **Review** (section 4), merge, run `npm run content:canonicalise` until
   `content:check` says "Would change 0", run the content tests, add a changelog entry,
   open a PR, squash-merge when CI is green.

## 3. Conventions that make a past question work

- **Ids:** `prompt-<course>-hsc-<year>-<number>` (Business Studies and Geography),
  `prompt-en-<n>` / `prompt-ea-<n>` for English; exemplars `sa-<course>-hsc-<key>-<n>`.
- **Provenance fields:** `isPastHSC: true`, `hscYear`, `hscQuestionNumber` as printed but
  without a leading Q (`"21(a)"`, `"6"`); the chip adds the Q ("HSC 2025 · Q6").
- **Front matter is not scenario.** The paper's heading goes in `hscSection` exactly as
  printed, with the question number left out ("Paper 2, Section III — Module C: The Craft of
  Writing (20 marks). Allow about 40 minutes."). The prescribed text a part is set on goes
  in `hscText` ("Prose Fiction — George Orwell, Nineteen Eighty-Four"). Lists of every
  prescribed text are left out. `scenario` keeps only what the student reads to answer:
  the stimulus or extract, instructions such as "You are not required to write out the
  opening words", and "Your answer will be assessed on how well you: …". The card shows
  the first two above the question (`PastHscExamLine`). A one-paper course with untitled
  sections (Business Studies, Geography) takes the heading from the paper's cover:
  "Section II (40 marks). Allow about 1 hour and 15 minutes for this section.", with the
  attempt line only where it is a choice ("Attempt either Question 26 or Question 27.").
- **One question for parts that differ only by text.** Where the paper sets the same
  question once per prescribed text, with only the composer, title or form words changed,
  the seed holds one question on "your prescribed text": `hscQuestionNumber` lists the
  parts (`"6(a)–(n)"`, `"1(a), (b), (d), (j)"`), there is no `hscText`, marker notes,
  errors and terms are written for any text, and every part's exemplars are kept with
  `prescribedText` naming their text. Parts that ask about a different idea for each text
  (2019 Q6, 2020 Q2–4), or that print an extract from each text (2022 Q2), stay separate.
- **Marking guide:** NESA's rows as "N marks: …" lines, top row first, bullets joined
  with semicolons. A past paper's guide is held only to being a sound ladder
  (`guideStructureProblem`); generated questions are held to the app's rows.
- **Verb:** the Verb Gate needs a command term, so exam-form stems (How…, Why…, To what
  extent…, Craft…) store the nearest one: EXPLAIN for How/Why, OUTLINE for "What is the
  purpose of…", INTERPRET for "What does … indicate", DISCUSS or ASSESS for "To what
  extent" and for long "Explain/Analyse/Evaluate" stems, CONSTRUCT for writing tasks.
- **20 marks is Tier 5.** Tier 5 at 20 marks derives NESA's five bands exactly
  (17–20 / 13–16 / 9–12 / 5–8 / 1–4); at 25 marks it gives 21–25 / 16–20 / 11–15 / 6–10 / 1–5.
- **Verb floor by length** (`minimumTierForMarks`, PR #362): 7–9 marks need Tier 3, 10–14
  need Tier 4, 15+ need Tier 5; CONSTRUCT is exempt at any length. The generators,
  import and storage load enforce it, and `tests/unit/verbLength.test.ts` holds the seed to
  it. The reason: past about 10 marks a low-tier verb has too few bands for the marks
  (Explain on 20 marks is three bands seven marks apart).
- **Exemplar lengths:** `getFullMarkWordRange` is the ceiling; NESA's own samples are
  much shorter (median 20 / 33 / 54 / 74 / 93 / 125 / 202 words for 1–6 and 8 marks), so
  aim near those. Each lower exemplar is shorter than the one above.
- **Time:** past the verb's top mark, `getRecommendedTime` continues at 1.8 minutes a mark
  (a 20-mark Discuss gets 36 minutes).
- **Spelling:** UK/Australian English. Quotations are 8 words or fewer.
- **Images:** a shipped question can carry one stimulus image: `scenarioImage.src` names a file
  under `public/courseData/images/`, and the scenario keeps a text version after "Stimulus:" for
  the marker (which reads text only). Use it for a table, data dictionary, chart or slideshow the
  paper prints; a question answered by drawing (a DFD, a class diagram) is still skipped.

## 4. Reviewing what the writers produce

Haiku writers get facts wrong with confidence. Every batch so far had errors caught on
review. Do this each time:

- Read `_unverified` for every question first; anything listed must not appear as a fact.
- Check every quotation is real and at most 8 words. Free texts (Project Gutenberg) can be
  checked directly; the rest were checked only against study guides, so flag them.
- Spot-check named people, dates, statistics, case names and statutes against a source.
  Examples caught: a misattributed Shakespeare line, invented film scenes, a wrong job
  title, a claimed poem title, a statistic that a fetched source contradicted.
- Scan for American spellings, AI-sounding filler ("delve", "tapestry", "In conclusion" in
  a top answer), headings or bullets inside an answer, and any mention of bands or marks.
- Check the middle and bottom exemplars really show the flaws of their row, not just fewer words.
- Real places and texts need sources; invented businesses are labelled "Hypothetical:".
- Reviewers asked to "improve stems" rewrite the task. Reject changes that alter what the
  student must do (for example replacing "a text you have studied" with a named title).

The 2019–2023 English Standard exemplars (October 2026) were written by Haiku writers and fact-checked by a
second set of Haiku reviewers against Project Gutenberg (Shakespeare, Shaw, Lawson, Orwell), Wikipedia, LitCharts,
Reading Australia and Australian Screen Online. 22 errors and 81 doubtful details were corrected or softened. Texts
not freely available (Vertigo, Past the Shallows, Rainbow's End, Dobson, Slessor, Gray, Noonuccal, Namatjira, The
Boy Behind the Curtain, Stasiland, Waste Land, the films) were written from secondary sources with few or no
quotations; their scene-level detail still wants a teacher's check. Four 2021–2022 parts were left out because NESA
withheld the stimulus for copyright (2021 3(a)–(b), 2022 2(b) and 2(h)).

Still to be checked by a teacher against the printed texts: The Crucible, King Richard III
and Nineteen Eighty-Four quotations in the 2025 English exemplars; the Geography 20-mark
answers (2024 Q25–27, 2025 Q23); the 2024 English Standard exemplars for texts studied
from guides (1(c), 1(d), 1(g), 1(h), 1(k)).

## 5. Extraction mistakes to expect

- **Check against the marking-guideline tables, not the text.** `.claude/skills/build-course-data/tools/check_past_questions.py`
  reads each criteria table cell by cell with `pdfplumber` and compares every row of every past question's
  ladder with it, and every stem with the paper. The October 2026 review found the 2024 English Standard
  Paper 2 ladders paraphrased (NESA's three bullets merged into one reworded sentence); they read as
  plausible and passed every other check. Expect one report that is deliberate: Business Studies 2022
  23(d)'s top row is reordered to open with its verb, which the app requires.
- **A question on "your prescribed text" is for every text.** Its keywords, marker notes and errors reach
  the student and the AI marker whatever text the student wrote on. Seventeen English Standard essays had
  them written about the one text their exemplars discuss ("One Night the Moon", "the tracker"), so a
  student writing on another text was told those were the terms to use. Write them for any text, and label
  each exemplar with `prescribedText`.
- **Prefer NESA's own answer.** Where the marking guidelines print a sample answer, it is the full-mark
  exemplar (`HSC_EXEMPLAR`), verbatim; AI writes only the lower marks. NESA's are usually much shorter than
  an AI full-mark answer (Business Studies 2025 21(d): 55 words against 119).

- **Bullets in the wrong band.** `pdftotext -layout` puts the mark label in the middle of
  a block, so the bottom bullets drift up a band. It happened in Business Studies 20-mark
  guides and in all 88 Legal Studies 15- and 25-mark guides ("Writes in general terms…"
  belongs in the 1–5 row, not the 6–10). The verifier cannot see this. Check that long
  guides split 4/4/4/4/3 (or whatever the PDF shows) and compare against the PDF.
- **Mark column interleaved into stems.** Stray one- and two-digit numbers appear inside
  sentences; the verifier strips them, the extraction must not keep them.
- **Question numbering moves.** Legal Studies Part A was Q21–23 in 2025 and Q21–24 in
  2021–2023; options are Q25–31 in some years and Q26–32 in others. Follow the paper.
- **Totals that look wrong are not always.** Business Studies 2025 Section II has parts of
  11 and 9 marks. Check against the paper's section total, not an assumed split.
- **Shared stimulus.** A scenario shared by several parts is repeated in each part.
- **Marking-guideline typos** ("establised", "statememt") are kept as printed.

## 6. What the content report shows

`npm run content:report` (and `-- --list`) counts, per course: exam-length questions
(15+ marks), 7–10 mark questions, stems that restate their dot point, verbless stems, and
past-paper questions. At the end of these sessions:

| Course               | Questions | 15+ marks | Restating dot point | Past |
| -------------------- | --------- | --------- | ------------------- | ---- |
| Business Studies     | 441       | 18        | 17%                 | 93   |
| Geography            | 353       | 4         | 1%                  | 20   |
| Legal Studies        | 327       | 0         | 23%                 | 0    |
| Economics            | 262       | 0         | 49%                 | 0    |
| Software Engineering | 201       | 0         | 3%                  | 0    |

Most "restating" stems read as acceptable HSC stems ("Explain the reasons for trends in
inequality in Australia"), so the count overstates the problem. Do not rewrite them in
bulk. Software Engineering has 19 questions of 7–10 marks against a real longest part of
6 marks, and Enterprise Computing real papers reach 8; both were left as stretch practice.
Fix these when a course is rebuilt on a new syllabus, not before.

## 7. What is left

- **New-syllabus courses (Legal Studies, Economics, Modern History, Ancient History):**
  rebuild when the first papers or NESA samples exist. Use the Legal 2011 papers
  (`data/referencePapers/legal-studies-2020-2025-past-papers.json`) for question shape,
  25-mark Option essays and marking ladders. English 2024 syllabus papers have no
  published samples yet (NESA's page lists none).
- **English Advanced 2025 Paper 2:** 7 Module A and 12 Module B text-specific variants
  (and a Module C image question). Adds 19 stems and a lot of text-specific exemplar
  checking.
- **Software Engineering and Enterprise Computing:** the online papers are not published, but NESA's
  "sample full mark responses" (from August 2026 for the 2025 papers) print each question they answer. 2025 is in
  the seed; add each later year when its samples appear, from
  `/sites/default/files/noindex/<yyyy-mm>/<subject>-<year>-full-mark-samples.PDF` on the year's page. The responses
  are images: transcribe with an agent, then proofread every one against the page yourself (Haiku "corrected"
  student spelling four times in 2025). Store them as `HSC_EXEMPLAR`, keep the spelling, and put code, SQL and
  formulas in ``` fences.
- **Business Studies and Geography earlier years:** add if the 2010 / 2022 syllabuses still
  apply; Geography 2024–2025 only so far.
- **Option to consider:** feedback by marking-criteria strand for long answers. Every
  15–25 mark NESA guide has three or four bullets per row (knowledge, application of
  examples, communication), so the evaluator could report the band plus which strand held
  it back, instead of implying a mark-by-mark story. At 20 marks a mark is not a skill.
  Not built.

## 8. Process notes

- Branch `claude/…`; PR; squash-merge; reset the working branch to `origin/main` and
  `git push --force-with-lease` before the next piece. CI takes 10–15 minutes.
- One Unit Tests failure in `tests/unit/invoiceRequestForm.test.tsx` was a timing flake
  unrelated to content; it passed on a single re-run.
- `public/courseData/**/*.json` is excluded from Prettier on purpose. Edit it with a script
  that writes `JSON.stringify(data, null, 2) + '\n'` (`ensure_ascii=False` in Python) so a
  rewrite does not churn the diff.
- Scratch scripts (skeleton builders, merge scripts, Haiku briefs) were one-offs and are not
  kept. Their shape is section 2; rebuild them per course rather than generalising.
- Haiku subagents can hit the session rate limit mid-run. Their work is saved; resume the
  same agent after the reset instead of starting a new one.
