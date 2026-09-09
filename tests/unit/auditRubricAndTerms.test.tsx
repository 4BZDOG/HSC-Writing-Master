import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import { isNonStandardRubric } from '../../components/admin/contentAudit/auditModel';
import { dropNonSyllabusTerms, sanitiseKeywords } from '../../services/geminiService';
import type { Course } from '../../types';

/**
 * Two defects an admin met in the studio, both reported from real use.
 *
 * A marking guide whose bands run together on one line reported as well-formed,
 * which disabled every button that could have repaired it. And the Syllabus
 * Terms panel — the list of terms a student is told to include — was carrying
 * connectives and command verbs, which the app's own generation rule has always
 * said to exclude.
 */

// A guide whose bands are all on one line, as nine of the shipped guides are.
const RUN_TOGETHER =
  '5 marks: Provides a comprehensive analysis of the whole process.4 marks: Provides an accurate ' +
  'analysis with minor omissions.3 marks: Describes several key components.2 marks: Identifies a ' +
  'few components.1 mark: Identifies one component.';

const WELL_FORMED = [
  '5 marks: Provides a comprehensive analysis of the whole process.',
  '4 marks: Provides an accurate analysis with minor omissions.',
  '3 marks: Describes several key components.',
  '1-2 marks: Identifies one or two components.',
].join('\n');

describe('isNonStandardRubric — bands anywhere, not only at the start of a line', () => {
  it('flags a guide whose bands run together on one line', () => {
    // The old scan read only line-initial marks, so it saw exactly one band —
    // which cannot be out of order and cannot be absent — and passed it.
    expect(isNonStandardRubric(RUN_TOGETHER)).toBe(true);
  });

  it('leaves a well-formed guide alone', () => {
    expect(isNonStandardRubric(WELL_FORMED)).toBe(false);
  });

  it('still flags bands that climb rather than descend', () => {
    expect(
      isNonStandardRubric(['1 mark: Some.', '3 marks: Most.', '5 marks: All.'].join('\n'))
    ).toBe(true);
  });

  it('still flags text carrying no mark bands at all', () => {
    expect(
      isNonStandardRubric(
        'Award credit for a thorough response that covers the whole process well.'
      )
    ).toBe(true);
  });

  it('does not mistake prose about marks for a band', () => {
    // "award 1 mark for each" has no colon, which is why the mid-line rule
    // requires one — without it every guide describing its own marking would
    // read as bands running together.
    const guide = [
      '4 marks: Identifies four correct purposes; award 1 mark for each correct purpose.',
      '2 marks: Identifies two correct purposes.',
    ].join('\n');
    expect(isNonStandardRubric(guide)).toBe(false);
  });

  it('leaves a guide too short to judge to the missing-guide check', () => {
    expect(isNonStandardRubric('Too short.')).toBe(false);
    expect(isNonStandardRubric(undefined)).toBe(false);
  });
});

describe('dropNonSyllabusTerms — the app’s own rule, applied to content that predates it', () => {
  const verb = 'ASSESS';

  it('drops the command verb, connectives and generic academic words', () => {
    const kept = dropNonSyllabusTerms(
      ['Assess', 'DNA methylation', 'because', 'therefore', 'gene expression', 'process'],
      verb
    );
    expect(kept).toEqual(['DNA methylation', 'gene expression']);
  });

  it('drops an over-long phrase and a duplicate, keeping the first of each term', () => {
    const kept = dropNonSyllabusTerms(
      ['mRNA', 'a phrase far too long to be a syllabus term', 'mRNA', 'tRNA'],
      verb
    );
    expect(kept).toEqual(['mRNA', 'tRNA']);
  });

  it('does NOT cap the list', () => {
    // The twelve-term cap is a preference about newly written lists. Applying
    // it to a curated list of nineteen would throw away seven real terms.
    const many = Array.from({ length: 19 }, (_, i) => `term ${i}`);
    expect(dropNonSyllabusTerms(many, verb)).toHaveLength(19);
    // …while generation still caps, which is the difference between the two.
    expect(sanitiseKeywords(many, verb)).toHaveLength(12);
  });

  it('leaves a clean list untouched', () => {
    const clean = ['transcription', 'translation', 'polypeptide'];
    expect(dropNonSyllabusTerms(clean, verb)).toEqual(clean);
  });

  it('handles a missing list', () => {
    expect(dropNonSyllabusTerms(undefined, verb)).toEqual([]);
  });
});

const fixture: Course[] = [
  {
    id: 'c1',
    name: 'HSC Biology',
    outcomes: [{ code: 'BI-1', description: 'An outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Heredity',
        subTopics: [
          {
            id: 'st1',
            name: 'DNA',
            dotPoints: [
              {
                id: 'dp1',
                description: 'analyse polypeptide synthesis',
                prompts: [
                  {
                    id: 'pr1',
                    question: 'Analyse the roles of the template strand.',
                    totalMarks: 5,
                    verb: 'ANALYSE',
                    linkedOutcomes: ['BI-1'],
                    // Both defects on one question: a run-together guide, and a
                    // term list ending in connectives plus its own verb.
                    markingCriteria: RUN_TOGETHER,
                    keywords: ['template strand', 'mRNA', 'Analyse', 'because', 'therefore'],
                    sampleAnswers: [
                      {
                        id: 'sa1',
                        band: 5,
                        mark: 5,
                        answer: 'A sample answer long enough to count as a real exemplar here.',
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

const renderStudio = (updateCourses = vi.fn(), showToast = vi.fn()) =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={fixture}
      updateCourses={updateCourses}
      showToast={showToast}
    />
  );

afterEach(cleanup);

describe('the studio offers a repair for both', () => {
  it('enables the guide buttons for a run-together guide', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Select HSC Biology'));

    // The report was that these read (0) and sat disabled on a guide the
    // curator could see was wrong.
    expect(
      (screen.getByText('Reformat Guides (1)').closest('button') as HTMLButtonElement).disabled
    ).toBe(false);
    expect(
      (screen.getByText('Write Marking Guides (1)').closest('button') as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('counts and tidies the off-syllabus terms, keeping the real ones', () => {
    let draft: Course[] = JSON.parse(JSON.stringify(fixture));
    const updateCourses = vi.fn((updater: (d: Course[]) => Course[] | void) => {
      const result = updater(draft);
      if (result) draft = result;
    });
    const showToast = vi.fn();
    renderStudio(updateCourses, showToast);

    fireEvent.click(screen.getByLabelText('Select HSC Biology'));
    const tidy = screen.getByText('Tidy Terms (1)').closest('button') as HTMLButtonElement;
    expect(tidy.disabled).toBe(false);

    fireEvent.click(tidy);

    const kept = draft[0].topics[0].subTopics[0].dotPoints[0].prompts![0].keywords;
    expect(kept).toEqual(['template strand', 'mRNA']);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Removed 3 entries that were not a syllabus term, across 1 question\./),
      'success'
    );
  });

  it('shows the flag on the row while browsing, not only under the filter', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Expand Heredity'));
    fireEvent.click(screen.getByLabelText('Expand DNA'));
    fireEvent.click(screen.getByLabelText('Expand analyse polypeptide synthesis'));

    const badge = screen
      .getAllByText('Off-Syllabus Terms')
      .find((el) => el.tagName === 'SPAN' && el.closest('[role="tree"]'));
    expect(badge).toBeTruthy();
  });
});
