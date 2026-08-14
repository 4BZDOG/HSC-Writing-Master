import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';
import * as navigatorChrome from '../../utils/navigatorChrome';
import {
  NAV_ACTION_BUTTON,
  NAV_INLINE_PANEL,
  NAV_LEVELS,
  NAV_NODE_BASE,
  NAV_RAIL_LINE,
  NAV_ROOT,
  NAV_STEP_BOX_ACTIVE,
  NAV_STEP_BOX_DONE,
} from '../../utils/navigatorChrome';

/**
 * The navigator is about to be redesigned in `utils/navigatorChrome.ts`, one
 * constant at a time. That only works if the constants are what the navigator
 * actually wears — a class string left behind in the JSX would silently stop
 * tracking the redesign, and nothing else in the suite looks at this component's
 * chrome.
 *
 * The mirror of `tests/unit/appHeaderChrome.test.tsx` and
 * `tests/unit/verbRibbonChrome.test.tsx`, which pinned the header and the verb
 * ribbon the same way before the same treatment.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const makePrompt = (id: string, question: string): Prompt =>
  ({ id, question, verb: 'ASSESS' as PromptVerb, totalMarks: 8 }) as Prompt;

const courses: Course[] = [
  {
    id: 'c1',
    name: 'Software Engineering',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Programming for the Web',
        subTopics: [
          {
            id: 's1',
            name: 'Web Systems',
            dotPoints: [
              {
                id: 'd1',
                description: 'Explore the applications of web programming.',
                prompts: [makePrompt('p1', 'Assess the value of automated testing.')],
              },
            ],
          },
        ],
      },
    ],
  },
];

const noop = vi.fn();

const props = {
  courses,
  onPathChange: noop,
  onAddCourse: noop,
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
  userRole: 'admin' as const,
};

const halfway: StatePath = { courseId: 'c1', topicId: 't1', subTopicId: 's1' } as StatePath;

describe('the navigator wears the shared vocabulary', () => {
  it('dresses its root, its rail line and its step boxes from navigatorChrome', () => {
    const { container } = render(<PromptSelector {...props} statePath={halfway} />);

    const list = screen.getByRole('list');
    expect(list.className).toBe(NAV_ROOT);
    expect((list.firstElementChild as HTMLElement).className).toBe(NAV_RAIL_LINE);

    // A chosen step is folded down; the one being worked on is not.
    const chosen = screen.getByRole('group', { name: /^Course — chosen: / });
    expect(chosen.className).toContain(NAV_STEP_BOX_DONE);
    expect(chosen.className).toContain(NAV_LEVELS.course.selectedBorder);

    const current = screen.getByRole('group', { name: /^Syllabus Content — / });
    expect(current.className).toContain(NAV_STEP_BOX_ACTIVE);
    expect(current.className).toContain(NAV_LEVELS.dotPoint.activeBorder);

    const nodes = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.includes(NAV_NODE_BASE)
    );
    expect(nodes).toHaveLength(4);
  });

  it('dresses the action buttons and the inline topic editor', () => {
    render(<PromptSelector {...props} statePath={{ courseId: 'c1' } as StatePath} />);

    // The `title` strings are load-bearing selectors in
    // `tests/unit/syllabusImportEntry.test.tsx`; this reads one of them rather
    // than inventing a new hook.
    expect(screen.getByTitle('Edit Outcomes').className).toContain(NAV_ACTION_BUTTON);

    fireEvent.click(screen.getByTitle('Add Topic'));
    const panel = screen.getByPlaceholderText(/Topic name/i).closest(`div[class]`)
      ?.parentElement as HTMLElement;
    expect(panel.className).toBe(NAV_INLINE_PANEL);
  });

  it('names its levels after the syllabus tree, never after a colour', () => {
    // `THEMES` was keyed by hue and carried a sixth `green` entry that nothing
    // read. Keyed by level, `green` cannot survive — there is no level of the
    // syllabus called green — and no call site can mistake a hue for a claim.
    expect(Object.keys(NAV_LEVELS)).toEqual([
      'course',
      'topic',
      'subTopic',
      'dotPoint',
      'question',
    ]);
  });
});

/**
 * DesignSpec §2's parity rule, swept over every class string this file exports.
 * The classifier is `tests/unit/verbRibbonChrome.test.tsx`'s, unchanged.
 *
 * The navigator is still written in the OLD `light:` idiom, so nearly every
 * constant fails today. Rather than skip the sweep — a skipped test nobody
 * re-enables is how these guards die — it lands with the failures named one by
 * one. THE TOKENISING STEP MUST EMPTY THIS SET. A constant that stops needing
 * its exemption and keeps it is a hole in the guard, so the sweep also fails on
 * an exemption that is no longer earned.
 */
const EXEMPT = new Set<string>([
  ...(['course', 'topic', 'subTopic', 'dotPoint', 'question'] as const).flatMap((level) =>
    (['activeBorder', 'activeShadow', 'selectedBorder', 'node', 'icon'] as const).map(
      (field) => `NAV_LEVELS.${level}.${field}`
    )
  ),
  'NAV_ACTION_VARIANTS.locked',
  'NAV_ACTION_VARIANTS.danger',
  'NAV_ACTION_VARIANTS.special',
  'NAV_ACTION_VARIANTS.primary',
  'NAV_ACTION_VARIANTS.vault',
  'NAV_ACTION_VARIANTS.default',
  'NAV_FOCUS_PILL',
  'NAV_INLINE_INPUT',
  'NAV_INLINE_PANEL',
  'NAV_NODE_COMPLETE',
  'NAV_NODE_UPCOMING',
  'NAV_RAIL_LINE',
  'NAV_STEP_BOX_ACTIVE',
  'NAV_STEP_BOX_DONE',
  'NAV_STEP_HEADER_LABEL',
]);

/** Every class string the file exports, including the ones nested inside
 *  `NAV_LEVELS` and `NAV_ACTION_VARIANTS` — the ribbon's sweep only had flat
 *  string exports to walk, and half of this file's colour lives one level in. */
const classStrings = (): [string, string][] => {
  const found: [string, string][] = [];
  const walk = (name: string, value: unknown) => {
    if (typeof value === 'string') found.push([name, value]);
    else if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) walk(`${name}.${key}`, nested);
    }
  };
  for (const [name, value] of Object.entries(navigatorChrome)) walk(name, value);
  return found;
};

describe('the navigator’s chrome carries both themes', () => {
  /** `hover:bg-slate-100` → `bg`; `text-lg` and `border-b` → null. */
  const colourProperty = (token: string): string | null => {
    const utility = token.split(':').pop() as string;
    const match = utility.match(/^(text|bg|border|from|via|to|shadow|ring|divide)-(.+)$/);
    if (!match) return null;
    const [, property, value] = match;
    // Theme-neutral keywords need no partner; sizes and gradient directions
    // are not colours at all.
    if (/^(transparent|current|inherit|none)$/.test(value)) return null;
    // The alpha may be an arbitrary value — `white/[0.03]` is a real tier-card
    // fill here, and the header's classifier never had to read one.
    const alpha = '(\\/(\\[[^\\]]+\\]|[\\d.]+))?';
    const isColour =
      new RegExp(`^(white|black)${alpha}$`).test(value) ||
      new RegExp(`^[a-z]+-\\d{2,3}${alpha}$`).test(value) ||
      value.startsWith('[rgb(');
    return isColour ? property : null;
  };

  /** Whether a string would pass the two rules below. */
  const faults = (value: string): string[] => {
    const problems: string[] = [];
    if (value.includes('light:')) problems.push('uses the legacy light: variant');

    const tokens = value.split(/\s+/).filter(Boolean);
    const themed = new Set(
      tokens
        .filter((t) => t.startsWith('dark:'))
        .map(colourProperty)
        .filter(Boolean)
    );
    for (const token of tokens) {
      if (token.startsWith('dark:')) continue;
      const property = colourProperty(token);
      if (property && !themed.has(property)) {
        problems.push(`sets \`${token}\` on a theme surface with no dark: partner`);
      }
    }
    return problems;
  };

  it('gives every colour on a theme surface a light value and a dark partner', () => {
    for (const [name, value] of classStrings()) {
      if (EXEMPT.has(name)) continue;
      expect(faults(value), `${name} ${faults(value).join('; ')}`).toEqual([]);
    }
  });

  it('holds every unconverted constant to account by name', () => {
    // The other half of the exemption: a constant that has been converted must
    // lose its exemption in the same commit, or the set quietly stops meaning
    // anything.
    const stale = [...EXEMPT].filter((name) => {
      const entry = classStrings().find(([key]) => key === name);
      return !entry || faults(entry[1]).length === 0;
    });
    expect(stale, `these exemptions are no longer earned: ${stale.join(', ')}`).toEqual([]);
  });
});
