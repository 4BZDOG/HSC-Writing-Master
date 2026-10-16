import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import CommandTermGuideModal from '../../components/CommandTermGuideModal';
import { getCommandTermInfo } from '../../data/commandTerms';
import { explainOutcomeInContext } from '../../services/geminiService';
import { AICache } from '../../services/aiCache';
import { CourseOutcome, Prompt, PromptVerb } from '../../types';

/**
 * Keyboard users open three things from the prompt card and close them again:
 * the outcome brief ("Read before you write"), the command verb guide (the verb
 * chip in the card's meta line) and the flag dialog (the flag button in the
 * footer). Each must hand focus back to the button that opened it, whichever way
 * it is closed. Losing that puts focus on <body>, and the next Tab starts again
 * from the top of the page.
 *
 * The verb guide is mounted by Workspace, not by the card, so the harness below
 * mounts it the same way: beside the card, driven by a flag the card's verb
 * button sets.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

const outcomes: CourseOutcome[] = [
  { code: 'SE-12-01', description: 'Justifies the selection of software development approaches.' },
  { code: 'SE-12-03', description: 'Analyses how hardware and software influence engineering.' },
];

const prompt = {
  id: 'p1',
  question: 'Assess the impact of emerging technologies on software development.',
  verb: 'ASSESS' as PromptVerb,
  totalMarks: 8,
  keywords: [],
  sampleAnswers: [],
  linkedOutcomes: outcomes.map((o) => o.code),
} as unknown as Prompt;

const cardProps = {
  prompt,
  isEnriching: false,
  enrichError: null,
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: outcomes,
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

/** The card with its verb guide, wired as Workspace wires them. */
const CardWithGuide: React.FC = () => {
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <>
      <PromptDisplay {...cardProps} onVerbClick={() => setGuideOpen(true)} />
      <CommandTermGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        termInfo={getCommandTermInfo('ASSESS' as PromptVerb)}
        marks={prompt.totalMarks}
        band={3}
      />
    </>
  );
};

beforeEach(() => {
  // The outcome chips ask for hover support on focus; jsdom has no matchMedia.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('hover: hover'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
  vi.mocked(explainOutcomeInContext).mockResolvedValue(
    '### What this outcome is asking for\nAssess the trade-offs.'
  );
  vi.spyOn(AICache, 'get').mockResolvedValue(undefined as never);
  vi.spyOn(AICache, 'set').mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

/** Escape goes to whatever holds focus, as it does for a real key press. */
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

/**
 * Open a trigger the way a keyboard or pointer user does: it holds focus, then
 * it is activated. `fireEvent.click` alone does not move focus in jsdom.
 */
const activate = (opener: HTMLElement) => {
  opener.focus();
  fireEvent.click(opener);
};

describe('focus returns to the prompt card’s triggers', () => {
  describe('"Read before you write" opens the outcome brief', () => {
    const opener = () => screen.getByRole('button', { name: /Read before you write/ });

    it('returns focus to the button when the brief is closed with its close button', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);

      const brief = screen.getByRole('dialog', { name: 'SE-12-01' });
      fireEvent.click(within(brief).getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('returns focus to the button when the brief is closed with Escape', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);
      expect(screen.getByRole('dialog', { name: 'SE-12-01' })).toBeTruthy();

      pressEscape();

      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('the verb chip opens the command verb guide', () => {
    const opener = () =>
      screen.getByRole('button', { name: 'Open the command verb guide for ASSESS' });

    it('returns focus to the verb chip when the guide is closed with its close button', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);

      const guide = screen.getByRole('dialog', { name: /ASSESS/ });
      fireEvent.click(within(guide).getByRole('button', { name: 'Close the command verb guide' }));

      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('returns focus to the verb chip when the guide is closed with Escape', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);
      expect(screen.getByRole('dialog', { name: /ASSESS/ })).toBeTruthy();

      pressEscape();

      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('the flag button opens the flag dialog', () => {
    const opener = () => screen.getByRole('button', { name: 'Flag this question for review' });

    it('returns focus to the flag button when the dialog is closed with Cancel', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);

      const dialog = screen.getByRole('dialog', { name: 'Report a problem with this content' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('returns focus to the flag button when the dialog is closed with Escape', async () => {
      render(<CardWithGuide />);
      const trigger = opener();
      activate(trigger);
      expect(
        screen.getByRole('dialog', { name: 'Report a problem with this content' })
      ).toBeTruthy();

      pressEscape();

      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
