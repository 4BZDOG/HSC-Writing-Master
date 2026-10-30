"""Check a course's past HSC questions against NESA's papers and marking guidelines.

    python3 .claude/skills/build-course-data/tools/check_past_questions.py <nesa_dir> <CourseFile>.json <subject-slug>

<nesa_dir> holds the year's PDFs as NESA names them (download them from the year's page on
nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/<subject>/<year>) and, beside each,
the `pdftotext -layout` .txt of the paper. <subject-slug> is the slug in those names:
"business-studies", "english-standard" (also matches "english-std"), "geography".

For every past question it reports:
- STEM: a sentence of the stem that is not word for word in the paper (expected only where a question
  was deliberately adapted, such as parts consolidated across prescribed texts);
- LADDER: a marking-guide row whose bullets differ from the row NESA prints, read from the criteria
  table cell by cell with pdfplumber, so a bullet that drifts into the next band is caught;
- NO-TABLE: no criteria table found for the question.

English papers share one criteria table per module, so a Module A or B question, or Paper 1
Section II, is matched to its module's 20-mark table. Exit code 1 when anything is reported.
"""
import glob, json, os, re, sys
import pdfplumber

QRE = re.compile(r'^Question\s+(\d+)\s*(\([a-z]\))?\s*(\([iv]+\))?', re.I)


def tables(path):
    """Every criteria table in a marking-guidelines PDF, as (question label, [(marks, [bullets])])."""
    out, cur = [], None
    for pg in pdfplumber.open(path).pages:
        heads = []
        for line in pg.extract_text_lines():
            m = QRE.match(line['text'].strip())
            if m:
                heads.append((line['top'], (m.group(1) + (m.group(2) or '') + (m.group(3) or '')).replace(' ', '')))
        events = [(y, 'h', lab) for y, lab in heads] + [(t.bbox[1], 't', t) for t in pg.find_tables()]
        for _, kind, obj in sorted(events, key=lambda e: e[0]):
            if kind == 'h':
                cur = obj
                continue
            rows = obj.extract()
            if not rows or not rows[0] or 'Criteria' not in (rows[0][0] or ''):
                continue
            body = []
            for r in rows[1:]:
                crit, mk = (r[0] or '').strip(), (r[-1] or '').strip()
                body.append((mk, [re.sub(r'\s+', ' ', b).strip() for b in crit.split('•') if b.strip()]))
            out.append((cur, body))
    return out


def norm(s):
    s = (s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
         .replace('–', '-').replace('—', '-').replace(' ', ' '))
    s = re.sub(r'[•●·◊|]', ' ', s)
    s = re.sub(r'\.{3,}', ' ', s)
    s = re.sub(r'(?<![\w$%.,])\d{1,2}\s*-\s*\d{1,2}(?![\w%.,])', ' ', s)
    s = re.sub(r'(?<![\w$%.,])\d{1,2}(?![\w%.,])', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return re.sub(r'(\w)- (\w)', r'\1-\2', s).strip().lower()


def words(s):
    return re.sub(r'[^a-z0-9]+', ' ', norm(s)).strip()


def rows_of(guide):
    out = []
    for line in guide.split('\n'):
        m = re.match(r'\s*(\d+(?:\s*[-–]\s*\d+)?)\s*marks?:\s*(.*)', line)
        if m:
            out.append((m.group(1).replace(' ', '').replace('–', '-'), [b.strip() for b in m.group(2).split('; ') if b.strip()]))
    return out


def files_for(nesa, slug, p):
    """(paper stem, guidelines pdf) for a question, by NESA's file naming."""
    year = p['hscYear']
    pats = [slug] + (['english-std'] if slug == 'english-standard' else [])
    cands = sorted({f for pat in pats for f in glob.glob(os.path.join(nesa, f'{year}-hsc-{pat}*.pdf'))})
    paper_no = None
    if (p.get('hscSection') or '').startswith('Paper'):
        paper_no = p['hscSection'][6]
    def is_paper(f, n):
        b = os.path.basename(f)
        return n is None or re.search(rf'(p|paper-|-){n}(\b|-|\.)', b.replace(f'{year}-hsc-', '')) is not None
    mg = [f for f in cands if f.endswith('-mg.pdf') and is_paper(f, paper_no)]
    paper = [f for f in cands if not f.endswith('-mg.pdf') and is_paper(f, paper_no)]
    if not mg or not paper:
        return None, None
    return paper[0][:-4], mg[0]


def main():
    nesa, course_file, slug = sys.argv[1:4]
    data = json.load(open(course_file))[0]
    past = [p for t in data['topics'] for s in t['subTopics'] for dp in s['dotPoints'] for p in dp['prompts'] if p.get('isPastHSC')]
    cache, problems = {}, []
    for p in sorted(past, key=lambda p: (p['hscYear'], p['id'])):
        q = p['hscQuestionNumber']
        paper, mg = files_for(nesa, slug, p)
        if not paper:
            problems.append((p['id'], q, 'NO-FILES', ''))
            continue
        text = norm(open(paper + '.txt').read())
        for sent in re.split(r'(?<=[.?!])\s+', p['question']):
            if len(sent) > 12 and norm(sent) not in text:
                problems.append((p['id'], q, 'STEM', sent[:120]))
                break
        if mg not in cache:
            cache[mg] = tables(mg)
        tabs = cache[mg]
        base = re.match(r'\d+', q).group(0)
        first = re.sub(r'(\d+)\(([a-z])\).*', r'\1(\2)', q.replace(' ', ''))
        hits = []
        for cand in (q.replace(' ', ''), first, base):
            hits = [b for lab, b in tabs if lab == cand]
            if hits:
                break
        sec = p.get('hscSection') or ''
        if slug.startswith('english') and ('Module A' in sec or 'Module B' in sec or sec.startswith('Paper 1')):
            twenty = [b for _, b in tabs if b and b[0][0].startswith('17')]
            hits = twenty[-1:] if sec.startswith('Paper 1') else twenty[:1] if 'Module A' in sec else twenty[1:2]
        if not hits:
            problems.append((p['id'], q, 'NO-TABLE', ''))
            continue
        mine, best = rows_of(p['markingCriteria']), None
        for h in hits:
            theirs = [(m.replace('–', '-'), b) for m, b in h]
            diffs = []
            if [m for m, _ in mine] != [m for m, _ in theirs]:
                diffs.append(f'marks {[m for m, _ in mine]} vs NESA {[m for m, _ in theirs]}')
            else:
                for (m, a), (_, b) in zip(mine, theirs):
                    A, B = [words(x) for x in a], [words(x) for x in b]
                    if A != B and ' '.join(A) != ' '.join(B):
                        ours = next((x for x in a if words(x) not in B), '')
                        nesa_b = next((x for x in b if words(x) not in A), '')
                        diffs.append(f'row {m}: ours {len(a)} bullets, NESA {len(b)}; ours={ours[:90]!r} NESA={nesa_b[:90]!r}')
            if best is None or len(diffs) < len(best):
                best = diffs
        problems += [(p['id'], q, 'LADDER', d) for d in best]
    for x in problems:
        print(' | '.join(x))
    print(f'{len(past)} past questions, {len(problems)} reported')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
