import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, PromptVerb } from '../../types';

/**
 * The two workspace cards are the scroll containers a student watches while
 * writing. Their bodies must reserve the scrollbar gutter before the first
 * overflow (so the text does not re-wrap when a bar appears) and carry the
 * themed scrollbar. The caret-follow timing itself is pinned end to end in
 * tests/e2e/workspace-chrome.spec.ts, where a real layout runs.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

afterEach(cleanup);

const QUESTION = 'Describe the key steps involved in DNA replication.';

const makePrompt = () =>
  ({
    id: 'p1',
    question: QUESTION,
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    scenario: undefined,
    sampleAnswers: [],
  }) as unknown as Prompt;

const promptProps = {
  prompt: makePrompt(),
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

/** The nearest scroll body above an element: the one the card scrolls inside. */
const scrollBodyOf = (el: Element | null) =>
  el?.closest('[class*="overflow-y-auto"]') as HTMLElement;

describe('writing card scroll body', () => {
  it('reserves the scrollbar gutter and takes the themed scrollbar', () => {
    render(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        placeholder={QUESTION}
      />
    );
    const body = scrollBodyOf(document.querySelector('textarea'));
    expect(body).toBeTruthy();
    expect(body.classList.contains('scroll-stable')).toBe(true);
    expect(body.classList.contains('custom-scrollbar')).toBe(true);
    expect(body.classList.contains('overflow-y-auto')).toBe(true);
  });
});

describe('prompt card scroll body', () => {
  it('reserves the scrollbar gutter and takes the themed scrollbar', () => {
    render(<PromptDisplay {...promptProps} />);
    const body = scrollBodyOf(screen.getByText(/DNA replication/));
    expect(body).toBeTruthy();
    expect(body.classList.contains('scroll-stable')).toBe(true);
    expect(body.classList.contains('custom-scrollbar')).toBe(true);
  });
});
