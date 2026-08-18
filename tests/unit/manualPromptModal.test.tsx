import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import ManualPromptModal from '../../components/ManualPromptModal';
import { CourseOutcome, Prompt, PromptVerb } from '../../types';

/**
 * The manual composer hands a teacher's rough idea to the model. Everything it
 * lets them decide first — the verb, whether there is a scenario, which
 * outcomes are assessed, whether this is a past paper — has to survive the
 * round trip, and the AI's draft has to stay editable before it is filed.
 */

const refineManualPrompt = vi.fn();
vi.mock('../../services/geminiService', () => ({
  refineManualPrompt: (...args: unknown[]) => refineManualPrompt(...args),
}));

// The scenario-image affordance commits to IDB immediately (see
// ScenarioImageUploader.tsx) — these tests are only about whether the modal
// cleans up an orphaned row on discard/re-refine, not about paste handling
// itself, so the uploader is stubbed to a single button that fires
// `onImageChange` with a fixed ref keyed on whatever promptId it was given.
vi.mock('../../components/ScenarioImageUploader', () => ({
  default: ({
    promptId,
    onImageChange,
  }: {
    promptId: string;
    onImageChange: (ref: { id: string; updatedAt: number } | undefined) => void;
  }) => (
    <button type="button" onClick={() => onImageChange({ id: promptId, updatedAt: 1 })}>
      Attach image
    </button>
  ),
}));

const deleteScenarioImage = vi.fn();
vi.mock('../../utils/scenarioImageStorage', () => ({
  deleteScenarioImage: (...args: unknown[]) => deleteScenarioImage(...args),
}));

/**
 * Refining is a plan-gated AI Content Studio call. These tests are about what
 * the composer DOES with a refinement, so the plan is held unlocked here — a
 * test with no signed-in user would otherwise resolve to the free plan and get
 * the upgrade prompt instead of a draft. The lock itself is covered below.
 */
let studioLocked = false;
const requestUpgradeMock = vi.fn();
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeatureLocked: () => studioLocked,
    requestUpgrade: (...args: unknown[]) => requestUpgradeMock(...args),
  };
});

const outcomes: CourseOutcome[] = [
  { code: 'SE-12-01', description: 'Justifies the selection of development approaches.' },
  { code: 'SE-12-06', description: 'Justifies the selection of a data structure.' },
];

const refined: Prompt = {
  id: 'p-new',
  question: 'Explain how a CPU cache reduces average memory access time.',
  totalMarks: 5,
  verb: 'EXPLAIN' as PromptVerb,
  scenario: 'A studio is profiling a slow render pipeline.',
  markingCriteria: '5 marks: complete\n4 marks: thorough',
  keywords: ['cache', 'latency'],
  linkedOutcomes: ['SE-12-01'],
  sampleAnswers: [],
  isPastHSC: false,
};

const onSave = vi.fn();

const renderModal = (props: Partial<React.ComponentProps<typeof ManualPromptModal>> = {}) =>
  render(
    <ManualPromptModal
      isOpen
      onClose={vi.fn()}
      onSave={onSave}
      courseName="Software Engineering"
      topicName="Programming for the Web"
      outcomes={outcomes}
      {...props}
    />
  );

const typeIdea = (text = 'ask about CPU caching') =>
  fireEvent.change(screen.getByLabelText(/Your Rough Question Idea/i), {
    target: { value: text },
  });

const refine = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Refine with AI/i }));
  await waitFor(() => expect(refineManualPrompt).toHaveBeenCalled());
  await screen.findByLabelText(/Polished Question/i);
};

const lastOptions = () => refineManualPrompt.mock.calls.at(-1)?.[5];

beforeEach(() => {
  refineManualPrompt.mockReset().mockResolvedValue(refined);
  onSave.mockReset();
  requestUpgradeMock.mockReset();
  deleteScenarioImage.mockReset();
  studioLocked = false;
});

afterEach(cleanup);

describe('ManualPromptModal — the AI pass is a paid feature', () => {
  it('sells the plan rather than spending the call when the studio is locked', async () => {
    // The proxy refuses a plan-gated call with a 402, which would surface here
    // as a bare inline error. Catching it in the UI opens the upgrade prompt
    // instead — the same thing every other studio control does.
    studioLocked = true;
    renderModal();
    typeIdea();
    fireEvent.click(screen.getByRole('button', { name: /Refine/i }));

    await waitFor(() => expect(requestUpgradeMock).toHaveBeenCalledWith('aiContentStudio'));
    expect(refineManualPrompt).not.toHaveBeenCalled();
  });
});

describe('ManualPromptModal — composing', () => {
  it('leaves the verb to the AI by default and pins it when one is chosen', async () => {
    renderModal();
    typeIdea();

    // Default: nothing pinned, and the AI's likely pick is named for the marks.
    expect(screen.getByRole('button', { name: /AI Chooses/i }).getAttribute('aria-pressed')).toBe(
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /^ANALYSE$/i }));
    await refine();

    expect(lastOptions()).toMatchObject({ verb: 'ANALYSE' });
  });

  it('sends the scenario toggle through, and shows the no-scenario state on review', async () => {
    renderModal();
    typeIdea();

    fireEvent.click(screen.getByRole('switch', { name: /Scenario On/i }));
    await refine();

    expect(lastOptions()).toMatchObject({ includeScenario: false });
    expect(screen.getByText(/No scenario — this is a direct question/i)).toBeTruthy();
  });

  it('pins the outcomes a teacher selects instead of letting the AI guess', async () => {
    renderModal();
    typeIdea();

    fireEvent.click(screen.getByRole('button', { name: 'SE-12-06' }));
    await refine();

    expect(lastOptions()).toMatchObject({ pinnedOutcomes: ['SE-12-06'] });
  });

  it('grounds the request in the syllabus dot point when one is selected', async () => {
    renderModal({ dotPoint: 'Explore the applications of web programming.' });
    typeIdea();
    await refine();

    expect(lastOptions()).toMatchObject({
      dotPoint: 'Explore the applications of web programming.',
    });
  });
});

describe('ManualPromptModal — reviewing and saving', () => {
  it('saves the AI draft untouched when nothing is edited', async () => {
    renderModal();
    typeIdea();
    await refine();

    fireEvent.click(screen.getByRole('button', { name: /Save to Syllabus/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        question: refined.question,
        scenario: refined.scenario,
        markingCriteria: refined.markingCriteria,
        isPastHSC: false,
      })
    );
  });

  it('saves the teacher edits, not the original wording', async () => {
    renderModal();
    typeIdea();
    await refine();

    fireEvent.change(screen.getByLabelText(/Polished Question/i), {
      target: { value: 'Explain, with reference to locality, why a CPU cache is fast.' },
    });
    fireEvent.change(screen.getByLabelText(/^Scenario$/i), {
      target: { value: 'A team is tuning a render farm.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save to Syllabus/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Explain, with reference to locality, why a CPU cache is fast.',
        scenario: 'A team is tuning a render farm.',
      })
    );
  });

  it('records past HSC provenance on the saved question', async () => {
    renderModal();
    typeIdea();

    fireEvent.click(screen.getByRole('switch', { name: /Practice/i }));
    fireEvent.change(screen.getByLabelText(/^Year$/i), { target: { value: '2021' } });
    fireEvent.change(screen.getByLabelText(/Question No\./i), { target: { value: '12(b)' } });
    await refine();

    fireEvent.click(screen.getByRole('button', { name: /Save to Syllabus/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        isPastHSC: true,
        hscYear: 2021,
        hscQuestionNumber: '12(b)',
      })
    );
  });

  it('leaves the HSC fields off a practice question', async () => {
    renderModal();
    typeIdea();
    await refine();
    fireEvent.click(screen.getByRole('button', { name: /Save to Syllabus/i }));

    const saved = onSave.mock.calls[0][0] as Prompt;
    expect(saved.isPastHSC).toBe(false);
    expect(saved.hscYear).toBeUndefined();
    expect(saved.hscQuestionNumber).toBeUndefined();
  });

  it('shows the keywords and outcomes the refinement produced', async () => {
    renderModal();
    typeIdea();
    await refine();

    const outcomeGroup = screen.getByText(/Linked Outcomes/i).parentElement as HTMLElement;
    expect(within(outcomeGroup).getByText('SE-12-01')).toBeTruthy();
    const keywordGroup = screen.getByText(/Syllabus Keywords/i).parentElement as HTMLElement;
    expect(within(keywordGroup).getByText('cache')).toBeTruthy();
  });

  it('refuses to save a question that has been emptied', async () => {
    renderModal();
    typeIdea();
    await refine();

    fireEvent.change(screen.getByLabelText(/Polished Question/i), { target: { value: '   ' } });

    const save = screen.getByRole('button', { name: /Save to Syllabus/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ManualPromptModal — scenario image cleanup', () => {
  const attachImage = () => {
    fireEvent.click(screen.getByRole('button', { name: /Add Scenario Image/i }));
    fireEvent.click(screen.getByRole('button', { name: /Attach image/i }));
  };

  it('does not delete the image a successful save just committed', async () => {
    renderModal();
    typeIdea();
    await refine();
    attachImage();

    fireEvent.click(screen.getByRole('button', { name: /Save to Syllabus/i }));

    expect(deleteScenarioImage).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioImage: { id: 'p-new', updatedAt: 1 } })
    );
  });

  it('deletes the orphaned image when the draft is discarded', async () => {
    renderModal();
    typeIdea();
    await refine();
    attachImage();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Discard$/i }));

    expect(deleteScenarioImage).toHaveBeenCalledWith('p-new');
    expect(onSave).not.toHaveBeenCalled();
  });

  it("deletes the previous draft's image when refining again", async () => {
    renderModal();
    typeIdea();
    await refine();
    attachImage();

    fireEvent.click(screen.getByRole('button', { name: /Back to Edit/i }));
    refineManualPrompt.mockResolvedValueOnce({ ...refined, id: 'p-second' });
    await refine();

    expect(deleteScenarioImage).toHaveBeenCalledWith('p-new');
  });
});
