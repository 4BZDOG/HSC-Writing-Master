import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { CourseOutcome, Prompt, PromptVerb } from '../../types';
import { capOutcomeLinks, MAX_LINKED_OUTCOMES, OUTCOME_LINK_RULE } from '../../utils/outcomeCodes';
import { enrichPromptDetails, suggestOutcomesForPrompt } from '../../services/geminiService';
import PromptDisplay from '../../components/PromptDisplay';

/**
 * A question links the outcome it most directly assesses, and a second only when
 * it genuinely assesses two. Shipped questions had up to five, and every AI path
 * that links outcomes asked for "1-3" or "the most relevant" codes, uncapped. The
 * question card showed every one, in course order.
 */

const makeProxyResponse = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(json),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 50 },
    }),
  }) as unknown as Response;

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

const outcomes: CourseOutcome[] = [
  { code: 'SE-12-01', description: 'One.' },
  { code: 'SE-12-02', description: 'Two.' },
  { code: 'SE-12-03', description: 'Three.' },
  { code: 'SE-12-04', description: 'Four.' },
];

const prompt = {
  id: 'p1',
  question: 'Describe how software is designed securely.',
  totalMarks: 6,
  verb: 'Describe' as PromptVerb,
  scenario: '',
  markingCriteria: '',
  keywords: [],
  linkedOutcomes: [],
  sampleAnswers: [],
  isPastHSC: false,
} as unknown as Prompt;

describe('capOutcomeLinks', () => {
  it('keeps at most two codes, in the order given', () => {
    expect(MAX_LINKED_OUTCOMES).toBe(2);
    expect(capOutcomeLinks(['A', 'B', 'C', 'D'])).toEqual(['A', 'B']);
    expect(capOutcomeLinks(['A'])).toEqual(['A']);
    expect(capOutcomeLinks([])).toEqual([]);
  });
});

describe('the AI paths that link outcomes', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ask for one outcome, two at most, and keep no more than two', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse(['SE-12-03', 'SE-12-01', 'SE-12-04']));
    const suggested = await suggestOutcomesForPrompt(prompt.question, outcomes, 6);

    expect(JSON.stringify(bodyOf(fetchMock))).toContain(OUTCOME_LINK_RULE);
    expect(suggested).toEqual(['SE-12-03', 'SE-12-01']);
  });

  it('hold the background enrichment to two as well', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        scenario: '',
        keywords: [],
        linkedOutcomes: ['SE-12-02', 'SE-12-04', 'SE-12-01'],
      })
    );
    const result = await enrichPromptDetails(prompt, { name: 'Software Engineering', outcomes });

    expect(JSON.stringify(bodyOf(fetchMock))).toContain(OUTCOME_LINK_RULE);
    expect(result.linkedOutcomes).toEqual(['SE-12-02', 'SE-12-04']);
  });
});

describe('the question card', () => {
  afterEach(cleanup);

  it('shows two outcome chips at most, in the question’s own order', () => {
    render(
      <PromptDisplay
        prompt={{ ...prompt, linkedOutcomes: ['SE-12-03', 'SE-12-01', 'SE-12-04'] }}
        isEnriching={false}
        enrichError={null}
        onVerbClick={vi.fn()}
        onGenerateScenario={vi.fn()}
        onUpdatePrompt={vi.fn()}
        isGeneratingScenario={false}
        generateScenarioError={null}
        courseOutcomes={outcomes}
        onOutcomeClick={vi.fn()}
        userRole="user"
        onDismissEnrichError={vi.fn()}
        onRunQualityCheck={vi.fn()}
        onSuggestOutcomes={vi.fn()}
        isSuggestingOutcomes={false}
        fontSize={18}
        onFontSizeChange={vi.fn()}
      />
    );
    const chips = within(screen.getByRole('group', { name: 'Linked outcomes' }))
      .getAllByRole('button')
      .map((b) => b.textContent?.trim());
    expect(chips).toEqual(['SE-12-03', 'SE-12-01']);
  });
});
