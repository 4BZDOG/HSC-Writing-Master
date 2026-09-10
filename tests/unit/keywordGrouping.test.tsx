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
 *
 * What decides the split is `classifySyllabusTerms`, tested on its own in
 * `syllabusTermSource.test.ts`. Pinned here is that the panel reads EVERY level
 * of the question's context through it, not just the dot point it started with:
 * a term the question's own stem names belongs above the rule.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const DOT_POINT =
  'Assess the risks and hazards of a fieldwork investigation, and the controls that manage them.';

const prompt = (keywords: string[], overrides: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Assess the risks of the proposed fieldwork.',
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 6,
    keywords,
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
    ...overrides,
  }) as Prompt;

/** The question's whole context: what it asks, and the syllabus above it. */
interface Context {
  question?: string;
  scenario?: string;
  dotPointText?: string;
  subTopicName?: string;
  topicName?: string;
}

const renderEditor = (keywords: string[], context: Context = {}) =>
  render(
    <KeywordEditor
      prompt={prompt(keywords, {
        ...(context.question !== undefined && { question: context.question }),
        ...(context.scenario !== undefined && { scenario: context.scenario }),
      })}
      onKeywordsChange={() => {}}
      isEnriching={false}
      onRegenerate={() => {}}
      isRegenerating={false}
      regenerateError={null}
      onSuggest={() => {}}
      isSuggesting={false}
      suggestError={null}
      userRole="user"
      dotPointText={context.dotPointText ?? DOT_POINT}
      subTopicName={context.subTopicName}
      topicName={context.topicName}
    />
  );

const syllabusGroup = () =>
  screen.queryByRole('group', { name: /named in the question or syllabus/i });
const supportingGroup = () => screen.queryByRole('group', { name: /^supporting terms$/i });

describe('Syllabus Terms: the two groups and the rule between them', () => {
  it('splits the chips by whether the question or its syllabus names them', () => {
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

  it('draws no rule when every term is named', () => {
    renderEditor(['Risk', 'Hazard']);
    expect(syllabusGroup()).not.toBeNull();
    expect(supportingGroup()).toBeNull();
    expect(screen.queryByText('Supporting terms')).toBeNull();
  });

  it('draws no rule when no term is named anywhere', () => {
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

describe('Syllabus Terms: every level of the question’s context', () => {
  const TESTING: Context = {
    topicName: 'Software automation',
    subTopicName: 'Testing and debugging',
    dotPointText: 'apply testing methodologies to a software solution',
    question:
      'Assess the effectiveness of implementing an automated unit testing methodology compared to manual ad-hoc testing for maintaining code reliability.',
    scenario: 'The team is investing time in developing a suite of automated unit tests.',
  };

  it('names the terms the question is built on, which its dot point never says', () => {
    renderEditor(
      ['automated unit testing', 'manual ad-hoc testing', 'regression testing'],
      TESTING
    );

    const named = syllabusGroup();
    expect(named).not.toBeNull();
    expect(within(named as HTMLElement).getByText('automated unit testing')).toBeTruthy();
    expect(within(named as HTMLElement).getByText('manual ad-hoc testing')).toBeTruthy();
    expect(within(supportingGroup() as HTMLElement).getByText('regression testing')).toBeTruthy();
  });

  it('reads the scenario and the sub-topic as well', () => {
    renderEditor(['debugging'], { ...TESTING, question: 'Assess the approach taken.' });
    expect(within(syllabusGroup() as HTMLElement).getByText('debugging')).toBeTruthy();
  });

  it('tells the student which level names the term', () => {
    renderEditor(['automated unit testing', 'software solution'], TESTING);

    expect(screen.getByText('automated unit testing').closest('button')).toHaveProperty(
      'title',
      'Named in the question — a must-use term'
    );
    expect(screen.getByText('software solution').closest('button')).toHaveProperty(
      'title',
      'Named in the syllabus dot point — a must-use term'
    );
  });
});

/**
 * The coverage chip counts the two groups apart.
 *
 * "2/9 used" counted a term the question is built on and one that would merely
 * strengthen an answer as the same tick — the one distinction the panel below
 * it spends two groups and a rule making.
 */
describe('Syllabus Terms: the coverage chip', () => {
  const TESTING: Context = {
    dotPointText: 'apply testing methodologies to a software solution',
    question: 'Assess automated unit testing against manual ad-hoc testing.',
  };

  const renderWithAnswer = (keywords: string[], userAnswer: string, context: Context) =>
    render(
      <KeywordEditor
        prompt={prompt(keywords, { question: context.question })}
        onKeywordsChange={() => {}}
        isEnriching={false}
        onRegenerate={() => {}}
        isRegenerating={false}
        regenerateError={null}
        onSuggest={() => {}}
        isSuggesting={false}
        suggestError={null}
        userRole="user"
        userAnswer={userAnswer}
        dotPointText={context.dotPointText}
      />
    );

  it('splits the count when the question has terms of both kinds', () => {
    renderWithAnswer(
      ['automated unit testing', 'manual ad-hoc testing', 'regression testing'],
      'I used automated unit testing throughout.',
      TESTING
    );
    expect(screen.getByText('1/2 key · 0/1 more')).toBeTruthy();
  });

  it('keeps the single number when there is only one group', () => {
    // Nothing here is named by the question, so there is nothing to separate.
    renderWithAnswer(['regression testing', 'test scripts'], 'Nothing relevant.', TESTING);
    expect(screen.getByText('0/2 used')).toBeTruthy();
  });
});
