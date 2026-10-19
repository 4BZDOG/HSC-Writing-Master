/**
 * Reads a NESA syllabus page from the data the page itself carries.
 *
 * curriculum.nsw.edu.au is a Next.js site. Every focus-area page embeds the CMS
 * record it was rendered from in `<script id="__NEXT_DATA__">`, and that record
 * holds the outcome, dot-point and "including" wording exactly as NESA published
 * it. Reading it avoids the paraphrase an AI reader introduces, and avoids the
 * cost of asking one at all.
 *
 * This is a port of `.claude/skills/build-course-data/tools/fetch_nesa.py`, which
 * the shipped course data was built from. The two must stay in step: a dot point
 * that reads differently here is a dot point that will not match the course it is
 * meant to update. Where the Python does a piece of text handling, this does the
 * same thing in the same order, including the Unicode subscripts and the arrow
 * notation for reaction conditions.
 *
 * Pure and dependency-free, so it runs in the Vercel function and in Vitest alike.
 * Nothing here throws on an unexpected shape. The CMS model can drift, and a page
 * we cannot read must fall back to the generic text path rather than fail the call.
 */

export interface NesaStatement {
  code: string;
  text: string;
  including: string[];
}

export interface NesaPage {
  syllabus: string; // e.g. "Health and Movement Science 11–12 (2023)", or '' when absent
  year: 'year11' | 'year12' | null;
  title: string; // focus area title, or the option's title on an option page
  optionsList?: string; // title of the options list, on option pages only
  outcomes: { code: string; description: string }[];
  groups: { title: string; statements: NesaStatement[] }[];
  electives: { title: string; description: string }[];
  /**
   * The syllabus's other mainstream Year 11/12 focus areas. An option of an options
   * list carries the list's title in `optionsList`; its own title is '' when this page
   * does not name it (only an option page holds its fellow options' titles), and the
   * caller reads it from the option's own page.
   */
  siblings: { path: string; title: string; year: 'year11' | 'year12'; optionsList?: string }[];
}

type Year = 'year11' | 'year12';
type Obj = Record<string, unknown>;
/** Rich-text components of one page, keyed by codename. */
type Components = Map<string, Obj>;

const EMPTY_COMPONENTS: Components = new Map();

/**
 * Components can nest inside one another. This bound stops a record that refers to
 * itself from recursing without end; no real page comes near it.
 */
const MAX_COMPONENT_DEPTH = 8;

const DATA_SCRIPT = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/**
 * The stage-year codenames the CMS uses. A Map rather than an object, so that a
 * codename such as "constructor" cannot resolve to something inherited.
 */
const STAGE_YEARS = new Map<string, Year>([
  ['n11', 'year11'],
  ['n12', 'year12'],
]);

const SUB_FROM = '0123456789+-';
const SUB_TO = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₊', '₋'];
const SUP_TO = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁺', '⁻'];

/**
 * The named entities the CMS writes into its text. `&amp;` and `&nbsp;` are the
 * ones the saved pages actually use; the typographic ones cover the rest of what
 * a curriculum writer is likely to type.
 */
const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['hellip', '…'],
]);

// MathML scripts and fractions. Each argument is an <mrow> that holds no further
// <mrow>, so the innermost pair resolves first and the outer pass then sees plain text.
const MSUB =
  /<msub>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<\/msub>/g;
const MSUP =
  /<msup>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<\/msup>/g;
const MFRAC =
  /<mfrac>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<mrow>((?:(?!<mrow>)[\s\S])*?)<\/mrow>\s*<\/mfrac>/g;
// A reaction condition written over an arrow: "→" with "light / chlorophyll" above it.
const MOVER = /<mover[^>]*>\s*<mo>\s*→\s*<\/mo>([\s\S]*?)<\/mover>/g;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Walks a path of keys, returning undefined as soon as a step is not an object. */
const at = (o: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), o);

const typeOf = (item: unknown): string => {
  const t = at(item, 'system', 'type');
  return typeof t === 'string' ? t : '';
};

const codenameOf = (item: unknown): string => {
  const c = at(item, 'system', 'codename');
  return typeof c === 'string' ? c : '';
};

/** The `elements` of a CMS item, or nothing when the item has no readable elements. */
const elementsOf = (item: unknown): Obj =>
  isObj(item) && isObj(item.elements) ? item.elements : {};

/** A field's `value`, whatever its type. */
const valueOf = (el: Obj, field: string): unknown => {
  const f = el[field];
  return isObj(f) ? f.value : undefined;
};

/** The codenames held in a modular-content field. */
const codenamesOf = (el: Obj, field: string): string[] => {
  const v = valueOf(el, field);
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [];
};

/** The codenames of a taxonomy field, e.g. `stages__stage_years` gives ['n11']. */
const taxonomyCodesOf = (el: Obj, field: string): string[] => {
  const v = valueOf(el, field);
  return Array.isArray(v)
    ? v.flatMap((t) => (isObj(t) && typeof t.codename === 'string' ? [t.codename] : []))
    : [];
};

const yearsOf = (codes: string[]): Year[] => [
  ...new Set(codes.flatMap((c) => STAGE_YEARS.get(c) ?? [])),
];

/**
 * Decodes the entities in a piece of text, in one pass so that `&amp;lt;` becomes
 * `&lt;` and not `<`. A numeric reference outside the Unicode range, or a surrogate,
 * becomes U+FFFD, as Python's html.unescape does. Named entities need their semicolon,
 * which the CMS always writes.
 */
const decodeEntities = (s: string): string =>
  s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : '�';
    }
    return NAMED_ENTITIES.get(body) ?? whole;
  });

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, '');

const translate = (s: string, to: string[]): string =>
  s.replace(/[0-9+-]/g, (c) => to[SUB_FROM.indexOf(c)]);

/**
 * Flattens a MathML fragment to readable text. Subscripts and superscripts become
 * Unicode (C₆H₁₂O₆), a fraction becomes a / b, and a reaction condition over an arrow
 * becomes —(light, chlorophyll)→. The Biology summary equations are written this way,
 * and this is what keeps them intact instead of blank.
 */
const mathToText = (math: string): string => {
  let s = math;
  // Six passes resolve nested scripts and fractions from the inside out.
  for (let pass = 0; pass < 6; pass++) {
    s = s.replace(
      MSUB,
      (_m, base: string, sub: string) => stripTags(base) + translate(stripTags(sub), SUB_TO)
    );
    s = s.replace(
      MSUP,
      (_m, base: string, sup: string) => stripTags(base) + translate(stripTags(sup), SUP_TO)
    );
    s = s.replace(
      MFRAC,
      (_m, top: string, bottom: string) => `${stripTags(top).trim()} / ${stripTags(bottom).trim()}`
    );
  }
  s = s.replace(MOVER, (_m, body: string) => {
    const conditions = [...body.matchAll(/<mtd>([\s\S]*?)<\/mtd>/g)]
      .map((m) => stripTags(m[1]).trim())
      .filter(Boolean);
    return ` —(${conditions.join(', ')})→ `;
  });
  s = s.replace(/<mo>\s*([=+→×])\s*<\/mo>/g, ' $1 ');
  s = s.replace(/<\/?(mtr|mtd|mtable)[^>]*>/g, ' ');
  return stripTags(s);
};

const componentValue = (components: Components, codename: string): string => {
  const content = components.get(codename)?.content;
  const v = isObj(content) ? content.value : undefined;
  return typeof v === 'string' ? v : '';
};

/**
 * A rich-text value with its components expanded and its MathML flattened. A
 * component is the `<object data-codename="…">` placeholder the CMS uses to embed a
 * shared piece of rich text, usually an equation, inside a statement.
 */
const renderRich = (value: string, components: Components, depth = 0): string => {
  const expanded = value.replace(
    /<object[^>]*data-codename="([^"]+)"[^>]*>\s*<\/object>/g,
    (_m, codename: string) =>
      depth >= MAX_COMPONENT_DEPTH
        ? ''
        : renderRich(componentValue(components, codename), components, depth + 1)
  );
  return expanded.replace(/<math[^>]*>([\s\S]*?)<\/math>/g, (_m, math: string) => mathToText(math));
};

/**
 * A CMS text value as plain text: one line per paragraph or list item, tags removed,
 * entities decoded, and runs of spaces collapsed. This mirrors `txt()` in fetch_nesa.py.
 */
const plainText = (value: unknown, components: Components = EMPTY_COMPONENTS): string => {
  if (typeof value !== 'string') return '';
  let s = renderRich(value, components);
  s = s.replace(/<\/(li|p)>/g, '\n').replace(/<br\s*\/?>/g, '\n');
  s = decodeEntities(stripTags(s));
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};

const linesOf = (value: unknown, components: Components): string[] =>
  plainText(value, components).split('\n').filter(Boolean);

/** The codenamed items of one page, with anything that is not an object dropped. */
const linkedItemsOf = (focusArea: Obj): Map<string, Obj> => {
  const items = new Map<string, Obj>();
  if (isObj(focusArea.linkedItems)) {
    for (const [codename, item] of Object.entries(focusArea.linkedItems)) {
      if (isObj(item)) items.set(codename, item);
    }
  }
  return items;
};

/**
 * The components a statement may refer to: every linked item, plus any the CMS hangs
 * off a field instead of listing at the top level. This mirrors COMPONENTS in
 * fetch_nesa.py, where a statement with an equation would otherwise come out blank.
 */
const componentsOf = (items: Map<string, Obj>): Components => {
  const components: Components = new Map();
  for (const [codename, item] of items) components.set(codename, elementsOf(item));
  for (const item of items.values()) {
    for (const field of Object.values(elementsOf(item))) {
      const nested = isObj(field) ? field.linkedItems : undefined;
      if (!isObj(nested)) continue;
      for (const [codename, c] of Object.entries(nested)) {
        if (!components.has(codename) && isObj(c)) components.set(codename, elementsOf(c));
      }
    }
  }
  return components;
};

const syllabusNameOf = (headEl: Obj, data: unknown): string => {
  // The focus area's own syllabus is the authoritative one; the page-level record is a fallback.
  const own = valueOf(headEl, 'syllabus');
  const fromItem = Array.isArray(own) ? at(own[0], 'name') : undefined;
  const fromPage = at(data, 'syllabus', 'item', 'system', 'name');
  const name = typeof fromItem === 'string' ? fromItem : fromPage;
  return typeof name === 'string' ? name.trim() : '';
};

const yearFromUrl = (pathname: string): Year | null => {
  const m = /\/content\/year-(11|12)\//.exec(pathname);
  return m ? (m[1] === '11' ? 'year11' : 'year12') : null;
};

/**
 * The site root a sibling's absolute URL is built from: everything before `/content/`.
 * Returns null when the page URL is not an https page of this site, in which case no
 * sibling can be given a usable address.
 */
const siteBaseOf = (url: URL | null): string | null => {
  if (!url || url.protocol !== 'https:') return null;
  const i = url.pathname.indexOf('/content/');
  return i < 0 ? null : `${url.origin}${url.pathname.slice(0, i)}`;
};

/**
 * The mainstream Year 11 and 12 focus areas of the syllabus, from the page's own list
 * of every focus area and options list. Life Skills entries, and the "(aligned to …)"
 * variants, are other courses for the same outcomes and are left out.
 *
 * An options list names its options by codename only. Their titles are on the page
 * when the page is one of those options; otherwise an option is listed with an empty
 * title under its list's name, rather than under a made-up label.
 */
const siblingsOf = (
  stageItems: unknown,
  items: Map<string, Obj>,
  base: string | null,
  current: string
): NesaPage['siblings'] => {
  if (!base || !Array.isArray(stageItems)) return [];
  const siblings: NesaPage['siblings'] = [];
  const seen = new Set<string>();
  const add = (path: string, title: string, year: Year, optionsList?: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    siblings.push({ path, title, year, ...(optionsList !== undefined ? { optionsList } : {}) });
  };
  for (const entry of stageItems) {
    const kind = typeOf(entry);
    const code = codenameOf(entry);
    if (!code || (kind !== 'focusarea' && kind !== 'optionslist')) continue;
    const el = elementsOf(entry);
    const title = plainText(valueOf(el, 'title'));
    if (!taxonomyCodesOf(el, 'syllabus_type__items').includes('mainstream')) continue;
    if (title.includes('(aligned to')) continue;
    for (const year of yearsOf(taxonomyCodesOf(el, 'stages__stage_years'))) {
      const segment = year === 'year11' ? '/content/year-11' : '/content/year-12';
      if (kind === 'focusarea') {
        if (code !== current) add(`${base}${segment}/${code}`, title, year);
        continue;
      }
      for (const option of codenamesOf(el, 'focus_area_options')) {
        if (option === current) continue;
        const optionTitle = plainText(valueOf(elementsOf(items.get(option)), 'title'));
        add(`${base}${segment}/${code}/${option}`, optionTitle, year, title);
      }
    }
  }
  return siblings;
};

const parsePage = (html: string, url: string): NesaPage | null => {
  const match = DATA_SCRIPT.exec(html);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const data = at(parsed, 'props', 'pageProps', 'data');
  const focusArea = at(data, 'focusArea');
  const head = at(focusArea, 'item');
  if (!isObj(focusArea) || !isObj(head)) return null;

  const items = linkedItemsOf(focusArea);
  const components = componentsOf(items);
  const headEl = elementsOf(head);
  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  const pathname = parsedUrl ? parsedUrl.pathname : '';

  // An options-list page (…/olXXXX/faoXXXX) holds the list as its head, and the option
  // the URL names is what the page is about.
  let subject: unknown = head;
  let subjectCode = codenameOf(head);
  let optionsList: string | undefined;
  if (typeOf(head) === 'optionslist') {
    const option = /\/content\/year-1[12]\/ol[0-9a-z]+\/([0-9a-z]+)\/?$/.exec(pathname);
    if (!option) return null;
    subject = items.get(option[1]);
    if (!isObj(subject)) return null;
    subjectCode = option[1];
    optionsList = plainText(valueOf(headEl, 'title'), components);
  }

  const el = elementsOf(subject);

  const outcomes = codenamesOf(el, 'outcomes').flatMap((k) => {
    const o = elementsOf(items.get(k));
    const code = plainText(valueOf(o, 'code'), components);
    const description = plainText(valueOf(o, 'description'), components);
    return code || description ? [{ code, description }] : [];
  });

  const groups = codenamesOf(el, 'contentgroups').flatMap((gk) => {
    const ge = elementsOf(items.get(gk));
    const statements = codenamesOf(ge, 'content_items').flatMap((ck) => {
      const ce = elementsOf(items.get(ck));
      const text = plainText(valueOf(ce, 'title'), components);
      // A statement with no wording is an empty slot in the CMS, not a dot point.
      if (!text) return [];
      return [
        {
          code: plainText(valueOf(ce, 'code'), components),
          text,
          including: linesOf(valueOf(ce, 'including_statements'), components),
        },
      ];
    });
    // A group with no statements has nothing to show, so it is left out.
    return statements.length
      ? [{ title: plainText(valueOf(ge, 'title'), components), statements }]
      : [];
  });

  // The Extension "Elective N" list, though English Studies and EALD prescriptions use
  // the same field. An elective with no description is a heading only, so it is skipped.
  const electives = codenamesOf(el, 'prescriptions').flatMap((pk) => {
    const pe = elementsOf(items.get(pk));
    const description = plainText(valueOf(pe, 'content'), components);
    return description ? [{ title: plainText(valueOf(pe, 'title'), components), description }] : [];
  });

  const yearCodes = taxonomyCodesOf(el, 'stages__stage_years');
  const ownYears = yearsOf(yearCodes);
  const year = yearFromUrl(pathname) ?? (ownYears.length === 1 ? ownYears[0] : null);

  const page: NesaPage = {
    syllabus: syllabusNameOf(headEl, data),
    year,
    title: plainText(valueOf(el, 'title'), components),
    outcomes,
    groups,
    electives,
    siblings: siblingsOf(at(data, 'stageFocusAreas'), items, siteBaseOf(parsedUrl), subjectCode),
  };
  if (optionsList !== undefined) page.optionsList = optionsList;
  return page;
};

/**
 * Reads a NESA syllabus page from its embedded CMS data. Returns null when the HTML
 * carries no focus-area record (a page of another kind, or a deployment that has
 * changed shape), in which case the caller falls back to the generic text path.
 */
export function parseNesaPage(html: string, url: string): NesaPage | null {
  try {
    return parsePage(html, url);
  } catch {
    // Nothing above is expected to throw. This is the backstop for a shape nobody has
    // seen yet, so that one odd page cannot take down the whole reader.
    return null;
  }
}

/**
 * One statement as its dot point, with its sub-points in brackets. The rule matches
 * `desc_of()` in build_course.py, so the text compares equal to the course data.
 */
export function dotPointText(s: NesaStatement): string {
  let d = s.text.trim().replace(/\.+$/, '');
  if (s.including.length) {
    d += ' (' + s.including.map((x) => x.trim().replace(/[.;]+$/, '')).join('; ') + ')';
  }
  return d;
}

/**
 * The page as clean plain text, for the AI fallback paths: the syllabus and page
 * headings, the outcomes, each group with its statements and sub-points, then the
 * electives. The output keeps NESA's wording and carries the codes, so that a
 * consumer can match a dot point to its statement.
 */
export function nesaPageToText(p: NesaPage): string {
  const out: string[] = [];
  if (p.syllabus) out.push(p.syllabus);
  if (p.optionsList) out.push(p.optionsList);
  if (p.title) out.push(p.title);
  if (p.year) out.push(p.year === 'year11' ? 'Year 11' : 'Year 12');
  if (p.outcomes.length) {
    out.push('', 'Outcomes');
    for (const o of p.outcomes) out.push([o.code, o.description].filter(Boolean).join(' '));
  }
  for (const g of p.groups) {
    out.push('');
    if (g.title) out.push(g.title);
    for (const s of g.statements) out.push([s.code, dotPointText(s)].filter(Boolean).join(' '));
  }
  if (p.electives.length) {
    out.push('', 'Electives');
    for (const e of p.electives) out.push([e.title, e.description].filter(Boolean).join('\n'));
  }
  return out.join('\n');
}

/**
 * Where a syllabus landing page (the course overview, or its "Content" page) starts:
 * the first focus area the site itself would open, Year 11 before Year 12. A teacher
 * is far more likely to paste the syllabus's address than one focus area's, and that
 * page carries no syllabus content of its own. Returns null for any other page.
 */
export function nesaStartPage(html: string, url: string): string | null {
  try {
    const match = DATA_SCRIPT.exec(html);
    if (!match) return null;
    const data = at(JSON.parse(match[1]), 'props', 'pageProps', 'data');
    if (isObj(at(data, 'focusArea', 'item'))) return null;
    const defaults = at(data, 'defaultFocusAreaUrls');
    const origin = new URL(url).origin;
    for (const key of ['n11', 'n12']) {
      const path = at(defaults, key);
      if (
        typeof path === 'string' &&
        /^\/learning-areas\/[^?#]+\/content\/year-1[12]\//.test(path)
      ) {
        return `${origin}${path}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}
