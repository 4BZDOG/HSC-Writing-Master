import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DraftCheck from '../../components/DraftCheck';
import type { WritingInsight } from '../../utils/writingAnalysis';

/**
 * The draft check as a checklist: the ring and its count, the terms a student
 * can add with one press, and the same keyboard behaviour as the panels around
 * it. `draftCheckPanel.test.tsx` holds the disclosure itself.
 */

afterEach(cleanup);

const insight = (id: string, message: string): WritingInsight => ({
  id,
  tone: 'info',
  message,
});

const MISSING_TERMS = ['osmosis', 'diffusion'];

const TERMS_MISSING: WritingInsight[] = [
  insight('keywords-missing', 'Weave in 2 more syllabus terms: osmosis, diffusion.'),
];

const header = () => screen.getByRole('button', { name: /Draft check/i });

describe('DraftCheck as a checklist', () => {
  describe('the ring', () => {
    it('shows how many checks are clear, in the ring and in words', () => {
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          defaultCollapsed
        />
      );

      // Length and sentences are clear; the terms check is not. The count in
      // the ring is the same as the words beside it, so colour is not the only
      // signal of progress.
      expect(within(header()).getByText('2')).toBeTruthy();
      expect(screen.getByText('2 of 3 checks clear')).toBeTruthy();
    });

    it('turns the ring emerald and says so once every check is clear', () => {
      const { container } = render(
        <DraftCheck
          insights={[insight('length-good', 'A full-mark length.')]}
          wordCount={60}
          defaultCollapsed
        />
      );

      expect(screen.getByText('All checks clear')).toBeTruthy();
      const progress = container.querySelectorAll('svg circle')[1];
      expect(progress.getAttribute('class')).toContain('stroke-emerald-600');
    });

    it('keeps the ring amber while work remains', () => {
      const { container } = render(
        <DraftCheck insights={TERMS_MISSING} wordCount={60} missingTerms={MISSING_TERMS} />
      );
      const progress = container.querySelectorAll('svg circle')[1];
      expect(progress.getAttribute('class')).toContain('stroke-amber-600');
    });

    it('rests on a dash rather than a nought while the draft is blank', () => {
      const { container } = render(<DraftCheck insights={[]} wordCount={0} />);

      expect(within(header()).getByText('—')).toBeTruthy();
      expect(container.querySelectorAll('svg circle')[1].getAttribute('class')).toContain(
        'stroke-slate-400'
      );
    });
  });

  describe('the checklist', () => {
    it('lists each check with its status word and its detail', () => {
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          defaultCollapsed={false}
        />
      );

      expect(screen.getByText('Length')).toBeTruthy();
      expect(screen.getByText('Syllabus terms')).toBeTruthy();
      expect(screen.getByText('Sentences')).toBeTruthy();
      expect(screen.getByText('To do')).toBeTruthy();
      expect(screen.getAllByText('Clear').length).toBe(2);
      expect(screen.getByText('Weave in 2 more syllabus terms: osmosis, diffusion.')).toBeTruthy();
    });

    it('offers each missing term as a chip, labelled with the word itself', () => {
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          onInsertTerm={vi.fn()}
          defaultCollapsed={false}
        />
      );

      expect(screen.getByRole('button', { name: 'osmosis' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'diffusion' })).toBeTruthy();
    });

    it('calls onInsertTerm with the term that was pressed', () => {
      const onInsertTerm = vi.fn();
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          onInsertTerm={onInsertTerm}
          defaultCollapsed={false}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'diffusion' }));
      expect(onInsertTerm).toHaveBeenCalledTimes(1);
      expect(onInsertTerm).toHaveBeenCalledWith('diffusion');
    });

    it('offers no chips when nothing is wired to insert them', () => {
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          defaultCollapsed={false}
        />
      );

      expect(screen.queryByRole('button', { name: 'osmosis' })).toBeNull();
    });

    it('gives each chip a touch target of at least 44px on a phone', () => {
      render(
        <DraftCheck
          insights={TERMS_MISSING}
          wordCount={60}
          missingTerms={MISSING_TERMS}
          onInsertTerm={vi.fn()}
          defaultCollapsed={false}
        />
      );

      expect(screen.getByRole('button', { name: 'osmosis' }).className).toContain('min-h-11');
    });
  });

  describe('the disclosure', () => {
    it('opens from the keyboard as well as the pointer', async () => {
      const user = userEvent.setup();
      render(<DraftCheck insights={TERMS_MISSING} wordCount={60} />);

      expect(header().getAttribute('aria-expanded')).toBe('false');
      header().focus();
      await user.keyboard('{Enter}');
      expect(header().getAttribute('aria-expanded')).toBe('true');

      await user.keyboard(' ');
      expect(header().getAttribute('aria-expanded')).toBe('false');
    });

    it('is not reachable from the keyboard while it is resting', () => {
      render(<DraftCheck insights={[]} wordCount={0} />);
      expect((header() as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps its checklist inert while folded, so its chips are out of reach', () => {
      render(<DraftCheck insights={TERMS_MISSING} wordCount={60} onInsertTerm={vi.fn()} />);
      // `useId` ids contain colons, so look the body up by id rather than by selector.
      const body = document.getElementById(header().getAttribute('aria-controls') ?? '');
      expect(body?.hasAttribute('inert')).toBe(true);
    });
  });
});
