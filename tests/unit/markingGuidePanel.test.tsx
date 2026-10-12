import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MarkingGuidePanel } from '../../components/ReferenceMaterials';
import { getBandConfig, getBandRgb } from '../../utils/renderUtils';
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
// The hero's tile is 40px (`w-10 h-10`); the ordinary section's was 32px.
const iconTile = (container: HTMLElement) =>
  container.querySelector('button .w-10.h-10') as HTMLElement;

describe('MarkingGuidePanel subtitle', () => {
  it('says the guide is not written yet, rather than naming a band it tops out at', () => {
    render(
      <MarkingGuidePanel prompt={prompt()} userRole="user" onMarkingCriteriaChange={vi.fn()} />
    );
    expect(toggle().textContent).toMatch(/4 marks · not written yet/i);
    expect(toggle().textContent).not.toMatch(/top level/i);
  });

  it('names the marks, then the ceiling band of the question once a guide is written', () => {
    // EVALUATE on 4 marks reaches Band 6 at full marks.
    render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    expect(toggle().textContent).toMatch(/4 marks · written to band 6/i);
  });
});

describe('MarkingGuidePanel is a secondary hero', () => {
  it('washes its header with the band and glows its tile, whether open or not', () => {
    const { container } = render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    expect(toggle().parentElement!.className).toContain('band-header-wash');
    expect(iconTile(container).className).toContain('band-glow');
    expect(iconTile(container).className).toContain('rounded-tile');
  });

  it('lights its edge only while open, and draws the band it is lit in on the panel root', () => {
    const { container } = render(
      <MarkingGuidePanel
        prompt={prompt({ markingCriteria: '4 marks: Judges the reform' })}
        userRole="user"
        onMarkingCriteriaChange={vi.fn()}
      />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('band-lit');

    fireEvent.click(toggle());
    expect(root.className).toContain('band-lit');
    expect(root.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(6));
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
