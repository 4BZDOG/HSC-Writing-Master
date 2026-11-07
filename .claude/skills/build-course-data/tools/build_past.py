#!/usr/bin/env python3
"""Insert one year's past HSC questions into a shipped course, from a verified extract and a writer's file.

usage: build_past.py --course <CourseFile>.json --extract <year-extract.json> --writer <writer.json>
                     --prefix <id prefix, e.g. eco> [--write]

extract.json: verbatim parts (see the extraction brief: number, section, sectionHeading, marks, stem, stimulus,
  assessedOn, criteria [{marks, text}] top row first, sampleAnswer, prescribedText). Checked first with
  scripts/verifyPastPaperExtract.mts; its strings are copied here unchanged.
writer.json: {"<number>": {"dpId", "verb", "linkedOutcomes", "keywords", "markerNotes", "commonStudentErrors",
  "samples": [{"mark", "answer", "feedback", "source"?}], "numberLabel"?: "1(a)–(n)", "skip"?: "<reason>"}}.
  numberLabel merges parts that differ only by prescribed text into the one question built from this part
  (the others are skipped with "merged into <number>"); such a question carries no hscText. The full-mark sample is NESA's
  own answer (source HSC_EXEMPLAR) where the guideline prints one; the builder enforces that.

Each question becomes `prompt-<prefix>-hsc-<year>-<number slug>` on its dot point, with the provenance fields the
app reads (isPastHSC, hscYear, hscQuestionNumber, hscSection, hscText) and NESA's ladder as "N marks: …" rows,
bullets joined with "; " (docs/seed-data-playbook.md §3). The scenario holds only what the student reads to answer:
the stimulus, then "Your answer will be assessed on how well you:" and its bullets. Re-running replaces the
questions it built before (same ids), so it is idempotent. Without --write it only reports.
"""
import argparse, json, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('--course', required=True)
ap.add_argument('--extract', required=True)
ap.add_argument('--writer', required=True)
ap.add_argument('--prefix', required=True)
ap.add_argument('--write', action='store_true')
a = ap.parse_args()

data = json.load(open(a.course, encoding='utf-8'))
course = data[0] if isinstance(data, list) else data
ext = json.load(open(a.extract, encoding='utf-8'))
writer = json.load(open(a.writer, encoding='utf-8'))
year = int(ext['year'])
outcomes = {o['code'] for o in course['outcomes']}
dps = {d['id']: d for t in course['topics'] for s in t['subTopics'] for d in s['dotPoints']}
problems, built = [], 0
US = re.compile(r'\b(analyz|color(?!ado)|organiz|behavior|center\b|centers\b|favor|summariz|recogniz|prioritiz|optimiz|'
                r'utiliz|realiz|minimiz|maximiz|labor\b|catalog\b|defense|license\b)', re.I)
PROPER = re.compile(r'\b(Australian Labor Party|Labor Party|Labor government|Labor|Strategic Defense Initiative|'
                    r'Department of Defense|Defense Department|World Health Organization|International Labour Organization|'
                    r'United Nations Educational, Scientific and Cultural Organization|Pearl Harbor|Center for [A-Z]\w+)\b')
# the canonical command terms (data/commandTerms.ts), read from the source so the two cannot drift
_terms = open(__file__.rsplit('/.claude/', 1)[0] + '/data/commandTerms.ts', encoding='utf-8').read()
VERBS = set(re.findall(r"\bterm:\s*'([A-Z ]+)'", _terms))


def slug(n):
    return re.sub(r'[^a-z0-9]+', '', n.lower().replace('(', '').replace(')', '')) or n


def ladder(criteria):
    rows = []
    for c in criteria:
        m = str(c['marks']).replace('–', '-').strip()
        unit = 'mark' if m == '1' else 'marks'
        text = re.sub(r'\s+', ' ', c['text']).strip().rstrip('.')
        text = re.sub(r'\s+;\s*', '; ', text)  # some extracts join bullets with ' ; '
        rows.append(f'{m} {unit}: {text}')
    return '\n'.join(rows)


def scenario(q):
    parts = []
    if q.get('stimulus', '').strip():
        parts.append(q['stimulus'].strip())
    if q.get('assessedOn'):
        parts.append('Your answer will be assessed on how well you:\n' + '\n'.join(f'• {b.strip()}' for b in q['assessedOn']))
    return '\n\n'.join(parts)


# drop questions this builder made before for this year, so a re-run replaces them
prefix_id = f'prompt-{a.prefix}-hsc-{year}-'
# only this builder's own ids: the slug never holds a hyphen, so an app-written question that apply_patch named after
# a past question on the same dot point ("prompt-bio-hsc-2022-28b-n1") is kept, not deleted with it
own = re.compile(re.escape(prefix_id) + r'[a-z0-9]+')
for d in dps.values():
    d['prompts'] = [p for p in d['prompts'] if not own.fullmatch(p['id'])]

for q in ext['questions']:
    num = q['number']
    # a two-paper course repeats numbers (Paper 1 Q1, Paper 2 Q1): such parts carry a "key" ("p1-1"), which names
    # the writer entry and the id; hscQuestionNumber stays the number as printed
    key = q.get('key') or num
    w = writer.get(key)
    if w is None:
        problems.append(f'{key}: no writer entry')
        continue
    if w.get('skip'):
        print(f'skip {num}: {w["skip"]}')
        continue
    dp = dps.get(w.get('dpId'))
    if dp is None:
        problems.append(f'{num}: unknown dot point {w.get("dpId")}')
        continue
    marks = int(q['marks'])
    samples = sorted(w.get('samples', []), key=lambda s: -s['mark'])
    if not samples or samples[0]['mark'] != marks:
        problems.append(f'{num}: no full-mark sample')
    if q.get('sampleAnswer', '').strip():
        top = samples[0] if samples else {}
        if top.get('answer', '').strip() != q['sampleAnswer'].strip():
            problems.append(f'{num}: NESA prints a sample answer; the full-mark sample must be it, verbatim')
        else:
            top['source'] = 'HSC_EXEMPLAR'
    for o in w.get('linkedOutcomes', []):
        if o not in outcomes:
            problems.append(f'{num}: outcome {o} not in course')
    if not w.get('linkedOutcomes'):
        problems.append(f'{num}: no linkedOutcomes')
    # the content checks apply_patch.mts makes of app-written questions, less the two that past questions are
    # exempt from (the stem uses NESA's wording, so it may not contain the verb; the guide is NESA's ladder)
    if w.get('verb') not in VERBS:
        problems.append(f'{num}: unknown verb {w.get("verb")}')
    for field, lo, hi in (('keywords', 4, 10), ('markerNotes', 2, 4), ('commonStudentErrors', 2, 4)):
        if not (lo <= len(w.get(field) or []) <= hi):
            problems.append(f'{num}: {field} needs {lo}-{hi}, has {len(w.get(field) or [])}')
    if len(samples) < (2 if marks <= 2 else 3):
        problems.append(f'{num}: {len(samples)} samples')
    if len({s['mark'] for s in samples}) != len(samples):
        problems.append(f'{num}: duplicate sample marks')
    for hi_s, lo_s in zip(samples, samples[1:]):
        if len(lo_s['answer'].split()) > len(hi_s['answer'].split()):
            problems.append(f'{num}: {lo_s["mark"]}-mark sample longer than the {hi_s["mark"]}-mark one')
    blob = json.dumps([w.get('markerNotes'), w.get('commonStudentErrors'), w.get('keywords'),
                       [[s['answer'], s.get('feedback', '')] for s in samples if s.get('source') != 'HSC_EXEMPLAR']])
    # proper nouns keep their own spelling (the Australian Labor Party, the Strategic Defense Initiative)
    blob = PROPER.sub('', blob)
    m = US.search(blob)
    if m:
        problems.append(f'{num}: US spelling "{m.group(0)}"')
    pid = prefix_id + slug(key)
    prompt = {
        'id': pid,
        'question': re.sub(r'[ \t]+', ' ', q['stem']).strip(),
        'totalMarks': marks,
        'verb': w['verb'],
        'linkedOutcomes': w['linkedOutcomes'],
        'markerNotes': w['markerNotes'],
        'commonStudentErrors': w['commonStudentErrors'],
        'keywords': w['keywords'],
        'markingCriteria': ladder(q['criteria']),
        'sampleAnswers': [
            {'id': f'sa-{a.prefix}-hsc-{year}-{slug(key)}-{i + 1}', 'source': s.get('source', 'AI'), 'mark': s['mark'],
             'answer': s['answer'].strip(), 'feedback': s.get('feedback', '').strip()}
            for i, s in enumerate(samples)
        ],
        'scenario': scenario(q),
        'isPastHSC': True,
        'hscYear': year,
        # parts set once per prescribed text are one question; the writer lists them ("1(a)–(n)")
        'hscQuestionNumber': w.get('numberLabel') or num,
        'hscSection': re.sub(r'\s+', ' ', w.get('sectionHeading') or q.get('sectionHeading')
                             or f'Section {q.get("section", "")}').strip(),
    }
    if q.get('prescribedText') and not w.get('numberLabel'):
        prompt['hscText'] = q['prescribedText'].strip()
    if not prompt['scenario']:
        del prompt['scenario']
    dp['prompts'].append(prompt)
    built += 1

ids = [p['id'] for d in dps.values() for p in d['prompts']]
dupes = sorted({i for i in ids if ids.count(i) > 1})
if dupes:
    problems.append(f'duplicate prompt ids: {dupes[:5]}')
print(f'{built} questions built from {len(ext["questions"])} parts; {len(ext.get("skipped", []))} skipped in extraction')
for p in problems:
    print('PROBLEM', p)
if problems:
    sys.exit(1)
if a.write:
    open(a.course, 'w', encoding='utf-8').write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print('written', a.course)
