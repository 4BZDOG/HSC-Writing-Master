#!/usr/bin/env python3
"""Build a structure-only course file (topics, sub-topics, dot points and outcomes; no questions) from nesa.json.

usage: build_structure.py --nesa <nesa.json> --config <config.json> --out <course.json>

config.json = {"id", "name", "prefix", "outcomePattern", "topics": [...]}. topics is the explicit, ordered list of
what goes in the course. Each entry is one of:
  {"title", "year", "name"?, "electives"?}              the nesa.json focus area with that exact title and year
                                                          (error if none or more than one); name defaults to the title
  {"optionsList", "year", "nameFormat"?, "electives"?}  every nesa.json entry with that optionsList and year, ordered by
                                                          optionIndex if present, else file order; name is nameFormat
                                                          with {title} replaced (default "{title}")
"year" is "year11" or "year12". Year 11 topics get "year": "year11"; Year 12 topics carry no year key.

* Each content group with items becomes a sub-topic; a group with no items is skipped and reported.
* A content group with no title is named after its focus area (NESA's title, never an invented one).
* An item with a blank title is skipped and reported (its NESA text is missing, so it cannot be a dot point).
* Each item becomes a dot point: NESA's statement plus its 'including' sub-points, built by desc_of exactly as in
  build_course.py. Text is kept verbatim.
* "electives": true adds one sub-topic per nesa.json elective with a non-empty description: name = elective title,
  one dot point = the description with newlines collapsed to single spaces. Empty electives are skipped and reported.
* Outcomes ("allOutcomes": true widens this to every focus area in the file): the union of the selected focus areas' outcomes whose code matches outcomePattern (re.match), deduped by
  code (error if one code has two descriptions), sorted by code. Year 11 codes (-11[A-Z]*-NN) get "year": "year11".
* Focus areas that are not selected are printed under "excluded:".
* Ids: topic-<prefix>-<11|12>-<slug>, subtopic-<prefix>-<11|12>-<topic slug>-<g>, dp-<prefix>-<11|12>-<topic slug>-<g>-<k>,
  where g is the 1-based index of the group (or elective) in the nesa.json focus area and k the 1-based item index.
Writes [{"id", "name", "outcomes", "topics"}] (one course) and prints a summary.
"""
import argparse, json, re


def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def topic_slug(name):
    s = slug(name)
    if len(s) > 60:  # truncate at a hyphen boundary, never mid-word
        cut = s.rfind('-', 0, 61)
        s = s[:cut] if cut > 0 else s[:60]
    return s.rstrip('-')


def desc_of(it):
    d = it['title'].strip().rstrip('.')
    if it['including']:
        d += ' (' + '; '.join(x.strip().rstrip('.;') for x in it['including']) + ')'
    return d


def die(msg): raise SystemExit('error: ' + msg)


def dupes(xs):
    seen, out = set(), set()
    for x in xs:
        if x in seen: out.add(x)
        seen.add(x)
    return sorted(out)


ap = argparse.ArgumentParser()
ap.add_argument('--nesa', required=True); ap.add_argument('--config', required=True); ap.add_argument('--out', required=True)
a = ap.parse_args()
nesa = json.load(open(a.nesa, encoding='utf-8'))
cfg = json.load(open(a.config, encoding='utf-8'))
for k in ('id', 'name', 'prefix', 'outcomePattern', 'topics'):
    if k not in cfg: die(f'config has no "{k}"')
prefix = cfg['prefix']

# 1. Select focus areas in config order: (nesa index, config entry, display name).
picks = []
for n, t in enumerate(cfg['topics'], 1):
    if t.get('year') not in ('year11', 'year12'): die(f'topics[{n}]: "year" must be year11 or year12')
    if 'optionsList' in t:
        hits = [(i, fa) for i, fa in enumerate(nesa) if fa.get('optionsList') == t['optionsList'] and fa['year'] == t['year']]
        if not hits: die(f'topics[{n}]: no nesa.json entry in options list {t["optionsList"]!r} for {t["year"]}')
        hits.sort(key=lambda h: (h[1].get('optionIndex', float('inf')), h[0]))
        fmt = t.get('nameFormat', '{title}')
        picks += [(i, t, fmt.replace('{title}', fa['title'])) for i, fa in hits]
    else:
        hits = [(i, fa) for i, fa in enumerate(nesa) if fa['title'] == t.get('title') and fa['year'] == t['year']]
        if len(hits) != 1: die(f'topics[{n}]: {len(hits)} nesa.json entries titled {t.get("title")!r} for {t["year"]}, need exactly 1')
        i, fa = hits[0]
        picks.append((i, t, t.get('name', fa['title'])))
dup = dupes([i for i, _, _ in picks])
if dup: die('focus area selected twice: ' + ', '.join(nesa[i]['title'] for i in dup))
picked = {i for i, _, _ in picks}
excluded = [(i, fa) for i, fa in enumerate(nesa) if i not in picked]
if excluded:
    print('excluded:')
    for i, fa in excluded:
        print(f"  {fa['year']}  {fa['title']!r}  ({sum(len(g['items']) for g in fa['groups'])} statements)")

# 2. Build topics, sub-topics, dot points and the outcome map.
topics, outcomes, skipped, skipped_el, blank = [], {}, [], [], []
for i, t, name in picks:
    fa = nesa[i]
    yy = fa['year'][-2:]
    ts = topic_slug(name)
    if not ts: die(f'topic name {name!r} has no letters or digits')
    subs = []
    for g, grp in enumerate(fa['groups'], 1):
        items = []
        for k, it in enumerate(grp['items'], 1):
            if it['title'].strip(): items.append((k, it))
            else: blank.append(f"{name} / {grp['title']!r} item {k} (code {it.get('code')!r}, {len(it.get('including') or [])} sub-points)")
        if not items:
            skipped.append(f"{name} / {grp['title']!r}")
            continue
        # An untitled group (History Extension case studies have one) takes the focus area's NESA title.
        sub = {'id': f'subtopic-{prefix}-{yy}-{ts}-{g}', 'name': grp['title'] or fa['title'], 'dotPoints': []}
        for k, it in items:
            sub['dotPoints'].append({'id': f'dp-{prefix}-{yy}-{ts}-{g}-{k}', 'description': desc_of(it), 'prompts': []})
        subs.append(sub)
    if t.get('electives'):
        for e_idx, el in enumerate(fa.get('electives') or [], 1):
            d = re.sub(r'\s*\n\s*', ' ', el.get('description') or '').strip()
            if not d:
                skipped_el.append(f"{name} / {el.get('title')!r}")
                continue
            g = len(fa['groups']) + e_idx
            subs.append({'id': f'subtopic-{prefix}-{yy}-{ts}-{g}', 'name': el.get('title', ''),
                         'dotPoints': [{'id': f'dp-{prefix}-{yy}-{ts}-{g}-1', 'description': d, 'prompts': []}]})
    if not subs: die(f'topic {name!r} ends up with no sub-topics')
    topic = {'id': f'topic-{prefix}-{yy}-{ts}', 'name': name}
    if fa['year'] == 'year11': topic['year'] = 'year11'
    topic['subTopics'] = subs
    topics.append(topic)
    for o in fa['outcomes']:
        if not re.match(cfg['outcomePattern'], o['code']): continue
        if o['code'] in outcomes and outcomes[o['code']] != o['description']:
            die(f"outcome {o['code']} has two different descriptions:\n  {outcomes[o['code']]!r}\n  {o['description']!r}")
        outcomes[o['code']] = o['description']

# "allOutcomes": true takes outcomes from every focus area in nesa.json, selected or not: a course outcome
# assessed only in a part left out here (History Extension's project, HX-12-03) is still one of the course's.
if cfg.get('allOutcomes'):
    for fa in nesa:
        for o in fa['outcomes']:
            if re.match(cfg['outcomePattern'], o['code']): outcomes.setdefault(o['code'], o['description'])
oc = []
for code in sorted(outcomes):
    o = {'code': code, 'description': outcomes[code]}
    if re.search(r'-11[A-Z]*-\d\d$', code): o['year'] = 'year11'
    oc.append(o)

# 3. Validate.
dd = dupes([t['name'] for t in topics])
if dd: die(f'duplicate topic names: {dd}')
ids = []
for t in topics:
    if not t['name'].strip(): die('blank topic name')
    dd = dupes([s['name'] for s in t['subTopics']])
    if dd: die(f"{t['name']!r}: duplicate sub-topic names {dd}")
    ids.append(t['id'])
    for s in t['subTopics']:
        if not s['name'].strip(): die(f"{t['name']!r}: blank sub-topic name")
        ids.append(s['id'])
        for dp in s['dotPoints']:
            if not dp['description'].strip(): die(f"{s['id']}: blank dot point")
            ids.append(dp['id'])
dd = dupes(ids)
if dd: die(f'duplicate ids: {dd}')
for d in dupes([dp['description'] for t in topics for s in t['subTopics'] for dp in s['dotPoints']]):
    print('warn: same dot point text appears more than once:', d[:100])

# 4. Output.
course = {'id': cfg['id'], 'name': cfg['name'], 'outcomes': oc, 'topics': topics}
open(a.out, 'w').write(json.dumps([course], indent=2, ensure_ascii=False) + '\n')

if blank:
    print('skipped statements with a blank title (NESA text missing, check the source):')
    for s in blank: print('  ' + s)
if skipped:
    print('skipped groups with no statements:')
    for s in skipped: print('  ' + s)
if skipped_el:
    print('skipped electives with empty description:')
    for s in skipped_el: print('  ' + s)
print('summary:')
n_sub = n_dp = 0
for t in topics:
    nd = sum(len(s['dotPoints']) for s in t['subTopics'])
    n_sub += len(t['subTopics']); n_dp += nd
    yl = 'Year 11' if t.get('year') == 'year11' else 'Year 12'
    print(f"  {yl}  {t['name']}: {len(t['subTopics'])} sub-topics, {nd} dot points")
print(f'total: {len(topics)} topics, {n_sub} sub-topics, {n_dp} dot points')
print(f"outcomes: {len(oc)} ({', '.join(o['code'] for o in oc)})")
print('written', a.out)
