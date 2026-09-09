import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import * as geminiService from '../../services/geminiService';
import * as contributionService from '../../services/contributionService';
import type { Course } from '../../types';

/**
 * The studio's reliability contract, as opposed to its feature list.
 *
 * Each test here stands for a defect that shipped: a filter chip whose
 * "Select All Filtered" matched nothing, a close button that walked away from a
 * live batch, a repair queue that a page reload silently emptied, a quality
 * score that could never reach the review queue, and a filter toggle that ate
 * the admin's own collapsed branches.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

vi.mock('../../services/contributionService', async (importOriginal) => {
  const actual = await importOriginal<typeof contributionService>();
  return {
    ...actual,
    savePromptContribution: vi.fn().mockResolvedValue('uuid-prompt'),
    saveSampleAnswerContribution: vi.fn().mockResolvedValue('uuid-answer'),
  };
});

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof geminiService>();
  return {
    ...actual,
    screenContentQuality: vi.fn().mockResolvedValue({ score: 41, notes: 'Vague wording.' }),
    generateRubricForPrompt: vi.fn().mockResolvedValue('Criteria\n4 marks: excellent'),
  };
});

/**
 * One question per gap the old `handleSmartSelect` could not see:
 *   pr-verb  → tagged "Analyse" but the question says "Describe"
 *   pr-flag  → carries an open user flag
 *   pr-exemplar → a Band 6 exemplar of ~40 words on a 10-mark question, which
 *                 is a warning-level under-length flag
 */
const fixture: Course[] = [
  {
    id: 'c1',
    name: 'Audit Course',
    outcomes: [{ code: 'FC-1', description: 'An outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Audit Topic',
        subTopics: [
          {
            id: 'st1',
            name: 'Audit SubTopic',
            dotPoints: [
              {
                id: 'dp1',
                description: 'explain a covered dot point',
                prompts: [
                  {
                    id: 'pr-verb',
                    question: 'Describe the storage layer of the system.',
                    totalMarks: 4,
                    verb: 'Analyse',
                    linkedOutcomes: ['FC-1'],
                    keywords: ['storage'],
                    markingCriteria: '4 marks: full\n3 marks: most\n1-2 marks: some',
                    sampleAnswers: [
                      {
                        id: 'sa-verb',
                        band: 2,
                        mark: 2,
                        answer: 'A short but adequate exemplar answer, comfortably over thirty.',
                        source: 'AI',
                      },
                    ],
                  },
                  {
                    id: 'pr-flag',
                    question: 'Analyse the reporting pipeline.',
                    totalMarks: 4,
                    verb: 'Analyse',
                    linkedOutcomes: ['FC-1'],
                    keywords: ['pipeline'],
                    markingCriteria: '4 marks: full\n3 marks: most\n1-2 marks: some',
                    contentFlag: { status: 'open', reason: 'The wording is ambiguous.' },
                    sampleAnswers: [
                      {
                        id: 'sa-flag',
                        band: 2,
                        mark: 2,
                        answer: 'Another adequate exemplar answer, comfortably over thirty chars.',
                        source: 'AI',
                      },
                    ],
                  },
                  {
                    id: 'pr-exemplar',
                    question: 'Evaluate the whole architecture.',
                    totalMarks: 10,
                    verb: 'Evaluate',
                    linkedOutcomes: ['FC-1'],
                    keywords: ['architecture'],
                    markingCriteria: '9-10 marks: full\n5-8 marks: most\n1-4 marks: some',
                    sampleAnswers: [
                      {
                        id: 'sa-short',
                        band: 6,
                        mark: 10,
                        answer:
                          'The architecture works well because it separates concerns and keeps the data layer apart from the interface, which makes it easier to change either one on its own later.',
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
] as unknown as Course[];

const renderStudio = (props: Partial<React.ComponentProps<typeof ContentAuditModal>> = {}) =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={fixture}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
      {...props}
    />
  );

const chip = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

// `vi.clearAllMocks` clears calls but keeps implementations, so a test that
// installs a deliberately-hanging `screenContentQuality` would leave it
// installed for every test after it. The defaults are re-established here.
beforeEach(() => {
  vi.mocked(geminiService.screenContentQuality).mockResolvedValue({
    score: 41,
    notes: 'Vague wording.',
  });
  vi.mocked(geminiService.generateRubricForPrompt).mockResolvedValue(
    'Criteria\n4 marks: excellent'
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('Content Audit Studio — Select All Filtered covers every chip on the rail', () => {
  // The predicates behind the chips, the header counts and this button used to
  // be three hand-written copies. These three chips were in the first two and
  // missing from the third, so the button selected nothing and said so as
  // though that were the answer.
  it.each([
    ['Verb Not In Question', 1],
    ['Flagged', 1],
    ['Exemplar Mismatch', 1],
  ])('selects the %s matches rather than nothing', (label, expected) => {
    const showToast = vi.fn();
    renderStudio({ showToast });

    expect(chip(label).textContent).toContain(String(expected));
    fireEvent.click(chip(label));
    fireEvent.click(screen.getByRole('button', { name: /select all filtered/i }));

    expect(screen.getByRole('button', { name: /clear selection \(1\)/i })).toBeTruthy();
    expect(showToast).toHaveBeenCalledWith(`Selected 1 item under "${label}".`, 'success');
  });

  it('leaves a chip with nothing to show disabled rather than routing to an empty tree', () => {
    renderStudio();
    // Every question in the fixture has a marking guide.
    const empty = chip('No Marking Guide') as HTMLButtonElement;
    expect(empty.textContent).toContain('0');
    expect(empty.disabled).toBe(true);
  });
});

describe('Content Audit Studio — the tree keeps the admin’s own state', () => {
  it('a filter does not permanently expand what the admin collapsed', () => {
    renderStudio();

    // Collapse everything, then narrow with a filter: the filtered rows open…
    fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryByText('Audit Topic')).toBeNull();

    fireEvent.click(chip('Flagged'));
    expect(screen.getByText('Analyse the reporting pipeline.')).toBeTruthy();

    // …and clearing the filter puts the collapse back, rather than leaving the
    // whole library expanded because the toggle wrote every id into the state.
    fireEvent.click(chip('Flagged'));
    expect(screen.queryByText('Audit Topic')).toBeNull();
  });

  it('drops selected ids whose nodes no longer exist', () => {
    const { rerender } = renderStudio();
    fireEvent.click(screen.getByLabelText('Select Audit Course'));
    // course + topic + subTopic + dotPoint + 3 prompts
    expect(screen.getByRole('button', { name: /clear selection \(7\)/i })).toBeTruthy();

    const emptied = JSON.parse(JSON.stringify(fixture)) as Course[];
    emptied[0].topics[0].subTopics[0].dotPoints[0].prompts = [];

    rerender(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={emptied}
        updateCourses={vi.fn()}
        showToast={vi.fn()}
      />
    );

    // The three deleted questions are no longer counted as selected.
    expect(screen.getByRole('button', { name: /clear selection \(4\)/i })).toBeTruthy();
  });
});

describe('Content Audit Studio — a running batch can be left, and reports back', () => {
  /**
   * This used to assert the opposite — Close was disabled for the length of a
   * run, so a ten-minute batch held the admin on the screen. The reason was
   * real (walking away left a run spending AI quota with its log and its Stop
   * control off screen) and the answer was wrong. Leaving is allowed now; what
   * makes it safe is that the run keeps reporting, and every notice it raises
   * carries a control that brings the studio back.
   */
  it('lets a run be left, tells the host it is still going, and offers the way back', async () => {
    let release: (() => void) | undefined;
    vi.mocked(geminiService.screenContentQuality).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ score: 50, notes: '' });
        })
    );

    const showToast = vi.fn();
    const onClose = vi.fn();
    const onReopen = vi.fn();
    const onRunStateChange = vi.fn();
    render(
      <ContentAuditModal
        isOpen={true}
        onClose={onClose}
        onReopen={onReopen}
        onRunStateChange={onRunStateChange}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByLabelText('Select Audit Course'));
    fireEvent.click(screen.getByText('Score Quality (3)'));

    await waitFor(
      () => expect(screen.getByRole('button', { name: /stop process/i })).toBeTruthy(),
      { timeout: 8000 }
    );

    // The host is told a run is in flight, which is what keeps this component
    // mounted through a close — `useBatchRun` aborts on unmount, so without it
    // "close" would mean "cancel".
    expect(onRunStateChange).toHaveBeenCalledWith(true);

    const close = screen.getByLabelText('Close') as HTMLButtonElement;
    expect(close.disabled).toBe(false);
    fireEvent.click(close);

    expect(onClose).toHaveBeenCalledTimes(1);
    const [message, type, action] = showToast.mock.calls.at(-1)!;
    expect(message).toMatch(/Batch still running/);
    expect(type).toBe('info');
    /**
     * And it carries NO control, deliberately.
     *
     * `useToast` gives an actionable toast fourteen seconds instead of five
     * and protects it from being dropped when the queue is full. On the first
     * notice of a run that then reports every step, that combination means it
     * sits on screen while the whole run goes past behind it — measured in a
     * browser, with not one step notice ever shown. The way back rides on the
     * notice that ENDS the run, where there is no stream to starve.
     */
    expect(action).toBeUndefined();

    release?.();
  }, 30000);

  it('offers the way back on the notice that ends a run left off screen', async () => {
    vi.mocked(geminiService.screenContentQuality).mockResolvedValue({ score: 50, notes: '' });

    const showToast = vi.fn();
    const onReopen = vi.fn();
    const props = (isOpen: boolean) => ({
      isOpen,
      onClose: vi.fn(),
      onReopen,
      courses: fixture,
      updateCourses: vi.fn(),
      showToast,
    });

    const { rerender } = render(<ContentAuditModal {...props(true)} />);
    fireEvent.click(screen.getByLabelText('Select Audit Course'));
    fireEvent.click(screen.getByText('Score Quality (3)'));
    rerender(<ContentAuditModal {...props(false)} />);

    const summary = await waitFor(
      () => {
        const call = showToast.mock.calls.find(([msg]: [string]) =>
          /^Batch (complete|finished)/.test(msg)
        );
        expect(call).toBeTruthy();
        return call!;
      },
      { timeout: 25000 }
    );

    expect(summary[2]).toBeTruthy();
    expect(summary[2].label).toBe('Open studio');
    summary[2].onClick();
    expect(onReopen).toHaveBeenCalledTimes(1);
  }, 40000);

  it('reports each completed step once the studio is off screen', async () => {
    vi.mocked(geminiService.screenContentQuality).mockResolvedValue({ score: 50, notes: '' });

    const showToast = vi.fn();
    const { rerender } = render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        onReopen={vi.fn()}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByLabelText('Select Audit Course'));
    fireEvent.click(screen.getByText('Score Quality (3)'));

    // Leave while it runs. From here the processing log is off screen, so the
    // per-step lines become notices instead.
    rerender(
      <ContentAuditModal
        isOpen={false}
        onClose={vi.fn()}
        onReopen={vi.fn()}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={showToast}
      />
    );

    await waitFor(
      () =>
        expect(showToast.mock.calls.some(([msg]: [string]) => /\(\d+ of 3\)$/.test(msg))).toBe(
          true
        ),
      { timeout: 20000 }
    );
  }, 40000);
});

describe('Content Audit Studio — the repair outbox', () => {
  it('queues a quality score and survives the studio being torn down and rebuilt', async () => {
    const { unmount } = renderStudio();

    fireEvent.click(screen.getByLabelText('Select Audit Course'));
    fireEvent.click(screen.getByText('Score Quality (3)'));

    // Scoring queues the question for sync. It used to write the score and
    // queue nothing, so the score could never reach the review queue — which is
    // the only reason the score is stored on the prompt at all.
    const syncBtn = await screen.findByRole(
      'button',
      { name: /sync to library/i },
      { timeout: 15000 }
    );
    expect(syncBtn).toBeTruthy();
    expect(window.localStorage.getItem('hsc.contentAudit.syncOutbox.v1')).toContain('pr-verb');

    unmount();
    renderStudio();

    // A reload used to empty the queue with no warning; the repairs stayed in
    // IndexedDB and the record of what still needed pushing did not.
    expect(await screen.findByRole('button', { name: /sync to library/i })).toBeTruthy();
  }, 60000);

  it('discards a queued entry whose question has since been deleted', async () => {
    window.localStorage.setItem(
      'hsc.contentAudit.syncOutbox.v1',
      JSON.stringify([{ promptAppId: 'gone', dotPointAppId: 'dp1', label: 'Deleted question' }])
    );

    renderStudio();

    // An unresolvable entry can never be pushed, and only a successful push
    // clears one — so it would sit in the queue failing forever.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /sync to library/i })).toBeNull()
    );
    expect(window.localStorage.getItem('hsc.contentAudit.syncOutbox.v1')).toBeNull();
  });
});
