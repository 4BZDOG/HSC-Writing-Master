# Authoring brief — new dot points (read fully)

You are writing questions for NEW syllabus dot points in one HSC/Preliminary seed course. NEVER edit the course JSON, any repo file, or git. Write ONLY your patch JSON to the path you are given. Work in python3/node scripts you keep in the scratchpad dir; never print whole course files.

Your job file (JSON): {"courseFile": "...", "items": [ {dpId, year, course, topic, subTopic, description, focusAreaOutcomes:[{code,description}]} ... ]}. Every item is a dot point (syllabus statement) with NO questions yet. The `description` is NESA's own wording (sub-points in brackets are part of the syllabus statement — the question should test them). Course file: /home/user/HSC-Writing-Master/public/courseData/<courseFile>. Read 2-3 existing dot points that already have prompts in the same course (python3) to see the standard (tone, level, scenario style, keywords).

## What to write

For EVERY item write EXACTLY TWO new prompts that test that dot point:

- Question A: short, 3-4 marks, verb from tiers 1-3 (e.g. IDENTIFY/OUTLINE/DESCRIBE/CALCULATE/APPLY/DEMONSTRATE/CONSTRUCT).
- Question B: 5-6 marks (occasionally 7-8), verb from tiers 4-6 (EXPLAIN/COMPARE/ANALYSE/DISCUSS/ASSESS/EVALUATE/JUSTIFY...), more demanding.
  Different verbs for the two questions, different angles, no repetition between them. Year 11 items are Preliminary level (accessible, foundational); Year 12 items are HSC level. Practical dot points (e.g. "Develop a flat-file database", "Design algorithms", "Use a flowchart") are tested by written tasks: describe/justify/construct a design, trace or write short pseudocode inside the stem or answer, interpret a described outcome. Questions must be answerable in writing without a computer.

## Patch format (JSON)

{ "dotPoints": { "<dpId>": { "newPrompts": [ { "question","verb","totalMarks","scenario","markingCriteria","keywords","linkedOutcomes","markerNotes","commonStudentErrors","sampleAnswers":[{"mark","answer","feedback"}] }, {...second prompt...} ] } } }
Do not write ids for prompts or samples and do not write "band" or "source".

## Validate repeatedly until it reports 0 errors

cd /home/user/HSC-Writing-Master && npx tsx .claude/skills/build-course-data/tools/apply_patch.mts validate public/courseData/<courseFile> <your patch path>
(validate never writes; "unknown dot point" means a wrong id.) Warnings should be minimised too. It checks: verb is canonical and appears in the stem; marking-guide ladder; keywords 4-10; markerNotes 2-4; commonStudentErrors 2-4; linkedOutcomes exist in the course outcomes; sample marks whole, <= total, distinct, include full marks; 3 samples (2 for 1-2 mark questions); no duplicates; US spellings; full-mark answer length; lower samples shorter than higher.

## Content rules

- British/Australian English (analyse, organisation, colour, programme only where idiomatic; "program" for software; "judgement").
- Canonical verbs (UPPERCASE; typical marks): Tier1 IDENTIFY 1-2, STATE 1-2, RECALL 1-2, DEFINE 1-3, EXTRACT 1-2, RECOUNT 2-4; Tier2 OUTLINE 2-4, DESCRIBE 3-5, CLARIFY 2-4, SUMMARISE 3-5, CLASSIFY 2-4; Tier3 CALCULATE 2-4, APPLY 3-6, DEMONSTRATE 3-6, CONSTRUCT 3-6; Tier4 EXPLAIN 3-6, COMPARE 4-8, CONTRAST 4-6, DISTINGUISH 3-5, INTERPRET 3-6, DEDUCE 3-5, EXTRAPOLATE 3-6, PREDICT 3-5, ANALYSE 5-8, EXAMINE 4-7, ACCOUNT 4-7; Tier5 DISCUSS 5-8, PROPOSE 4-7, INVESTIGATE 5-10, SYNTHESISE 6-10; Tier6 ASSESS 6-10, EVALUATE 6-12, JUSTIFY 6-10, RECOMMEND 5-8. The verb must appear in capitals-insensitive form in the question stem. NESA definitions: EXPLAIN = relate cause and effect, make relationships evident, provide why/how; COMPARE = show how things are similar or different; CONTRAST = show how things are different or opposite; DEMONSTRATE = show by example; APPLY = use in a different, new or unfamiliar situation.
- markingCriteria: one string, lines "N marks: ..." separated by \n, in HSC marking-guideline style: HIGHEST MARK FIRST, descending; each row a performance descriptor opening with a capitalised third-person verb ("Provides…", "Demonstrates…", "Identifies…", "Outlines…", "Explains…", "Analyses…", "Makes a judgement…"), NESA qualifiers (sustained, thorough, detailed, sound, relevant, accurate, specific, limited, some, basic, general, minimal), no closing full stop, no bullets. <=6 marks: one line per mark value from the total down to 1, no ranges ("4 marks: …\n3 marks: …\n2 marks: …\n1 mark: …"). >6 marks: exact rows by tier: Tier4 7m: 6-7/4-5/2-3/1; Tier4 8m: 7-8/5-6/3-4/1-2; Tier5 8m: 7-8/5-6/4/2-3/1; Tier6 8m: 7-8/6/5/3-4/2/1. Describe the quality of a WHOLE answer at each mark, never components that add up. Rows differ from each other and are at least 5 words except the lowest ("Minimal relevant response" allowed).
- Samples: full, middle and bottom marks (5m: 5/3/1; 4m: 4/2/1; 3m: 3/2/1). BRIEF ANSWERS ARE PREFERRED: the full-mark exemplar should be at or under the app word band maximum and at least ~90% of the band minimum, ideally in the lower-middle of the band. Bands (words): 1m 1-10; 2m 15-40; 3m 40-80; 4m 80-120; 5m 110-160; 6m 140-220; 7m 180-280; 8m 220-350. The exemplar meets every demand of the top marking row at the verb's full level and uses every must-use keyword in real sentences. Middle and bottom answers are SHORTER than the full-mark one, with flaws matching their rows; feedback is 1-3 sentences of marker commentary.
- scenario: 2-4 sentences giving a concrete context the answer must use. Invented business/place/person/data MUST start with "Hypothetical:". Never invent statistics, laws, case names, quotations or dates presented as real; use real facts only when certain, otherwise stay general. Questions needing figures or code supply every needed value in the stem/scenario.
- keywords: 5-9 syllabus terms. The terms the dot point text names come first, in the SAME words (the validator requires the full-mark answer to contain every keyword that appears in the dot point / question / scenario text; use base forms, no possessives).
- markerNotes: 2-4 short marker-register notes about what separates a strong answer. commonStudentErrors: 2-4 specific mistakes phrased as the mistake.
- linkedOutcomes: 1-3 codes chosen ONLY from the item's focusAreaOutcomes.
- Quality over speed: technical and factual accuracy (this is NSW Stage 6 content — check your technical claims), the question must test its dot point, no placeholders, no stem that merely restates the dot point.

## Reporting

Final message (under 100 words): patch path, dot points done of dot points listed, validator result (errors/warnings), anything not done. Do not paste the patch.
