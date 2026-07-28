import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReferenceMaterials, { AccordionSection } from '../../components/ReferenceMaterials';
import { PanelReadChip, useOpenedOnce } from '../../components/PanelDisclosure';
import { Prompt, PromptVerb } from '../../types';

/**
 * Every panel under the workspace now starts shut, which buys a calm page but
 * costs the one thing an open panel gave for free: knowing at a glance what
 * you had already looked at. A panel that has been opened and shut again says
 * so — and forgets it when the student moves to another question, because
 * "read" means read for THIS question.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Explain the roles of mRNA and tRNA in polypeptide synthesis.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 6,
    keywords: ['mRNA'],
    markingCriteria: '6 marks: Explains both roles thoroughly.',
    sampleAnswers: [],
    ...over,
  }) as Prompt;

const railProps = {
  onKeywordsChange: vi.fn(),
  onMarkingCriteriaChange: vi.fn(),
  isEnriching: false,
  onRegenerateKeywords: vi.fn(),
  isRegeneratingKeywords: false,
  regenerateError: null,
  onSuggestKeywords: vi.fn(),
  isSuggestingKeywords: false,
  suggestError: null,
  userRole: 'student' as const,
};

describe('the reference rail arrives closed', () => {
  it('opens nothing on its own', () => {
    render(<ReferenceMaterials {...railProps} prompt={prompt()} topic={undefined} />);

    const panels = Array.from(document.querySelectorAll('button[aria-expanded]'));
    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) {
      expect(panel.getAttribute('aria-expanded')).toBe('false');
    }
  });
});

describe('the read marker', () => {
  const openable = () => (
    <AccordionSection title="Marking Guide" icon={<span />} resetKey="p1">
      <p>criteria</p>
    </AccordionSection>
  );

  it('appears only after a panel has been opened AND shut', () => {
    render(openable());
    const header = screen.getByRole('button', { name: /Marking Guide/i });

    expect(screen.queryByText(/^Read$/i)).toBeNull();
    fireEvent.click(header);
    expect(screen.queryByText(/^Read$/i)).toBeNull();
    fireEvent.click(header);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();
  });

  it('is forgotten when the student moves to another question', () => {
    const Harness = () => {
      const [id, setId] = useState('p1');
      return (
        <>
          <button onClick={() => setId('p2')}>next question</button>
          <AccordionSection title="Marking Guide" icon={<span />} resetKey={id}>
            <p>criteria</p>
          </AccordionSection>
        </>
      );
    };
    render(<Harness />);

    const header = screen.getByRole('button', { name: /Marking Guide/i });
    fireEvent.click(header);
    fireEvent.click(header);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.queryByText(/^Read$/i)).toBeNull();
  });

  it('survives a re-render that changes nothing', () => {
    const { rerender } = render(openable());
    const header = screen.getByRole('button', { name: /Marking Guide/i });
    fireEvent.click(header);
    fireEvent.click(header);

    rerender(openable());
    expect(screen.getByText(/^Read$/i)).toBeTruthy();
  });
});

describe('useOpenedOnce', () => {
  const Probe: React.FC<{ open: boolean; resetKey?: string }> = ({ open, resetKey }) => (
    <PanelReadChip show={useOpenedOnce(open, resetKey) && !open} />
  );

  it('latches on the first open and stays latched', () => {
    const { rerender } = render(<Probe open={false} />);
    expect(screen.queryByText(/^Read$/i)).toBeNull();

    rerender(<Probe open={true} />);
    rerender(<Probe open={false} />);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();

    rerender(<Probe open={true} />);
    rerender(<Probe open={false} />);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();
  });

  it('clears the moment the key changes, not a frame later', () => {
    const { rerender } = render(<Probe open={false} resetKey="p1" />);
    rerender(<Probe open={true} resetKey="p1" />);
    rerender(<Probe open={false} resetKey="p1" />);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();

    rerender(<Probe open={false} resetKey="p2" />);
    expect(screen.queryByText(/^Read$/i)).toBeNull();
  });
});
