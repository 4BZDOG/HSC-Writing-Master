import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNewPrompt } from '../../services/geminiService';
import { getCommandTermInfo } from '../../data/commandTerms';
import type { CourseOutcome } from '../../types';

/**
 * The question generator can build a question WITH a scenario or as a direct,
 * scenario-free question. These drive the real code path (fetch mocked) and
 * assert the request and the returned prompt honour the caller's choice.
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

const verbs = [getCommandTermInfo('DESCRIBE')];
const outcomes: CourseOutcome[] = [{ code: 'SE-11-01', description: 'x' }];

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

describe('generateNewPrompt scenario handling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the scenario when scenarios are enabled (default)', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Describe X.',
        verb: 'Describe',
        scenario: 'A dev team ships a release under deadline.',
        markingCriteria: '2 marks: ...',
        keywords: ['release'],
        linkedOutcomes: ['SE-11-01'],
      })
    );

    const prompt = await generateNewPrompt('Course', 'Topic', 'describe X', 4, verbs, outcomes);
    expect(prompt.scenario).toBe('A dev team ships a release under deadline.');

    // The request asks for a scenario and marks it required.
    const body = bodyOf(fetchMock);
    const sent = JSON.stringify(body);
    expect(sent).toContain('A realistic context paragraph');
    const required = body.config.responseSchema.required as string[];
    expect(required).toContain('scenario');
  });

  it('produces no scenario when scenarios are disabled', async () => {
    // Even if the model returns a stray scenario, the caller's choice wins.
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Describe X.',
        verb: 'Describe',
        scenario: 'Some stray scenario the model added anyway.',
        markingCriteria: '2 marks: ...',
        keywords: ['release'],
        linkedOutcomes: ['SE-11-01'],
      })
    );

    const prompt = await generateNewPrompt(
      'Course',
      'Topic',
      'describe X',
      4,
      verbs,
      outcomes,
      undefined,
      'balanced',
      6,
      false
    );
    expect(prompt.scenario).toBe('');

    // The request instructs no scenario and drops it from required fields.
    const body = bodyOf(fetchMock);
    const sent = JSON.stringify(body);
    expect(sent).toContain('Do NOT write a scenario');
    expect(sent).toContain('scenario-free');
    const required = body.config.responseSchema.required as string[];
    expect(required).not.toContain('scenario');
  });
});

describe('generateNewPrompt verb enforcement', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (verb: string) =>
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Q',
        verb,
        scenario: 'S',
        markingCriteria: '2 marks: ...',
        keywords: [],
        linkedOutcomes: [],
      })
    );

  it('pins the prompt to the selected verb when the model drifts outside the allowed set', async () => {
    respond('Discuss'); // model ignored the instruction
    const prompt = await generateNewPrompt('C', 'T', 'describe X', 4, verbs, outcomes);
    expect(prompt.verb).toBe('DESCRIBE');
  });

  it('normalises the model verb to uppercase when it is in the allowed set', async () => {
    respond('describe');
    const prompt = await generateNewPrompt('C', 'T', 'describe X', 4, verbs, outcomes);
    expect(prompt.verb).toBe('DESCRIBE');
  });

  it('sends a strict single-verb contract when exactly one verb is selected', async () => {
    respond('DESCRIBE');
    await generateNewPrompt('C', 'T', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('MUST be built on exactly this verb');
    expect(sent).toContain('Must be exactly \\"DESCRIBE\\"');
  });

  it('keeps the allowed-verbs wording when several verbs are permitted', async () => {
    respond('EXPLAIN');
    const multi = [getCommandTermInfo('DESCRIBE'), getCommandTermInfo('EXPLAIN')];
    const prompt = await generateNewPrompt('C', 'T', 'describe X', 4, multi, outcomes);
    expect(prompt.verb).toBe('EXPLAIN'); // in the allowed set — respected
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Allowed Verbs');
  });
});

describe('generateNewPrompt focus areas', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Q',
        verb: 'DESCRIBE',
        scenario: 'S',
        markingCriteria: '2 marks: ...',
        keywords: [],
        linkedOutcomes: [],
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends focus items as a structured block without mutating the dot point', async () => {
    await generateNewPrompt(
      'C',
      'T',
      'describe network topologies',
      4,
      verbs,
      outcomes,
      undefined,
      undefined,
      undefined,
      true,
      ['star topology', 'mesh topology']
    );
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Focus Areas');
    expect(sent).toContain('star topology');
    expect(sent).toContain('mesh topology');
    expect(sent).toContain('Syllabus Dot Point: \\"describe network topologies\\"');
  });

  it('omits the focus block when no focus items are given', async () => {
    await generateNewPrompt('C', 'T', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).not.toContain('Focus Areas');
  });
});

describe('generateNewPrompt extended-response rubrics', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Q',
        verb: 'EVALUATE',
        scenario: 'S',
        markingCriteria: '8 marks: ...',
        keywords: [],
        linkedOutcomes: [],
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for band-discriminated NESA criteria on >6 mark questions', async () => {
    const evaluate = [getCommandTermInfo('EVALUATE')];
    await generateNewPrompt('C', 'T', 'evaluate X', 8, evaluate, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('band-aligned mark ranges');
    expect(sent).toContain('COGNITIVE DEPTH');
    expect(sent).toContain("cognitive demand of 'EVALUATE'");
  });

  it('keeps the per-mark rubric format for ≤6 mark questions', async () => {
    await generateNewPrompt('C', 'T', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('EVERY mark value individually');
    expect(sent).not.toContain('band-aligned mark ranges');
  });
});
