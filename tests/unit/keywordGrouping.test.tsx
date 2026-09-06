import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import KeywordEditor from '../../components/KeywordEditor';
import { Prompt, PromptVerb } from '../../types';

/**
 * The two groups in the Syllabus Terms panel, and the rule between them.
 *
 * The terms a Band 6 answer HAS to contain and the ones that would merely
 * strengthen it were one wrapping row of chips, ordered syllabus-first. The
 * boundary was real but had to be inferred from a change of chip colour
 * partway along the row — and on a row that wraps, that change lands at a
 * different place at every panel width, sometimes mid-row and sometimes at the
 * start of one.
 *
 * What is pinned here is the part a person cannot check by looking once: that
 * the rule appears when there are two groups to separate and NOT when there is
 * only one, and that a screen reader gets the same split from the groups
 * themselves rather than from a decorative line it cannot see.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const DOT_POINT =
  'Assess the risks and hazards of a fieldwork investigation, and the controls that manage them.';

const prompt = (keywords: string[]): Prompt =>
  ({
    id: 'p1',
    question: 'Assess the risks of the proposed fieldwork.',
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 6,
    keywords,
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
  }) as Prompt;

const renderEditor = (keywords: string[], syllabusText = DOT_POINT) =>
  render(
    <KeywordEditor
      prompt={prompt(keywords)}
      onKeywordsChange={() => {}}
      isEnriching={false}
      onRegenerate={() => {}}
      isRegenerating={false}
      regenerateError={null}
      onSuggest={() => {}}
      isSuggesting={false}
      suggestError={null}
      userRole="user"
      syllabusText={syllabusText}
    />
  );

const syllabusGroup = () => screen.queryByRole('group', { name: /named in the syllabus/i });
const supportingGroup = () => screen.queryByRole('group', { name: /^supporting terms$/i });

describe('Syllabus Terms: the two groups and the rule between them', () => {
  it('splits the chips by whether the dot point names them', () => {
    renderEditor(['Risk', 'Hazard', 'Mitigation', 'Likelihood']);

    const named = syllabusGroup();
    const supporting = supportingGroup();
    expect(named).not.toBeNull();
    expect(supporting).not.toBeNull();

    // "Risk" and "Hazard" appear in DOT_POINT; the other two do not.
    expect(within(named as HTMLElement).getByText('Risk')).toBeTruthy();
    expect(within(named as HTMLElement).getByText('Hazard')).toBeTruthy();
    expect(within(supporting as HTMLElement).getByText('Mitigation')).toBeTruthy();
    expect(within(supporting as HTMLElement).getByText('Likelihood')).toBeTruthy();
  });

  it('draws the rule only when there are two groups to separate', () => {
    renderEditor(['Risk', 'Mitigation']);
    // The label lives in the rule, so finding it is finding the rule. The
    // group's own accessible name is matched exactly, so it cannot stand in.
    expect(screen.getByText('Supporting terms')).toBeTruthy();
  });

  it('draws no rule when every term is named in the dot point', () => {
    renderEditor(['Risk', 'Hazard']);
    expect(syllabusGroup()).not.toBeNull();
    expect(supportingGroup()).toBeNull();
    expect(screen.queryByText('Supporting terms')).toBeNull();
  });

  it('draws no rule when no term is named in the dot point', () => {
    renderEditor(['Mitigation', 'Likelihood']);
    expect(syllabusGroup()).toBeNull();
    expect(supportingGroup()).not.toBeNull();
    // One group needs no boundary — a rule across it would claim a distinction
    // the panel is not making.
    expect(screen.queryByText('Supporting terms')).toBeNull();
  });

  it('keeps the empty state, which belongs to neither group', () => {
    renderEditor([]);
    expect(screen.getByText(/no syllabus terms defined/i)).toBeTruthy();
    expect(syllabusGroup()).toBeNull();
    expect(supportingGroup()).toBeNull();
  });
});
