import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import Combobox from '../../components/Combobox';
import { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * Volume is the point at which both of these stop working.
 *
 * A dot point accumulates questions and a generated batch drops five exemplars
 * onto one mark, and the two flat lists that result say nothing about what
 * distinguishes their contents. "2 of 5" turns five exemplars into a shuffle,
 * and twenty tinted question cards in a row are a wall rather than a choice.
 * Both are answered the same way: name what varies, and lead with the ones
 * worth reading first.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  screenContentQuality: vi.fn(),
}));

afterEach(cleanup);

const sample = (id: string, over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id,
    mark: 6,
    answer: 'A model response about polypeptide synthesis that runs to a few words.',
    feedback: '',
    source: 'AI',
    ...over,
  }) as SampleAnswer;

const prompt = (samples: SampleAnswer[]): Prompt =>
  ({
    id: 'p1',
    question: 'Explain the roles of mRNA and tRNA.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 6,
    keywords: [],
    linkedOutcomes: [],
    markingCriteria: '',
    sampleAnswers: samples,
  }) as Prompt;

const renderSamples = (samples: SampleAnswer[]) =>
  render(
    <SampleAnswersAccordion
      prompt={prompt(samples)}
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      userRole="user"
      defaultCollapsed={false}
    />
  );

describe('many exemplars at one mark', () => {
  const six = [
    sample('a1'),
    sample('a2'),
    sample('a3'),
    sample('a4'),
    sample('u1', { source: 'USER' }),
    sample('h1', { source: 'HSC_EXEMPLAR' }),
  ];

  it('says how many exemplars there are, not just how many levels', () => {
    renderSamples([...six, sample('b1', { mark: 4 })]);
    expect(screen.getByText(/2 levels · 7 exemplars/i)).toBeTruthy();
  });

  it('offers a named exemplar per variant instead of blind arrows', () => {
    renderSamples(six);
    fireEvent.click(screen.getByRole('button', { name: /6\/6 Marks/i }));

    const strip = screen.getByRole('tablist', { name: /exemplars at this mark/i });
    // The verified exemplar leads — it is the one closest to a real marked HSC
    // response, so it is what a student should read first.
    const tabs = within(strip).getAllByRole('tab');
    expect(tabs[0].textContent).toMatch(/Official/);
    expect(tabs[1].textContent).toMatch(/Student/);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('folds the tail away rather than spending four rows on chips', () => {
    renderSamples(six);
    fireEvent.click(screen.getByRole('button', { name: /6\/6 Marks/i }));

    const strip = screen.getByRole('tablist', { name: /exemplars at this mark/i });
    expect(within(strip).getAllByRole('tab')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /\+2 more/i }));
    expect(within(strip).getAllByRole('tab')).toHaveLength(6);
  });

  it('leaves a single exemplar with no picker at all', () => {
    renderSamples([sample('only')]);
    fireEvent.click(screen.getByRole('button', { name: /6\/6 Marks/i }));

    expect(screen.queryByRole('tablist', { name: /exemplars at this mark/i })).toBeNull();
  });
});

describe('a long question list', () => {
  // jsdom has no layout, so the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();

  const options = [
    { id: 'q1', label: 'Identify one feature.', group: 'Remember & List', tier: 1 },
    { id: 'q2', label: 'Describe the process.', group: 'Define & Describe', tier: 2 },
    { id: 'q3', label: 'Describe the second process.', group: 'Define & Describe', tier: 2 },
    { id: 'q4', label: 'Analyse the impact.', group: 'Analyse & Apply', tier: 4 },
  ];

  it('breaks into named runs, one heading per group', () => {
    render(
      <Combobox options={options} value="" onChange={vi.fn()} label={null} placeholder="Pick" />
    );
    fireEvent.click(screen.getByRole('button'));

    // Three headings for four questions: the two Describe questions share one.
    expect(screen.getAllByText('Define & Describe')).toHaveLength(1);
    expect(screen.getByText('Remember & List')).toBeTruthy();
    expect(screen.getByText('Analyse & Apply')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('leaves an ungrouped list flat', () => {
    render(
      <Combobox
        options={options.map(({ group: _group, ...rest }) => rest)}
        value=""
        onChange={vi.fn()}
        label={null}
        placeholder="Pick"
      />
    );
    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Define & Describe')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });
});
