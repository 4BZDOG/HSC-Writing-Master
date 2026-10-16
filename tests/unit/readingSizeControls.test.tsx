import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import Editor from '../../components/Editor';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { PromptVerb, Prompt } from '../../types';
import { READING_SIZE_MAX, READING_SIZE_MIN } from '../../utils/readingSize';

/**
 * The question card, the writing surface and the exemplars share one reading
 * size, and each has its own pair of zoom buttons. They must agree on where the
 * range ends: the same size disables the same button on all three. Before the
 * shared range, the question card allowed 48 and the other two stopped at 32, so
 * a size of 40 left the writing surface's zoom-in greyed out.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

type Surface = 'question card' | 'writing surface' | 'exemplars';

/** One surface at one size, with its two zoom buttons and the size it reports. */
const renderSurface = (surface: Surface, size: number, onChange = vi.fn()) => {
  if (surface === 'question card') {
    const prompt = {
      id: 'p1',
      question: 'Explain how the cell membrane regulates transport.',
      verb: 'EXPLAIN' as PromptVerb,
      totalMarks: 6,
      keywords: [],
      sampleAnswers: [],
      linkedOutcomes: [],
    } as unknown as Prompt;
    render(
      <PromptDisplay
        prompt={prompt}
        isEnriching={false}
        enrichError={null}
        onVerbClick={vi.fn()}
        onGenerateScenario={vi.fn()}
        onUpdatePrompt={vi.fn()}
        isGeneratingScenario={false}
        generateScenarioError={null}
        courseOutcomes={[]}
        onOutcomeClick={vi.fn()}
        userRole="user"
        onDismissEnrichError={vi.fn()}
        onRunQualityCheck={vi.fn()}
        onSuggestOutcomes={vi.fn()}
        isSuggestingOutcomes={false}
        fontSize={size}
        onFontSizeChange={onChange}
      />
    );
    return {
      down: screen.getByRole('button', { name: 'Decrease reading size' }),
      up: screen.getByRole('button', { name: 'Increase reading size' }),
    };
  }

  if (surface === 'writing surface') {
    render(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'EXPLAIN' as PromptVerb}
        writingMode="coach"
        syncedFontSize={size}
        onFontSizeChange={onChange}
      />
    );
    return {
      down: screen.getByRole('button', { name: 'Smaller text' }),
      up: screen.getByRole('button', { name: 'Larger text' }),
    };
  }

  const prompt = {
    id: 'p1',
    question: 'Explain how the cell membrane regulates transport.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 6,
    keywords: [],
    markingCriteria: '',
    sampleAnswers: [],
  } as unknown as Prompt;
  render(
    <SampleAnswersAccordion
      prompt={prompt}
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      userRole="user"
      defaultCollapsed={false}
      fontSize={size}
      onFontSizeChange={onChange}
    />
  );
  return {
    down: screen.getByTitle('Decrease text size'),
    up: screen.getByTitle('Increase text size'),
  };
};

const SURFACES: Surface[] = ['question card', 'writing surface', 'exemplars'];

/** Whether each button is disabled, as a pair: [smaller, larger]. */
const disabledPair = (surface: Surface, size: number): [boolean, boolean] => {
  const { down, up } = renderSurface(surface, size);
  const pair: [boolean, boolean] = [
    (down as HTMLButtonElement).disabled,
    (up as HTMLButtonElement).disabled,
  ];
  cleanup();
  return pair;
};

describe('the three reading-size controls disable at the same limits', () => {
  it.each([12, 14, 40, 46, 48])('agree with each other at %i', (size) => {
    const pairs = SURFACES.map((surface) => disabledPair(surface, size));
    // Every surface answers the same question the same way…
    expect(new Set(pairs.map((p) => p.join(','))).size).toBe(1);
  });

  it('disables only the smaller button at the minimum, and only the larger at the maximum', () => {
    expect(disabledPair('question card', READING_SIZE_MIN)).toEqual([true, false]);
    expect(disabledPair('writing surface', READING_SIZE_MIN)).toEqual([true, false]);
    expect(disabledPair('exemplars', READING_SIZE_MIN)).toEqual([true, false]);

    expect(disabledPair('question card', READING_SIZE_MAX)).toEqual([false, true]);
    expect(disabledPair('writing surface', READING_SIZE_MAX)).toEqual([false, true]);
    expect(disabledPair('exemplars', READING_SIZE_MAX)).toEqual([false, true]);
  });

  it('leaves both buttons working at 40, which the writing surface and exemplars used to block', () => {
    for (const surface of SURFACES) {
      expect(disabledPair(surface, 40)).toEqual([false, false]);
    }
  });

  it.each(SURFACES)('steps the %s to the top of the range and no further', (surface) => {
    const onChange = vi.fn();
    const { up } = renderSurface(surface, 46, onChange);
    fireEvent.click(up);
    expect(onChange).toHaveBeenLastCalledWith(48);
    cleanup();

    const again = vi.fn();
    const atTop = renderSurface(surface, 48, again);
    fireEvent.click(atTop.up);
    expect(again).not.toHaveBeenCalled();
  });
});
