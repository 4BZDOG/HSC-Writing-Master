import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';
import { isFeatureLocked } from '../../services/entitlements';
import { exportEvaluationPdf } from '../../pdf';
import { useFeedbackView } from '../../hooks/useFeedbackView';
import { useFeedbackExport } from '../../hooks/useFeedbackExport';

/**
 * The PDF gets the marker's reasons for its edits only when it gets the rewrite
 * they describe. A locked rewrite takes its change list out of the file too.
 */

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, isFeatureLocked: vi.fn(() => false) };
});

vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn(async () => undefined) }));

const prompt = {
  id: 'p1',
  question: 'Explain how a data visualisation highlights significant results.',
  totalMarks: 6,
  verb: 'EXPLAIN' as PromptVerb,
  sampleAnswers: [],
  keywords: ['data visualisation'],
  linkedOutcomes: [],
  markingCriteria: '',
  isPastHSC: false,
} as unknown as Prompt;

const KEY_CHANGES = [
  'Named the mechanism: position and colour are read before conscious reading.',
  'Tied the sea-level example to significance.',
];

const resultWith = (revisedAnswer: EvaluationResult['revisedAnswer']): EvaluationResult =>
  ({
    overallMark: 4,
    overallBand: 2,
    overallFeedback: 'A sound response.',
    quickTip: 'Name the mechanism.',
    strengths: [],
    improvements: [],
    criteria: [],
    revisedAnswer,
  }) as unknown as EvaluationResult;

const userAnswer = 'A data visualisation is better than a table because it is easier to look at.';

/** The export as the report runs it: the view derived, then the export hook over it. */
const exportHook = (result: EvaluationResult) =>
  renderHook(() => {
    const view = useFeedbackView({ result, prompt, userAnswer });
    return useFeedbackExport({ prompt, result, userAnswer, view });
  });

/** What the exporter was handed on the most recent export. */
const exportedData = () => {
  const calls = vi.mocked(exportEvaluationPdf).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0].data;
};

const runExport = async (hook: ReturnType<typeof exportHook>) => {
  await act(async () => {
    await hook.result.current.handleExportPdf();
  });
};

describe('PDF export: the rewrite and its key changes travel together', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFeatureLocked).mockReturnValue(false);
  });

  it('passes the key changes with the rewrite when the rewrite is shown', async () => {
    const hook = exportHook(
      resultWith({
        text: 'A data visualisation encodes values in position and colour.',
        mark: 5,
        band: 3,
        keyChanges: KEY_CHANGES,
      })
    );
    await runExport(hook);

    const data = exportedData();
    expect(data.revisedAnswer).toBe('A data visualisation encodes values in position and colour.');
    expect(data.keyChanges).toEqual(KEY_CHANGES);
  });

  it('withholds the rewrite and its key changes together when the rewrite is locked', async () => {
    vi.mocked(isFeatureLocked).mockReturnValue(true);
    const hook = exportHook(
      resultWith({ text: 'A paid rewrite.', mark: 5, band: 3, keyChanges: KEY_CHANGES })
    );
    await runExport(hook);

    const data = exportedData();
    expect(data.revisedAnswer).toBeUndefined();
    expect(data.keyChanges).toEqual([]);
  });

  it('passes no key changes when the rewrite carries none', async () => {
    const hook = exportHook(
      resultWith({ text: 'A rewrite with no reasons.', mark: 5, band: 3, keyChanges: [] })
    );
    await runExport(hook);

    const data = exportedData();
    expect(data.revisedAnswer).toBe('A rewrite with no reasons.');
    expect(data.keyChanges).toEqual([]);
  });
});
