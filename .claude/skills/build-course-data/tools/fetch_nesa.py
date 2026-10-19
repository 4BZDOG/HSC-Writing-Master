#!/usr/bin/env python3
"""Fetch every Year 11 / Year 12 focus-area page of a NESA syllabus and write nesa.json.

usage: fetch_nesa.py <out_dir> <syllabus_base_url> <start_focus_area_path> [<start_focus_area_path> ...]

  fetch_nesa.py nz https://curriculum.nsw.edu.au/learning-areas/tas/enterprise-computing-11-12-2022 \
      content/year-11/fa90aca463 content/year-12/fae7598c1b

Each page embeds its CMS data in <script id="__NEXT_DATA__">; that JSON holds the exact statement text,
"including" sub-points, outcomes and content-group titles, with none of the "Loading" gaps or paraphrasing
that WebFetch produces.

Siblings are found two ways: the /content/year-NN/faXXXXXXXX links on each page, and
props.pageProps.data.stageFocusAreas, which lists every focus area and options list of the syllabus.
Mainstream Year 11/12 focus areas are fetched; "(aligned to ...)" Life Skills items are skipped.

An options list (type optionslist, e.g. "Elective focus areas") is not emitted itself. Each option in its
focus_area_options is fetched at content/year-NN/<optionslist>/<option> and emitted as a focus area.

Needs the agent proxy CA: curl --cacert /root/.ccr/ca-bundle.crt (retries on resets).
Output: <out_dir>/nesa.json = [{year, codename, title, intro, outcomes:[{code,description}],
  groups:[{title, intro, items:[{code,title,including[],examples[]}]}],
  electives?:[{title, description}],
  optionsList?, optionsListIntro?}]
  year is 'year11' or 'year12'. codename is the CMS codename (faXXXX, or faoXXXX for an option), unique per entry.
  electives is present only when the page has prescriptions (linked items: title + content); it is the
  Extension 'Elective N' list, but English Studies / EALD prescription groups also appear here.
  optionsList and optionsListIntro are present only on entries that came from an options list.
Prints one summary line per entry, then one line per options list with fetched/expected counts.
"""
import html, json, os, re, subprocess, sys, time

CA = '/root/.ccr/ca-bundle.crt'
STAGE_YEARS = {'n11': 'year-11', 'n12': 'year-12'}


def txt(v):
    if v is None:
        return ''
    s = str(v)
    s = re.sub(r'</(li|p)>', '\n', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return '\n'.join(re.sub(r'[ \t ]+', ' ', l).strip() for l in s.split('\n') if l.strip())


def lines(v):
    return [l for l in txt(v).split('\n') if l]


def tax_codes(el, key):
    """Codenames of a taxonomy field, e.g. stages__stage_years -> ['n11']."""
    return [v.get('codename') for v in (el.get(key) or {}).get('value') or []]


def fetch(url, dest):
    for _ in range(5):
        r = subprocess.run(['curl', '-sS', '--cacert', CA, '-L', '--max-time', '90', '-o', dest, url])
        if r.returncode == 0 and os.path.getsize(dest) > 100000:
            return
        time.sleep(3)
    raise SystemExit(f'could not fetch {url}')


def page_data(raw):
    return json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw, re.S).group(1))['props']['pageProps']['data']


def discover(data, todo, olists):
    """Queue the mainstream Year 11/12 focus areas and options of the page's stageFocusAreas list."""
    for it in data.get('stageFocusAreas') or []:
        s, el = it.get('system', {}), it.get('elements', {})
        code, kind = s.get('codename'), s.get('type')
        title = txt((el.get('title') or {}).get('value'))
        if kind not in ('focusarea', 'optionslist'):
            continue
        if 'mainstream' not in tax_codes(el, 'syllabus_type__items') or '(aligned to' in title:
            continue
        for yr in [STAGE_YEARS[c] for c in tax_codes(el, 'stages__stage_years') if c in STAGE_YEARS]:
            if kind == 'focusarea':
                todo.append(f'content/{yr}/{code}')
            else:
                opts = (el.get('focus_area_options') or {}).get('value') or []
                olists.setdefault(code, {'title': title, 'year': yr, 'expected': len(opts), 'fetched': 0})
                todo.extend(f'content/{yr}/{code}/{o}' for o in opts)


def parse(data, year, code=None):
    """Parse a focus-area page (code=None) or one option of an options-list page (code=option codename)."""
    fa = data['focusArea']
    li = fa['linkedItems']
    item = fa['item'] if code is None else li[code]
    el = item['elements']
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
    entry = {'year': year, 'codename': item['system']['codename'], 'title': txt(el['title']['value']),
             'intro': txt(el['content']['value']), 'outcomes': outcomes, 'groups': groups}
    electives = []
    for k in (el.get('prescriptions') or {}).get('value') or []:
        p = li.get(k)
        if p:
            pe = p['elements']
            electives.append({'title': txt((pe.get('title') or {}).get('value')),
                              'description': txt((pe.get('content') or {}).get('value'))})
    if electives:
        entry['electives'] = electives
    return entry


def main():
    out, base, *starts = sys.argv[1:]
    os.makedirs(out, exist_ok=True)
    todo, seen, done, result, olists = list(starts), set(), set(), [], {}
    while todo:
        p = todo.pop()
        m = re.match(r'content/(year-1[12])/(fa[0-9a-z]+)$', p)
        o = re.match(r'content/(year-1[12])/(ol[0-9a-z]+)/([0-9a-z]+)$', p)
        if not (m or o) or p in seen:
            continue
        seen.add(p)
        if m:
            yr, code, ol = m.group(1), m.group(2), None
        else:
            yr, ol, code = o.group(1), o.group(2), o.group(3)
        if code in done:
            continue
        dest = os.path.join(out, f'{yr}_{code}.html')
        fetch(f'{base}/{p}', dest)
        raw = open(dest, encoding='utf-8').read()
        data = page_data(raw)
        discover(data, todo, olists)
        done.add(code)
        year = 'year11' if yr == 'year-11' else 'year12'
        if ol is None:
            result.append(parse(data, year))
            for link in set(re.findall(r'/content/(year-1[12]/fa[0-9a-z]+)', raw)):
                todo.append('content/' + link)
        else:
            head = data['focusArea']['item']
            if head['system']['codename'] != ol:
                raise SystemExit(f'{p}: page options list is {head["system"]["codename"]}, expected {ol}')
            fa = parse(data, year, code)
            fa['optionsList'] = txt(head['elements']['title']['value'])
            fa['optionsListIntro'] = txt(head['elements']['content']['value'])
            if ol in olists:
                olists[ol]['fetched'] += 1
            result.append(fa)
    json.dump(result, open(os.path.join(out, 'nesa.json'), 'w'), indent=1, ensure_ascii=False)
    for fa in result:
        extra = ''
        if fa.get('optionsList'):
            extra += f" | options list '{fa['optionsList']}'"
        if fa.get('electives'):
            extra += f" | electives {len(fa['electives'])}"
        if not fa['groups']:
            extra += ' | WARN no groups'
        print(fa['year'], fa['title'], fa['codename'], '| groups', len(fa['groups']),
              '| statements', sum(len(g['items']) for g in fa['groups']), extra)
    for ol, o in olists.items():
        print(f"options list '{o['title']}' ({ol}, {o['year']}): {o['fetched']} of {o['expected']} options fetched")


main()
