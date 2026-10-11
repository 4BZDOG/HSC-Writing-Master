import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MarkingGuidePanel } from '../../components/ReferenceMaterials';
import { getBandConfig } from '../../utils/renderUtils';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The Marking Guide panel exists once, in ReferenceMaterials, and both the
 * reference rail and Focus Mode render it. These tests pin what the shared copy
 * owes its callers: the subtitle, the question's own tier hue on the icon tile,
 * and the curator's save path.
 */

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p-panel',
    question: 'Evaluate the success of the reform.',
    verb: 'EVALUATE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const toggle = () => screen.getByRole('button', { name: /marking guide/i });
const iconTile = (container: HTMLElement) =>
  container.querySelector('button .w-8.h-8') as HTMLElement;

describe('MarkingGuidePanel subtitle', () => {
  it('says the guide is not written yet, rather than naming a band it tops out at', () => {
    render(
      <MarkingGuidePanel prompt={prompt()} userRole="user" onMarkingCriteriaChange={vi.fn()} />
    );
    expect(toggle().textContent).toMatch(/not written yet/i);
    expect(toggle().textContent).not.toMatch(/top level/i);
  });

  it('names the ceiling band of the question once a guide is written', () => {
    // EVALUATE on 4 marks reaches Band 6 at full marks.
    render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    expect(toggle().textContent).toMatch(/written to band 6/i);
  });
});

describe('MarkingGuidePanel icon tile', () => {
  it('takes the ceiling band of the question, not a fixed one', () => {
    const { container } = render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    fireEvent.click(toggle());

    const tile = iconTile(container);
    for (const token of getBandConfig(6).solidBg.split(' ')) {
      expect(tile.className).toContain(token);
    }
    // The fixed band the panel used to draw in, 5, is no longer on the tile.
    expect(tile.className).not.toContain('bg-blue-600');
  });

  it('follows a different tier, so a Describe question draws Band 2', () => {
    const { container } = render(
      <MarkingGuidePanel
        prompt={prompt({ verb: 'DESCRIBE' as PromptVerb, totalMarks: 2 })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    fireEvent.click(toggle());

    const tile = iconTile(container);
    for (const token of getBandConfig(2).solidBg.split(' ')) {
      expect(tile.className).toContain(token);
    }
  });
});

describe('MarkingGuidePanel curator controls', () => {
  it('still saves an edited guide through the handler it was given', () => {
    const onChange = vi.fn();
    render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="admin"
        onMarkingCriteriaChange={onChange}
      />
    );
    fireEvent.click(toggle());

    fireEvent.click(screen.getByRole('button', { name: 'Edit criteria' }));
    const editor = screen.getByPlaceholderText(/e\.g\. 5 marks/i) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '4 marks: Judges the reform well' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onChange).toHaveBeenCalledWith('4 marks: Judges the reform well');
  });

  it('shows no curator controls to a student', () => {
    render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    fireEvent.click(toggle());
    expect(screen.queryByRole('button', { name: 'Edit criteria' })).toBeNull();
  });
});
