import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  markSupportOpened,
  readSupportUsage,
  registerSupport,
  resetSupportEngagement,
} from '../../utils/supportEngagement';
import SupportUsageSummary from '../../components/SupportUsageSummary';

/**
 * The workspace folds every support shut, so a student can write an answer
 * having read none of them and then be told, in the feedback, something the
 * marking guide had already said. The record below is what lets the report say
 * that once, concretely — and it has to be honest in both directions: only
 * supports that were actually on offer count, and opening one twice is still
 * opening it once.
 */

beforeEach(() => resetSupportEngagement());
afterEach(cleanup);

describe('support engagement record', () => {
  it('separates what was on offer from what was opened', () => {
    registerSupport('p1', 'markingGuide');
    registerSupport('p1', 'sampleAnswers');
    registerSupport('p1', 'keywords');
    markSupportOpened('p1', 'sampleAnswers');

    const usage = readSupportUsage('p1');
    expect(usage.available).toEqual(['keywords', 'markingGuide', 'sampleAnswers']);
    expect(usage.opened).toEqual(['sampleAnswers']);
    expect(usage.skipped).toEqual(['keywords', 'markingGuide']);
  });

  it('counts an opening once, however many times it happens', () => {
    registerSupport('p1', 'markingGuide');
    markSupportOpened('p1', 'markingGuide');
    markSupportOpened('p1', 'markingGuide');

    expect(readSupportUsage('p1').opened).toEqual(['markingGuide']);
  });

  it('keeps questions apart', () => {
    registerSupport('p1', 'markingGuide');
    markSupportOpened('p1', 'markingGuide');
    registerSupport('p2', 'markingGuide');

    expect(readSupportUsage('p2').opened).toEqual([]);
    expect(readSupportUsage('p2').skipped).toEqual(['markingGuide']);
  });

  it('reports nothing for a question it never saw', () => {
    expect(readSupportUsage('unknown')).toEqual({ available: [], opened: [], skipped: [] });
  });
});

describe('the feedback summary', () => {
  const registerFive = () => {
    (['outcomes', 'keywords', 'gradeStandards', 'markingGuide', 'sampleAnswers'] as const).forEach(
      (id) => registerSupport('p1', id)
    );
  };

  it('names the supports that were skipped, and what they would have said', () => {
    registerFive();
    markSupportOpened('p1', 'keywords');
    markSupportOpened('p1', 'outcomes');

    render(<SupportUsageSummary promptId="p1" />);

    expect(screen.getByText(/You opened 2 of 5 supports/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /show all 5/i }));
    expect(screen.getByText(/the criteria your answer is scored against/i)).toBeTruthy();
  });

  it('says so plainly when nothing was opened', () => {
    registerFive();

    render(<SupportUsageSummary promptId="p1" />);

    expect(screen.getByText(/without opening any of the 5 supports/i)).toBeTruthy();
  });

  it('credits a student who opened everything', () => {
    registerSupport('p1', 'markingGuide');
    registerSupport('p1', 'sampleAnswers');
    markSupportOpened('p1', 'markingGuide');
    markSupportOpened('p1', 'sampleAnswers');

    render(<SupportUsageSummary promptId="p1" />);

    expect(screen.getByText(/You opened all 2 supports/i)).toBeTruthy();
  });

  it('stays silent when there is nothing worth reporting', () => {
    const { container } = render(<SupportUsageSummary promptId="never-seen" />);
    expect(container.firstChild).toBeNull();
  });
});
