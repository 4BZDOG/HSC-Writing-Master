#!/usr/bin/env python3
"""Fetch every Year 11 / Year 12 focus-area page of a NESA syllabus and write nesa.json.

usage: fetch_nesa.py <out_dir> <syllabus_base_url> <start_focus_area_path> [<start_focus_area_path> ...]

  fetch_nesa.py nz https://curriculum.nsw.edu.au/learning-areas/tas/enterprise-computing-11-12-2022 \
      content/year-11/fa90aca463 content/year-12/fae7598c1b

Each page embeds its CMS data in <script id="__NEXT_DATA__">; that JSON holds the exact statement text,
"including" sub-points, outcomes and content-group titles, with none of the "Loading" gaps or paraphrasing
that WebFetch produces. Sibling focus areas are found by crawling the /content/year-NN/faXXXXXXXX links on
each page. Needs the agent proxy CA: curl --cacert /root/.ccr/ca-bundle.crt (retries on resets).
Output: <out_dir>/nesa.json = [{year, title, intro, outcomes:[{code,description}],
  groups:[{title, intro, items:[{code,title,including[],examples[]}]}]}]
"""
import html, json, os, re, subprocess, sys, time

CA = '/root/.ccr/ca-bundle.crt'


def txt(v):
    if v is None:
        return ''
    s = str(v)
    s = re.sub(r'</(li|p)>', '\n', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return '\n'.join(re.sub(r'[ \t ]+', ' ', l).strip() for l in s.split('\n') if l.strip())


def lines(v):
    return [l for l in txt(v).split('\n') if l]


def fetch(url, dest):
    for _ in range(5):
        r = subprocess.run(['curl', '-sS', '--cacert', CA, '-L', '--max-time', '90', '-o', dest, url])
        if r.returncode == 0 and os.path.getsize(dest) > 100000:
            return
        time.sleep(3)
    raise SystemExit(f'could not fetch {url}')


def parse(path, year):
    s = open(path, encoding='utf-8').read()
    d = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', s, re.S).group(1))
    fa = d['props']['pageProps']['data']['focusArea']
    li, el = fa['linkedItems'], fa['item']['elements']
    outcomes = []
    for k in el['outcomes']['value']:
        o = li.get(k)
        if o:
            outcomes.append({'code': txt(o['elements']['code']['value']), 'description': txt(o['elements']['description']['value'])})
    groups = []
    for gk in el['contentgroups']['value']:
        g = li[gk]['elements']
        items = []
        for ck in g['content_items']['value']:
            c = li.get(ck)
            if not c:
                print('MISSING linked item', ck, file=sys.stderr)
                continue
            ce = c['elements']
            items.append({
                'code': txt(ce['code']['value']),
                'title': txt(ce['title']['value']),
                'including': lines(ce['including_statements']['value']),
                'examples': lines(ce['examples']['value']) if ce.get('examples') else [],
            })
        groups.append({'title': txt(g['title']['value']), 'intro': txt(g['content']['value']), 'items': items})
    return {'year': year, 'title': txt(el['title']['value']), 'intro': txt(el['content']['value']), 'outcomes': outcomes, 'groups': groups}


def main():
    out, base, *starts = sys.argv[1:]
    os.makedirs(out, exist_ok=True)
    todo, seen, result = list(starts), set(), []
    while todo:
        p = todo.pop()
        m = re.match(r'content/(year-1[12])/(fa[0-9a-z]+)$', p)
        if not m or p in seen:
            continue
        seen.add(p)
        dest = os.path.join(out, f'{m.group(1)}_{m.group(2)}.html')
        fetch(f'{base}/{p}', dest)
        result.append(parse(dest, 'year11' if m.group(1) == 'year-11' else 'year12'))
        for link in set(re.findall(r'/content/(year-1[12]/fa[0-9a-z]+)', open(dest, encoding='utf-8').read())):
            todo.append('content/' + link)
    json.dump(result, open(os.path.join(out, 'nesa.json'), 'w'), indent=1, ensure_ascii=False)
    for fa in result:
        print(fa['year'], fa['title'], '| groups', len(fa['groups']), '| statements', sum(len(g['items']) for g in fa['groups']))


main()
