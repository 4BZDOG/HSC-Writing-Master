import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptGeneratorModal from '../../components/PromptGeneratorModal';
import SampleAnswerGeneratorModal from '../../components/SampleAnswerGeneratorModal';
import SampleAnswerEditorModal from '../../components/SampleAnswerEditorModal';
import { getBandForMark, getCommandTermInfo, TIER_GROUPS } from '../../data/commandTerms';
import { getBandConfig } from '../../utils/renderUtils';
import type { Prompt, SampleAnswer, PromptVerb } from '../../types';

/**
 * Alignment tests for the question/sample-answer creation modals: the band a
 * user can target must obey the same verb-tier cap the rest of the project
 * enforces (getBandForMark, TIER_GROUPS.maxBand, the audit studio's
 * recalibration).
 */

const makePrompt = (overrides: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p-test',
    question: 'Describe the function of a CPU cache.',
    totalMarks: 4,
    verb: 'Describe' as PromptVerb,
    sampleAnswers: [],
    ...overrides,
  }) as Prompt;

describe('PromptGeneratorModal band/tier alignment', () => {
  const renderModal = (dotPoint: string) =>
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint={dotPoint}
        marks={0}
        courseOutcomes={[]}
      />
    );

  it('caps the target band at the tier maximum for a low-tier syllabus verb', () => {
    // "identify" → Tier 1, whose maxBand is 1 per TIER_GROUPS (NESA Band 1).
    renderModal('identify the key components of a network');
    const tier1Max = TIER_GROUPS.find((t) => t.tier === 1)!.maxBand;
    const tier1Title = TIER_GROUPS.find((t) => t.tier === 1)!.title;

    expect(screen.getByText(`These verbs support up to Band ${tier1Max}`)).toBeTruthy();
    const capped = screen.getAllByTitle(`'${tier1Title}' verbs support up to Band ${tier1Max}`);
    expect(capped.length).toBe(6 - tier1Max);
    capped.forEach((btn) => expect((btn as HTMLButtonElement).disabled).toBe(true));
  });

  it('clamps the selected target band when the user switches to a lower tier', () => {
    // "evaluate" → Tier 6, no cap note, Band 6 selectable by default.
    renderModal('evaluate the impact of cloud computing');
    expect(screen.queryByText(/verbs cap at Band/)).toBeNull();

    // Switch to Tier 2 ("Define & Describe", maxBand 4).
    const tier2 = TIER_GROUPS.find((t) => t.tier === 2)!;
    fireEvent.click(screen.getByText(tier2.title));

    expect(screen.getByText(`These verbs support up to Band ${tier2.maxBand}`)).toBeTruthy();
    // Footer reflects the clamped target — it can never still say Band 6.
    expect(screen.queryByText(/targeting/i)?.textContent).toContain(`Band ${tier2.maxBand}`);
  });

  it('raises the target band to follow the tier when the user aims higher', () => {
    // "describe" → Tier 2 (opens targeting Band 2). Bumping the tier up must
    // raise the target, not leave it stuck at the lower band.
    renderModal('describe the features of a relational database');
    const tier2 = TIER_GROUPS.find((t) => t.tier === 2)!;
    expect(screen.queryByText(/targeting/i)?.textContent).toContain(`Band ${tier2.maxBand}`);

    const tier6 = TIER_GROUPS.find((t) => t.tier === 6)!;
    fireEvent.click(screen.getByText(tier6.title));
    expect(screen.queryByText(/targeting/i)?.textContent).toContain(`Band ${tier6.maxBand}`);
  });

  it('caps the marks slider to the verb markRange', () => {
    renderModal('define the key components of a network');
    // "define" → Tier 2, markRange [1, 3].
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();

    const verbInfo = getCommandTermInfo('DEFINE');
    expect(Number(slider.max)).toBe(verbInfo.markRange[1]);
    expect(Number(slider.min)).toBe(verbInfo.markRange[0]);
  });

  // Band 3's solid fill is yellow (`getBandConfig(3).solidBg`); hardcoded
  // `text-white` on it reads at 1.92:1, well under the 4.5:1 AA floor for
  // normal-weight text this size. `solidText` exists on every band entry
  // specifically so a solid fill never has to guess its own text colour —
  // CommandVerbHierarchy already pairs the two for this same reason.
  it('gives the band-3 picker fill its matched text colour, not white-on-yellow', () => {
    // "explain" → Tier 3 ("Explain & Compare"), maxBand 3 — opens targeting
    // Band 3 by default, so the target button is band 3's solid fill.
    renderModal('explain the causes of thermal expansion');
    const target = screen.getByTitle('Target Band 3');

    expect(target.className).not.toContain('text-white');
    expect(target.className).toContain(getBandConfig(3).solidText.split(' ')[0]);
  });
});

describe('PromptGeneratorModal syllabus-demand difficulty signal', () => {
  const renderModal = (dotPoint: string) =>
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint={dotPoint}
        marks={5}
        courseOutcomes={[]}
      />
    );

  it('surfaces the syllabus command verb and its tier as the demanded level', () => {
    // "describe" → Tier 2.
    renderModal('describe the features of a relational database');
    expect(screen.getAllByText(/Syllabus demands/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/DESCRIBE · up to Band 2/)).toBeTruthy();
  });

  it('flags a question that is harder than the syllabus asks', () => {
    // Dot point verb "describe" = Tier 2; default selected tier opens on it, so
    // switch up to Tier 6 to over-shoot.
    renderModal('describe the features of a relational database');
    const tier6 = TIER_GROUPS.find((t) => t.tier === 6)!;
    fireEvent.click(screen.getByText(tier6.title));
    expect(screen.getByText(/Harder than the syllabus asks/i)).toBeTruthy();
  });

  it('flags a question that is easier than the syllabus asks', () => {
    // "evaluate" → Tier 6; drop to Tier 2 to under-shoot.
    renderModal('evaluate the impact of cloud computing');
    const tier2 = TIER_GROUPS.find((t) => t.tier === 2)!;
    fireEvent.click(screen.getByText(tier2.title));
    expect(screen.getByText(/Easier than the syllabus asks/i)).toBeTruthy();
  });

  it('confirms when the question is on the syllabus level', () => {
    renderModal('describe the features of a relational database');
    // Opens on the syllabus tier (Tier 2) by default.
    expect(screen.getByText(/On the syllabus level/i)).toBeTruthy();
  });
});

describe('PromptGeneratorModal focus refinements', () => {
  it('surfaces the selected focus items so the generator can target them', () => {
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint="describe the features of a relational database"
        marks={5}
        courseOutcomes={[]}
        selectedFocusItems={['primary keys', 'normalisation']}
      />
    );

    // The active-focus banner and one pill per item must render.
    expect(screen.getByText(/Active Focus: 2 Refinements/i)).toBeTruthy();
    expect(screen.getByText('primary keys')).toBeTruthy();
    expect(screen.getByText('normalisation')).toBeTruthy();
  });

  it('offers the dot point’s parsed sub-items as toggleable focus chips', () => {
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint="describe database features including primary keys, indexing and normalisation"
        marks={5}
        courseOutcomes={[]}
      />
    );

    // Nothing selected yet — no banner, but every parsed sub-item is offered.
    expect(screen.queryByText(/Active Focus/i)).toBeNull();
    const chip = screen.getByRole('button', { name: 'indexing' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    // Toggling a chip activates the focus and updates the count.
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Active Focus: 1 Refinement/i)).toBeTruthy();

    // Toggling again clears it.
    fireEvent.click(chip);
    expect(screen.queryByText(/Active Focus/i)).toBeNull();
  });

  it('pre-selects the navigator’s focus items as pressed chips', () => {
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint="describe database features including primary keys, indexing and normalisation"
        marks={5}
        courseOutcomes={[]}
        selectedFocusItems={['indexing']}
      />
    );

    expect(screen.getByRole('button', { name: 'indexing' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'primary keys' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByText(/Active Focus: 1 Refinement/i)).toBeTruthy();
  });
});

describe('PromptGeneratorModal scenario toggle', () => {
  const renderModal = () =>
    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint="describe the features of a relational database"
        marks={5}
        courseOutcomes={[]}
      />
    );

  it('shows scenario options by default and hides them when toggled off', () => {
    renderModal();
    // Scenario type options are visible by default.
    expect(screen.getByText('Time Pressure')).toBeTruthy();

    // Toggle the switch (labelled "Scenario On" initially).
    fireEvent.click(screen.getByRole('switch'));

    // The type grid is replaced by the direct-question explainer.
    expect(screen.queryByText('Time Pressure')).toBeNull();
    expect(screen.getByText(/direct question/i)).toBeTruthy();
    expect(screen.getByText('No Scenario')).toBeTruthy();
  });
});

describe('SampleAnswerGeneratorModal mark reset across prompts', () => {
  it('resets the selection when reopened for a different (smaller) prompt', () => {
    const big = makePrompt({ id: 'p-big', totalMarks: 10 });
    const small = makePrompt({ id: 'p-small', totalMarks: 4 });

    const { rerender } = render(
      <SampleAnswerGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={big}
        onSampleAnswerGenerated={vi.fn()}
      />
    );

    // Marks toggle, so adding 7 to the default (full marks) makes a batch of two.
    fireEvent.click(screen.getByText('7'));
    expect(screen.getByText('Generate 2 Sample Answers')).toBeTruthy();

    // Close, switch prompt, reopen — the modal stays mounted in the real app.
    rerender(
      <SampleAnswerGeneratorModal
        isOpen={false}
        onClose={vi.fn()}
        prompt={big}
        onSampleAnswerGenerated={vi.fn()}
      />
    );
    rerender(
      <SampleAnswerGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={small}
        onSampleAnswerGenerated={vi.fn()}
      />
    );

    // The stale marks (7 and 10, both > 4 total) must be gone; default is full marks.
    const tier = getCommandTermInfo(small.verb).tier;
    const bandFull = getBandForMark(4, 4, tier);
    expect(screen.getByText(`Generate Band ${bandFull} Answer`)).toBeTruthy();
    expect(screen.getByText(/4\/4 marks/)).toBeTruthy();
  });
});

describe('SampleAnswerEditorModal tier-capped bands', () => {
  const sample: SampleAnswer = {
    id: 'sa-1',
    band: 2,
    mark: 3,
    answer: 'A cache stores frequently used data close to the CPU.',
    source: 'AI',
  } as SampleAnswer;

  it('disables band buttons above the verb tier cap and explains why', () => {
    const prompt = makePrompt(); // 'Describe' → Tier 2
    render(
      <SampleAnswerEditorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt}
        sampleToEdit={sample}
        onSave={vi.fn()}
      />
    );

    const tier = getCommandTermInfo(prompt.verb).tier;
    const cap = getBandForMark(prompt.totalMarks, prompt.totalMarks, tier);
    expect(cap).toBeLessThan(6);

    const capped = screen.getAllByTitle(`'${prompt.verb}' caps this question at Band ${cap}`);
    expect(capped.length).toBe(6 - cap);
    capped.forEach((btn) => expect((btn as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(new RegExp(`up to Band ${cap}`))).toBeTruthy();
  });

  // Same defect as the generator's target-band picker: the selected band's
  // solid fill got a hardcoded `text-white` instead of the band's own
  // `solidText`, and band 3's yellow fill puts that at 1.92:1.
  it('gives the band-3 picker fill its matched text colour, not white-on-yellow', () => {
    const prompt = makePrompt({ verb: 'Explain' as PromptVerb }); // Tier 3, maxBand 3
    render(
      <SampleAnswerEditorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt}
        sampleToEdit={{ ...sample, band: 3 }}
        onSave={vi.fn()}
      />
    );

    const target = screen.getByTitle('Band 3');
    expect(target.className).not.toContain('text-white');
    expect(target.className).toContain(getBandConfig(3).solidText.split(' ')[0]);
  });

  it('warns (without trapping the user) when legacy data already exceeds the cap', () => {
    const prompt = makePrompt();
    const overCap: SampleAnswer = { ...sample, band: 6 };
    render(
      <SampleAnswerEditorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt}
        sampleToEdit={overCap}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText(/recalibration will lower it/i)).toBeTruthy();
  });
});
