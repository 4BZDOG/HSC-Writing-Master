import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import ReferenceMaterials from '../../components/ReferenceMaterials';
import { Prompt, PromptVerb, UserRole } from '../../types';

/**
 * "Common mistakes" is off the workspace for now.
 *
 * `commonStudentErrors` and `markerNotes` are still authored, validated and
 * stored with each question — only the panel that showed them is gone. This
 * pins that neither list reaches the screen for any role, so a half-restored
 * panel (the marker notes in particular, which are written TO a marker) cannot
 * slip back in unnoticed. When the panel returns, restore the role-boundary
 * tests from this file's history.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const MISTAKE = 'Confusing transcription with replication';
const NOTE = 'Credit explicit mention of start and stop codons';

const prompt = (): Prompt =>
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
  }) as Prompt;

const renderRail = (role: UserRole) =>
  render(
    <ReferenceMaterials
      prompt={prompt()}
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
    />
  );

describe('Common mistakes panel (hidden)', () => {
  it.each<UserRole>(['user', 'teacher', 'admin'])('shows %s neither list', (role) => {
    renderRail(role);
    expect(screen.queryByText(/common mistakes/i)).toBeNull();
    expect(screen.queryByText(MISTAKE)).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(/what the marker looks for/i)).toBeNull();
  });
});
