import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Course, SampleAnswer } from '../../types';
import { splitPastHscScenario } from '../../utils/pastHscScenario';
import {
  onText,
  prescribedTextsOf,
  rememberText,
  rememberedTextAmong,
} from '../../utils/prescribedTextChoice';

describe('splitPastHscScenario', () => {
  it('splits context from a stimulus held after it (a table beside its screenshot)', () => {
    const parts = splitPastHscScenario(
      'Below is the Issues table.\n\nStimulus: | JobID | Status |\n| --- | --- |\n| 0001 | Pending |'
    );
    expect(parts.context).toBe('Below is the Issues table.');
    expect(parts.stimulus).toEqual({
      label: 'Stimulus',
      lines: ['| JobID | Status |\n| --- | --- |\n| 0001 | Pending |'],
    });
  });

  it('lifts NESA’s criteria into a list', () => {
    const parts = splitPastHscScenario(
      'Your answer will be assessed on how well you: craft language to address the demands of the question; use language appropriate to audience, purpose and form to shape meaning.'
    );
    expect(parts.assessedOn).toEqual([
      'craft language to address the demands of the question',
      'use language appropriate to audience, purpose and form to shape meaning',
    ]);
    expect(parts.context).toBeUndefined();
  });

  it('keeps an extract’s line breaks and labels it', () => {
    const parts = splitPastHscScenario(
      'Extract: For 2,000 years / The Earth Mother / Nursed her son, Your answer will be assessed on how well you: a; b.'
    );
    expect(parts.stimulus).toEqual({
      label: 'Extract',
      lines: ['For 2,000 years', 'The Earth Mother', 'Nursed her son,'],
    });
    expect(parts.assessedOn).toEqual(['a', 'b']);
  });

  it('separates instructions and the note on the model piece', () => {
    const parts = splitPastHscScenario(
      'Refer to the piece you crafted for part (a). The sample answers below respond to a model part (a) piece. It is a story. Your answer will be assessed on how well you: x.'
    );
    expect(parts.instructions).toEqual(['Refer to the piece you crafted for part (a).']);
    expect(parts.sampleNote).toBe(
      'The sample answers below respond to a model part (a) piece. It is a story.'
    );
    expect(parts.stimulus).toBeUndefined();
  });

  it('leaves a case study as context', () => {
    const scenario = 'A cafe produces quality food and friendly, personalised service.';
    expect(splitPastHscScenario(scenario)).toEqual({
      context: scenario,
      instructions: [],
      assessedOn: [],
    });
  });

  it('accounts for every word of every shipped past scenario', () => {
    const dir = join(process.cwd(), 'public/courseData');
    for (const file of readdirSync(dir).filter((f) => f.startsWith('HSC'))) {
      const course: Course = JSON.parse(readFileSync(join(dir, file), 'utf8'))[0];
      for (const t of course.topics)
        for (const st of t.subTopics)
          for (const dp of st.dotPoints)
            for (const p of dp.prompts) {
              if (!p.isPastHSC || !p.scenario) continue;
              const parts = splitPastHscScenario(p.scenario);
              const words = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');
              const stimulus = parts.stimulus ? parts.stimulus.lines.join('') : '';
              // A stimulus held after a paragraph of context (a table beside its
              // screenshot) follows that context.
              const contextFirst = /\n\n(Stimulus|Extract):/.test(p.scenario);
              const rebuilt = [
                ...parts.instructions,
                parts.sampleNote ?? '',
                contextFirst ? (parts.context ?? '') + stimulus : stimulus + (parts.context ?? ''),
                parts.assessedOn.join(''),
              ].join('');
              // Nothing dropped and nothing moved: the parts, read in order, are the
              // scenario without its lead-in and label.
              const original = p.scenario
                .replace('Your answer will be assessed on how well you:', '')
                .replace(/(^|\n\n)(Stimulus|Extract):/, '$1');
              expect(words(rebuilt), p.id).toBe(words(original));
            }
    }
  });
});

describe('choosing a prescribed text', () => {
  beforeEach(() => window.localStorage.clear());

  const answers = [
    { id: '1', mark: 20, prescribedText: 'Vertigo' },
    { id: '2', mark: 20, prescribedText: 'The Crucible' },
    { id: '3', mark: 12, prescribedText: 'Vertigo' },
  ] as SampleAnswer[];

  it('lists the texts in the order they first appear', () => {
    expect(prescribedTextsOf(answers)).toEqual(['Vertigo', 'The Crucible']);
    expect(prescribedTextsOf([{ id: 'x', mark: 4 } as SampleAnswer])).toEqual([]);
  });

  it('shows the chosen text, and every answer when none is chosen or none is on it', () => {
    expect(onText(answers, 'The Crucible').map((a) => a.id)).toEqual(['2']);
    expect(onText(answers, null)).toHaveLength(3);
    expect(onText(answers.slice(2), 'The Crucible').map((a) => a.id)).toEqual(['3']);
  });

  it('remembers the latest choice for the next question set on that text', () => {
    expect(rememberedTextAmong(['Vertigo'])).toBeNull();
    rememberText('Vertigo');
    rememberText('Billy Elliot');
    expect(rememberedTextAmong(['Vertigo', 'Feed'])).toBe('Vertigo');
    expect(rememberedTextAmong(['Billy Elliot', 'Vertigo'])).toBe('Billy Elliot');
  });
});
