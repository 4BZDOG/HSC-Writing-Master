import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer } from '../../services/geminiService';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The marker reads the question's stimulus.
 *
 * A question's `scenario` is the stimulus the student read before answering: a
 * case study, a data table, a text description of a graph. The student saw it,
 * but the marking prompt never carried it, so an answer that said "the graph
 * shows a peak at 12 noon" was marked without the graph. This test fails if the
 * scenario stops reaching the marker, or if an empty one leaves a heading behind.
 */

const proxyResponse = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify({
        overallMark: 3,
        overallBand: 3,
        overallFeedback: 'Sound.',
        quickTip: 'Cite the data.',
        strengths: ['Clear.'],
        improvements: ['More depth.'],
        criteria: [{ criterion: 'Accuracy', mark: 3, maxMark: 4, feedback: 'Mostly right.' }],
      }),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 100 },
    }),
  }) as unknown as Response;

const STIMULUS =
  'Table 1: Hourly temperature at the weather station. 10 am: 18 C. 12 noon: 26 C (peak). 2 pm: 24 C.';

const promptWith = (scenario?: string): Prompt =>
  ({
    id: 'p1',
    question: 'Using Table 1, analyse the temperature change over the day.',
    totalMarks: 4,
    verb: 'Analyse' as PromptVerb,
    scenario,
    markingCriteria: 'Award marks for correct use of the data.',
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
  }) as unknown as Prompt;

/** The prompt text actually sent to the proxy on the one call made. */
const sentPrompt = (fetchMock: ReturnType<typeof vi.fn>): string => {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  return String(body.contents.parts[0].text);
};

const HEADING = 'Stimulus / scenario (what the student read before answering)';

describe('the marker reads the question stimulus', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(proxyResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the scenario text under its heading, after the question', async () => {
    await evaluateAnswer('The temperature peaked at 12 noon.', promptWith(STIMULUS));
    const text = sentPrompt(fetchMock);
    expect(text).toContain(STIMULUS);
    expect(text).toContain(HEADING);
    expect(text).toMatch(/check the student's answer against this stimulus/i);
    // It sits in QUESTION DATA, directly after the question itself.
    const questionAt = text.indexOf('**Question:**');
    const stimulusAt = text.indexOf(HEADING);
    const maxMarksAt = text.indexOf('**Max Marks:**');
    expect(questionAt).toBeGreaterThan(-1);
    expect(stimulusAt).toBeGreaterThan(questionAt);
    expect(maxMarksAt).toBeGreaterThan(stimulusAt);
  });

  it('writes no stimulus heading when the scenario is empty', async () => {
    await evaluateAnswer('An answer.', promptWith(''));
    const text = sentPrompt(fetchMock);
    expect(text).not.toContain(HEADING);
    expect(text).not.toContain('Check the student');
    expect(text).not.toContain('undefined');
  });

  it('writes no stimulus heading when the scenario is only whitespace', async () => {
    await evaluateAnswer('An answer.', promptWith('   \n  '));
    const text = sentPrompt(fetchMock);
    expect(text).not.toContain(HEADING);
  });

  it('writes no stimulus heading when the scenario is absent', async () => {
    await evaluateAnswer('An answer.', promptWith(undefined));
    const text = sentPrompt(fetchMock);
    expect(text).not.toContain(HEADING);
    expect(text).not.toContain('undefined');
  });
});
