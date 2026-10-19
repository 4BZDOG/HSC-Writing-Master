import { describe, it, expect } from 'vitest';
import type { NesaPage } from '../../services/geminiService';
import {
  comparablePath,
  courseNameFromSyllabus,
  groupSiblings,
  hasNesaStatements,
  mergeOutcomesByCode,
  nesaDotPoint,
  nesaOutcomes,
  nesaPageToPreviewNode,
  outcomesWithoutRemoved,
  pendingSiblings,
} from '../../utils/nesaSyllabus';

/**
 * The pure half of reading a NESA page: the dot-point rule, the preview shape,
 * the outcomes and their years, the course name, and the picker's grouping.
 */

const page = (overrides: Partial<NesaPage> = {}): NesaPage => ({
  syllabus: 'Health and Movement Science 11–12 (2023)',
  year: 'year11',
  title: 'Health Issues',
  outcomes: [],
  groups: [],
  electives: [],
  siblings: [],
  ...overrides,
});

const sibling = (
  name: string,
  year: 'year11' | 'year12',
  optionsList?: string
): NesaPage['siblings'][number] => ({
  path: `https://curriculum.nsw.edu.au/learning-areas/pdhpe/${name.toLowerCase().replace(/\s+/g, '-')}`,
  title: name,
  year,
  ...(optionsList ? { optionsList } : {}),
});

describe('nesaDotPoint', () => {
  it('returns the statement alone when it has no sub-points', () => {
    expect(nesaDotPoint({ text: 'Describe the body systems.', including: [] })).toBe(
      'Describe the body systems'
    );
  });

  it('puts the sub-points in brackets, separated by semicolons', () => {
    expect(
      nesaDotPoint({
        text: 'Explain the factors affecting health.',
        including: ['nutrition', 'physical activity'],
      })
    ).toBe('Explain the factors affecting health (nutrition; physical activity)');
  });

  it('removes trailing full stops and semicolons from each sub-point', () => {
    expect(
      nesaDotPoint({
        text: 'Analyse risk',
        including: ['stress.', 'sleep;', 'diet..'],
      })
    ).toBe('Analyse risk (stress; sleep; diet)');
  });

  it('trims the statement and each sub-point', () => {
    expect(
      nesaDotPoint({ text: '  Identify the causes.  ', including: [' fatigue ', 'stress. '] })
    ).toBe('Identify the causes (fatigue; stress)');
  });

  it('keeps a full stop that is inside the text, and only trims the end', () => {
    expect(nesaDotPoint({ text: 'Compare e.g. two systems.', including: [] })).toBe(
      'Compare e.g. two systems'
    );
  });
});

describe('nesaPageToPreviewNode', () => {
  it('names the topic after the page title and gives each group a sub-topic', () => {
    const node = nesaPageToPreviewNode(
      page({
        groups: [
          {
            title: 'Key concepts',
            statements: [
              { code: 'HM11.1', text: 'Explain health.', including: ['nutrition'] },
              { code: 'HM11.2', text: 'Describe fitness.', including: [] },
            ],
          },
          {
            title: 'Skills',
            statements: [{ code: 'HM11.3', text: 'Plan a session.', including: [] }],
          },
        ],
      })
    );
    expect(node).toEqual({
      name: 'Health Issues',
      year: 'year11',
      subTopics: [
        {
          name: 'Key concepts',
          dotPoints: ['Explain health (nutrition)', 'Describe fitness'],
        },
        { name: 'Skills', dotPoints: ['Plan a session'] },
      ],
    });
  });

  it('uses the page title as the sub-topic name for a group with no title', () => {
    const node = nesaPageToPreviewNode(
      page({
        groups: [{ title: '  ', statements: [{ code: 'X', text: 'A point', including: [] }] }],
      })
    );
    expect(node.subTopics).toEqual([{ name: 'Health Issues', dotPoints: ['A point'] }]);
  });

  it('adds each elective as a sub-topic whose description is one dot point', () => {
    const node = nesaPageToPreviewNode(
      page({
        electives: [
          {
            title: 'Elective: Sport',
            description: 'Students study how\nsport is\n   organised.',
          },
        ],
      })
    );
    expect(node.subTopics).toEqual([
      { name: 'Elective: Sport', dotPoints: ['Students study how sport is organised.'] },
    ]);
  });

  it('falls back to the page title for an elective with no title', () => {
    const node = nesaPageToPreviewNode(
      page({ electives: [{ title: '', description: 'Something to study.' }] })
    );
    expect(node.subTopics[0].name).toBe('Health Issues');
  });

  it('carries no year when the page names none', () => {
    const node = nesaPageToPreviewNode(page({ year: null }));
    expect('year' in node).toBe(false);
  });

  it('carries the year the page names', () => {
    expect(nesaPageToPreviewNode(page({ year: 'year12' })).year).toBe('year12');
  });
});

describe('nesaOutcomes', () => {
  it('reads each outcome year from its code', () => {
    const outcomes = nesaOutcomes(
      page({
        year: null,
        outcomes: [
          { code: 'HM-11-01', description: 'analyses the impact of health' },
          { code: 'HM-12-02', description: 'evaluates the impact of health' },
        ],
      })
    );
    expect(outcomes).toEqual([
      { code: 'HM-11-01', description: 'analyses the impact of health', year: 'year11' },
      { code: 'HM-12-02', description: 'evaluates the impact of health', year: 'year12' },
    ]);
  });

  it('uses the page year when the code names none', () => {
    const outcomes = nesaOutcomes(
      page({ year: 'year11', outcomes: [{ code: 'PDH-OUT', description: 'describes' }] })
    );
    expect(outcomes).toEqual([{ code: 'PDH-OUT', description: 'describes', year: 'year11' }]);
  });

  it('leaves the year off when neither the code nor the page gives one', () => {
    const [outcome] = nesaOutcomes(
      page({ year: null, outcomes: [{ code: 'WHATEVER', description: 'describes' }] })
    );
    expect('year' in outcome).toBe(false);
  });

  it('prefers the year in the code over the page year', () => {
    const [outcome] = nesaOutcomes(
      page({ year: 'year11', outcomes: [{ code: 'HM-12-01', description: 'analyses' }] })
    );
    expect(outcome.year).toBe('year12');
  });
});

describe('hasNesaStatements', () => {
  it('is true only when some group has a statement', () => {
    expect(hasNesaStatements(page({ groups: [] }))).toBe(false);
    expect(hasNesaStatements(page({ groups: [{ title: 'Empty', statements: [] }] }))).toBe(false);
    expect(
      hasNesaStatements(
        page({
          groups: [
            { title: 'Empty', statements: [] },
            { title: 'Full', statements: [{ code: 'A', text: 'x', including: [] }] },
          ],
        })
      )
    ).toBe(true);
  });
});

describe('courseNameFromSyllabus', () => {
  it('turns a NESA syllabus name into an HSC course name', () => {
    expect(courseNameFromSyllabus('Health and Movement Science 11–12 (2023)')).toBe(
      'HSC Health and Movement Science'
    );
  });

  it('strips a Stage 6 suffix', () => {
    expect(courseNameFromSyllabus('Biology Stage 6 (2017)')).toBe('HSC Biology');
  });

  it('strips a bare year of issue', () => {
    expect(courseNameFromSyllabus('English Advanced (2024)')).toBe('HSC English Advanced');
  });

  it('accepts a hyphen as well as an en dash in the stage', () => {
    expect(courseNameFromSyllabus('Chemistry 11-12 (2019)')).toBe('HSC Chemistry');
  });

  it('does not add HSC twice', () => {
    expect(courseNameFromSyllabus('HSC Biology 11–12 (2023)')).toBe('HSC Biology');
  });

  it('returns an empty string for an empty syllabus', () => {
    expect(courseNameFromSyllabus('')).toBe('');
    expect(courseNameFromSyllabus('   ')).toBe('');
  });
});

describe('groupSiblings', () => {
  it('orders Year 11 before Year 12 and omits a year with nothing in it', () => {
    const groups = groupSiblings([sibling('Movement', 'year12'), sibling('Stress', 'year11')]);
    expect(groups.map((g) => g.year)).toEqual(['year11', 'year12']);
    expect(groups[0].items.map((i) => i.title)).toEqual(['Stress']);
    expect(groups[1].items.map((i) => i.title)).toEqual(['Movement']);
  });

  it('shows plain focus areas as items and returns nothing for no siblings', () => {
    expect(groupSiblings([])).toEqual([]);
    const [group] = groupSiblings([sibling('Movement', 'year12')]);
    expect(group.lists).toEqual([]);
    expect(group.items).toEqual([
      {
        path: 'https://curriculum.nsw.edu.au/learning-areas/pdhpe/movement',
        title: 'Movement',
      },
    ]);
  });

  it('gathers the options of one list into a single list, in page order', () => {
    const [group] = groupSiblings([
      sibling('Sport A', 'year11', 'Elective focus areas'),
      sibling('Sport B', 'year11', 'Elective focus areas'),
      sibling('Stress', 'year11'),
    ]);
    expect(group.items.map((i) => i.title)).toEqual(['Stress']);
    expect(group.lists).toHaveLength(1);
    expect(group.lists[0].optionsList).toBe('Elective focus areas');
    expect(group.lists[0].titles).toEqual(['Sport A', 'Sport B']);
    expect(group.lists[0].paths).toHaveLength(2);
  });

  it('lists plain focus areas before options lists within a year', () => {
    const [group] = groupSiblings([
      sibling('Sport A', 'year12', 'Options'),
      sibling('Movement', 'year12'),
    ]);
    expect(group.items.map((i) => i.title)).toEqual(['Movement']);
    expect(group.lists.map((l) => l.optionsList)).toEqual(['Options']);
  });

  it('keeps an option whose title is empty, so its own page can name it', () => {
    const [group] = groupSiblings([
      {
        path: 'https://curriculum.nsw.edu.au/option-1',
        title: '',
        year: 'year11',
        optionsList: 'Electives',
      },
    ]);
    expect(group.lists[0].titles).toEqual(['']);
    expect(group.lists[0].paths).toEqual(['https://curriculum.nsw.edu.au/option-1']);
  });

  it('shows a path the page listed twice only once', () => {
    const duplicate = sibling('Movement', 'year12');
    const groups = groupSiblings([duplicate, { ...duplicate, title: 'Movement again' }]);
    expect(groups[0].items).toHaveLength(1);
  });
});

describe('pendingSiblings', () => {
  it('drops the focus areas already in the import', () => {
    const groups = groupSiblings([sibling('Movement', 'year11'), sibling('Stress', 'year12')]);
    const pending = pendingSiblings(groups, [
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/stress',
    ]);
    expect(pending).toHaveLength(1);
    expect(pending[0].year).toBe('year11');
    expect(pending[0].items.map((i) => i.title)).toEqual(['Movement']);
  });

  it('removes an options list only once every option in it is added', () => {
    const groups = groupSiblings([
      sibling('Sport A', 'year11', 'Electives'),
      sibling('Sport B', 'year11', 'Electives'),
    ]);
    const partly = pendingSiblings(groups, [
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/sport-a',
    ]);
    expect(partly[0].lists[0].titles).toEqual(['Sport B']);

    const all = pendingSiblings(groups, [
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/sport-a',
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/sport-b',
    ]);
    expect(all).toEqual([]);
  });

  it('matches an added path however the page reader spelled it', () => {
    const groups = groupSiblings([sibling('Movement', 'year11')]);
    expect(
      pendingSiblings(groups, ['http://CURRICULUM.nsw.edu.au/learning-areas/pdhpe/movement/'])
    ).toEqual([]);
  });
});

describe('comparablePath', () => {
  it('ignores the scheme, case and a trailing slash', () => {
    expect(comparablePath('HTTPS://curriculum.nsw.edu.au/Stress/')).toBe(
      comparablePath('http://curriculum.nsw.edu.au/stress')
    );
  });

  it('keeps different pages apart', () => {
    expect(comparablePath('https://curriculum.nsw.edu.au/a')).not.toBe(
      comparablePath('https://curriculum.nsw.edu.au/b')
    );
  });

  it('still compares something that is not a full address', () => {
    expect(comparablePath(' not a url/ ')).toBe('not a url');
  });
});

describe('mergeOutcomesByCode', () => {
  const o = (code: string, description = 'd') => ({ code, description });

  it('adds incoming outcomes whose codes are new', () => {
    expect(mergeOutcomesByCode([o('A')], [o('B')])).toEqual([o('A'), o('B')]);
  });

  it('skips an incoming outcome whose code already exists, ignoring case and spaces', () => {
    expect(mergeOutcomesByCode([o('HM-11-01', 'first')], [o(' hm-11-01 ', 'second')])).toEqual([
      o('HM-11-01', 'first'),
    ]);
  });

  it('keeps a repeat that arrives within the incoming list itself', () => {
    expect(mergeOutcomesByCode([], [o('A'), o('A')])).toEqual([o('A'), o('A')]);
  });
});

describe('outcomesWithoutRemoved', () => {
  const o = (code: string) => ({ code, description: 'd' });

  it('drops the outcomes of a removed focus area that nothing else holds', () => {
    const current = [o('A'), o('B'), o('C')];
    expect(outcomesWithoutRemoved(current, [o('A'), o('B')], [o('C')])).toEqual([o('C')]);
  });

  it('keeps an outcome another focus area still carries', () => {
    const current = [o('A'), o('B')];
    expect(outcomesWithoutRemoved(current, [o('A')], [o('A')])).toEqual([o('A'), o('B')]);
  });
});
