import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import Editor from '../../components/Editor';
import LiveInsights from '../../components/LiveInsights';
import WritingMetricsDashboard from '../../components/WritingMetricsDashboard';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { PANEL_SURFACE } from '../../utils/panelStyles';
import {
  CARD_HEADER_BAR,
  CARD_HEADER_BOX,
  CARD_HEADER_ICON,
  CARD_HEADER_IDENTITY,
  CARD_HEADER_META_ROW,
  CARD_HEADER_ROW,
  CARD_HEADER_TITLE,
  CARD_HEADER_TITLE_BLOCK,
  CARD_HEADER_TRAY,
} from '../../utils/cardChrome';
import { Prompt, PromptVerb } from '../../types';

/**
 * Two pieces of workspace chrome that user testing kept catching.
 *
 * 1. "Writing Prompt" and "Written Response" have to sit on the same line as
 *    each other. The two headers are stretched to a shared height but hold
 *    different things, so anything that centres their content lands the two
 *    headings a few pixels apart — an offset that then moves with zoom and with
 *    every width at which the chrome wraps.
 * 2. Everything below the two cards is reference material of one weight, and
 *    should look it. The live writing stats had drifted onto their own heavier
 *    surface.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
  freeEvalsRemaining: () => Infinity,
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: ['helicase'],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const promptProps = {
  prompt: prompt(),
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

/**
 * The header box a heading sits in, and the rows between the two.
 *
 * The box is recognised by the radius token `CARD_HEADER_BOX` actually carries,
 * read from the constant rather than written out here. It used to look for the
 * literal `rounded-t-[30px]`; when that value was given a name
 * (`rounded-t-surface-inner`, DesignSpec §3) the walk ran off the top of the
 * tree and both assertions started reading `<body>`, which has no className and
 * fails in a way that says nothing about the layout this is guarding.
 */
const HEADER_RADIUS_CLASS =
  CARD_HEADER_BOX.split(/\s+/).find((c) => c.startsWith('rounded-')) ?? '';

const headingChain = (heading: HTMLElement): HTMLElement[] => {
  const chain: HTMLElement[] = [];
  let el = heading.parentElement;
  while (el && !el.className.includes(HEADER_RADIUS_CLASS)) {
    chain.push(el);
    el = el.parentElement;
  }
  expect(el, 'never found the card header box walking up from the heading').toBeTruthy();
  if (el) chain.push(el);
  return chain;
};

describe('the two card headings sit on the same line', () => {
  it('pins the question card header to the top, never centred', () => {
    const { getByText } = render(<PromptDisplay {...promptProps} />);
    const chain = headingChain(getByText('Writing Prompt'));

    expect(chain.length).toBeGreaterThan(0);
    for (const el of chain) {
      expect(el.className).not.toMatch(/(^|\s)items-center/);
    }
    expect(chain[chain.length - 1].className).toMatch(/items-start/);
  });

  it('pins the writing card header to the top in exactly the same way', () => {
    const { getByText } = render(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );
    const chain = headingChain(getByText('Written Response'));

    expect(chain.length).toBeGreaterThan(0);
    for (const el of chain) {
      expect(el.className).not.toMatch(/(^|\s)items-center/);
    }
    expect(chain[chain.length - 1].className).toMatch(/items-start/);
  });

  it('gives both title blocks the same step down from the top', () => {
    const { getByText: promptText } = render(<PromptDisplay {...promptProps} />);
    const { getByText: editorText } = render(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );

    // The heading's own block: whatever padding lifts it off the top of the
    // card has to be identical on both, or the alignment is undone by it.
    const promptBlock = promptText('Writing Prompt').closest('div');
    const editorBlock = editorText('Written Response').closest('div');
    const padding = (el: Element | null) => (el?.className.match(/\bpt-[\d.]+\b/) ?? ['none'])[0];

    expect(padding(promptBlock)).toBe(padding(editorBlock));
  });
});

/**
 * The two headers are the same object twice. Held apart in two files they
 * drifted every time either was touched — different paddings, different title
 * sizes, a toolbar beside the heading on one card and a pill bar in the corner
 * on the other. Both now build from utils/cardChrome, and this is what says so.
 */
describe('the two headers are built from one vocabulary', () => {
  const headerOf = (heading: HTMLElement) =>
    heading.closest('[class*="rounded-t-"]') as HTMLElement;

  const renderPromptHeader = () => {
    const { getByText } = render(<PromptDisplay {...promptProps} />);
    return { heading: getByText('Writing Prompt'), header: headerOf(getByText('Writing Prompt')) };
  };

  const renderEditorHeader = () => {
    const { getByText } = render(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );
    return {
      heading: getByText('Written Response'),
      header: headerOf(getByText('Written Response')),
    };
  };

  it('dresses both header boxes and rows identically', () => {
    const prompt = renderPromptHeader();
    const editor = renderEditorHeader();

    for (const { header } of [prompt, editor]) {
      expect(header.className).toContain(CARD_HEADER_BOX);
      expect(header.querySelector(`div[class*="${CARD_HEADER_ROW.split(' ')[0]}"]`)).toBeTruthy();
    }
    // The row, the icon tile, the identity block: byte for byte the same.
    for (const cls of [CARD_HEADER_ROW, CARD_HEADER_IDENTITY, CARD_HEADER_ICON]) {
      expect(prompt.header.innerHTML).toContain(cls);
      expect(editor.header.innerHTML).toContain(cls);
    }
  });

  it('gives both headings the same block, size and meta line', () => {
    const prompt = renderPromptHeader();
    const editor = renderEditorHeader();

    for (const { heading, header } of [prompt, editor]) {
      expect(heading.className).toContain(CARD_HEADER_TITLE);
      expect(heading.parentElement?.className).toContain(CARD_HEADER_TITLE_BLOCK);
      expect(header.innerHTML).toContain(CARD_HEADER_META_ROW);
    }
  });

  // The bar in the bottom-right corner is the clearest signal that the two
  // cards belong together: the question's stats on one side, the writing tools
  // on the other, same tray, same height, same fill.
  it('docks a bar of the same build in both bottom-right corners', () => {
    const prompt = renderPromptHeader();
    const editor = renderEditorHeader();

    for (const { header } of [prompt, editor]) {
      const tray = header.querySelector(`div[class*="self-stretch"]`);
      expect(tray?.className).toContain(CARD_HEADER_TRAY);
      expect(
        tray?.innerHTML.includes(CARD_HEADER_BAR) || tray?.firstElementChild?.className
      ).toBeTruthy();
      expect(header.innerHTML).toContain(CARD_HEADER_BAR);
    }
  });

  it('keeps the writing tools out of the title row', () => {
    const { header, heading } = renderEditorHeader();
    const tray = header.querySelector('div[class*="self-stretch"]');

    // The reading-size controls are in the tray, not beside the title.
    expect(tray?.querySelector('button[aria-label="Smaller text"]')).toBeTruthy();
    expect(heading.parentElement?.querySelector('button[aria-label="Smaller text"]')).toBeNull();
  });
});

describe('the panels below the cards share one surface', () => {
  const surfaceOf = (container: HTMLElement) => container.firstElementChild?.className ?? '';

  it('dresses the live writing stats like every other panel', () => {
    const { container } = render(
      <WritingMetricsDashboard userAnswer="" prompt={prompt()} onAddWord={vi.fn()} />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });

  it('dresses Live Insights the same way', () => {
    const { container } = render(
      <LiveInsights insights={[{ id: 'i1', tone: 'info', message: 'Add a second point.' }]} />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });

  it('dresses the exemplars the same way', () => {
    const { container } = render(
      <SampleAnswersAccordion
        prompt={prompt()}
        onSampleAnswerGenerated={vi.fn()}
        onUseSampleAnswer={vi.fn()}
        onDeleteSampleAnswer={vi.fn()}
        onUpdateSampleAnswer={vi.fn()}
        userRole="user"
      />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });
});
