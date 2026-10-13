import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { PANEL_ROW_MIN_H, PANEL_SURFACE } from '../../utils/panelStyles';
import { PANEL_NAME } from '../../components/PanelDisclosure';
import {
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_GUTTER,
  LADDER_ROW,
  LADDER_STACK,
} from '../../utils/ladderChrome';
import {
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TITLE,
  RIBBON_MINI_STAIR,
} from '../../utils/verbRibbonChrome';
import * as sampleAnswerChrome from '../../utils/sampleAnswerChrome';
import { getBandConfig, getBandRgb } from '../../utils/renderUtils';
import { readSupportUsage, resetSupportEngagement } from '../../utils/supportEngagement';
import type { Prompt, PromptVerb, SampleAnswer, UserRole } from '../../types';

/**
 * The Sample Answers panel, on the Marking Guide's anatomy.
 *
 * The panel is an `AccordionSection`: the same header, the same disclosure and the
 * same surface as the guide beside it. Its tools sit in the body, and each mark
 * level is a ladder row (`utils/ladderChrome.ts`) with the guide's gutter. This file
 * pins what jsdom can see: the structure, the aria state, the behaviour of each
 * control, and the class vocabulary. The colours themselves are measured in the
 * browser.
 *
 * The cross-link (a guide's "Model answer" opening a level here) and the parity
 * with the guide's gutter are in `sampleAnswersLadder.test.tsx`.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

beforeEach(() => {
  // jsdom has no layout, so the cross-link's scroll is a stub where it is called.
  Element.prototype.scrollIntoView = vi.fn();
  resetSupportEngagement();
});

afterEach(cleanup);

const sample = (over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id: 's1',
    answer: 'A model response that is short enough to read.',
    mark: 6,
    band: 3,
    source: 'AI',
    ...over,
  }) as SampleAnswer;

/** EXPLAIN is tier 3, so a six-mark question's ceiling is Band 3. */
const renderPanel = (
  options: {
    verb?: PromptVerb;
    totalMarks?: number;
    sampleAnswers?: SampleAnswer[];
    userRole?: UserRole;
    defaultCollapsed?: boolean;
    markingCriteria?: string;
    keywords?: string[];
    onUseSampleAnswer?: (text: string) => void;
    onContributeSampleAnswer?: (answer: SampleAnswer) => void;
    onFontSizeChange?: (size: number) => void;
    onRecalibrate?: () => Promise<void>;
  } = {}
) => {
  const prompt = {
    id: 'p1',
    question: 'Explain how the cell membrane regulates transport.',
    verb: options.verb ?? ('EXPLAIN' as PromptVerb),
    totalMarks: options.totalMarks ?? 6,
    keywords: options.keywords ?? [],
    markingCriteria: options.markingCriteria ?? '',
    sampleAnswers: options.sampleAnswers ?? [],
  } as unknown as Prompt;
  return render(
    <SampleAnswersAccordion
      prompt={prompt}
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      onUseSampleAnswer={options.onUseSampleAnswer}
      onContributeSampleAnswer={options.onContributeSampleAnswer}
      onRecalibrate={options.onRecalibrate}
      onFontSizeChange={options.onFontSizeChange}
      fontSize={options.onFontSizeChange ? 15 : undefined}
      userRole={options.userRole ?? 'user'}
      defaultCollapsed={options.defaultCollapsed ?? false}
    />
  );
};

/** The panel's own disclosure, which is named for Sample Answers. */
const toggleOf = (): HTMLElement => screen.getByRole('button', { name: /^Sample Answers/i });
/** The root of the panel, the surface every other panel shares. */
const panelOf = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;
/** The body the panel's disclosure controls. */
const bodyOf = (toggle: HTMLElement): HTMLElement =>
  document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement;
/** A level's disclosure, by the mark it names first ("4/6 marks, …"). */
const disclosureFor = (mark: number, total = 6): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^${mark}/${total} marks`) });
/** A level's row, from its disclosure. */
const rowOf = (disclosure: HTMLElement): HTMLElement =>
  disclosure.closest('[data-exemplar-row]') as HTMLElement;
/** A level's gutter: the ladder's own, which is the first `LADDER_GUTTER` in the row. */
const gutterOf = (row: HTMLElement): HTMLElement =>
  row.querySelector(`[class*="${LADDER_GUTTER.split(' ')[0]}"]`) as HTMLElement;

describe('the header is the Marking Guide’s header', () => {
  it('names the panel, and states its exemplars and levels as the sublabel', () => {
    renderPanel({ sampleAnswers: [sample({ id: 'a', mark: 6 }), sample({ id: 'b', mark: 4 })] });
    const title = screen.getByText('Sample answers');
    expect(title.tagName).toBe('SPAN');
    expect(title.className).toContain(PANEL_NAME);
    expect(toggleOf().querySelector('span.font-bold')).toBe(title);
    // The marks lead the sublabel: the same ladder for every question, read off the total.
    expect(screen.getByText('6 marks · 2 exemplars · 2 levels').className).toContain('t-label');
  });

  it('says there are no exemplars yet when none are written, on the same marks line', () => {
    renderPanel({ sampleAnswers: [] });
    expect(screen.getByText('6 marks · No exemplars yet')).toBeTruthy();
  });

  it('is a secondary hero: a glowing tile always, and a lit edge only while open', () => {
    const { container } = renderPanel({ defaultCollapsed: true });
    const root = panelOf(container);
    expect(toggleOf().querySelector('.band-glow')).toBeTruthy();
    expect(toggleOf().parentElement!.className).toContain('band-header-wash');
    expect(root.className).not.toContain('band-lit');

    fireEvent.click(toggleOf());
    expect(root.className).toContain('band-lit');
    expect(root.style.getPropertyValue('--band-rgb')).toMatch(/^\d+ \d+ \d+$/);
  });

  it('carries the same header row height and surface as every other panel', () => {
    const { container } = renderPanel();
    expect(panelOf(container).className).toContain(PANEL_SURFACE);
    expect(toggleOf().parentElement!.className).toContain(PANEL_ROW_MIN_H);
    expect(panelOf(container).firstElementChild!.contains(toggleOf())).toBe(true);
  });

  it('lights its icon tile in the question’s ceiling band, as the guide does', () => {
    renderPanel({ verb: 'EXPLAIN' as PromptVerb, defaultCollapsed: false });
    const ceiling = getBandForMark(6, 6, getCommandTermInfo('EXPLAIN' as PromptVerb).tier);
    // A hero's tile is 40px (`w-10`), not the ordinary section's 32px.
    const tile = toggleOf().querySelector('.w-10') as HTMLElement;
    expect(tile.className).toContain('band-solid');
    const owner = tile.closest('[style*="--band-rgb"]') as HTMLElement;
    expect(owner.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(ceiling));
  });

  it('drops the verb ribbon’s chrome: no mini ladder, no tier-lit glow, no ribbon classes', () => {
    const { container } = renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [sample({ id: 'a', mark: 6 })],
    });
    const html = container.innerHTML;
    for (const token of [RIBBON_HEADER_TITLE, RIBBON_HEADER_SUBLABEL, RIBBON_HEADER_TILE]) {
      expect(html).not.toContain(token);
    }
    expect(container.querySelector(`[class="${RIBBON_MINI_STAIR}"]`)).toBeNull();
    expect(container.querySelector('[title^="Model answers at"]')).toBeNull();
    expect(panelOf(container).style.borderColor).toBe('');
    expect(panelOf(container).style.boxShadow).toBe('');
  });

  it('records the panel as a support the student opened, once they open it', () => {
    renderPanel({ defaultCollapsed: true, sampleAnswers: [sample()] });
    expect(readSupportUsage('p1').opened).not.toContain('sampleAnswers');
    fireEvent.click(toggleOf());
    expect(readSupportUsage('p1').opened).toContain('sampleAnswers');
  });
});

describe('the body is folded until it is opened, and mounts nothing until then', () => {
  it('reports the open state and names the body it controls', () => {
    renderPanel({ defaultCollapsed: true, sampleAnswers: [sample({ id: 'a', mark: 6 })] });
    const toggle = toggleOf();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();

    // The body itself is there, inert and empty, so the aria-controls it names is real.
    expect(bodyOf(toggle).hasAttribute('inert')).toBe(true);
    expect(bodyOf(toggle).querySelector('[data-exemplar-row]')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bodyOf(toggle).hasAttribute('inert')).toBe(false);
    expect(bodyOf(toggle).querySelector('[data-exemplar-row]')).toBeTruthy();
  });

  it('mounts none of its rows while shut, so their text metrics do not run unseen', () => {
    renderPanel({
      defaultCollapsed: true,
      sampleAnswers: [sample({ answer: 'Unseen prose here.' })],
    });
    expect(screen.queryByText('Unseen prose here.')).toBeNull();
    fireEvent.click(toggleOf());
    expect(screen.getAllByText('Unseen prose here.').length).toBeGreaterThan(0);
  });

  it('can be asked to start open', () => {
    renderPanel({ defaultCollapsed: false, sampleAnswers: [sample({ id: 'a', mark: 6 })] });
    expect(toggleOf().getAttribute('aria-expanded')).toBe('true');
    expect(disclosureFor(6)).toBeTruthy();
  });
});

describe('the tools sit in the body, in the guide’s slim row', () => {
  it('puts the reading size in the body, not the header', () => {
    const onFontSizeChange = vi.fn();
    renderPanel({ onFontSizeChange });
    const zoom = screen.getByTitle(/Increase text size/i);
    expect(bodyOf(toggleOf()).contains(zoom)).toBe(true);
    expect(toggleOf().parentElement!.contains(zoom)).toBe(false);
    fireEvent.click(zoom);
    expect(onFontSizeChange).toHaveBeenCalledWith(17);
  });

  it('shows the student the reading size and nothing else', () => {
    renderPanel({ userRole: 'user', onRecalibrate: vi.fn().mockResolvedValue(undefined) });
    expect(screen.getByTitle(/Increase text size/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /generate/i })).toBeNull();
    expect(screen.queryByTitle(/Recalibrate samples with AI/i)).toBeNull();
  });

  it('gives a teacher the two AI actions beside the reading size', () => {
    renderPanel({ userRole: 'teacher', onRecalibrate: vi.fn().mockResolvedValue(undefined) });
    expect(screen.getByRole('button', { name: /generate a sample answer/i })).toBeTruthy();
    expect(screen.getByTitle(/Recalibrate samples with AI/i)).toBeTruthy();
    const row = screen.getByTitle(/Increase text size/i).parentElement!.parentElement!;
    expect(row.contains(screen.getByRole('button', { name: /generate a sample answer/i }))).toBe(
      true
    );
  });
});

describe('each mark level is a ladder row, built on the guide’s gutter', () => {
  const levels = [
    sample({ id: 'a', mark: 6 }), // Band 3
    sample({ id: 'b', mark: 4 }), // Band 2
    sample({ id: 'c', mark: 4, source: 'USER' }),
    sample({ id: 'd', mark: 1 }), // Band 1
  ];

  it('draws one row per level, highest mark first, in one stack', () => {
    const { container } = renderPanel({ sampleAnswers: levels });
    const rows = Array.from(container.querySelectorAll('[data-exemplar-row]')) as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(
      rows.map((row) =>
        row.querySelector('button[data-exemplar-mark]')!.getAttribute('data-exemplar-mark')
      )
    ).toEqual(['6', '4', '1']);
    expect(rows[0].parentElement!.className).toBe(LADDER_STACK);
  });

  it('gives each row the ladder row’s shape and its band, from the band itself', () => {
    renderPanel({ sampleAnswers: levels });
    const row = rowOf(disclosureFor(6));
    for (const token of LADDER_ROW.split(' ').filter((t) => !t.includes('['))) {
      expect(row.className, `row lacks ${token}`).toContain(token);
    }
    expect(row.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
    expect(row.classList.contains(LADDER_EDGE_SHUT)).toBe(true);
  });

  it('shows the mark in the gutter, with the band beneath it as the guide does', () => {
    renderPanel({ sampleAnswers: levels });
    const gutter = gutterOf(rowOf(disclosureFor(6)));
    expect(gutter.textContent).toBe(`6/6Band ${getBandForMark(6, 6, 3)}`);
    expect(within(gutter).getByText('6')).toBeTruthy();
    expect(within(gutter).getByText(`Band ${getBandForMark(6, 6, 3)}`)).toBeTruthy();
  });

  it('opens a row to the strong edge, and shuts it back to the whisper', () => {
    renderPanel({ sampleAnswers: levels });
    const disclosure = disclosureFor(6);
    const row = rowOf(disclosure);
    fireEvent.click(disclosure);
    expect(row.classList.contains(LADDER_EDGE_OPEN)).toBe(true);
    expect(row.classList.contains(LADDER_EDGE_SHUT)).toBe(false);
    fireEvent.click(disclosure);
    expect(row.classList.contains(LADDER_EDGE_SHUT)).toBe(true);
  });

  it('holds only one row open at a time', () => {
    renderPanel({ sampleAnswers: levels });
    fireEvent.click(disclosureFor(6));
    fireEvent.click(disclosureFor(4));
    expect(disclosureFor(6).getAttribute('aria-expanded')).toBe('false');
    expect(disclosureFor(4).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('the disclosure is the whole of a shut row', () => {
  it('is a native button, named for its mark, with its body inert while shut', () => {
    renderPanel({ defaultCollapsed: false, sampleAnswers: [sample({ id: 'a', mark: 4 })] });
    const disclosure = disclosureFor(4);
    expect(disclosure.tagName).toBe('BUTTON');
    expect(disclosure.getAttribute('type')).toBe('button');
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    const body = document.getElementById(disclosure.getAttribute('aria-controls')!)!;
    expect(body.hasAttribute('inert')).toBe(true);
  });

  it('shows the source, the length and the exemplar count in its header line', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [
        sample({ id: 'a', mark: 4, answer: 'Nine words in a model answer for the row.' }),
        sample({ id: 'b', mark: 4, source: 'USER', answer: 'Short student one.' }),
      ],
    });
    const disclosure = disclosureFor(4);
    // The student's own response leads, as it is the one the trust order puts first.
    expect(within(disclosure).getByText('Student')).toBeTruthy();
    expect(within(disclosure).getByText('3 words')).toBeTruthy();
    expect(within(disclosure).getByText('2 exemplars')).toBeTruthy();
  });

  it('names the exemplar’s opening as a two-line clamp while it is shut', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [
        sample({ id: 'a', mark: 6, answer: 'The **membrane** regulates transport.' }),
      ],
    });
    const preview = disclosureFor(6).querySelector('.line-clamp-2') as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.textContent).toBe('The membrane regulates transport.');
    expect(preview.textContent).not.toContain('**');
  });

  it('drops the preview once the row is open, and draws none for a locked exemplar', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: 'Open prose.' })],
    });
    const disclosure = disclosureFor(6);
    expect(disclosure.querySelector('.line-clamp-2')).toBeTruthy();
    fireEvent.click(disclosure);
    expect(disclosure.querySelector('.line-clamp-2')).toBeNull();
  });

  it('draws no preview and no word count for an exemplar the plan withholds', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: '', withheld: true })],
    });
    const disclosure = disclosureFor(6);
    expect(disclosure.querySelector('.line-clamp-2')).toBeNull();
    expect(within(disclosure).getByText('Locked')).toBeTruthy();
    expect(within(disclosure).queryByText(/words$/)).toBeNull();
  });

  it('flags a flagged exemplar in its header', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [
        sample({
          id: 'a',
          mark: 6,
          contentFlag: { reason: 'Looks wrong', flaggedAt: 1, status: 'open' },
        }),
      ],
    });
    expect(within(disclosureFor(6)).getByText('Flagged')).toBeTruthy();
  });

  // A button inside a button is invalid HTML, and it is the restructure this panel
  // exists to keep closed: the carousel is a sibling of the disclosure, never a child.
  it('never nests a button inside a button, with the carousel open', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = renderPanel({
        defaultCollapsed: false,
        sampleAnswers: [sample({ id: 'a', mark: 4 }), sample({ id: 'b', mark: 4, source: 'USER' })],
      });
      fireEvent.click(disclosureFor(4));
      expect(screen.getByRole('button', { name: /next sample/i })).toBeTruthy();
      expect(container.querySelectorAll('button button')).toHaveLength(0);
      const nesting = consoleError.mock.calls.filter((call) =>
        String(call[0]).includes('cannot be a descendant')
      );
      expect(nesting).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('steps the carousel beside the disclosure without toggling the row', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [sample({ id: 'a', mark: 4 }), sample({ id: 'b', mark: 4, source: 'USER' })],
    });
    const disclosure = disclosureFor(4);
    fireEvent.click(disclosure);
    const next = screen.getByRole('button', { name: /next sample/i });
    const prev = screen.getByRole('button', { name: /previous sample/i });
    for (const control of [next, prev]) {
      expect(disclosure.contains(control)).toBe(false);
      expect(control.getAttribute('type')).toBe('button');
    }
    expect(screen.getByText('1/2')).toBeTruthy();
    fireEvent.click(next);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('2/2')).toBeTruthy();
    fireEvent.click(prev);
    expect(screen.getByText('1/2')).toBeTruthy();
  });
});

describe('an open row: the criterion, the picker, the page, then the actions', () => {
  const GUIDE = [
    '6 marks: Explains the membrane in detail, with a worked example',
    '4 marks: Explains the membrane with accurate detail',
    '2 marks: Identifies one feature of the membrane',
  ].join('\n');

  it('opens with the criterion that earns the mark, from the guide, as its own labelled zone', () => {
    renderPanel({
      defaultCollapsed: false,
      markingCriteria: GUIDE,
      sampleAnswers: [sample({ id: 'a', mark: 4 })],
    });
    fireEvent.click(disclosureFor(4));
    const zone = screen.getByRole('group', { name: 'Marking criterion' });
    expect(zone.textContent).toContain('Marking criterion');
    expect(zone.textContent).toContain('4/6');
    expect(zone.textContent).toContain('Explains the membrane with accurate detail');
    // The head is the band's solid strip; the edge is the band's strong edge.
    expect(zone.classList.contains(LADDER_EDGE_OPEN)).toBe(true);
  });

  it('draws no criterion zone when the guide has no row for that level', () => {
    renderPanel({
      defaultCollapsed: false,
      markingCriteria: '6 marks: Explains the membrane in detail',
      sampleAnswers: [sample({ id: 'a', mark: 4 })],
    });
    fireEvent.click(disclosureFor(4));
    expect(screen.queryByRole('group', { name: 'Marking criterion' })).toBeNull();
  });

  it('offers the level’s exemplars as a picker, and folds the tail behind "+N more"', () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) =>
      sample({ id: `m${n}`, mark: 6, answer: `Exemplar ${n}.` })
    );
    renderPanel({ defaultCollapsed: false, sampleAnswers: many });
    fireEvent.click(disclosureFor(6));
    const strip = screen.getByRole('tablist', { name: /exemplars at this mark/i });
    expect(within(strip).getAllByRole('tab')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /\+2 more/i }));
    expect(within(strip).getAllByRole('tab')).toHaveLength(6);
  });

  it('names each chip by where it came from and how long it is', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [
        sample({ id: 'a', mark: 4, source: 'HSC_EXEMPLAR', answer: 'One two three.' }),
        sample({ id: 'b', mark: 4, answer: 'Four five six seven.' }),
      ],
    });
    fireEvent.click(disclosureFor(4));
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs[0].textContent).toMatch(/Official/);
    expect(tabs[0].textContent).toMatch(/3w/);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('leaves a single exemplar with no picker at all', () => {
    renderPanel({ defaultCollapsed: false, sampleAnswers: [sample({ id: 'only', mark: 6 })] });
    fireEvent.click(disclosureFor(6));
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('reads the exemplar on its page, with the actions beneath it', () => {
    renderPanel({
      defaultCollapsed: false,
      userRole: 'teacher',
      onUseSampleAnswer: vi.fn(),
      onContributeSampleAnswer: vi.fn(),
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: 'Page prose.' })],
    });
    fireEvent.click(disclosureFor(6));
    const text = document.querySelector(
      `[class="${sampleAnswerChrome.SAMPLE_PAGE_TEXT}"]`
    ) as HTMLElement;
    const page = text.parentElement!;
    const copy = screen.getByRole('button', { name: /^copy$/i });
    expect(page.className).toBe(sampleAnswerChrome.SAMPLE_PAGE);
    expect(text.textContent).toContain('Page prose.');
    // The reading size is set inline, from the zoom control.
    expect(text.style.fontSize).toBe('15px');
    // The toolbar comes after the page in the document.
    expect(page.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the exemplar actions for a curator, and hides Use and the edit actions from a student', () => {
    const onUseSampleAnswer = vi.fn();
    const onContributeSampleAnswer = vi.fn();
    const { unmount } = renderPanel({
      userRole: 'teacher',
      sampleAnswers: [sample({ id: 'a', mark: 6, feedback: 'Strong link.' })],
      onUseSampleAnswer,
      onContributeSampleAnswer,
    });
    fireEvent.click(disclosureFor(6));
    expect(screen.getByRole('button', { name: /^Use$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy();
    expect(screen.getByTitle(/Flag it for review/i)).toBeTruthy();
    expect(screen.getByTitle('Revise with AI')).toBeTruthy();
    expect(screen.getByTitle('Edit manually')).toBeTruthy();
    expect(screen.getByTitle('Delete')).toBeTruthy();
    unmount();

    renderPanel({ userRole: 'user', sampleAnswers: [sample({ id: 'a', mark: 6 })] });
    fireEvent.click(disclosureFor(6));
    expect(screen.queryByTitle('Delete')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
  });

  it('shows the keywords the exemplar meets, and not the word count a second time', () => {
    renderPanel({
      defaultCollapsed: false,
      keywords: ['membrane', 'diffusion'],
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: 'The membrane controls transport.' })],
    });
    fireEvent.click(disclosureFor(6));
    const row = rowOf(disclosureFor(6));
    expect(within(row).getByText(/1\/2 keywords/)).toBeTruthy();
    // Once in the header line, and not again in the toolbar.
    expect(within(row).getAllByText(/^\d+ words$/)).toHaveLength(1);
  });
});

describe('the Coach’s Tip and Feedback are neutral notes, folded by the reader', () => {
  const noted = [
    sample({ id: 'a', mark: 6, quickTip: 'Tighten the opening.', feedback: 'Solid structure.' }),
  ];

  it('draws each note with a rule and a glyph, and no band or tone fill', () => {
    renderPanel({ defaultCollapsed: false, sampleAnswers: noted });
    fireEvent.click(disclosureFor(6));
    const tip = screen.getByText("Coach's Tip").closest('.border-l-2') as HTMLElement;
    const feedback = screen.getByText('Feedback').closest('.border-l-2') as HTMLElement;
    for (const note of [tip, feedback]) {
      expect(note.className).not.toMatch(/\b(bg|indigo|amber|emerald|sky|violet)-/);
      expect(note.querySelector('svg')).toBeTruthy();
    }
    expect(tip.textContent).toContain('Tighten the opening.');
  });

  it('folds the notes away from the reader’s own toggle', () => {
    renderPanel({ defaultCollapsed: false, sampleAnswers: noted });
    fireEvent.click(disclosureFor(6));
    const toggle = screen.getByRole('button', { name: /Hide Feedback/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: /Show Feedback/i }).getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('shows neither a locked exemplar’s notes nor its prose', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [
        sample({
          id: 'a',
          mark: 6,
          withheld: true,
          quickTip: 'Hidden tip.',
          feedback: 'Hidden feedback.',
        }),
      ],
    });
    fireEvent.click(disclosureFor(6));
    expect(screen.queryByText('Hidden tip.')).toBeNull();
    expect(screen.queryByText('Hidden feedback.')).toBeNull();
  });
});

describe('a locked exemplar is a locked card in its row', () => {
  it('stands in for the page and the actions, with the upgrade', () => {
    renderPanel({
      defaultCollapsed: false,
      userRole: 'teacher',
      onUseSampleAnswer: vi.fn(),
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: '', withheld: true })],
    });
    fireEvent.click(disclosureFor(6));
    expect(screen.getByText(/A Band \d exemplar at 6\/6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /unlock with/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^copy$/i })).toBeNull();
    expect(screen.queryByTitle('Delete')).toBeNull();
  });

  it('shows the exemplar it did send, with its page and its actions', () => {
    renderPanel({
      defaultCollapsed: false,
      sampleAnswers: [sample({ id: 'a', mark: 6, answer: 'Sent prose.' })],
    });
    fireEvent.click(disclosureFor(6));
    expect(screen.queryByRole('button', { name: /unlock with/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
  });
});

describe('the panel’s chrome is pinned', () => {
  const source = readFileSync('utils/sampleAnswerChrome.ts', 'utf8');
  const component = readFileSync('components/SampleAnswersAccordion.tsx', 'utf8');
  const strings = Object.entries(sampleAnswerChrome).filter(
    ([, value]) => typeof value === 'string'
  ) as [string, string][];

  /** A colour utility that names a ground, an ink or a hairline. */
  const colourProperty = (token: string): string | null => {
    const utility = token.split(':').pop() as string;
    const match = utility.match(/^(text|bg|border|from|via|to|shadow|ring|divide)-(.+)$/);
    if (!match) return null;
    const [, property, value] = match;
    if (/^(transparent|current|inherit|none)$/.test(value)) return null;
    const alpha = '(\\/(\\[[^\\]]+\\]|[\\d.]+))?';
    const isColour =
      new RegExp(`^(white|black)${alpha}$`).test(value) ||
      new RegExp(`^[a-z]+-\\d{2,3}${alpha}$`).test(value) ||
      value.startsWith('[rgb(');
    return isColour ? property : null;
  };

  it('has constants to hold to it', () => {
    expect(strings.length).toBeGreaterThanOrEqual(25);
  });

  it('documents every export with a doc comment, saying what it is painted on', () => {
    const exports = Array.from(source.matchAll(/^export const (\w+)/gm)).map((m) => m[1]);
    expect(exports.length).toBe(strings.length);
    for (const name of exports) {
      const index = source.indexOf(`export const ${name}`);
      const before = source.slice(0, index).trimEnd();
      expect(before.endsWith('*/'), `${name} has no doc comment`).toBe(true);
      const comment = before.slice(before.lastIndexOf('/**'));
      expect(comment, `${name} does not say what it is painted on`).toMatch(/[Pp]ainted/);
    }
  });

  it('uses every export in the component, so none is dead', () => {
    for (const [name] of strings) {
      expect(component.includes(name), `${name} is exported but the panel never uses it`).toBe(
        true
      );
    }
  });

  it('names no hex colour, and no band palette colour: the tier comes from --band-rgb', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} names a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(value, `${name} names a band palette colour`).not.toMatch(
        /\b(red|orange|yellow|green|blue|purple|amber|emerald|violet|indigo|sky)-\d{2,3}\b/
      );
    }
  });

  it('is dark-first: no light: variant anywhere', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} still uses the legacy light: variant`).not.toContain('light:');
    }
  });

  it('gives every colour on a themed surface a dark: partner', () => {
    for (const [name, value] of strings) {
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
        if (!property) continue;
        expect(themed.has(property), `${name} sets \`${token}\` with no dark: partner`).toBe(true);
      }
    }
  });

  it('holds the figures and the captions to the contrast floor in both themes', () => {
    // slate-700 is 10:1 on white and slate-300 is about 10:1 on the dark ground, both
    // above AA on the band wash; slate-500 is not, on the dark one.
    expect(sampleAnswerChrome.SAMPLE_ROW_FIGURE).toContain('text-slate-700');
    expect(sampleAnswerChrome.SAMPLE_ROW_FIGURE).toContain('dark:text-slate-300');
    expect(sampleAnswerChrome.SAMPLE_ROW_PREVIEW).toContain('text-slate-700');
    expect(sampleAnswerChrome.SAMPLE_ROW_PREVIEW).toContain('dark:text-slate-300');
    expect(sampleAnswerChrome.SAMPLE_PAGE_TEXT).toContain('text-slate-800');
  });

  it('dims nothing with opacity, and animates nothing forever', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} dims with opacity`).not.toMatch(/(^|\s)opacity-/);
      expect(value, `${name} runs forever`).not.toMatch(/animate-(ping|pulse|bounce|spin)/);
    }
  });

  it('transitions only the properties it names, and never all', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} transitions \`all\``).not.toMatch(/(^|\s)transition-all(\s|$)/);
    }
  });

  it('gates every hover to a device that can hover', () => {
    for (const [name, value] of strings) {
      for (const token of value.split(/\s+/)) {
        if (!/(^|:)(group-)?hover([/:]|$)/.test(token)) continue;
        expect(token, `${name} has an ungated hover: ${token}`).toMatch(/(^|:)can-hover:/);
      }
    }
  });

  it('draws every focus ring in both themes, inset because the row clips', () => {
    for (const [name, value] of strings) {
      if (!value.includes('focus-visible:ring-')) continue;
      expect(value, `${name} has a focus ring with no dark partner`).toContain(
        'dark:focus-visible:ring-'
      );
      expect(value, `${name} draws its focus ring outside the box`).toContain(
        'focus-visible:ring-inset'
      );
    }
  });

  it('gives every touch target a 44px height on a phone, and returns it to its own size from sm', () => {
    for (const name of [
      'SAMPLE_ACTION',
      'SAMPLE_PICKER_TAB',
      'SAMPLE_ZOOM_BUTTON',
      'SAMPLE_CAROUSEL_BUTTON',
      'SAMPLE_NOTE_TOGGLE',
    ] as const) {
      const value = sampleAnswerChrome[name];
      expect(value, `${name} is under 44px on a phone`).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(value, `${name} keeps the phone height at desktop`).toContain('sm:min-h-0');
    }
  });

  it('wraps the toolbar and the picker, so no control is clipped at 390px', () => {
    expect(sampleAnswerChrome.SAMPLE_ACTIONS).toContain('flex-wrap');
    expect(sampleAnswerChrome.SAMPLE_ACTION_GROUP).toContain('flex-wrap');
    expect(sampleAnswerChrome.SAMPLE_PICKER).toContain('flex-wrap');
    expect(sampleAnswerChrome.SAMPLE_TOOLS).toContain('flex-wrap');
  });

  it('clamps the preview to two lines and never to one', () => {
    expect(sampleAnswerChrome.SAMPLE_ROW_PREVIEW).toContain('line-clamp-2');
    expect(sampleAnswerChrome.SAMPLE_ROW_PREVIEW).not.toContain('truncate');
  });

  it('keeps the page and the notes on the reading face', () => {
    expect(sampleAnswerChrome.SAMPLE_PAGE_TEXT).toContain('font-serif');
    expect(sampleAnswerChrome.SAMPLE_ROW_PREVIEW).toContain('font-serif');
  });

  it('keeps the row rhythm and the gutter the guide draws', () => {
    expect(LADDER_STACK).toBe('space-y-2');
    expect(LADDER_GUTTER).toContain('w-[4.5rem]');
    expect(LADDER_GUTTER).toContain('sm:w-20');
  });
});
