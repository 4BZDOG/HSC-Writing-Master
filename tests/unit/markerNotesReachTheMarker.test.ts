import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer } from '../../services/geminiService';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The notes written for the marker are given to the marker.
 *
 * `markerNotes` is per-question marking guidance in a marker's own register —
 * "Credit explicit mention of start/stop codons", "Award higher marks for
 * integrating the scenario throughout" — and `ReferenceMaterials` shows it to
 * teachers under the heading "What the marker looks for". The marking prompt
 * never carried it. 149 of the 224 shipped Software Engineering questions have
 * these notes, so for two thirds of the reference course that heading named
 * something no marker had ever read, and a teacher who wrote a note to steer
 * the marking steered nothing.
 *
 * Two things to hold, and the second matters as much as the first: the notes
 * arrive, AND they arrive subordinate to the rubric. Notes phrased in the
 * imperative ("award higher marks for…") read to a model as licence to inflate
 * unless something says otherwise, so the block says so, and this test fails if
 * that sentence is dropped while the notes stay.
 *
 * What this test canNOT show: that marks get better. That needs live model
 * calls and a marked corpus to compare against, neither of which exists here.
 * It shows the guidance reaches the model — which is the part that was broken.
 */

const proxyResponse = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify({
        overallMark: 4,
        overallBand: 4,
        overallFeedback: 'Sound.',
        quickTip: 'Name each step.',
        strengths: ['Clear.'],
        improvements: ['More depth.'],
        criteria: [{ criterion: 'Accuracy', mark: 4, maxMark: 6, feedback: 'Mostly right.' }],
      }),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 100 },
    }),
  }) as unknown as Response;

const NOTES = [
  'Credit explicit mention and correct explanation of start/stop codons.',
  'Award higher marks for integrating the chosen example throughout.',
];

const promptWith = (markerNotes?: string[]): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    totalMarks: 6,
    verb: 'Describe' as PromptVerb,
    scenario: '',
    markingCriteria: 'Award marks for correct sequence and terminology.',
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
    ...(markerNotes ? { markerNotes } : {}),
  }) as unknown as Prompt;

/** The prompt text actually sent to the proxy on the one call made. */
const sentPrompt = (fetchMock: ReturnType<typeof vi.fn>): string => {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  return String(body.contents.parts[0].text);
};

describe("the marker's notes reach the marker", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(proxyResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends every note, verbatim', async () => {
    await evaluateAnswer('An answer about DNA replication.', promptWith(NOTES));
    const text = sentPrompt(fetchMock);
    for (const note of NOTES) expect(text).toContain(note);
  });

  it('subordinates them to the rubric, so an imperative note is not licence to inflate', async () => {
    await evaluateAnswer('An answer about DNA replication.', promptWith(NOTES));
    const text = sentPrompt(fetchMock);
    // The notes must not arrive as bare instructions. Something has to tell the
    // model they refine the rubric rather than extend it — "Award higher marks
    // for…" is one of the notes above, and on its own that is a raise.
    expect(text).toMatch(/refine the rubric above; they\s+do not extend it/);
    expect(text).toMatch(/maximum achievable band, is wrong/);
    // And they belong after the rubric, not before it: the rubric is what the
    // model reads first and the notes qualify it.
    expect(text.indexOf('MARKING RUBRIC')).toBeLessThan(text.indexOf("MARKER'S NOTES"));
  });

  it('writes no heading when a question has no notes', async () => {
    await evaluateAnswer('An answer about DNA replication.', promptWith());
    const text = sentPrompt(fetchMock);
    // An empty section is worse than none: it tells the model notes exist and
    // then shows it nothing, which is the "undefined under a heading" problem
    // the rubric fallback in evaluateAnswer already exists to avoid.
    expect(text).not.toContain("MARKER'S NOTES");
  });

  it('drops blank entries rather than emitting an empty bullet', async () => {
    await evaluateAnswer('An answer.', promptWith(['   ', '', 'A real note.']));
    const text = sentPrompt(fetchMock);
    expect(text).toContain('A real note.');
    expect(text).not.toMatch(/-\s*\n/);
  });
});
