import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';
import * as navigatorChrome from '../../utils/navigatorChrome';
import {
  NAV_ACTION_BUTTON,
  NAV_ACTION_VARIANTS,
  NAV_INLINE_PANEL,
  NAV_LEVELS,
  NAV_NODE_BASE,
  NAV_RAIL_LINE,
  NAV_ROOT,
  NAV_STEP_BOX_ACTIVE,
  NAV_STEP_BOX_DONE,
  NAV_STEP_EDGE,
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

const makePrompt = (id: string, question: string, verb = 'ASSESS'): Prompt =>
  ({ id, question, verb: verb as PromptVerb, totalMarks: 8 }) as Prompt;

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
                // The trailing list is what the Active Focus picker is made of,
                // and EXPLAIN is a tier-3 verb — the one tier whose solid fill
                // is too light for white text.
                description:
                  'Explore the applications of web programming, including markup, styling and scripting.',
                prompts: [
                  makePrompt('p1', 'Assess the value of automated testing.'),
                  makePrompt('p2', 'Explain how a browser renders a page.', 'EXPLAIN'),
                ],
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

/** All four containers chosen, so the question list and the focus picker exist. */
const onADotPoint: StatePath = { ...halfway, dotPointId: 'd1' } as StatePath;

describe('the navigator wears the shared vocabulary', () => {
  it('dresses its root, its rail line and its step boxes from navigatorChrome', () => {
    const { container } = render(<PromptSelector {...props} statePath={halfway} />);

    const list = screen.getByRole('list');
    expect(list.className).toBe(NAV_ROOT);
    expect((list.firstElementChild as HTMLElement).className).toBe(NAV_RAIL_LINE);

    // A chosen step is folded down; the one being worked on is not.
    const chosen = screen.getByRole('group', { name: /^Course — chosen: / });
    expect(chosen.className).toContain(NAV_STEP_BOX_DONE);

    const current = screen.getByRole('group', { name: /^Syllabus Content — / });
    expect(current.className).toContain(NAV_STEP_BOX_ACTIVE);

    const nodes = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.includes(NAV_NODE_BASE)
    );
    expect(nodes).toHaveLength(4);
  });

  it('puts the level hue on the leading edge and nowhere on the box', () => {
    // The whole of D3 in one assertion: the step the reader is standing on
    // carries the level's colour on a 2px edge, and the box behind it carries
    // none. A hue that comes back onto the box is the regression this catches.
    render(<PromptSelector {...props} statePath={halfway} />);

    const current = screen.getByRole('group', { name: /^Syllabus Content — / });
    const edge = current.firstElementChild as HTMLElement;
    expect(edge.className).toContain(NAV_STEP_EDGE);
    expect(edge.className).toContain(NAV_LEVELS.dotPoint.edge);
    expect(edge.getAttribute('aria-hidden')).toBe('true');

    expect(current.className).not.toMatch(/border-(blue|purple|teal|pink|amber)-/);
    expect(current.className).not.toMatch(/shadow-(blue|purple|teal|pink|amber)-/);

    // A chosen step is not a place, so it has no edge to mark.
    const chosen = screen.getByRole('group', { name: /^Course — chosen: / });
    expect(chosen.className).not.toMatch(/border-(blue|purple|teal|pink|amber)-/);
    expect((chosen.firstElementChild as HTMLElement).className).not.toContain(NAV_STEP_EDGE);
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

  it('pairs a solid tier fill with the tier’s own text, not with white', () => {
    // `bandColors.test.ts` names the verb chip below this tile as a consumer of
    // the pairing; the tile eleven lines above it hard-coded `text-white`, which
    // on tier 3's yellow is 1.92:1 dark and 2.15:1 light.
    render(<PromptSelector {...props} statePath={onADotPoint} />);
    fireEvent.click(screen.getByRole('button', { name: /Select Question/i }));

    const row = screen.getByText('Explain how a browser renders a page.').closest('div[class]')
      ?.parentElement as HTMLElement;
    const tile = row.querySelector('div[class*="w-8"]') as HTMLElement;
    const glyph = tile.querySelector('svg') as SVGElement;
    expect(glyph.getAttribute('class')).toContain('text-yellow-950');
    expect(glyph.getAttribute('class')).not.toContain('text-white');
  });

  it('lets a selected focus area keep the row’s own text colour', () => {
    // The worst reading in the file: `text-white` on `bg-emerald-500/10` over
    // the light theme's white list surface, measured at 1.10:1. The row already
    // says `text-white light:text-slate-900`, so the override had nothing to
    // add and everything to take away.
    render(
      <PromptSelector
        {...props}
        statePath={{ ...onADotPoint, selectedSubItems: ['markup'] } as StatePath}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Refine Scope/i }));

    const label = screen.getAllByText('markup').find((el) => el.tagName === 'SPAN') as HTMLElement;
    expect(label.className).not.toContain('text-white');
    const tile = label.previousElementSibling as HTMLElement;
    expect(tile.className).toContain('text-emerald-950');
    expect(tile.className).not.toContain('text-white');
  });

  it('gives the four unpartnered light-theme colours a partner', () => {
    // Measured on their real washes rather than on the white this document
    // first assumed: 2.86 / 2.34 / 2.40 / 1.96 : 1.
    expect(NAV_ACTION_VARIANTS.special).toContain('text-amber-800');
    expect(NAV_ACTION_VARIANTS.special).not.toContain('text-amber-600');
    expect(NAV_ACTION_VARIANTS.locked).toContain('text-amber-800');
    expect(NAV_ACTION_VARIANTS.locked).not.toContain('text-amber-600');
    // Icon-only at 4.19:1, which clears the 3:1 floor. Left deliberately.
    expect(NAV_ACTION_VARIANTS.danger).toContain('text-red-600');

    // Read as text rather than rendered: three of these four sit in states the
    // fixture cannot reach — an AI parse failure, a locked plan, a hover.
    const source = readFileSync('components/PromptSelector.tsx', 'utf8');
    for (const pair of [
      'text-purple-700 dark:text-purple-400',
      'text-red-600 dark:text-red-400',
      'text-emerald-700 dark:text-emerald-400',
    ]) {
      expect(source, `${pair} is what the measurement chose`).toContain(pair);
    }
    expect(source).not.toContain('text-emerald-500/80');
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
 * This set held twenty-six names when the vocabulary was lifted out of the JSX
 * still written in the old `light:` idiom — the sweep landed failing-by-name
 * rather than skipped, because a skipped test nobody re-enables is how these
 * guards die. The tokenising step emptied it, and it stays empty: the second
 * test below fails on an exemption that is no longer earned, so nothing can be
 * parked here on the way past.
 */
const EXEMPT = new Set<string>([]);

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

  it('writes the new idiom only', () => {
    // The cheapest exact pin on the migration: `light:` is a descendant
    // selector (`[data-theme="light"] &`, `tailwind.config.js`), so a single one
    // left in this file would outrank every unprefixed class a call site adds.
    for (const [name, value] of classStrings()) {
      expect(value, `${name} still uses the legacy light: variant`).not.toContain('light:');
    }
  });

  it('paints the active step box in both themes and in neither hue', () => {
    expect(NAV_STEP_BOX_ACTIVE).toContain('bg-white');
    expect(NAV_STEP_BOX_ACTIVE).toContain('dark:bg-[rgb(var(--color-bg-surface))]');
    // Neutral glass: the elevation says "you are here", not the colour.
    expect(NAV_STEP_BOX_ACTIVE).not.toMatch(/(blue|purple|teal|pink|amber)-/);
    expect(NAV_STEP_BOX_ACTIVE).not.toContain('scale-[1.01]');
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
