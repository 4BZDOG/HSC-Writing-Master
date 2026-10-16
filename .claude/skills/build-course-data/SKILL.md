---
name: build-course-data
description: >
  Build, rebuild or fact-check a shipped HSC/Preliminary course (public/courseData) from NESA's
  published syllabus, using agents to author the questions. Use when adding a course (Biology, PDHPE,
  Society and Culture…), adding Year 11 content, or bringing an existing course into line with NESA.
category: content
---

# Building course data from NESA, with agents

This is the workflow that rebuilt Software Engineering and Enterprise Computing (Year 11 + Year 12) and
fact-checked every shipped course. It is split into the parts that need judgement (you) and the parts
that are volume (Haiku agents). Tools live in `.claude/skills/build-course-data/tools/`; run them from the
repo root.

## 0. Decide what you are building

1. **Which syllabus is actually examined?** NESA runs old and new syllabuses side by side. Economics,
   Legal Studies, Modern History and Ancient History ship the 2024/2025 syllabus, but Year 12 does not
   start it until Term 4 2027 (first HSC 2028); students sit the 2009/2017 syllabus until then. Check the
   course page on nsw.gov.au (`/education-and-training/nesa/curriculum/<area>/<course>-stage-6-<year>`) for
   "in force until / from" dates. If the choice is not obvious, put it to the user — do not decide silently.
2. **Year 11 is its own population of topics inside the same course.** `Topic.year` is `'year11'` for
   Preliminary topics and **absent** for Year 12 (absence means Year 12; only ever write `'year11'`).
   The syllabus navigator shows a Year 11 / Year 12 control per course (`utils/syllabusYear.ts`). Year 11
   outcomes carry `"year": "year11"`; outcomes are only filtered by year when at least one has a year.
   Always build both years when NESA has both. A Year 11 topic that is not tagged shows as Year 12.
3. **Is the subject suited to this app?** Extended-writing subjects (short and long responses, marking
   guides with ladders). Calculation-led and practical courses are poor fits.

## 1. Get NESA's data — never trust summarised fetches

`WebFetch` summarises through a small model: it paraphrases, drops sub-points and shows "[Loading]" in place
of words. Fact-check reports built on it had to be re-verified. The curriculum site embeds the exact CMS
data in each page, so fetch the HTML and read that:

```
python3 .claude/skills/build-course-data/tools/fetch_nesa.py <out_dir> \
  https://curriculum.nsw.edu.au/learning-areas/<kla>/<slug> \
  content/year-11/<faId> content/year-12/<faId>
```

Find one focus-area id per year from `<base>/content` (look for `/content/year-11/fa…` links; the
`defaultFocusAreaUrls` in the page data has them). The tool crawls the sibling focus areas from there
and writes `<out_dir>/nesa.json`: per focus area the title, outcomes and content groups, each with its
statements (`title`), `including` sub-points and `examples`. Check the counts it prints against the
syllabus's course page. `curl` needs `--cacert /root/.ccr/ca-bundle.crt` here (the tool does this and
retries connection resets). Outcome statements come from the same data (`outcomes`).

Older syllabuses (2009/2010/2017) are not on the curriculum site; they are DOCX files linked from the
course page on nsw.gov.au — convert with pandoc and compare line by line.

## 2. Build the skeleton

```
python3 .claude/skills/build-course-data/tools/build_course.py \
  --nesa <out_dir>/nesa.json --course <CourseFile>.json --prefix <xx> \
  [--overrides overrides.json] [--outcome-pattern '<regex for the course outcome codes>'] [--write]
```

- Every NESA statement becomes a dot point `"<title> (<sub-point>; <sub-point>)"` — NESA's own words.
- Existing dot points are matched to their statement by similarity; matches keep their id and **keep
  their questions** (duplicates are merged in, never dropped). Review the printed `UNPLACED` list and
  resolve each with an override (`{"dp-old": "<suffix of NESA code>"}`); an existing dot point with
  questions must never be silently lost.
- New statements get an empty `dp-<nesa code slug>` dot point; Year 11 topics get `year: "year11"`.
- Outcomes are replaced by NESA's codes and wording (lower-case verb form, as NESA writes them); remap
  `linkedOutcomes` on kept questions if old codes are retired (see the EC mapping in the PR #304 history).
- Re-running on a rebuilt course is safe (idempotent). Then `npm run content:canonicalise` — it keeps a
  `topics/*-topic.json` file identical to its course topic and derives sample-answer bands.
- Commit this on its own branch before launching agents (see 3).

## 3. Author the questions with agents

```
python3 .claude/skills/build-course-data/tools/make_jobs.py <CourseFile>.json <out_dir>/nesa.json jobs/
```

Splits the dot points with no questions into job files of about 9. Then launch one **Haiku agent with
extra effort per job file** (`model: haiku`, `effort: xhigh` — the owner's standing preference for the
grunt volume work; you review). Prompt each with only: read `.claude/skills/build-course-data/author_brief.md`,
the job file path, the patch output path, "validate until 0 errors, no git, no repo edits". Rules that
matter:

- **Agents write patch files only.** Never let them edit the course JSON or run git.
- **Do not switch branches or edit the course files while agents run** — they validate against the working
  tree. Commit/push WIP from a new branch instead (`git checkout -b`, which keeps the tree).
- The harness caps concurrent subagents (20). Launch the rest as slots free.
- Agents occasionally try `send_message` or create stray empty sessions; ignore and report if asked.
- Each agent validates with
  `npx tsx .claude/skills/build-course-data/tools/apply_patch.mts validate public/courseData/<File>.json <patch>`
  (0 errors, 0 warnings). The validator enforces: canonical command verb used in the stem; marking-guide
  ladder rows exact for the verb's tier (`utils/markingGuideLadder.ts`, HSC style — highest mark first, each
  row a capitalised third-person performance descriptor, no closing full stop); 4–10 keywords; 2–4 marker
  notes and errors; linked outcomes exist; sample marks whole and distinct with a full-mark sample; the
  full-mark answer within the app word band (`getFullMarkWordRange`) and containing every must-use
  keyword; lower samples shorter; US spellings.
- Apply sequentially yourself: `... apply_patch.mts apply public/courseData/<File>.json patches/*.json`.

Content policy the brief encodes: two questions per new dot point (a 3–4 mark low-tier verb, a 5–6 mark
higher-tier verb); **brief answers are preferred** (the band maximum is the ceiling); scenarios invented
for a question start "Hypothetical:"; no invented statistics, statutes, cases or dates; British/Australian
English; NESA's command-term wording (`data/commandTerms.ts` matches NESA's glossary of key words).

## 4. Review (this is yours, not the agents')

1. Read a random sample of questions from each job (stem tests the dot point, guide is a real ladder, the
   top sample genuinely earns the top row, facts are right for NSW Stage 6).
2. `npx tsx .claude/skills/build-course-data/tools/must_use_check.mts public/courseData/<File>.json` — lists
   full-mark answers missing a must-use keyword (the keyword appears in the dot point, question or scenario).
   Adding sub-points to dot-point descriptions turns more keywords into must-use terms, so _existing_
   answers can start failing; edit those answers minimally. `tests/unit/syllabusTermCoverage.test.ts`
   bounds the must-use share for the reference course.
3. `npm run content:canonicalise`, `npx prettier --write` on touched JSON/TS/MD, `npx tsc --noEmit`,
   `npx eslint` on touched TS, `npx vitest run` (about 3 minutes).
4. Confirm both years separate: `topicsForYear(course, 'year11')` / `'year12'` and `outcomesForYear`
   (`utils/syllabusYear.ts`) return the expected counts.

## 5. Ship

- Bump `DATA_VERSION` in `utils/storageUtils.ts` **and** the sync gate `isOlderThan(savedVersion, '…')` in
  `hooks/useSyllabusData.ts` to the same version — shipped-course changes only reach browsers that already
  synced when the version moves. Unedited copies are refreshed; edited copies are backed up as
  "(before refresh)" and hidden from the navigator (`supersededBy`).
- Add a `projectDocs/changeLog.md` entry. Several open PRs adding a top entry conflict — merge main, keep
  both entries.
- Add the course to `public/courseData/manifest.json` if it is new. The live Supabase database needs
  `supabase/seed.mjs` re-run (cannot be done from a session).
- Open the PR (ready for review), subscribe, wait for green CI, squash-merge. Merge as you go.

## Pitfalls seen

- Summarised fetches: wrong or missing "including" sub-points and "[Loading]" gaps. Use the page data.
- Marking guides written lowest-first or as additive bullet lists. They must be descending ladders; the
  tools and `normaliseGuideRows` enforce this, and the docs/brief print the tier table from code.
- Unquoted bash heredocs eat backticks in TS patches; quote the delimiter (`<<'EOF'`).
- `json.dumps(indent=2, ensure_ascii=False)` plus a trailing newline round-trips the shipped JSON exactly.
- NESA's own text has typos and oddities (for example "(3G→)"); keep it verbatim.
- Fact-check before editing: an agent's claim is not evidence until it is confirmed against NESA's data.
