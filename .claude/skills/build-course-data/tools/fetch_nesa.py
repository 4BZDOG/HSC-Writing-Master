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

Needs the agent proxy CA: curl --cacert /root/.ccr/ca-bundle.crt (retries on resets). Set NESA_REUSE=1 to
re-parse the pages already saved in <out_dir> rather than download them again.
Statements holding an equation are rich-text components with MathML; each equation is flattened to one line of
plain text (C₆H₁₂O₆, 10⁻¹⁵, n = m / MM, f (vwave + vobserver) / (vwave − vsource), —(light, chlorophyll)→).
The rendering rules are in the mathml() docstring. Outside MathML, <sup>/<sub> text becomes Unicode script
characters when every character has one (10<sup>-15</sup> -> 10⁻¹⁵, mol<sup>-1</sup> -> mol⁻¹).
Output: <out_dir>/nesa.json = [{year, codename, title, intro, outcomes:[{code,description}],
  groups:[{title, intro, items:[{code,title,including[],examples[]}]}],
  electives?:[{title, description}],
  optionsList?, optionsListIntro?}]
  year is 'year11' or 'year12'. codename is the CMS codename (faXXXX, or faoXXXX for an option), unique per entry.
  electives is present only when the page has prescriptions (linked items: title + content); it is the
  Extension 'Elective N' list, but English Studies / EALD prescription groups also appear here.
  optionsList, optionsListIntro and optionIndex are present only on entries that came from an options list;
  optionIndex is the option's 0-based position in that list's focus_area_options.
Prints one summary line per entry, then one line per options list with fetched/expected counts.
"""
import html, html.entities, json, os, re, subprocess, sys, time
import xml.etree.ElementTree as ET

CA = '/root/.ccr/ca-bundle.crt'
STAGE_YEARS = {'n11': 'year-11', 'n12': 'year-12'}


# Rich-text components of the page being parsed (codename -> elements). A statement whose text holds an
# equation is stored as an <object data-codename=...> placeholder pointing at one of these; without
# resolving it the statement comes out blank (Biology "Use the summary equation ...").
COMPONENTS = {}
SUB = str.maketrans('0123456789+-−=()', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎')
SUP = str.maketrans("0123456789+-−=()'", '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾′')
SUB_CHARS = set('0123456789+-−=()')
SUP_CHARS = set("0123456789+-−=()'")
MO_TEXT = {'-': '−', '−': '−', '∆': 'Δ', '⁠': '', ' ': ' '}  # U+2206 (increment) is Greek Delta
FUNCTION_NAMES = {'sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'csc', 'ln', 'log', 'exp', 'max', 'min', 'lim', 'det'}
SPACED_OPS = {'=', '×', '→', '⇌', '⇒', '⇔', '≈', '≠', '≥', '≤', '<', '>', '∝', '/'}
ADD_OPS = {'+', '−', '±'}  # spaced after an operand; otherwise unary and glued to the term that follows
SEQ_TAGS = {'math', 'mrow', 'mstyle', 'mtd', 'mtr', 'mpadded', 'semantics'}
OPERANDS = ('term', 'func', 'frac')
UNKNOWN_TAGS = set()


def mathml(m):
    """Flatten one <math> element to a single line of plain text (HTML-escaped; txt() unescapes it later).

    Rendering rules:
      - sub/superscripts: digits and signs become Unicode script characters (C₆H₁₂O₆, 10⁻¹⁵, H₃O⁺); letters
        stay plain as NESA wrote them (v_esc -> vesc); T_(1/2) -> T½; msubsup is base, subscript, superscript.
      - fraction: "a / b"; a side with a top-level + − or = is bracketed; a fraction followed by a factor is
        bracketed, (1 / 2)mv²; a fraction after a factor gets a space: f (vwave + vobserver) / (vwave − vsource).
      - square root: √x or √(...), no extra brackets when the radicand is already one bracketed group.
      - mfenced keeps its brackets (R(1 / nf² − 1 / ni²)); a function name (sin, cos, ln) is followed by a
        space, except before brackets (ln(2)).
      - '-' is the Unicode minus; U+2061 is a space; &nbsp;, U+2008 and line breaks are ordinary spaces.
      - reaction conditions above an arrow: " —(light, chlorophyll)→ ".
    """
    m = m.strip()
    if not m.startswith('<math'):
        m = '<math>' + m + '</math>'
    try:
        root = ET.fromstring(re.sub(r'&[A-Za-z][A-Za-z0-9]*;', _xml_entity, m))
    except ET.ParseError as e:
        print('MathML not parsed (%s): %s' % (e, re.sub(r'\s+', ' ', m)[:160]), file=sys.stderr)
        return html.escape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m)).strip(), quote=False)
    s = re.sub(r'\s+', ' ', _join(_items(root))).strip()
    s = re.sub(r'([(\[]) ', r'\1', s)
    s = re.sub(r' ([)\]])', r'\1', s)
    s = re.sub(r' ,', ',', s)
    return html.escape(s, quote=False)


def _xml_entity(m):
    """Named HTML entities (&nbsp; ...) -> numeric references, so the MathML parses as XML."""
    name = m.group(0)[1:]
    if name in ('amp;', 'lt;', 'gt;', 'quot;', 'apos;') or name not in html.entities.html5:
        return m.group(0)
    return ''.join('&#%d;' % ord(c) for c in html.entities.html5[name])


def _local(tag):
    return tag.rsplit('}', 1)[-1]


def _text(el):
    return re.sub(r'\s+', ' ', el.text or '')  # &nbsp;, U+2008 and newlines all become plain spaces


def _raw(el):
    """Unformatted text of a subtree, used inside sub/superscripts and accents."""
    if len(el):
        return ''.join(_raw(c) for c in el).strip()
    t = _text(el).strip()
    return MO_TEXT.get(t, t).replace('⁡', '') if _local(el.tag) == 'mo' else t


def _items(el):
    """Layout items of one element as (kind, text); kinds: term, func, frac, bin, addop, raw, fa, sp."""
    tag = _local(el.tag)
    if tag in SEQ_TAGS:
        return _seq(el)
    if tag == 'mo':
        t = (el.text or '').strip()
        if t == '⁡':
            return [('fa', '')]
        t = MO_TEXT.get(t, t)
        if t == "'":
            t = '′'
        if not t:
            return []
        if t == '⋯':  # "V₁ + V₂ + ⋯ + Vₙ": the + after the ellipsis is binary, so the ellipsis is not an operator
            return [('raw', ' ⋯ ')]
        if t in SPACED_OPS:
            return [('bin', t)]
        if t in ADD_OPS:
            return [('addop', t)]
        return [('raw', t)]
    if tag in ('mi', 'mn', 'mtext'):
        t = _text(el)
        core = t.strip()
        if not core:  # a spacer token such as <mi>&nbsp;</mi> between operands: "v = f λ" is written "v = fλ"
            return []
        out = [('sp', '')] if t[:1] == ' ' else []
        if core:
            out.append(('func' if tag == 'mi' and core in FUNCTION_NAMES else 'term', core))
        if len(t) > 1 and t[-1:] == ' ':
            out.append(('sp', ''))
        return out
    if tag == 'mspace':
        return [('sp', '')]
    if tag in ('maligngroup', 'malignmark'):
        return []
    if tag == 'mfrac':
        return [('frac', _frac(el))]
    if tag in ('msub', 'msup', 'msubsup'):
        return [_script(el, tag)]
    if tag == 'msqrt':
        body = _join(_seq(el))
        return [('term', '√' + (body if _wrapped(body) or len(body) == 1 else '(' + body + ')'))]
    if tag == 'mfenced':
        sep = el.get('separators', ',').strip()
        joiner = ', ' if sep == ',' else (' %s ' % sep if sep else '')
        return [('term', el.get('open', '(') + joiner.join(_join(_items(k)) for k in el) + el.get('close', ')'))]
    if tag == 'mover' and len(el) >= 2:
        base, over = list(el)[:2]
        if _local(base.tag) == 'mo' and _raw(base) in ('→', '⇌'):  # arrow with its conditions above it
            cells = [c for c in over.iter() if _local(c.tag) == 'mtd']
            conds = [c for c in (_join(_items(x)).strip() for x in (cells or [over])) if c]
            if conds:
                return [('raw', ' —(' + ', '.join(conds) + ')' + _raw(base) + ' ')]
            return [('bin', _raw(base))]
        return [('term', _join(_items(base)) + _raw(over))]  # accent, e.g. v with the combining arrow
    if tag == 'mtable':
        rows = [', '.join(_join(_items(c)).strip() for c in r if _local(c.tag) == 'mtd') for r in el]
        return [('term', ', '.join(x for x in rows if x))]
    if len(el) == 0:
        t = _text(el).strip()
        return [('term', t)] if t else []
    if tag not in UNKNOWN_TAGS:
        UNKNOWN_TAGS.add(tag)
        print('MathML: <%s> rendered as its children' % tag, file=sys.stderr)
    return _seq(el)


def _seq(el):
    return [it for c in el for it in _items(c)]


def _script(el, tag):
    kids = list(el)
    base_items = _items(kids[0])
    base = _join(base_items)
    is_func = any(k == 'func' for k, _ in base_items) and all(k in ('func', 'sp') for k, _ in base_items)
    if tag == 'msub':
        text = base + _sub(_raw(kids[1]))
    elif tag == 'msup':
        text = base + _sup(_raw(kids[1]))
    else:
        text = base + _sub(_raw(kids[1])) + _sup(_raw(kids[2]))
    return ('func' if is_func else 'term', text)


def _sub(raw):
    if raw in ('1/2', '1 / 2'):
        return '½'  # T_(1/2), the half-life
    if raw and set(raw) <= SUB_CHARS:
        return raw.translate(SUB)
    return raw  # letters stay on the line: v_esc -> vesc


def _sup(raw):
    if not raw:
        return ''
    if set(raw) <= SUP_CHARS:
        return raw.translate(SUP)
    return '^' + raw if len(raw) == 1 else '^(' + raw + ')'


def _frac(el):
    kids = list(el)
    num, den = _join(_items(kids[0])).strip(), _join(_items(kids[1])).strip()
    if _multi(num):
        num = '(' + num + ')'
    if _multi(den):
        den = '(' + den + ')'
    return num + ' / ' + den


def _multi(s):
    """True when s has a + − or = outside any brackets, i.e. it is more than one term."""
    depth = 0
    for i, ch in enumerate(s):
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        elif depth == 0 and ch in '+−=' and s[max(i - 1, 0):i] == ' ' and s[i + 1:i + 2] == ' ':
            return True
    return False


def _wrapped(s):
    """True when s is one bracketed group, (...), with the first '(' closed by the last ')'."""
    if not (s.startswith('(') and s.endswith(')')):
        return False
    depth = 0
    for i, ch in enumerate(s):
        depth += (ch == '(') - (ch == ')')
        if depth == 0 and i < len(s) - 1:
            return False
    return True


def _join(items):
    """Join layout items: operators spaced, implicit products glued, brackets where a fraction needs them."""
    res, last = [], None
    for kind, text in items:
        if kind == 'addop':
            unary = last is None or last[0] in ('bin', 'un') or (last[0] == 'raw' and last[1] in ('(', '[', '{', ',', '∑'))
            kind = 'un' if unary else 'bin'
        res.append((kind, text))
        if kind not in ('sp', 'fa'):
            last = (kind, text)
    out = []
    for pos, (kind, text) in enumerate(res):
        prev = res[pos - 1] if pos else None
        nxt = res[pos + 1] if pos + 1 < len(res) else None
        if kind == 'sp':
            out.append(' ')
        elif kind == 'fa':
            if not (nxt and nxt[0] == 'term' and nxt[1].startswith('(')):
                out.append(' ')
        elif kind == 'bin':
            out.append(' ' + text + ' ')
        elif kind in ('un', 'raw'):
            out.append(text)
        else:
            if kind == 'frac' and nxt and nxt[0] in OPERANDS:
                text = '(' + text + ')'
            if prev and prev[0] in OPERANDS and (kind != 'term' or prev[0] == 'func') \
                    and not (prev[0] == 'func' and kind == 'term' and text.startswith('(')):
                out.append(' ')
            out.append(text)
    return ''.join(out)


def components(s):
    def sub(m):
        el = COMPONENTS.get(m.group(1)) or {}
        return components(str((el.get('content') or {}).get('value') or ''))
    s = re.sub(r'<object[^>]*data-codename="([^"]+)"[^>]*>\s*</object>', sub, s)
    return re.sub(r'<math[^>]*>.*?</math>', lambda m: mathml(m.group(0)), s, flags=re.S)


def _html_script(m):
    """HTML <sup>/<sub> in statement text (outside MathML): Unicode script characters when every character has one
    (10<sup>-15</sup> -> 10⁻¹⁵, mol<sup>-1</sup> -> mol⁻¹); otherwise the text is kept without the tags."""
    tag, inner = m.group(1), m.group(2)
    if tag == 'sup' and inner and set(inner) <= SUP_CHARS:
        return inner.translate(SUP)
    if tag == 'sub' and inner and set(inner) <= SUB_CHARS:
        return inner.translate(SUB)
    return inner


def txt(v):
    if v is None:
        return ''
    s = components(str(v))
    s = re.sub(r'</(li|p)>', '\n', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<(sup|sub)(?:\s[^>]*)?>(.*?)</\1>', _html_script, s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace(' ', ' ')  # NBSP before or after an equation is an ordinary space
    return '\n'.join(re.sub(r'[ \t ]+', ' ', l).strip() for l in s.split('\n') if l.strip())


def lines(v):
    return [l for l in txt(v).split('\n') if l]


def tax_codes(el, key):
    """Codenames of a taxonomy field, e.g. stages__stage_years -> ['n11']."""
    return [v.get('codename') for v in (el.get(key) or {}).get('value') or []]


def fetch(url, dest):
    # NESA_REUSE=1 re-parses pages already in <out_dir> instead of downloading them again (2-3MB each).
    if os.environ.get('NESA_REUSE') and os.path.exists(dest) and os.path.getsize(dest) > 100000:
        return
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
                olists.setdefault(code, {'title': title, 'year': yr, 'expected': len(opts), 'fetched': 0, 'index': {}})
                olists[code]['index'].update({o: i for i, o in enumerate(opts)})
                todo.extend(f'content/{yr}/{code}/{o}' for o in opts)


def parse(data, year, code=None):
    """Parse a focus-area page (code=None) or one option of an options-list page (code=option codename)."""
    fa = data['focusArea']
    li = fa['linkedItems']
    COMPONENTS.clear()
    for k, v in li.items():
        COMPONENTS[k] = v.get('elements', {})
    for v in li.values():  # components may also hang off the fields that use them
        for f in v.get('elements', {}).values():
            for k, c in (f.get('linkedItems') or {}).items() if isinstance(f.get('linkedItems'), dict) else []:
                COMPONENTS.setdefault(k, c.get('elements', {}))
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
            idx = olists.get(ol, {}).get('index', {}).get(code)
            if idx is not None:
                fa['optionIndex'] = idx
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
