import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import ReferenceMaterials from '../../components/ReferenceMaterials';
import { Prompt, PromptVerb, UserRole } from '../../types';

/**
 * "Common mistakes" carries two audiences, and only one of them is the student.
 *
 * `commonStudentErrors` is written about students and is useful to them.
 * `markerNotes` is written TO a marker — "Credit explicit mention of…",
 * "Higher marks awarded for…" — so it sits behind `canCurateContent`. A
 * screenshot cannot prove a role boundary holds; this can.
 *
 * Both lists were authored, validated, migrated and round-tripped through
 * Supabase for the life of the project, and rendered nowhere: 119 shipped
 * questions carry mistakes and 126 carry marker notes that nobody could read.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const MISTAKE = 'Confusing transcription with replication';
const NOTE = 'Credit explicit mention of start and stop codons';

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Explain how DNA replication ensures genetic continuity.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 7,
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
    commonStudentErrors: [MISTAKE],
    markerNotes: [NOTE],
    ...over,
  }) as Prompt;

const renderRail = (role: UserRole, over: Partial<Prompt> = {}) =>
  render(
    <ReferenceMaterials
      prompt={prompt(over)}
      topic={undefined}
      userRole={role}
      courseOutcomes={[]}
      onKeywordsChange={() => {}}
      isEnriching={false}
      onRegenerateKeywords={() => {}}
      isRegeneratingKeywords={false}
      regenerateError={null}
      onSuggestKeywords={() => {}}
      isSuggestingKeywords={false}
      suggestError={null}
      onMarkingCriteriaChange={() => {}}
      {...({} as Record<string, never>)}
    />
  );

describe('Common mistakes panel', () => {
  it('shows a student what goes wrong, and never the marker notes', () => {
    renderRail('user');
    expect(screen.getByText(/common mistakes/i)).toBeTruthy();
    expect(screen.getByText(MISTAKE)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(/what the marker looks for/i)).toBeNull();
  });

  it('shows a curator both, with the rule naming the boundary', () => {
    renderRail('admin');
    expect(screen.getByText(MISTAKE)).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText(/what the marker looks for/i)).toBeTruthy();
  });

  it('draws no rule when there is only one group to show', () => {
    // Marker notes alone: nothing above the rule, so no rule.
    renderRail('admin', { commonStudentErrors: [] });
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByText(/what the marker looks for/i)).toBeNull();
  });

  it('does not render the panel at all when the question has neither', () => {
    renderRail('admin', { commonStudentErrors: [], markerNotes: [] });
    expect(screen.queryByText(/common mistakes/i)).toBeNull();
  });

  it('does not render for a student when only marker notes exist', () => {
    // The panel would otherwise open onto nothing they are allowed to read.
    renderRail('user', { commonStudentErrors: [] });
    expect(screen.queryByText(/common mistakes/i)).toBeNull();
  });
});
