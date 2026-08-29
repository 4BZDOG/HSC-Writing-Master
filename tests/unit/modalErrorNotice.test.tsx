import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QualityCheckModal from '../../components/QualityCheckModal';
import DotPointGeneratorModal from '../../components/DotPointGeneratorModal';
import SampleAnswerRevisionModal from '../../components/SampleAnswerRevisionModal';
import { performQualityCheck, generateDotPointsForSubTopic } from '../../services/geminiService';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

// The real Gemini service must never be reached from a unit test — every AI
// call these modals make is mocked here.
vi.mock('../../services/geminiService', () => ({
  performQualityCheck: vi.fn(),
  generateDotPointsForSubTopic: vi.fn(),
  reviseSampleAnswer: vi.fn(),
}));

const mockQualityCheck = vi.mocked(performQualityCheck);
const mockDotPoints = vi.mocked(generateDotPointsForSubTopic);

/**
 * These modals now surface generation/marking failures through the shared
 * AiErrorNotice card (role="alert" + a "Try again" and/or "Dismiss" button)
 * rather than a bespoke error <div>. The tests below pin that new markup.
 */
describe('AI modals render failures through the shared AiErrorNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('QualityCheckModal shows an assertive alert with a Try again affordance when the check throws', async () => {
    mockQualityCheck.mockRejectedValueOnce(new Error('Model unavailable.'));

    render(
      <QualityCheckModal
        isOpen={true}
        onClose={vi.fn()}
        content="const x = 1;"
        contentType="code"
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Check failed');
    expect(alert.textContent).toContain('Model unavailable.');

    // Retry re-runs the check.
    mockQualityCheck.mockResolvedValueOnce({
      status: 'PASS',
      score: 100,
      summary: 'All good.',
      issues: [],
    });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(mockQualityCheck).toHaveBeenCalledTimes(2));
  });

  it('DotPointGeneratorModal surfaces a generation failure and clears it on Dismiss', async () => {
    mockDotPoints.mockRejectedValueOnce(new Error('Network error.'));

    render(
      <DotPointGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onDotPointsGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        subTopicName="Test Sub-Topic"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Generation failed');
    expect(alert.textContent).toContain('Network error.');

    // Dismiss removes the notice.
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('SampleAnswerRevisionModal error affordance', () => {
  const prompt = {
    id: 'p-1',
    question: 'Describe the function of a CPU cache.',
    totalMarks: 4,
    verb: 'Describe' as PromptVerb,
    sampleAnswers: [],
  } as Prompt;

  const sample: SampleAnswer = {
    id: 'sa-1',
    band: 2,
    mark: 2,
    answer: 'A cache stores frequently used data close to the CPU.',
    source: 'AI',
  } as SampleAnswer;

  it('offers only a Dismiss affordance, not a retry, matching the original design', async () => {
    const { reviseSampleAnswer } = await import('../../services/geminiService');
    vi.mocked(reviseSampleAnswer).mockRejectedValueOnce(new Error('Timed out.'));

    render(
      <SampleAnswerRevisionModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt}
        sampleToRevise={sample}
        existingMarks={[2]}
        onRevisionComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /revise with ai/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Revision failed');
    expect(alert.textContent).toContain('Timed out.');
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
