# LLM Prompt: Generating Import-Ready Course Datasets

Copy everything inside the fenced block below into any capable LLM (Claude,
Gemini, GPT), replace the three `<<PLACEHOLDERS>>`, and the model will produce
a JSON file that imports cleanly through **Data Vault → Import** with correct
verbs, tiers, colours, marking guides and focus sub-items on every surface.

You no longer have to start here. **Data Vault → Export** now writes these same
rules into the exported `.json` under `_instructions_for_llm`, and **Import →
download the LLM template** writes them into an empty file with the shape
alongside. Both come from `utils/llmSeedBrief.ts`, so handing a model an export
of one course and asking for three more is the shortest route to a seeded
subject — and the import unwraps the block on the way back in. This page stays
for the from-scratch case where you want the prompt as prose.

Why this prompt is shaped the way it is:

- **Verbs must come from the canonical list.** Every colour, band ceiling and
  marking surface in the app derives from the question's command verb. The
  import now repairs unknown verbs automatically, but a dataset that uses the
  canonical verbs from the start gets exactly the tiers the author intended.
- **`totalMarks` must sit inside the verb's typical range** — the app flags
  unusual pairings and derives time guides and band ceilings from marks.
- **Dot points that end in `including a, b and c`** get those items parsed as
  toggleable *focus areas* in the navigator and the question generator.
- **Marking criteria are line-based** (`N marks: …` / `N–M marks: …`), which
  the marking accordion parses; bullet points and paragraphs are not. Above 6
  marks the rows are fixed by the verb's tier — the table below is printed
  from the app's own ladder, and the downloaded template carries the full set.
- **Every question gets a ladder of answers** (full, middle, bottom). The
  marker is calibrated against them; one full-mark exemplar gives it nothing
  to compare a weaker answer with.

**The reference standard is HSC Software Engineering** — 2-4 questions per dot
point across 2-12 marks, a full/middle/bottom sample ladder, marker notes and
common student errors on most questions. When in doubt, export that course
and hand it to the model as the example.

---

````text
You are an expert NESA HSC content writer producing a syllabus dataset for an
AI writing-coach app. Output a single JSON document and nothing else — no
markdown fences, no commentary.

SUBJECT: <<e.g. HSC Software Engineering>>
TOPICS TO COVER: <<e.g. Programming for the web; Secure software architecture>>
DEPTH: <<e.g. 2 sub-topics per topic, 3 dot points per sub-topic, 3 questions per dot point, 3 sample answers per question>>

LANGUAGE: British/Australian English throughout (analyse, colour, organisation,
programme). No American spellings anywhere, including inside sample answers.

OUTPUT SHAPE (exactly this structure; omit all id fields — the app generates them):

{
  "name": "<course name>",
  "outcomes": [
    { "code": "<e.g. SE-12-01>", "description": "<outcome statement>" }
  ],
  "topics": [
    {
      "name": "<topic name>",
      "subTopics": [
        {
          "name": "<sub-topic name>",
          "dotPoints": [
            {
              "description": "<syllabus dot point — see DOT POINT RULES>",
              "prompts": [
                {
                  "question": "<exam question — see QUESTION RULES>",
                  "verb": "<canonical verb — see VERB LIST>",
                  "totalMarks": <integer>,
                  "scenario": "<context paragraph, or empty string>",
                  "markingCriteria": "<see MARKING CRITERIA RULES>",
                  "keywords": ["<5-10 technical terms>"],
                  "linkedOutcomes": ["<outcome codes from the outcomes array>"],
                  "markerNotes": ["<2-4 notes — see MARKER NOTES>"],
                  "commonStudentErrors": ["<2-4 mistakes — see COMMON ERRORS>"],
                  "sampleAnswers": [
                    {
                      "mark": <whole number, 0 to totalMarks — no "band" field>,
                      "answer": "<the full sample response>",
                      "source": "AI",
                      "feedback": "<2-3 sentences of marker commentary>"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

DOT POINT RULES
- Every dot point description MUST begin with a command verb from the VERB LIST
  (lowercase reads naturally, e.g. "describe the OSI model…").
- Where the dot point has enumerable parts, END it with
  "including <item 1>, <item 2> and <item 3>" — the app parses these into
  selectable focus areas. Use 2-6 items, each 1-4 words.

QUESTION RULES
- The question stem MUST begin with (or prominently use) its "verb" value,
  and genuinely demand that verb's cognitive level — an EVALUATE question
  requires a judgement against criteria, not a description.
- "verb" MUST be one of the canonical verbs below, in UPPERCASE, exactly.
- "totalMarks" MUST be an integer within the verb's typical range below.
- Write 2-4 questions per dot point, each on a different verb and mark value.
  Across a topic: mostly 3-6 mark questions, some 2-mark recall questions and
  at least one 7+ mark extended response using a Tier 5-6 verb.
- "scenario": give most questions a realistic industry/context paragraph
  (who, what, why — 2-4 sentences) the answer has to use. Use "" otherwise.
- "linkedOutcomes" must reference 1-3 codes that exist in the outcomes array.

VERB LIST (verb — typical marks)
- Tier 1 (recall): IDENTIFY 1-2, STATE 1-2, RECALL 1-2, DEFINE 1-3, EXTRACT 1-2, RECOUNT 2-4
- Tier 2 (describe): OUTLINE 2-4, DESCRIBE 3-5, CLARIFY 2-4, SUMMARISE 3-5, CLASSIFY 2-4
- Tier 3 (apply): CALCULATE 2-4, APPLY 3-6, DEMONSTRATE 3-6, CONSTRUCT 3-6
- Tier 4 (analyse): EXPLAIN 3-6, COMPARE 4-8, CONTRAST 4-6, DISTINGUISH 3-5, INTERPRET 3-6, DEDUCE 3-5, EXTRAPOLATE 3-6, PREDICT 3-5, ANALYSE 5-8, EXAMINE 4-7, ACCOUNT 4-7, DIFFERENTIATE 3-5
- Tier 5 (synthesise): DISCUSS 5-8, PROPOSE 4-7, INVESTIGATE 5-10, SYNTHESISE 6-10
- Tier 6 (evaluate): ASSESS 6-10, EVALUATE 6-12, APPRECIATE 5-8, JUSTIFY 6-10, RECOMMEND 5-8, CRITICALLY ANALYSE 8-20, CRITICALLY EVALUATE 8-20

MARKING CRITERIA RULES
- One string, lines separated by \n. Every line starts with a mark value or
  range followed by a colon. NEVER use bullet points, headings or paragraphs.
- Questions of 6 marks or fewer: one line PER mark value, descending, no
  ranges. Example for 4 marks:
  "4 marks: Provides a detailed description of X including A and B, using specific terminology\n3 marks: Describes X with some specific detail\n2 marks: Outlines basic features of X\n1 mark: Identifies a relevant feature of X"
- Questions above 6 marks: EXACTLY these rows for the verb's tier, top first,
  discriminated by QUALITY OF THINKING, not length. The top row must demand
  the verb's full cognitive level; middle rows show sound knowledge a step
  below the verb (describes where it should analyse); the lowest is
  fragmentary.
    Tier 4, 7 marks:  6-7 / 4-5 / 2-3 / 1
    Tier 4, 8 marks:  7-8 / 5-6 / 3-4 / 1-2
    Tier 5, 8 marks:  7-8 / 5-6 / 4 / 2-3 / 1
    Tier 5, 10 marks: 9-10 / 7-8 / 5-6 / 3-4 / 1-2
    Tier 6, 8 marks:  7-8 / 6 / 5 / 3-4 / 2 / 1
    Tier 6, 10 marks: 9-10 / 7-8 / 6 / 4-5 / 2-3 / 1
    Tier 6, 12 marks: 11-12 / 9-10 / 7-8 / 5-6 / 3-4 / 1-2
  (The downloaded template lists every tier and mark value.) Example for a
  Tier 6 verb at 8 marks:
  "7-8 marks: Makes a sustained, criteria-based judgement …\n6 marks: …\n5 marks: …\n3-4 marks: Sound knowledge that describes rather than evaluates …\n2 marks: Basic statements with general terminology\n1 mark: Minimal relevant response"
- Describe a whole answer at each mark, never components that add up
  ("Makes a judgement (1 mark) • Applies criterion A (2 marks)"). The app
  flags that layout as non-standard.

MARKER NOTES
- "markerNotes": 2-4 short notes in a marker's register on what separates a
  strong answer to THIS question. The marker reads them after the criteria;
  they refine it and never add marks the criteria do not award.

COMMON ERRORS
- "commonStudentErrors": 2-4 specific mistakes students make on THIS question,
  written as the mistake itself ("Describing both approaches without judging
  their effectiveness"). Students see them as things to avoid.

SYLLABUS TERM RULES
- "keywords" are the syllabus terminology a full-mark answer must use. Order
  them MUST-USE FIRST: a must-use term is one the topic, sub-topic, dot point,
  question or scenario NAMES ITSELF. The app re-derives that split by matching
  each term back against those five sources and shows what it finds as the
  must-use terms in the student's Syllabus Terms panel, so write a must-use
  term in the same words its source uses ("automated unit testing", not
  "automated testing methodologies") or the app cannot see it.
- After those, add the supporting terms a strong answer reaches for even though
  nothing in the question names them ("credibility", "peer review").
- No command verbs, no generic academic words ("process", "factor",
  "important"), no connectives ("therefore", "however").

SAMPLE ANSWER RULES
- For each question write three answers at DIFFERENT mark values: full
  marks, the middle and the bottom (5-mark question: 5, 3 and 1; 2-mark
  question: 2 and 1), each with flaws that match that mark's criteria line.
- "mark" is a whole number from 0 to totalMarks — never a half mark. Do not
  write "band"; the app derives it from the mark and the verb.
- The full-mark exemplar must use EVERY must-use term from that question's
  keywords, each doing real work in a sentence rather than listed. A lower-mark
  answer uses proportionally fewer, taking must-use terms before supporting
  ones and falling back on general language for the rest — the terms it leaves
  out are part of why it earns less. Never bolt terms onto an answer that has
  not earned them.
- "source" is always "AI". "feedback" explains, in marker language, exactly
  why the answer earns its mark and what would lift it.
- Full-mark exemplars must genuinely satisfy the verb: an ANALYSE exemplar
  draws out relationships and implications; an EVALUATE exemplar reaches an
  explicit judgement against named criteria.
- Write answers at realistic student length: roughly 40-60 words per mark.

QUALITY BAR
- Content must be factually accurate and syllabus-authentic for the subject.
- No placeholder text ("lorem", "TBD", "sample"), no duplicated questions,
  and no two sample answers with identical text.
- Validate mentally before output: every verb is from the list, every
  totalMarks is inside its verb's range, every linkedOutcomes code exists,
  every markingCriteria line starts with "N marks:" or "N-M marks:".
````

---

## After generating

### Seeding the shared library (admin)

1. Save each course as a JSON array of courses in `public/courseData/` and list
   it in `public/courseData/manifest.json` as `{ "file": …, "type": "course",
   "subject": … }`. Give every item an `id` (the seed matches existing rows by
   it, so a re-seed updates rather than duplicates); keep the ids of anything
   that already exists. A file straight from the model has no ids — import it
   through **Data Vault → Import** and export it again, and the export has them.
2. `npm run content:canonicalise` — applies the app's import rules (verbs,
   whole marks, derived bands, topic files matched to their course) and lists
   anything it had to guess. Then `npm run content:check` must report nothing.
3. `npm test` — the seed-content tests fail on anything the canonicaliser could
   not fix.
4. `node supabase/seed.mjs` (see its header for the environment it needs).
   Topic entries in the manifest are not seeded; the course file carries them.

### Importing into one workspace

1. Save the model's output as a `.json` file.
2. In the app: **Data Vault → Import**, choose the file, review the preview
   (conflicts and placements are reconciled interactively), and confirm.
3. Spot-check one imported question: the navigator row, the writing prompt and
   the writing area should all show the same tier colour, and the dot point's
   `including …` items should appear as focus chips in the question generator.
