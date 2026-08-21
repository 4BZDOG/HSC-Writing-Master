import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath, SyllabusYear, Topic } from '../../types';
import {
  DEFAULT_SYLLABUS_YEAR,
  activeSyllabusYear,
  hasContentForYear,
  mergeParsedOutcomes,
  outcomesForYear,
  outcomesFromYearTabs,
  outcomesOfYear,
  resolveSyllabusYear,
  topicsForYear,
  yearOfTopic,
} from '../../utils/syllabusYear';

/**
 * A NSW senior course is two syllabuses under one name. Year 11 and Year 12
 * share the course and nothing below it, so the year is a choice beside the
 * course rather than a level inside it — and the absence of a year MEANS
 * Year 12, because that is what every topic written before this existed is.
 */

vi.mock('../../services/geminiService', () => ({ parseSyllabusStructure: vi.fn() }));
vi.mock('../../services/responseService', () => ({ fetchMyAttempts: vi.fn(async () => new Map()) }));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const topic = (id: string, name: string, year?: SyllabusYear): Topic =>
  ({ id, name, subTopics: [], ...(year ? { year } : {}) }) as Topic;

describe('the year model', () => {
  it('reads a topic with no year as Year 12', () => {
    expect(yearOfTopic(topic('t', 'Heredity'))).toBe('year12');
    expect(yearOfTopic(undefined)).toBe('year12');
    expect(DEFAULT_SYLLABUS_YEAR).toBe('year12');
  });

  it('separates the two populations', () => {
    const course = {
      topics: [
        topic('a', 'Cells', 'year11'),
        topic('b', 'Heredity'),
        topic('c', 'Organisation', 'year11'),
        topic('d', 'Genetic change', 'year12'),
      ],
    };
    expect(topicsForYear(course, 'year11').map((t) => t.id)).toEqual(['a', 'c']);
    // Both spellings of Year 12 — the explicit one and the absent one.
    expect(topicsForYear(course, 'year12').map((t) => t.id)).toEqual(['b', 'd']);
  });

  it('knows when a year is empty', () => {
    const hscOnly = { topics: [topic('b', 'Heredity')] };
    expect(hasContentForYear(hscOnly, 'year12')).toBe(true);
    expect(hasContentForYear(hscOnly, 'year11')).toBe(false);
    expect(hasContentForYear(undefined, 'year12')).toBe(false);
  });

  describe('resolving which year to show', () => {
    const hscOnly = { topics: [topic('b', 'Heredity')] };
    const both = { topics: [topic('a', 'Cells', 'year11'), topic('b', 'Heredity')] };
    const prelimOnly = { topics: [topic('a', 'Cells', 'year11')] };

    it('defaults to Year 12', () => {
      expect(resolveSyllabusYear(both, undefined)).toBe('year12');
    });

    it('honours a request the course can answer', () => {
      expect(resolveSyllabusYear(both, 'year11')).toBe('year11');
    });

    it('falls back rather than showing an empty picker', () => {
      // Carried over from the previous course, which had Year 11 content.
      expect(resolveSyllabusYear(hscOnly, 'year11')).toBe('year12');
    });

    it('opens a Year-11-only course on Year 11, with nobody configuring it', () => {
      expect(resolveSyllabusYear(prelimOnly, undefined)).toBe('year11');
    });

    it('still answers for a course with nothing in it at all', () => {
      expect(resolveSyllabusYear({ topics: [] }, 'year11')).toBe('year12');
    });

    it('lets a curator stand in an empty year to fill it', () => {
      // Without this the feature could never be populated: every empty year
      // would bounce back to Year 12, including the one being filled.
      expect(resolveSyllabusYear(hscOnly, 'year11', { allowEmpty: true })).toBe('year11');
      // Still needs an explicit request — an absent one means "wherever the
      // content is".
      expect(resolveSyllabusYear(hscOnly, undefined, { allowEmpty: true })).toBe('year12');
    });
  });

  describe('the year the app is working in', () => {
    const hscOnly = { topics: [topic('b', 'Heredity')] };

    it('is the same answer for the navigator and for what creates into it', () => {
      // The bug this exists to prevent: a topic created while a curator stood
      // in an EMPTY Year 11 came out tagged Year 12 and appeared in the HSC
      // list, because the navigator resolved with `allowEmpty` and the creation
      // path resolved without it.
      expect(activeSyllabusYear(hscOnly, 'year11', true)).toBe('year11');
      expect(activeSyllabusYear(hscOnly, 'year11', false)).toBe('year12');
    });

    it('leaves a reader where the content is', () => {
      expect(activeSyllabusYear(hscOnly, undefined, false)).toBe('year12');
      expect(activeSyllabusYear(hscOnly, undefined, true)).toBe('year12');
    });
  });

  describe('outcomes', () => {
    it('shows every outcome when the course labels none of them', () => {
      const course = {
        outcomes: [
          { code: 'BI-12-01', description: 'a' },
          { code: 'BI-12-02', description: 'b' },
        ],
      };
      // Hiding all of them for the sake of a rule would take working content
      // away from every course that predates the two years.
      expect(outcomesForYear(course, 'year11')).toHaveLength(2);
      expect(outcomesForYear(course, 'year12')).toHaveLength(2);
    });

    it('filters once the course does distinguish them', () => {
      const course = {
        outcomes: [
          { code: 'BI-11-01', description: 'a', year: 'year11' as SyllabusYear },
          { code: 'BI-12-01', description: 'b' },
        ],
      };
      expect(outcomesForYear(course, 'year11').map((o) => o.code)).toEqual(['BI-11-01']);
      expect(outcomesForYear(course, 'year12').map((o) => o.code)).toEqual(['BI-12-01']);
    });

    /**
     * The whole reason there are two filters. Reading is lenient so an
     * unlabelled course keeps working; editing is exact so it cannot be
     * destroyed in one click.
     */
    it('offers an unlabelled course nothing to EDIT in Year 11', () => {
      const course = {
        outcomes: [
          { code: 'BI-12-01', description: 'a' },
          { code: 'BI-12-02', description: 'b' },
        ],
      };
      // Lenient: all of them are shown to a Year 11 reader.
      expect(outcomesForYear(course, 'year11')).toHaveLength(2);
      // Exact: none of them ARE Year 11. Editing through the lenient list and
      // saving would stamp both HSC outcomes `year11` and empty Year 12.
      expect(outcomesOfYear(course, 'year11')).toEqual([]);
      expect(outcomesOfYear(course, 'year12')).toHaveLength(2);
    });
  });

  describe('saving both years of outcomes', () => {
    it('stamps each tab with its own year, Year 12 as an absence', () => {
      const saved = outcomesFromYearTabs({
        year12: [{ code: 'BI-12-01', description: 'HSC one' }],
        // Carrying a stale tag, e.g. an outcome moved between tabs.
        year11: [{ code: 'BI-11-01', description: 'Prelim one', year: 'year12' }],
      });

      expect(saved.map((o) => o.code)).toEqual(['BI-12-01', 'BI-11-01']);
      expect('year' in saved[0]).toBe(false);
      expect(saved[1].year).toBe('year11');
    });

    it('is what turns an unlabelled list into a real filter', () => {
      const saved = outcomesFromYearTabs({
        year12: [{ code: 'BI-12-01', description: 'HSC one' }],
        year11: [{ code: 'BI-11-01', description: 'Prelim one' }],
      });
      expect(outcomesForYear({ outcomes: saved }, 'year12').map((o) => o.code)).toEqual([
        'BI-12-01',
      ]);
      expect(outcomesForYear({ outcomes: saved }, 'year11').map((o) => o.code)).toEqual([
        'BI-11-01',
      ]);
    });
  });

  describe('folding a parsed page into the two tabs', () => {
    const empty = { year11: [], year12: [] };

    it('sends each outcome to the year the page said it was', () => {
      // What a NESA outcomes page gives you: both years in one document.
      const { tabs, added } = mergeParsedOutcomes(
        empty,
        [
          { code: 'BIO11-8', description: 'Prelim', year: 'year11' },
          { code: 'BIO12-12', description: 'HSC', year: 'year12' },
        ],
        'year12'
      );
      expect(tabs.year11.map((o) => o.code)).toEqual(['BIO11-8']);
      expect(tabs.year12.map((o) => o.code)).toEqual(['BIO12-12']);
      expect(added).toEqual({ year11: 1, year12: 1 });
    });

    it('puts an unplaced outcome in the tab the user is looking at', () => {
      // Not Year 12 by default: that would be a guess wearing the default's
      // clothes, on the one page that failed to say.
      const { tabs } = mergeParsedOutcomes(
        empty,
        [{ code: 'XX-1', description: 'No year given' }],
        'year11'
      );
      expect(tabs.year11.map((o) => o.code)).toEqual(['XX-1']);
      expect(tabs.year12).toEqual([]);
    });

    it('does not double a page that is fetched twice', () => {
      const parsed = [{ code: 'BIO11-8', description: 'Prelim', year: 'year11' as SyllabusYear }];
      const once = mergeParsedOutcomes(empty, parsed, 'year12');
      const twice = mergeParsedOutcomes(once.tabs, parsed, 'year12');
      expect(twice.tabs.year11).toHaveLength(1);
      expect(twice.added.year11).toBe(0);
      expect(twice.duplicates).toBe(1);
    });

    it('treats the same code in the other year as a different outcome', () => {
      // Not every NESA code carries its year, and where it does not, the same
      // string in Year 11 and Year 12 is two outcomes.
      const { tabs, duplicates } = mergeParsedOutcomes(
        { year11: [{ code: 'WS-1', description: 'Prelim working scientifically' }], year12: [] },
        [{ code: 'WS-1', description: 'HSC working scientifically', year: 'year12' }],
        'year12'
      );
      expect(tabs.year12).toHaveLength(1);
      expect(duplicates).toBe(0);
    });
  });
});

// --- The navigator ----------------------------------------------------------

const prompt = (id: string): Prompt =>
  ({ id, question: `Question ${id}`, verb: 'EXPLAIN' as PromptVerb, totalMarks: 5 }) as Prompt;

const withDotPoint = (t: Topic, suffix: string): Topic => ({
  ...t,
  subTopics: [
    {
      id: `st-${suffix}`,
      name: `Sub-topic ${suffix}`,
      dotPoints: [
        { id: `dp-${suffix}`, description: `Dot point ${suffix}`, prompts: [prompt(`p-${suffix}`)] },
      ],
    },
  ],
});

const courseWith = (topics: Topic[]): Course[] => [
  { id: 'c1', name: 'HSC Biology', outcomes: [], topics },
];

const HSC_ONLY = courseWith([withDotPoint(topic('t12', 'Heredity'), '12')]);
const BOTH_YEARS = courseWith([
  withDotPoint(topic('t11', 'Cells and organisation', 'year11'), '11'),
  withDotPoint(topic('t12', 'Heredity'), '12'),
]);

const noop = vi.fn();

const baseProps = {
  onPathChange: noop,
  onAddCourse: noop,
  onToggleCourseStatus: noop,
  onAddSubTopic: noop,
  onGeneratePrompt: noop,
  onManualEntry: noop,
  onEditOutcomes: noop,
  onOpenDataManager: noop,
  onRenameItem: noop,
  onDeleteItem: noop,
  onAddTopicFromSyllabus: noop,
  onAddTopicWithContent: noop,
  onGenerateDotPoints: noop,
  onImportTopic: noop,
  onImportSyllabus: noop,
  newlyAddedIds: new Set<string>(),
  userRole: 'user' as const,
};

const renderNavigator = (courses: Course[], path: Partial<StatePath> = {}) => {
  const onPathChange = vi.fn();
  render(
    <PromptSelector
      {...baseProps}
      courses={courses}
      statePath={{ courseId: 'c1', ...path } as StatePath}
      onPathChange={onPathChange}
    />
  );
  return onPathChange;
};

/** The year control sits beside the course name and shows the active year. */
const yearControl = () =>
  screen.getByRole('button', { name: /Year 1[12]/ }) as HTMLButtonElement;

const openYearList = () => {
  fireEvent.click(yearControl());
  return screen.getByRole('listbox');
};

const topicList = () => {
  fireEvent.click(screen.getByText('Select Topic...').closest('button') as HTMLElement);
  return screen.getByRole('listbox');
};

describe('choosing a year in the navigator', () => {
  it('opens on Year 12 without anyone asking', () => {
    renderNavigator(BOTH_YEARS);
    expect(yearControl().textContent).toMatch(/Year 12/);
  });

  it('offers only the year on screen in the topic list', () => {
    renderNavigator(BOTH_YEARS);
    const list = topicList();
    expect(within(list).getByText('Heredity')).toBeTruthy();
    expect(within(list).queryByText('Cells and organisation')).toBeNull();
  });

  it('shows the other year once it is chosen', () => {
    renderNavigator(BOTH_YEARS, { syllabusYear: 'year11' });
    const list = topicList();
    expect(within(list).getByText('Cells and organisation')).toBeTruthy();
    expect(within(list).queryByText('Heredity')).toBeNull();
  });

  it('drops the whole selection below the course when the year changes', () => {
    const onPathChange = renderNavigator(BOTH_YEARS, {
      topicId: 't12',
      subTopicId: 'st-12',
      dotPointId: 'dp-12',
      promptId: 'p-12',
      selectedSubItems: ['something'],
    });

    fireEvent.click(within(openYearList()).getByText('Year 11'));

    // A topic id from Year 12 means nothing in Year 11.
    expect(onPathChange).toHaveBeenCalledWith({
      syllabusYear: 'year11',
      topicId: undefined,
      subTopicId: undefined,
      dotPointId: undefined,
      promptId: undefined,
      selectedSubItems: undefined,
    });
  });

  it('offers an empty year to a reader but will not go there, and says why', () => {
    const onPathChange = renderNavigator(HSC_ONLY);
    const list = openYearList();

    const row = within(list).getByText('Year 11').closest('li') as HTMLElement;
    expect(within(row).getByText(/No content yet/i)).toBeTruthy();
    expect(row.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(row);
    expect(onPathChange).not.toHaveBeenCalled();
  });

  it('names the year in the empty state, so it does not read as lost content', () => {
    renderNavigator(courseWith([withDotPoint(topic('t11', 'Cells', 'year11'), '11')]), {
      syllabusYear: 'year12',
    });
    // A Year-11-only course resolves to Year 11 rather than showing nothing.
    expect(yearControl().textContent).toMatch(/Year 11/);
    expect(screen.queryByText(/No Year 12 topics yet/i)).toBeNull();
  });

  it('says which year is empty when a year genuinely has nothing', () => {
    render(
      <PromptSelector
        {...baseProps}
        courses={courseWith([])}
        statePath={{ courseId: 'c1' } as StatePath}
      />
    );
    expect(screen.getByText(/No Year 12 topics yet/i)).toBeTruthy();
  });
});

describe('a curator filling an empty year', () => {
  const curatorProps = { ...baseProps, userRole: 'teacher' as const };

  const renderAsCurator = (courses: Course[], path: Partial<StatePath> = {}) => {
    const onPathChange = vi.fn();
    render(
      <PromptSelector
        {...curatorProps}
        courses={courses}
        statePath={{ courseId: 'c1', ...path } as StatePath}
        onPathChange={onPathChange}
      />
    );
    return onPathChange;
  };

  it('can select the empty year, because that is where the first topic goes', () => {
    const onPathChange = renderAsCurator(HSC_ONLY);
    const list = openYearList();

    const row = within(list).getByText('Year 11').closest('li') as HTMLElement;
    expect(row.getAttribute('aria-disabled')).toBeNull();
    // No note on a selectable row: the trigger draws the SELECTED option's own
    // label, so one here would ride up into the closed control and read as part
    // of the year's name. The empty state under the topic picker says it
    // instead, with room to say it properly.
    expect(within(row).queryByText(/Empty|No content/i)).toBeNull();

    fireEvent.click(row);
    expect(onPathChange).toHaveBeenCalledWith(
      expect.objectContaining({ syllabusYear: 'year11', topicId: undefined })
    );
  });

  it('stays in the empty year rather than bouncing back to Year 12', () => {
    renderAsCurator(HSC_ONLY, { syllabusYear: 'year11' });

    expect(yearControl().textContent).toMatch(/Year 11/);
    expect(screen.getByText(/No Year 11 topics yet/i)).toBeTruthy();
  });
});

describe('the sub-topic question count', () => {
  const openSubTopicList = () => {
    fireEvent.click(screen.getByText('Select Sub-Topic...').closest('button') as HTMLElement);
    return screen.getByRole('listbox');
  };

  // Two dot points totalling three prompts, so the badge sums across the
  // whole sub-topic rather than reporting just one dot point's count.
  const mixedTopic: Topic = {
    ...topic('t', 'Mixed'),
    subTopics: [
      {
        id: 'st-full',
        name: 'Full sub-topic',
        dotPoints: [
          { id: 'dp-a', description: 'A', prompts: [prompt('p-a'), prompt('p-b')] },
          { id: 'dp-b', description: 'B', prompts: [prompt('p-c')] },
        ],
      },
      {
        id: 'st-empty',
        name: 'Empty sub-topic',
        dotPoints: [{ id: 'dp-c', description: 'C', prompts: [] }],
      },
    ],
  };

  it('shows the total question count for a populated sub-topic, and no badge for an empty one', () => {
    renderNavigator(courseWith([mixedTopic]), { topicId: 't' });
    const list = openSubTopicList();

    const fullRow = within(list).getByText('Full sub-topic').closest('li') as HTMLElement;
    expect(within(fullRow).getByText('3 questions')).toBeTruthy();

    const emptyRow = within(list).getByText('Empty sub-topic').closest('li') as HTMLElement;
    expect(within(emptyRow).queryByText(/question/i)).toBeNull();
  });

  it('uses the singular for exactly one question', () => {
    renderNavigator(
      courseWith([
        {
          ...topic('t', 'Single'),
          subTopics: [
            {
              id: 'st-one',
              name: 'One-question sub-topic',
              dotPoints: [{ id: 'dp-one', description: 'A', prompts: [prompt('p-one')] }],
            },
          ],
        },
      ]),
      { topicId: 't' }
    );
    const list = openSubTopicList();

    const row = within(list).getByText('One-question sub-topic').closest('li') as HTMLElement;
    expect(within(row).getByText('1 question')).toBeTruthy();
  });
});
