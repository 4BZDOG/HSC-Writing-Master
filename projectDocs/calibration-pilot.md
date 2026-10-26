# Calibration pilot: 2012 Business Studies Question 26

October 2026. A first test of the app's marking assumptions against responses NESA has marked and published.

## What was tested

**Question.** 2012 HSC Business Studies, Section IV, Question 26 (20 marks): "Why are ethical behaviour and
government regulation important in marketing?" The marking guideline has five ranges: 17–20, 13–16, 9–12, 5–8 and
1–4.

**Responses.** The 13 Question 26 responses in NESA's HSC standards materials for Business Studies. NESA labels each
by the band border it sits on: three at Band 5/6, three at 4/5, one at 3/4, three at 2/3 and three at 1/2.

**Sources.**

- The paper and marking guidelines: the NESA (Board of Studies) HSC exam archive,
  `boardofstudies.nsw.edu.au/hsc_exams/hsc2012exams/`.
- The responses: NESA HSC standards materials, Business Studies,
  `nsw.gov.au/education-and-training/nesa/curriculum/hsc-standards/business-studies`.

**Copyright.** The papers, guidelines and student responses are © NESA. Only counts and marks are recorded here. No
response or transcription is in this repository, and none should be. Using NESA material inside the product needs
NESA's written permission (copyright@nesa.nsw.edu.au).

## Method

There is no AI key in the development environment, so the model could not be called. Instead:

1. Each response's pages were rendered, the band label in the header was blanked, and the files were renamed to
   random IDs. The ID-to-band key was set aside unread.
2. Each response was transcribed, then marked out of 20 against NESA's 2012 guideline. A proxy marker did the marking,
   given what the app's own marker brief gives it: the guideline, the verb and the mark ranges.
3. Every mark was recorded with a rationale before the key was opened.
4. The marks and the response lengths were then compared with NESA's bands and with the app's own length rules.

A band border is taken as this mark range on a 20-mark question: 5/6 ≈ 16–19, 4/5 ≈ 13–15, 3/4 ≈ 10–12,
2/3 ≈ 6–9, 1/2 ≈ 1–5.

## Results

| NESA band label | Blind mark /20 | Words | Characters |
| --------------- | -------------- | ----- | ---------- |
| 5/6             | 17             | 635   | 4,369      |
| 5/6             | 18             | 1,358 | 8,951      |
| 5/6             | 14             | 680   | 4,409      |
| 4/5             | 11             | 512   | 3,153      |
| 4/5             | 13             | 559   | 3,704      |
| 4/5             | 14             | 771   | 4,821      |
| 3/4             | 10             | 268   | 1,757      |
| 2/3             | 7              | 254   | 1,603      |
| 2/3             | 5              | 333   | 1,988      |
| 2/3             | 6              | 147   | 910        |
| 1/2             | 3              | 54    | 350        |
| 1/2             | 3              | 220   | 1,507      |
| 1/2             | 2              | 41    | 283        |

**Agreement.**

- The blind marks put the responses in NESA's order. The rank correlation with NESA's band is 0.97.
- 10 of the 13 marks fall inside their border's range.
- All three misses are under-marks, by 1–2 marks: one 5/6 response marked 14, one 4/5 marked 11, and one 2/3 marked 5.

**Length.**

- Length tracks band closely (rank correlation 0.92), but not perfectly.
- One 1/2 response ran to 220 words. Almost none of it answered the question.
- Real responses averaged about 6.5 characters a word, spaces included.

## What it shows

### 1. The app expected a 20-mark answer to be half the length NESA's real ones are (fixed)

The app held a 20-mark DISCUSS to the length for 10 marks. `getExpectedCharRange` interpolated inside the verb's mark
range (5–10 for DISCUSS) and stopped at its top, so a 20-mark question got 2,250–3,000 characters. The marker brief
used the verb's raw range instead: 1,500–3,000 characters and "9–18 minutes" for a question the paper allows about 36
minutes for.

The real Band 5/6 responses ran to 4,400 characters and more, and the Band 4/5 ones to 3,150–4,800. So the app was
describing a mid-band answer as full length. That had three effects:

- **The live writing guide.** A student writing a Band 6-length answer was told it was "longer than this verb usually
  needs — tighten your expression". The note fires above 1.3 × 3,000 = 3,900 characters, and every real Band 5/6
  response here would have set it off.
- **The marker brief.** The marker was told 1,500–3,000 characters was the expected length, alongside a structure
  guide saying 640–900 words (about 4,200–5,900 characters) in the same prompt.
- **Rewrites and exemplars.**
  - The rewrite of a strong answer was capped at 3,000 characters. A student who wrote 4,400 characters got back a
    "one step better" version a third shorter than their own.
  - New exemplars were briefed to the same short scale.

**Fix.** `getExpectedCharRange` now carries on past the verb's top mark in proportion, as `getRecommendedTime` and
`getFullMarkWordRange` already did. A 20-mark DISCUSS is now 4,500–6,000 characters; 17/20 of that is 3,825–5,100,
which brackets the real Band 5/6 responses. The marker brief now uses that range, and the paper's time.
`tests/unit/expectedCharRange.test.ts` pins it.

`getFullMarkWordRange(20)` (640–900 words) was already right. The real Band 5/6 median was 680 words.

### 2. Length is evidence, not proof (applied to the marker brief)

Length followed band, but a 220-word response with almost nothing relevant in it sat in the bottom range beside two
40–50 word ones. The marker brief now says plainly that a long response that does not answer the question still earns
a low mark. Before, it only said not to "reward padding".

### 3. The shipped 12/20 exemplars are about half real length (recommended: regenerate)

Every 20-mark DISCUSS and ASSESS question ships AI exemplars at 5, 12 and 20 marks. Measured across 38 questions:

| Exemplar | Median characters | Real responses at that mark |
| -------- | ----------------- | --------------------------- |
| 20/20    | 4,412             | 4,369–4,409 at 17–18        |
| 12/20    | 1,686             | 1,757–3,704 at 10–13        |
| 5/20     | 629               | 283–1,988 at 2–7            |

The 20/20 exemplars are about the right length; the model overshot the short brief. The 12/20 exemplars are the length
of a real 6/20 answer. The marker uses these as its reference samples, so a real 12/20 answer of 3,500 characters sits
much nearer the 20/20 anchor by length than it should.

**Recommended.** Regenerate the 12/20 exemplars, now that the scope brief asks for 2,700–3,600 characters at 12/20.
That needs AI calls, so it was not done here.

### 4. The verb cap held a 20-mark DISCUSS at Band 5 (applied, then withdrawn)

**Withdrawn on 25 October 2026.** The six-band ladder below drew a question in two colours: the Writing Prompt shows a
question in its verb tier's colour (a 20-mark DISCUSS is Tier 5, blue), while the Syllabus Terms, Marking Guide and
Sample Answers beside it took the purple of Band 6. It also broke the guide's own rows: NESA writes five ranges (17–20,
13–16, 9–12, 5–8, 1–4), six bands cannot fall one to a row, so the 13–16 row read Band 5 while a 13/20 exemplar in it
read Band 4. The owner asked for the Writing Prompt's cap everywhere. A question's ceiling is its verb's tier again,
and a guide written in mark ranges now gives one band per row, the ceiling at the top (`utils/guideBands.ts`), so the
guide, its exemplars and the feedback agree by construction. The 2.21.0 data migration and a second one-off step in
`schema.sql` re-derive the stored bands. The border evidence below stands: on the tier ladder NESA's Band 5/6 samples
read Band 5, which is the trade made for one colour per question. In English Standard in particular a Band 6 is rare
(NESA's band labels are per course), so a 20/20 reading Band 5 overstates the gap less than it might elsewhere.

`getBandForMark` capped a Tier 5 verb (DISCUSS, ASSESS, JUSTIFY) at Band 5, whatever the marks. A student scoring
18/20 on a Business Studies extended response saw "Band 5", and so did a perfect 20/20. NESA publishes three
Question 26 responses as Band 5/6 standard, and 17–20 is the top range of its guideline.

The old ladder was built to match the guideline's five mark ranges (17–20 as Band 5, down to 1–4 as Band 1). Read
against NESA's band labels, it put every border sample a band low:

| NESA border | Mean blind mark | Old ladder's border | Six-band ladder's border |
| ----------- | --------------- | ------------------- | ------------------------ |
| 5/6         | 16.3            | none (no Band 6)    | 16/17                    |
| 4/5         | 12.7            | 16/17               | 13/14                    |
| 3/4         | 10              | 12/13               | 10/11                    |
| 2/3         | 6               | 8/9                 | 6/7                      |
| 1/2         | 2.7             | 4/5                 | 3/4                      |

**Change.** A question worth 15 marks or more (`EXTENDED_RESPONSE_MARKS`) now reaches Band 6 whatever its verb
(`getQuestionBandCeiling`). Shorter questions keep the verb's ceiling. Over 20 marks Band 6 is 17–20, which is exactly
the guideline's top range, and every band border falls where NESA's border samples sit.

The app's word-count bands (`BAND_METRICS`) agree with it. On a 20-mark question they put the Band 6, 5, 3 and 2
thresholds at 640, 540, 260 and 160 words. The 5/6, 4/5 and 2/3 border samples have medians of 680, 559 and 254 words,
and the 1/2 samples straddle 160.

**What else this changes.**

- The 85 shipped exemplars on extended responses store their re-derived band. Browsers re-derive theirs through the
  2.20.0 data migration, and the database through a one-off step in `schema.sql`.
- The verb floor still stops a low verb on a long question. Its note now gives the task as the reason, not the
  ladder.
- The question picker's tier headings no longer name a band, because each row carries its own.
- With the free plan's exemplar cap at Band 3, the 12/20 exemplar on an extended response (Band 4 under this rule)
  became part of Plus. Free students still saw the 5/20 one. Under the tier ladder it is Band 3 and free again.

### 5. Where the proxy marker went wrong: deducting, not best-fit (applied; check with the real model)

All three misses came from the same habit. The marker deducted for the kind of regulation a response chose
(employment law, the carbon tax, free trade) instead of consumer and marketing law, and for imperfect facts. NESA
credited those responses for sustained, logical argument with well-used case studies.

NESA marks by best fit to the range descriptions. The marker brief now says so: where the rubric is a ladder of mark
ranges, it chooses the range that fits best as a whole and does not deduct for each flaw. "Do not inflate marks"
stays. Because the habit was seen in a proxy marker, the first run against the real model should check the change
does not lift marks.

## How to repeat this

1. Pick a past question that has standards samples on every border.
2. Blank the band labels and randomise the file names. Keep the key unread.
3. Mark each response with the app itself: create the question with NESA's guideline as its rubric, then submit each
   transcription.
4. Compare with the key. The checks above are the ones to run: rank correlation, the share inside the border's range,
   the direction of misses, and length by band.

Use different courses and verbs before drawing firm conclusions. This pilot is one question, 13 responses and a proxy
marker. The length findings are measurements and stand on their own. The marking findings need the real model to
confirm them.
