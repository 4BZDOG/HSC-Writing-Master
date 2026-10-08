#!/usr/bin/env python3
"""Rebuild a shipped course's topics from nesa.json, keeping existing questions where they match.

usage: build_course.py --nesa nz/nesa.json --course HSCSoftwareEngineering09122025.json --prefix se
                       [--overrides overrides.json] [--outcome-pattern '(SE)-1[12]-\\d\\d$'] [--write]

* Every NESA statement becomes a dot point: "<title> (<sub-point>; <sub-point>)".
* Each existing dot point is matched to its closest NESA statement (similarity >= 0.62, or an explicit
  override {"<existingDotPointId>": "<suffix of NESA code>" | null}). The best match keeps its id and
  prompts; other matches are merged in (prompts appended, so no question is lost).
* Unmatched NESA statements get an empty dot point `dp-<nesa code slug>` for the authoring step.
* Year 11 focus areas become topics with "year": "year11" (Year 12 topics carry no year: absent = Year 12).
  Year 11 outcomes get "year": "year11".
* Prints the existing dot points it could not place; resolve with overrides, never silently drop.
Without --write (or --out) it only reports. Re-running on an already rebuilt course is safe: dot points
whose id is `dp-<nesa code slug>` keep their prompts.
"""
import argparse, difflib, json, os, re, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))


def norm(s): return re.sub(r'[^a-z0-9 ]', '', s.lower())
def base(d): return re.split(r'\s*,?\s*including\b', d)[0]
def sim(a, b): return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def desc_of(it):
    d = it['title'].strip().rstrip('.')
    if it['including']:
        d += ' (' + '; '.join(x.strip().rstrip('.;') for x in it['including']) + ')'
    return d


ap = argparse.ArgumentParser()
ap.add_argument('--nesa', required=True); ap.add_argument('--course', required=True)
ap.add_argument('--prefix', required=True); ap.add_argument('--overrides'); ap.add_argument('--out', help='write here instead of over the course file')
ap.add_argument('--outcome-pattern', default=r'[A-Z]+-1[12]-\d\d$'); ap.add_argument('--write', action='store_true')
a = ap.parse_args()
path = os.path.join(REPO, 'public/courseData', a.course)
raw = json.load(open(path)); c = raw[0] if isinstance(raw, list) else raw
nesa = json.load(open(a.nesa)); ov = json.load(open(a.overrides)) if a.overrides else {}

exdp = {dp['id']: dp for t in c['topics'] for st in t['subTopics'] for dp in st['dotPoints']}
y12 = [fa for fa in nesa if fa['year'] == 'year12']; y11 = [fa for fa in nesa if fa['year'] == 'year11']
items = {it['code']: it for fa in y12 for g in fa['groups'] for it in g['items']}
all_codes = {'dp-' + slug(it['code']) for fa in nesa for g in fa['groups'] for it in g['items']}
suffix = lambda s: next(k for k in items if k.endswith(s))

assign = {}
for did, dp in exdp.items():
    if did in all_codes: continue  # already built from NESA by an earlier run: keep as is
    exact = [k for k, it in items.items() if desc_of(it) == dp['description']]
    if exact:  # kept id from an earlier run (description is the NESA build)
        assign[did] = exact[0]
        continue
    if did in ov:
        assign[did] = suffix(ov[did]) if ov[did] else None
        continue
    best = max((max(sim(base(dp['description']), base(it['title'])), sim(dp['description'], it['title'])), k) for k, it in items.items())
    assign[did] = best[1] if best[0] >= 0.62 else None
prim = {}
for did, k in assign.items():
    if k is None: continue
    sc = max(sim(base(exdp[did]['description']), base(items[k]['title'])), sim(exdp[did]['description'], items[k]['title'])) + (0.5 if did in ov else 0)
    if k not in prim or sc > prim[k][0]: prim[k] = (sc, did)
print('UNPLACED existing dot points (add overrides):', [d for d, k in assign.items() if k is None])

oldtop = {t['name']: t for t in c['topics']}
oldst = {(t['name'], st['name']): st for t in c['topics'] for st in t['subTopics']}


def mk_topic(fa, year):
    ot = oldtop.get(fa['title'])
    t = {'id': ot['id'] if ot else f"topic-{a.prefix}-{year[-2:]}-{slug(fa['title'])}", 'name': fa['title']}
    if year == 'year11': t['year'] = 'year11'
    subs = []
    for g in fa['groups']:
        ost = oldst.get((fa['title'], g['title']))
        dps = []
        for it in g['items']:
            k = it['code']
            if year == 'year12' and k in prim:
                pd = prim[k][1]
                dp = {'id': pd, 'description': desc_of(it), 'prompts': list(exdp[pd]['prompts'])}
                for d2, k2 in assign.items():
                    if k2 == k and d2 != pd: dp['prompts'] += exdp[d2]['prompts']
            else:
                did = 'dp-' + slug(k)
                dp = {'id': did, 'description': desc_of(it), 'prompts': list(exdp[did]['prompts']) if did in exdp else []}
            dps.append(dp)
        subs.append({'id': ost['id'] if ost else f"subTopic-{a.prefix}-{year[-2:]}-{slug(g['title'])}", 'name': g['title'], 'dotPoints': dps})
    t['subTopics'] = subs
    return t


new12 = [mk_topic(fa, 'year12') for fa in y12]
order = [t['name'] for t in c['topics']]
new12.sort(key=lambda t: order.index(t['name']) if t['name'] in order else 99)
c['topics'] = [mk_topic(fa, 'year11') for fa in y11] + new12

oc = {}
for fa in nesa:
    for o in fa['outcomes']:
        if re.match(a.outcome_pattern, o['code']): oc[o['code']] = o['description']
c['outcomes'] = [({'code': k, 'description': oc[k], 'year': 'year11'} if re.match(r'.+-11-\d\d$', k) else {'code': k, 'description': oc[k]}) for k in sorted(oc)]

dps = [dp for t in c['topics'] for st in t['subTopics'] for dp in st['dotPoints']]
print(f"{len(dps)} dot points, {sum(1 for d in dps if not d['prompts'])} need questions; topics:", [(t['name'], t.get('year', 'year12')) for t in c['topics']])
if a.write or a.out:
    path = a.out or path
    open(path, 'w').write(json.dumps(raw if isinstance(raw, list) else c, indent=2, ensure_ascii=False) + '\n')
    print('written', path, '- now run: npm run content:canonicalise')
