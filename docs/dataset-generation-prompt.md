# LLM Prompt: Generating Import-Ready Course Datasets

Copy everything inside the fenced block below into any capable LLM (Claude,
Gemini, GPT), replace the three `<<PLACEHOLDERS>>`, and the model will produce
a JSON file that imports cleanly through **Data Vault → Import** with correct
verbs, tiers, colours, marking guides and focus sub-items on every surface.

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
  the marking accordion parses; bullet points and paragraphs are not.

---

````text
You are an expert NESA HSC content writer producing a syllabus dataset for an
AI writing-coach app. Output a single JSON document and nothing else — no
markdown fences, no commentary.

SUBJECT: <<e.g. HSC Software Engineering>>
TOPICS TO COVER: <<e.g. Programming for the web; Secure software architecture>>
DEPTH: <<e.g. 2 sub-topics per topic, 3 dot points per sub-topic, 2 questions per dot point, 2 sample answers per question>>

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
                  "sampleAnswers": [
                    {
                      "mark": <integer ≤ totalMarks>,
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
- Mix mark values across the dataset: mostly 3-6 mark questions, with some
  1-2 mark recall questions and at least one 8+ mark extended response per
  topic using a Tier 5-6 verb.
- "scenario": give roughly half the questions a realistic industry/context
  paragraph (who, what, why — 2-4 sentences). Use "" for direct questions.
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
- Questions above 6 marks: band-range lines, descending, discriminated by
  QUALITY OF THINKING, not length. The top range must demand the verb's full
  cognitive level (judgement/relationships/synthesis); middle ranges show
  sound knowledge a step below the verb (describes where it should analyse);
  the lowest range is fragmentary. Example for 8 marks:
  "8 marks: Makes a sustained, criteria-based judgement …\n6-7 marks: Thorough knowledge with an inconsistent line of argument …\n4-5 marks: Sound knowledge that describes rather than evaluates …\n2-3 marks: Basic statements with general terminology\n1 mark: Minimal relevant response"

SAMPLE ANSWER RULES
- For each question provide the requested number of sample answers at
  DIFFERENT mark values: always include one full-mark exemplar, plus at least
  one clearly weaker response (roughly half marks) whose flaws match the
  marking criteria for that mark.
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

1. Save the model's output as a `.json` file.
2. In the app: **Data Vault → Import**, choose the file, review the preview
   (conflicts and placements are reconciled interactively), and confirm.
3. Spot-check one imported question: the navigator row, the writing prompt and
   the writing area should all show the same tier colour, and the dot point's
   `including …` items should appear as focus chips in the question generator.
