# What a real HSC paper looks like, course by course

Measured from the NESA papers and marking guidelines the seed has been checked
against (see `data/referencePapers/` and the past-paper questions flagged
`isPastHSC`). Use it to write and to check questions: a generated question should
look like one of these, not like a syllabus restatement.

Papers read: Business Studies 2020–2025 (all six), English Standard Paper 2 2024
(stems also from 2023 and from Advanced 2024), Geography 2024 and 2025, and the 2025
marking guidelines for Software Engineering and Enterprise Computing (NESA does not
publish those two papers' wording).

## Shape of the paper

| Course                            | Written parts                                                                                                                                                                         | Longest part | Notes                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Business Studies                  | Section II: four 10-mark questions of 1–6 mark parts (a 2025 question is 11 and another 9); Section III: one 20-mark business report; Section IV: choose one of two 20-mark questions | 20           | Scenario per question; "this business" in the stem; Section IV asks for case studies       |
| English Standard (Paper 2)        | Three 20-mark sections; Module C is 15 + 5                                                                                                                                            | 20           | Stems name the prescribed text and end "make close reference to your prescribed text"      |
| Geography                         | Section II 4–6 parts of 2–6 marks, one 12 or 13 mark part; Section III/IV 20 marks (2025: a 3 + 5 + 12 question on one city)                                                          | 20           | Many parts depend on the Stimulus Booklet (maps, graphs); extended responses are text only |
| Software Engineering (guidelines) | Parts of 1–5 marks, most 3; one 6-mark response on a video                                                                                                                            | 6            | No 20-mark response; stimulus is a video or a scenario                                     |
| Enterprise Computing (guidelines) | Parts of 1–5 marks, most 3 or 4; one 8-mark response on a stimulus                                                                                                                    | 8            | As above                                                                                   |

So "exam-length" is a per-course fact: 20 marks for Business Studies, English and
Geography; 6 for Software Engineering; 8 for Enterprise Computing.

## Stems

- Business Studies Section II (73 parts): Explain 20, Outline 14, How… 9, Why… 4, What… 3, then Justify, Recommend, Calculate, Discuss, Identify, Distinguish, Clarify, Analyse, Interpret. One task each; 24 capitalise a count (ONE, TWO); 62 sit on a scenario.
- Geography written parts (20): Describe, How…, Discuss, Propose, Explain, Account for, Analyse, Compare, Outline.
- Nothing in these papers restates a dot point as a question.

## Marking ladders

- Up to 6 marks: one row per mark, "Provides some relevant information" at 1 mark, and
  printed ORs that merge two routes into one mark. A 6-mark guide may merge rows
  (6 / 5 / 3–4 / 2 / 1 in Geography, 6 / 5 / 4 / 2–3 / 1 in Software Engineering).
- 8 marks (Enterprise Computing): 8 / 6–7 / 4–5 / 2–3 / 1.
- 12 marks (Geography): 11–12 / 8–10 / 5–7 / 3–4 / 1–2.
- 15 marks (English Module C): 13–15 / 10–12 / 7–9 / 4–6 / 1–3.
- 20 marks (all courses): 17–20 / 13–16 / 9–12 / 5–8 / 1–4, each row three or four
  bullets: knowledge, application of examples or the scenario, communication.
- A criterion opens with a third-person verb: Provides, Explains, Outlines, Describes,
  Identifies, Demonstrates, Correctly (a calculation).

## Sample answers

NESA's own sample answers are short. Median words by marks: 1 → 20, 2 → 33, 3 → 54,
4 → 74, 5 → 93, 6 → 125, 8 → 202. That is 15–35% under the app's lower word band from
4 marks up, and NESA says they are neither complete nor exemplary. A generated full-mark
exemplar should land near these medians (up to about a third more), not at the top of the
band.

## Where the app's ladder and NESA's differ

The app derives a ladder from the verb tier. Tier 5 at 20 marks reproduces NESA's five
bands exactly, which is why 20-mark questions are stored with a Tier 5 verb whatever the
paper prints. At 12, 15 and 8 marks the derived ladder is close to NESA's but not the
same, so a past paper's guide is stored as NESA wrote it and held only to being a sound
ladder (`guideStructureProblem`).
