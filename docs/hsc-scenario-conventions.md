# HSC scenario conventions

Related: `docs/seed-data-playbook.md` (how past questions get into the seed), `docs/hsc-exam-profiles.md` (what a real paper looks like per course), `utils/scenarioConventions.ts` and `utils/pastPaperCalibration.ts` (how these rules reach the generators). Evidence reviewed 25 October 2026.

## 1. Purpose

This document records how real NSW HSC papers use scenarios and stimulus contexts, measured across 472 items. It is there so that the AI generators (through `utils/scenarioConventions.ts`, called from `services/geminiService.ts`) and seed authors write scenarios the way NESA does. Most context items name no place. Australia is named when the question is about Australia, and then once and plainly. The specific aim is to avoid stereotypical Australian contexts unless a course asks for them: the generators should not reach for Australian settings or cultural shorthand by default, and should not invent place names. Rule 12 lists the terms that never appear in the papers.

## 2. What was measured

472 items from NESA papers, marking guidelines and the seed, covering 2020–2025.

- **In-repo past questions** (`public/courseData`, `isPastHSC`): Business Studies 90 (2020–2025), Geography 20 (2024–2025), English Standard 18 and English Advanced 4 (2024–2025). Geography's 20 are a subset of the reference set, so they are counted once.
- **Reference set** (`data/referencePapers`): Legal Studies 2020–2025 (111 parts, 2011 syllabus); Geography 2024–2025 (31 parts); Software Engineering and Enterprise Computing 2025 marking guidelines (32 and 30 items). These two publish no stems, only criteria and sample answers.
- **NESA downloads**: Economics 2024 and 2025; Biology 2025; PDHPE 2024 and 2025 (papers and marking guidelines); Business Studies 2024 and 2025 (papers). Economics 2024 Q26 is an image-only page, read visually.
- **Gap-fills from NESA PDFs**: Business Studies 2025 Q25 (20-mark scenario report) and 2024 Q21(b) (product images). Both were absent from the in-repo seed.

**Unit of count:** one Business Studies prompt; one Geography or Legal part; one MCQ; one numbered constructed-response question for Economics, Biology and PDHPE (its parts share one stimulus); one criterion set for SE and EC. Total: **472 items**.

**Two tags per item.** Context-bearing items are those with a scenario, data, stimulus or case-choice.

| Tag     | Value                     | Meaning                                                                              |
| ------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Context | SCENARIO                  | an invented situation about a business, person, community or place                   |
| Context | DATA                      | table, graph, diagram, pedigree, balance sheet, source image                         |
| Context | CASE-CHOICE               | the student applies a case they have studied                                         |
| Context | PLAIN                     | no situation or stimulus                                                             |
| Context | PRESCRIBED-TEXT, STIMULUS | English                                                                              |
| Locale  | AU-named                  | names an Australian place, body, law, data source or company form                    |
| Locale  | AU-cued                   | an Australian term without a place, e.g. superannuation, award wages, cash rate, PBS |
| Locale  | INTL-named                | names an overseas place, organisation or framework                                   |
| Locale  | INTL-cued                 | requires a non-Australian example without naming one, e.g. "outside Australia"       |
| Locale  | MIXED                     | both AU and overseas                                                                 |
| Locale  | GEN                       | none of these: unlocated                                                             |

Footers and credit lines were excluded from locale, because they name NSW, stock-photo agencies and overseas newspapers. They are recorded as sourcing, not scenario context.

**Method:** a regex pass for locale names, then a manual read of every item or distinct scenario (Business Studies: 36 distinct scenario texts, tagged one by one). Limits are in section 8.

## 3. Headline numbers

| Course                          | Items   | Context-bearing | AU-named | AU-cued | MIXED (AU + overseas) | Overseas named | Overseas cued | Unlocated (GEN) |
| ------------------------------- | ------- | --------------- | -------- | ------- | --------------------- | -------------- | ------------- | --------------- |
| Business Studies                | 92      | 76              | 15       | 2       | 7                     | 0              | 0             | 52              |
| Economics                       | 56      | 32              | 10       | 0       | 0                     | 0              | 0             | 22              |
| Biology                         | 34      | 27              | 4        | 0       | 0                     | 0              | 0             | 23              |
| PDHPE                           | 64      | 23              | 3        | 0       | 0                     | 1              | 0             | 19              |
| Geography                       | 31      | 24              | 1        | 0       | 0                     | 10             | 3             | 10              |
| Legal Studies                   | 111     | 1               | 1        | 0       | 0                     | 0              | 0             | 0               |
| English Standard                | 18      | 3               | 0        | 0       | 0                     | 0              | 0             | 3               |
| English Advanced                | 4       | 1               | 0        | 0       | 0                     | 0              | 0             | 1               |
| Software Engineering (inferred) | 32      | 20              | 0        | 0       | 0                     | 0              | 0             | 20              |
| Enterprise Computing (inferred) | 30      | 17              | 0        | 0       | 0                     | 0              | 0             | 17              |
| **Total**                       | **472** | **224**         | **34**   | **2**   | **7**                 | **11**         | **3**         | **167**         |

- Headline (excluding SE and EC, whose stems are unpublished, and English, which is text-led): **183** items carry a scenario, data, stimulus or case-choice.
  - Unlocated: 126 (69%).
  - Australian signal: 43 (23%): 34 named, 2 cued, 7 mixed.
  - Overseas signal: 21 (11%): 11 named, 3 cued, 7 mixed.
- Counting all 388 items in the six courses with published stems (Business Studies, Economics, Biology, PDHPE, Geography and Legal Studies), including plain knowledge questions, Australia is named or cued in 75 (19%). Overseas places are named or cued in 32 (8%).

## 4. Rules

Each rule has its evidence and examples. Counts are out of the course totals in section 3 unless stated. Examples are quoted from the report, which quotes the papers, with their source.

**1. Default to an unlocated, role-named situation.** Use the role, not a name or a place: "a cafe", "a building company", "a local council", "an athlete", "a hypothetical economy", "Country A and Country B". About 69% of context items use no locator. Biology and PDHPE are 83–85%.

- "A cafe produces quality food and friendly, personalised service." (Business Studies 2025 Q21b)
- "An athlete is preparing for a marathon." (PDHPE 2025 MCQ1)

**2. Name Australia only when the item is about Australia, and name it once, plainly.** About 23% of context items carry an Australian signal. The share is highest in Business Studies (32%) and Economics (31%). Use "an Australian business", "Australian schools", "in Australia", "in Newcastle", "throughout NSW".

- "XYZ Equipment Pty Ltd is an Australian business which manufactures equipment for Australian schools." (Business Studies 2025 Q25)
- "A foreign investor buys a 5% share in an Australian company." (Economics 2024 MCQ5)

**3. Signal "Australian" with institutions, laws and Australia-only terms, not with cliché.** These forms appear in the real papers. Draw from this list:

- Institutions and data: Reserve Bank of Australia and the cash rate; Australian Bureau of Statistics; Australian Institute of Health and Welfare; Productivity Commission; Treasury; Cancer Council.
- Health: Medicare and private health insurance; pharmaceutical benefits; the National Immunisation Program; Closing the Gap.
- Law: Australian Consumer Law; Australian Constitution; High Court of Australia.
- Company, finance and work: "Pty Ltd"; Australian Securities Exchange (ASX); superannuation; award wages; minimum wage.
- Peoples and places: "Aboriginal and Torres Strait Islander peoples"; "Indigenous" in Legal and English items; NSW; Newcastle; "the Victorian government".
- Not found in any of these sources: ATO, Fair Work, ACCC, NDIS, Centrelink. These are not evidence of a default signal.

- "Which of the following actions by the Reserve Bank of Australia would appreciate the value of the Australian dollar?" (Economics 2024 MCQ10)
- "Which row of the table correctly identifies advantages of Medicare and private health insurance?" (PDHPE 2025 MCQ5)

**4. One locator per item. No city decoration.** The real papers name at most one place per item. Before this change, the generator's Business Studies output named 13 or more different cities (Sydney, Newcastle, Melbourne, Wollongong, Canberra, Hobart, Brisbane, Gold Coast, Adelaide, Hunter Valley, Ballarat, Perth, Byron Bay). The real Business Studies set names only Newcastle and NSW. The papers do not use phrasing such as "a regional NSW town". The closest real forms name a type of place, not a town.

- "Icecreams R Us exclusively delivers ice-cream to homes in Newcastle." (Business Studies 2020 Q25)
- "regional centres" and "rural setting" (Geography 2024 Q24c; 2025 Q19b)

**5. Name a business only in the 20-mark report, and use the company form.** In Business Studies, 9 of 92 items name a business or person. Six are the 20-mark reports, one per paper. Short items use "a business" or "this business" (43 of 90 seed stems use "this business"). The real names used are Icecreams R Us; Eucafuels Ltd; Ozzi Baby Food Pty Ltd; Bee Sticky Pty Ltd; Future Century Gaming Pty Ltd; Teddy Bear Store; Hans-Made Watches; and the placeholder XYZ Equipment Pty Ltd (2025). Four use the Pty Ltd form and one uses Ltd.

- "Ozzi Baby Food Pty Ltd have developed a trusted reputation in domestic and global markets" (Business Studies 2021 Q25)
- "Hans-Made Watches is a business that designs and hand-makes European-style watches with a lifetime warranty." (Business Studies 2024 Q25)

**6. Use roles for people, and do not build a cast.** Named people are rare. "Michael" (Business Studies 2022 Q21a–b) is the only personal given name used as a character in a Business Studies prompt. The Economics, Biology and PDHPE papers use roles or labels, and real people appear only as attributed sources. If a name is needed, use one plain name. Do not use names to signal diversity. The in-repo generator's Legal and EC sets cast "Jordan", "Sam", "Chloe", "Ana" and "Eli". No NESA paper here does this.

- "The player profile for Athlete A is shown." (PDHPE 2024 MCQ4)
- "Country A and Country B agree to share a common currency." (Economics 2025 MCQ1)

**7. Keep scenarios short and concrete.**

- Business Studies scenario texts: median 38 words (62 seed items, including the rubric note on the 20-mark reports).
- Business Studies 20-mark reports: about 80–150 words of scenario, plus a fixed note of about 40 words.
- MCQ stems: median 22 words (PDHPE), 31.5 (Economics), 37 (Biology). Maximum 90 words (a Biology item that includes a table).
- Reports often include a second document: an advertisement (Teddy Bear, 2023), an expression of interest (Hans-Made, 2024), or a relocation chart (XYZ, 2025).

Example: "Michael would like to open a new burger restaurant." (Business Studies 2022 Q21a–b), 9 words.

**8. Use numbers, but label invented numbers as hypothetical. Never fake a real source.** Data or stimulus items are common in Economics (26 of 56), Biology (16 of 34) and Business Studies (19 of 92), and rare in PDHPE (7 of 64). Real stimuli carry real credits. Invented ones must not. The generator should use "hypothetical" wording ("hypothetical" appears six times in each Economics paper), or state no source. It must not write an "Australian Bureau of Statistics" or "RBA" line onto an invented chart, and it must not fabricate a quote from a real organisation or person.

- "The following information is for a hypothetical economy." (Economics 2024 MCQ6)
- "apply the hypothetical business situation" (Business Studies 20-mark report rubrics)

**9. Tie the stem to the stimulus with fixed phrases.** "this business" or "this business's" appears in 43 of 90 Business Studies stems. Capitalised counts, as in "Explain ONE ... for this business.", appear in 24 of 90 Business Studies stems and 13 of 31 Geography parts.

- "Use the following graph to answer parts (a) and (b)." (Economics 2025 Q22)
- "Using Source D on page 2 of the Stimulus Booklet complete the cross-section." (Geography 2024 Q21a)

**10. Where the syllabus expects the student's own case, ask for it instead of inventing one.** Business Studies 20-mark essays use "apply relevant business case study/studies and contemporary business issues" (12 seed items). Geography asks for "an economic activity you have studied" (11 items). Invent a case only when the item needs one.

- "Describe internal linkages between people in ONE economic enterprise operating at a local scale." (Geography 2024 Q23a)

**11. Overseas context: name it, bound it, give it a stimulus.** Geography names real places (Aogashima Island, Japan; the Black Forest and Freiburg, Germany) and gives them a stimulus. For a generic overseas case, it uses an explicit bound. Business Studies uses an overseas clause inside an Australian scenario ("enter the US market"; "expanding into Malaysia and USA"). The generator should not set whole scenarios overseas unless the course is Geography.

- "Answer parts (a)–(c) with reference to ONE large city of 5 million people or more, outside Australia, that you have studied." (Geography 2025 Q22)
- "For an economy other than Australia, analyse the effects of globalisation on economic development." (Economics 2024 Q24c)

**12. Do not add stereotypes.** In all 472 items there are zero hits for kangaroo, koala, surf (outside prescribed English texts), outback, barbecue or BBQ, Bondi, Vegemite, Akubra, Anzac, footy, "mate" or Uluru. The sport references are rugby league in a PDHPE option list and the NRL in mark-guide sample answers. The real Australian signal is institutional and legal (rule 3), not cultural shorthand.

- "rugby league appears as an option in 2025 MCQ10" (PDHPE 2025 MCQ10)
- "Union membership not permitted ... No superannuation included" (Business Studies 2023 Q22b)

**13. Legal Studies (calibration only; 2011 syllabus).** No scenarios. Open with a quoted proposition or name the jurisdiction or treaty, then a task ("To what extent...", "Assess...", "Analyse..."). This is calibration only: the reference set's own status note says the replacement syllabus is first taught to Year 11 in 2027.

- "‘Legal measures often fail to respond to change.’ Assess this statement with reference to the need to protect consumers." (Legal Studies 2021)
- "‘Non-compliance challenges the effectiveness of the law.’ To what extent is this statement accurate in relation to consumers?" (Legal Studies 2025 Q25a)

**14. English (Module C): attribute real stimuli and use prescribed-text stems.** Use a real published quote, illustration or article with its attribution. Prescribed-text stems follow "How does your study of [text] inform your understanding of [concept] and its connection to culture?" (Standard 2024 Q1a–k).

- "‘For all the benefits gained by time-saving inventions, ... ’ — Jessica Powell, Worth the while" (English Advanced 2024 Q3)
- "How does your study of The Penguin Henry Lawson Short Stories inform your understanding of place and its connection to culture?" (English Standard 2024 Q1a)

## 5. Course defaults

| Course                                        | Default context                                                                                           | Locale default                                                | Stem style                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Business Studies                              | Invented business (or data pack) for short items; invented report with company name for the 20-mark item  | Unlocated, about 1 in 3 Australian                            | "this business"; ONE/TWO counts; rubric "apply the hypothetical business situation" for reports |
| Economics MCQ                                 | "a hypothetical economy" or "Country A/B"; tables and graphs                                              | Unlocated                                                     | Four options; numerical items with exact answers                                                |
| Economics Section II and III/IV               | Real Australian data with a citation line                                                                 | Australian (13 of 16 constructed questions)                   | "refer to the information provided"; "Australia" named in the stem                              |
| Biology                                       | Organisms, populations, diagrams, data tables                                                             | Unlocated (85%); Australia only for real events or programmes | Short stems; diagrams credited                                                                  |
| PDHPE                                         | Athlete, coach or health-worker archetype                                                                 | Unlocated for scenarios; Australia in health-system stems     | "Support your answer with examples"; "Select ONE..."                                            |
| Geography                                     | Real overseas place with a Stimulus Booklet source; or the student's own case                             | Overseas named (10); student-chosen (11)                      | "Answer parts (a)–(c) with reference to ..."                                                    |
| Legal Studies                                 | No scenario; quoted proposition or jurisdiction-specific stem                                             | Jurisdiction in the stem (19 of 111)                          | "To what extent..."; "Assess this statement..."                                                 |
| English                                       | Prescribed text list; attributed quote or artwork                                                         | Mixed (Australian and overseas texts)                         | "make close reference to your prescribed text"                                                  |
| Software Engineering and Enterprise Computing | Product or system (weather app, TV line, website); "from the scenario" or "from the stimulus" in criteria | Unlocated and nameless                                        | Criteria-led; no places, companies or people                                                    |

The generator's `COURSE_DEFAULTS` holds a shorter version of these rows (section 7).

## 6. How the generator compares (before this change)

These generated items are not NESA evidence. They are the seed's non-past prompts, shown for contrast.

| Measure                                                                                      | NESA papers (this study)                                 | In-repo generated (non-past)                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Business Studies scenarios naming Australia or an AU place                                   | 21 of 64 (33%)                                           | 192 of 348 (55%)                                                                    |
| Economics MCQs naming Australia (NESA) vs Economics scenarios naming an AU place (generated) | 4 of 40 MCQs (10%)                                       | 41 of 262 (16%)                                                                     |
| Business Studies place names                                                                 | Newcastle (1 item); NSW (1 item)                         | 13 or more capital and regional cities                                              |
| Geography place names                                                                        | Real overseas places (Aogashima, Black Forest, Freiburg) | Invented toponyms (Lark Creek, Pellow Creek, Kestrel Gorge, Ashmere, Tarrin Hollow) |
| Named people                                                                                 | Michael (2 items) only; none in Legal, EC or Geography   | Jordan, Sam (Legal); Chloe, Ana, Eli (EC)                                           |

The Economics row compares NESA MCQs with generated Economics scenarios, so it is a contrast, not a like-for-like count. The generator is most off-pattern in Business Studies (more Australian places, more cities) and in Geography and EC (invented places and people).

## 7. Where it is used

**`utils/scenarioConventions.ts`.** `buildScenarioRules(courseName)` returns a block of ten general rules, a condensed form of section 4, followed by the first matching entry in `COURSE_DEFAULTS` (matched on course name, first match wins). It is called from `enrichPromptDetails`, `generateScenarioForPrompt`, `refineManualPrompt` and `generateNewPrompt` in `services/geminiService.ts`. `SCENARIO_TYPE_BRIEF` in the same file turns the scenario-type id from the generator modal into words for `generateNewPrompt`.

**`utils/pastPaperCalibration.ts`.** Real past questions (`isPastHSC`) from the library, shown to the generators as calibration. `selectCalibrationExamples` returns up to three, same course first. Examples are ranked by closeness (same dot point, then same topic, then course), then by how close their marks are, then newest year first. Variants of one paper question (for example 1(a)–(k)) count once. A course with no past questions borrows at most two from other courses, one per course where it can, and its brief tells the model to take only the craft, not the content. `buildQuestionCalibrationBrief` is used in `refineManualPrompt` and `generateNewPrompt`; `buildSampleCalibrationBrief` in `generateSampleAnswer`; `buildGuideCalibrationBrief` in `generateRubricForPrompt`, which excludes the prompt it is writing for. `App.tsx` registers the library whenever the courses change.

## 8. Caveats and how to extend the study

### Caveats

- Sample size: Business Studies (92) and Geography (31) are reasonable. English (22) and Legal (111, 2011 syllabus) are not comparable to the 2025 syllabus.
- Judgement calls: "award wages", "superannuation", "federal government" and "PBS" are treated as Australia-cued, not named. "Indigenous" in Legal is treated as unlocated, since the UN also uses the term. "Developed world" and "developing world" are treated as unlocated. The Ottawa Charter is treated as an overseas named framework.
- Inferred items: SE and EC scenario flags are inferred from criteria and sample answers, not from stems. Read them as indicative only.
- Seed gaps: the in-repo Business Studies seed lacks 2025 Q25 and 2024 Q21(b); both are in the tallies. The seed also lacks Geography stimulus booklets, which 10 parts need.
- Image-only content: Economics 2024 Q26 was read from a rendered page image (no OCR installed). Its SMH quote and ABS unemployment chart were transcribed by hand.
- Verbatim check: quotations were checked against extracted text. Only the margin mark values that the PDF layout inserts were removed.

### How to extend the study

1. Copy the item-level data into the repository first. `scenario-items.csv` (472 rows) and the extracted NESA text were in a session scratch folder and are not in the repository. Keep them in the repository, for example under `data/`.
2. Download the paper and marking guidelines from NESA, as in `docs/seed-data-playbook.md` section 2, step 1. Convert with `pdftotext -layout`.
3. Add one row per item with the existing columns: `course`, `source`, `year`, `qno`, `ctx`, `locale`, `invented_names`, `note`. Tag `ctx` and `locale` with the categories in section 2. Keep footers and credit lines out of `locale`.
4. Re-tally with the definitions here. Context-bearing items are SCENARIO, DATA, CASE-CHOICE and STIMULUS. The headline excludes SE, EC and English. Check that each course's tags sum to its items.
5. Check each new quotation against the `pdftotext` output before it goes into this document.
6. Update the figures here, the item count in the header comment of `utils/scenarioConventions.ts` (it says 472), and the years that comment gives.
