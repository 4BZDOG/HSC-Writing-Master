import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dotPointText,
  nesaPageToText,
  nesaStartPage,
  parseNesaPage,
} from '../../api/_lib/nesaCurriculum';

/**
 * The NESA reader is a port of the offline tool the shipped course data was built
 * from, so these expectations are the wording that tool produces. The fixtures are
 * real NESA pages cut down to the records the parser reads (tests/fixtures/nesa).
 */

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../fixtures/nesa', name), 'utf8');

const HMS_URL =
  'https://curriculum.nsw.edu.au/learning-areas/pdhpe/health-and-movement-science-11-12-2023/content/year-12/fa544450d1';
const BIO_URL =
  'https://curriculum.nsw.edu.au/learning-areas/science/biology-11-12-2025/content/year-11/fa0edb304c';
const EEXT_URL =
  'https://curriculum.nsw.edu.au/learning-areas/english/english-extension-11-12-2024/content/year-12/faa5982718';
const EST_OPTION_URL =
  'https://curriculum.nsw.edu.au/learning-areas/english/english-studies-11-12-2024/content/year-11/ol90838007/fao73c6369a';

describe('Health and Movement Science focus area', () => {
  const page = parseNesaPage(fixture('hms-year-12.html'), HMS_URL);

  it('reads the focus area, its year and its syllabus', () => {
    expect(page).not.toBeNull();
    expect(page!.year).toBe('year12');
    expect(page!.title).toBe('Health in an Australian and global context');
    expect(page!.syllabus).toBe('Health and Movement Science 11–12 (2023)');
    expect(page!.optionsList).toBeUndefined();
  });

  it('keeps the outcome codes and wording', () => {
    expect(page!.outcomes.map((o) => o.code)).toEqual([
      'HM-12-01',
      'HM-12-02',
      'HM-12-03',
      'HM-12-06',
      'HM-12-07',
      'HM-12-08',
      'HM-12-09',
      'HM-12-10',
    ]);
    expect(page!.outcomes[0].description).toBe(
      'analyses the health status of Australians at a national and international level'
    );
  });

  it('renders a statement with its including sub-points as one dot point', () => {
    const statement = page!.groups
      .flatMap((g) => g.statements)
      .find((s) => s.code === 'HMS_11_12_CP_GLO_HEA_STG12_01')!;
    expect(statement.including).toHaveLength(4);
    expect(dotPointText(statement)).toBe(
      'Analyse the current health status of Australians from Australia’s Health and other health reports, tables and graphs (what does the data tell us?; what are the major causes of morbidity and mortality, and the life expectancy for males, females and the general population?; what are the sociological causes of risky health behaviours?; where do inequities exist and what can we do about them?)'
    );
  });

  it('lists the other mainstream focus areas and leaves out Life Skills and the current page', () => {
    const paths = page!.siblings.map((s) => s.path);
    expect(page!.siblings).toContainEqual({
      path: 'https://curriculum.nsw.edu.au/learning-areas/pdhpe/health-and-movement-science-11-12-2023/content/year-12/fa11e33fdf',
      title: 'Training for improved performance',
      year: 'year12',
    });
    expect(paths.some((p) => p.endsWith('/fa544450d1'))).toBe(false);
    expect(paths.some((p) => p.endsWith('/fab2c7c925'))).toBe(false);
  });
});

describe('Biology statements built from MathML components', () => {
  const page = parseNesaPage(fixture('bio-year-11.html'), BIO_URL);
  const texts = page!.groups.flatMap((g) => g.statements).map((s) => s.text);

  it('flattens the summary equation to Unicode subscripts and arrows, not blank', () => {
    expect(texts).toContain(
      'Use the summary equation C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy to describe the process of cellular respiration'
    );
  });

  it('shows a reaction condition written over the arrow', () => {
    expect(texts).toContain(
      'Use the summary equation 6CO₂ + 6H₂O —(light, chlorophyll)→ C₆H₁₂O₆ + 6O₂ to describe the process of photosynthesis'
    );
  });

  it('reads the year and syllabus of a Year 11 page', () => {
    expect(page!.year).toBe('year11');
    expect(page!.syllabus).toBe('Biology 11–12 (2025)');
  });
});

describe('English Extension prescriptions', () => {
  it('reads the five electives with their titles', () => {
    const page = parseNesaPage(fixture('eext-year-12.html'), EEXT_URL);
    expect(page!.title).toBe('Literary worlds');
    expect(page!.electives.map((e) => e.title)).toEqual([
      'Elective 1: Confessional worlds',
      'Elective 2: Historical worlds',
      'Elective 3: Hybrid worlds',
      'Elective 4: Natural worlds',
      'Elective 5: Shakespearean worlds',
    ]);
    expect(page!.electives.every((e) => e.description.length > 0)).toBe(true);
  });
});

describe('English Studies option page', () => {
  const page = parseNesaPage(fixture('est-option-year-11.html'), EST_OPTION_URL);

  it('names the option, its options list and its outcomes', () => {
    expect(page!.title).toBe('Elective A: Voices of Australia');
    expect(page!.optionsList).toBe('Elective focus areas');
    expect(page!.year).toBe('year11');
    expect(page!.outcomes.map((o) => o.code)).toEqual([
      'ESD-11-01',
      'ESD-11-02',
      'ESD-11-03',
      'ESD-11-04',
      'ESD-11-05',
    ]);
  });

  it('skips the "(aligned to …)" Life Skills variants', () => {
    expect(page!.siblings.some((s) => s.title.includes('(aligned to'))).toBe(false);
  });

  it('lists the other options by their own titles, not the current one', () => {
    expect(page!.siblings).toContainEqual({
      path: 'https://curriculum.nsw.edu.au/learning-areas/english/english-studies-11-12-2024/content/year-11/ol90838007/faoc27e14c3',
      title: 'Elective B: Media and influence',
      year: 'year11',
      optionsList: 'Elective focus areas',
    });
    expect(page!.siblings.some((s) => s.path.endsWith('/fao73c6369a'))).toBe(false);
  });
});

describe('a syllabus landing page', () => {
  const landing = (defaults: Record<string, string>, focusArea?: unknown) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { data: { defaultFocusAreaUrls: defaults, focusArea } } },
    })}</script>`;
  const base =
    'https://curriculum.nsw.edu.au/learning-areas/pdhpe/health-and-movement-science-11-12-2023';

  it('starts at the Year 11 focus area the site would open', () => {
    expect(
      nesaStartPage(
        landing({
          n11: '/learning-areas/pdhpe/health-and-movement-science-11-12-2023/content/year-11/fa345f6f19',
          n12: '/learning-areas/pdhpe/health-and-movement-science-11-12-2023/content/year-12/fa544450d1',
        }),
        base
      )
    ).toBe(`${base}/content/year-11/fa345f6f19`);
  });

  it('is not a landing page when it has a focus area of its own, or no usable start', () => {
    expect(
      nesaStartPage(landing({ n11: '/x/content/year-11/fa1' }, { item: {} }), base)
    ).toBeNull();
    expect(
      nesaStartPage(landing({ n11: 'https://elsewhere.example/content/year-11/fa1' }), base)
    ).toBeNull();
    expect(nesaStartPage('<html></html>', base)).toBeNull();
  });
});

describe('decoding the CMS text', () => {
  // A minimal record with one group and one statement, written with the entities and
  // the sub-point list the CMS uses. It checks the text rules without the bulk of a page.
  const record = {
    props: {
      pageProps: {
        data: {
          focusArea: {
            item: {
              system: { codename: 'fa1', type: 'focusarea' },
              elements: {
                title: { value: 'Test focus area' },
                outcomes: { value: [] },
                contentgroups: { value: ['g1'] },
              },
            },
            linkedItems: {
              g1: {
                system: { codename: 'g1', type: 'contentgroup' },
                elements: {
                  title: { value: 'Group &amp; one' },
                  content_items: { value: ['c1'] },
                },
              },
              c1: {
                system: { codename: 'c1', type: 'contentitem' },
                elements: {
                  code: { value: 'A1' },
                  title: { value: 'Explain &amp; compare &#8211; &lt;x&gt;.' },
                  including_statements: { value: '<ul><li>one.</li><li>two;</li></ul>' },
                },
              },
            },
          },
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(record)}</script>`;
  const url = 'https://curriculum.nsw.edu.au/learning-areas/x/y/content/year-11/fa1';

  it('decodes named and numeric entities, and reads sub-points one per line', () => {
    const page = parseNesaPage(html, url);
    expect(page!.groups[0].title).toBe('Group & one');
    expect(page!.groups[0].statements[0]).toEqual({
      code: 'A1',
      text: 'Explain & compare – <x>.',
      including: ['one.', 'two;'],
    });
    expect(dotPointText(page!.groups[0].statements[0])).toBe('Explain & compare – <x> (one; two)');
  });

  it('renders the page as plain text that keeps each statement code', () => {
    const text = nesaPageToText(parseNesaPage(html, url)!);
    expect(text).toContain('A1 Explain & compare – <x> (one; two)');
    expect(text).toContain('Year 11');
  });
});

describe('when the input is not a readable NESA page', () => {
  it('returns null for a page with no embedded record', () => {
    expect(parseNesaPage('<html></html>', HMS_URL)).toBeNull();
  });

  it('returns null, without throwing, for malformed JSON', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props": </script>';
    expect(() => parseNesaPage(html, HMS_URL)).not.toThrow();
    expect(parseNesaPage(html, HMS_URL)).toBeNull();
  });

  it('returns null when the record holds no focus area', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"data":{}}}}</script>';
    expect(parseNesaPage(html, HMS_URL)).toBeNull();
  });

  it('reads an unexpected shape as empty rather than throwing', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      '{"props":{"pageProps":{"data":{"focusArea":{"item":{"system":{"type":"focusarea"},' +
      '"elements":{"outcomes":"nope","contentgroups":{"value":5}}}},"linkedItems":null}}}}' +
      '</script>';
    const page = parseNesaPage(html, HMS_URL);
    expect(page).not.toBeNull();
    expect(page!.outcomes).toEqual([]);
    expect(page!.groups).toEqual([]);
    expect(page!.siblings).toEqual([]);
  });
});
