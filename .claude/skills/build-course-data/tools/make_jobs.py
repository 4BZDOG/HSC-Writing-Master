#!/usr/bin/env python3
"""Split the dot points that still have no questions into job files for authoring agents.

usage: make_jobs.py <course.json file name> <nesa.json> <out_dir> [--per-job 9]

Writes <out_dir>/<prefix>-NN.json = {courseFile, items:[{dpId, year, course, topic, subTopic, description,
focusAreaOutcomes}]}. Jobs never straddle a topic unless the leftovers are tiny (<4), which are merged forward.
"""
import json, os, re, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
course_file, nesa_path, out = sys.argv[1:4]
per = int(sys.argv[sys.argv.index('--per-job') + 1]) if '--per-job' in sys.argv else 9
c = json.load(open(os.path.join(REPO, 'public/courseData', course_file)))
c = c[0] if isinstance(c, list) else c
outs = {fa['title']: fa['outcomes'] for fa in json.load(open(nesa_path))}
os.makedirs(out, exist_ok=True)
jobs, carry = [], []
for t in c['topics']:
    year = 'Year 11' if t.get('year') == 'year11' else 'Year 12 (HSC)'
    todo = carry
    carry = []
    for st in t['subTopics']:
        for dp in st['dotPoints']:
            if not dp['prompts']:
                todo.append({'dpId': dp['id'], 'year': year, 'course': c['name'], 'topic': t['name'], 'subTopic': st['name'],
                             'description': dp['description'], 'focusAreaOutcomes': outs.get(t['name'], [])})
    while todo:
        take = min(per, len(todo))
        if len(todo) - take < 4: take = len(todo)
        if take < 4 and t is not c['topics'][-1]:
            carry = todo; break
        jobs.append(todo[:take]); todo = todo[take:]
prefix = re.sub(r'[^a-z]', '', course_file.lower())[3:7]
for i, items in enumerate(jobs, 1):
    open(os.path.join(out, f'{prefix}-{i:02d}.json'), 'w').write(json.dumps({'courseFile': course_file, 'items': items}, indent=1, ensure_ascii=False))
    print(f'{prefix}-{i:02d}', len(items), 'dot points')
