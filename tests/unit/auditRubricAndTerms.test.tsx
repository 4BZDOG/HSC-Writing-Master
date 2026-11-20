import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import {
  isNonStandardRubric,
  syllabusTermGaps,
  type TreeNode,
} from '../../components/admin/contentAudit/auditModel';
import { dropNonSyllabusTerms, sanitiseKeywords } from '../../services/geminiService';
import { missingSyllabusTerms } from '../../utils/syllabusTermGaps';
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

describe('missingSyllabusTerms — the terms a question is built on', () => {
  const dotPoint =
    'Verify and validate an enterprise computing system, including evaluating test data, ' +
    'trialling operation and maintenance documentation, and reviewing the impact of implementation.';

  it('finds a phrase the syllabus and the question are both built on', () => {
    const terms = missingSyllabusTerms(dotPoint, {
      question: "Explain how 'evaluating test data' contributes to verification of a new system.",
      scenario: 'A new accounting system is being checked against its test data before launch.',
      keywords: ['verify', 'validate', 'documentation'],
    });
    expect(terms).toContain('test data');
  });

  it('prefers the phrase over its own words', () => {
    // With "test data" kept there is nothing to be gained by adding "test" and
    // "data" beside it.
    const terms = missingSyllabusTerms(dotPoint, {
      question: 'Explain how evaluating test data supports validation.',
      scenario: 'The team reviews the test data gathered during the final run.',
      keywords: [],
    });
    expect(terms).toContain('test data');
    expect(terms).not.toContain('data');
    expect(terms).not.toContain('test');
  });

  it('says nothing when the list already covers the term', () => {
    const terms = missingSyllabusTerms(dotPoint, {
      question: 'Explain how evaluating test data supports validation.',
      scenario: 'The team reviews the test data gathered during the final run.',
      keywords: ['Evaluating test data'],
    });
    expect(terms).not.toContain('test data');
  });

  it('never offers the command verb or a word carrying no subject matter', () => {
    const terms = missingSyllabusTerms('Explain the important process of maintenance.', {
      question: 'Explain the important process of maintenance in an enterprise system.',
      scenario: 'A system has been in operation for a year and its maintenance is under review.',
      keywords: [],
    });
    expect(terms).toEqual(['maintenance']);
  });

  it('offers a phrase the question uses even with no scenario at all', () => {
    // The case that prompted this: the five shipped questions about big data
    // have it in the dot point and the question, and their scenarios say
    // "billions of data points". A rule needing all three cannot see it.
    const terms = missingSyllabusTerms(
      'Explain how big data affects the design of data visualisation.',
      {
        question: 'Identify two design challenges that big data creates for data visualisation.',
        scenario: 'A designer must chart a dataset with billions of points.',
        keywords: ['design'],
      }
    );
    expect(terms).toContain('big data');
  });

  it('makes a lone word earn all three, because that is where the verbs hide', () => {
    // "maintenance" is in the dot point and the question but not the scenario.
    // Single words agree between a dot point and a question for reasons that
    // have nothing to do with subject matter — both open with an instruction.
    const terms = missingSyllabusTerms('Explain the maintenance of a system.', {
      question: 'Explain the maintenance required by an enterprise system.',
      scenario: 'A system has been running for a year and needs updates.',
      keywords: [],
    });
    expect(terms).not.toContain('maintenance');
  });

  it('offers a lone word all three DO agree on, when it is not the course’s wallpaper', () => {
    // The counterpart to the test above, and the case that prompted the check:
    // "maintenance" named in the dot point, the question AND the scenario.
    const terms = missingSyllabusTerms(
      'Explain the maintenance required to keep an enterprise system running.',
      {
        question: 'Explain the maintenance an enterprise system requires after deployment.',
        scenario: 'A retailer has run the same platform for six years with no maintenance plan.',
        keywords: ['deployment'],
      }
    );
    expect(terms).toContain('maintenance');
  });

  it('will not offer a bare word the whole course is written in', () => {
    /**
     * All three sources say "software" and "development" here, so the
     * all-three rule passes them — and it should not. They are the wallpaper of
     * a Software Engineering course, not something this question is about. Over
     * the shipped library this was 22 of the 30 terms the lone-word branch
     * offered.
     */
    const terms = missingSyllabusTerms('Explain the software development life cycle.', {
      question: 'Explain the stages of software development in a large project.',
      scenario: 'A software house is planning the development of a new project.',
      keywords: [],
    });
    expect(terms).not.toContain('software');
    expect(terms).not.toContain('development');
    expect(terms).not.toContain('project');
  });

  it('still builds a phrase out of the words it will not offer alone', () => {
    // The generic list is consulted only where a single word asks to stand as a
    // term. Putting these words in the phrase-building stop list instead would
    // have deleted "big data" and "data security" along with the noise.
    const terms = missingSyllabusTerms(
      'Investigate how big data is used in a data security context.',
      {
        question: 'Explain how big data changes the data security posture of an enterprise.',
        scenario: 'An insurer now ingests billions of records a day.',
        keywords: [],
      }
    );
    expect(terms).toContain('big data');
    expect(terms).toContain('data security');
    expect(terms).not.toContain('data');
  });

  it('keeps a name whole rather than shredding it into overlapping pairs', () => {
    const terms = missingSyllabusTerms(
      'Describe the Cultural Knowledges of Aboriginal and Torres Strait Islander Peoples.',
      {
        question: "Examine how Torres Strait Islander Peoples' observations shaped fire regimes.",
        keywords: ['Cultural burning'],
      }
    );
    expect(terms).toContain('Torres Strait Islander Peoples');
    expect(terms).not.toContain('Torres Strait');
    expect(terms).not.toContain('Strait Islander');
  });

  it('matches whole words, not substrings', () => {
    // "model" is not present in "modelling".
    const terms = missingSyllabusTerms('Conduct an investigation to model the process.', {
      question: 'Analyse the roles demonstrated in a practical modelling investigation.',
      scenario: 'A student completed a practical modelling investigation.',
      keywords: [],
    });
    expect(terms).not.toContain('model');
  });

  it('does not run a phrase across punctuation', () => {
    const terms = missingSyllabusTerms('Explain primary, secondary and tertiary structures.', {
      question: 'Explain how primary, secondary and tertiary structures arise.',
      keywords: [],
    });
    expect(terms).not.toContain('primary secondary');
    expect(terms).not.toContain('primary secondary tertiary');
  });
});

describe('the studio offers the missing terms as an edit', () => {
  const withGap: Course[] = [
    {
      id: 'c2',
      name: 'HSC Enterprise Computing',
      outcomes: [{ code: 'EC-1', description: 'An outcome' }],
      topics: [
        {
          id: 't2',
          name: 'Enterprise project',
          subTopics: [
            {
              id: 'st2',
              name: 'Implementation',
              dotPoints: [
                {
                  id: 'dp2',
                  description:
                    'Verify and validate an enterprise system, including evaluating test data and reviewing bug data.',
                  prompts: [
                    {
                      id: 'pr2',
                      question:
                        'Explain how evaluating test data and bug data supports validation.',
                      scenario:
                        'A new accounting system is checked against its test data and bug data before launch.',
                      totalMarks: 4,
                      verb: 'EXPLAIN',
                      linkedOutcomes: ['EC-1'],
                      keywords: ['verify', 'validate'],
                      markingCriteria: '4 marks: full\n3 marks: most\n1-2 marks: some',
                      sampleAnswers: [],
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

  it('counts them, adds them, and leaves the existing list alone', () => {
    let draft: Course[] = JSON.parse(JSON.stringify(withGap));
    const updateCourses = vi.fn((updater: (d: Course[]) => Course[] | void) => {
      const result = updater(draft);
      if (result) draft = result;
    });
    const showToast = vi.fn();
    render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={withGap}
        updateCourses={updateCourses}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByLabelText('Select HSC Enterprise Computing'));
    const add = screen.getByText('Add Terms (1)').closest('button') as HTMLButtonElement;
    expect(add.disabled).toBe(false);

    fireEvent.click(add);

    const kept = draft[0].topics[0].subTopics[0].dotPoints[0].prompts![0].keywords!;
    // The curator's own two terms keep their place and their wording; the
    // syllabus's words are appended.
    expect(kept.slice(0, 2)).toEqual(['verify', 'validate']);
    expect(kept).toContain('test data');
    expect(kept).toContain('bug data');
  });
});

/**
 * Missing Terms proposed fragments and verbs: "shape meaning", "Gather data",
 * "achieving Australias economic", "have shaped", "Australias". The candidate
 * rules are the same whatever the question says, so each case is a dot point
 * whose words the question and scenario repeat — the case most likely to be
 * proposed, and the one the rules exist for.
 */
describe('missingSyllabusTerms — fragments and non-command verbs are not terms', () => {
  const echoed = (dotPoint: string, fragment: string) => ({
    question: `Explain the ${fragment} in this case.`,
    scenario: `In the case, the ${fragment} is set out.`,
    keywords: [] as string[],
    dotPoint,
  });

  it.each([
    'develop',
    'produce',
    'generate',
    'prepare',
    'collect',
    'promote',
    'protect',
    'improve',
    'achieve',
    'have',
    'make',
    'give',
    'take',
    'name',
    'writing',
  ])('never proposes "%s" as a term, alone or in a phrase', (word) => {
    const dotPoint = `Discuss how governments ${word} human rights in a democracy.`;
    const terms = missingSyllabusTerms(dotPoint, {
      question: `Discuss how governments ${word} human rights in a democracy.`,
      scenario: `Governments ${word} human rights in a democracy.`,
      keywords: [],
    });
    const words = terms.flatMap((t) => t.toLowerCase().split(' '));
    expect(words).not.toContain(word);
  });

  it.each([
    ['Analyse how texts shape meaning.', 'shape meaning'],
    ['Gather data about the local council.', 'Gather data'],
    ['Assess how policies improve access to services.', 'improve access'],
    ['Discuss how the states promoting international trade.', 'promoting international'],
    [
      'Assess how Australia achieving Australia’s economic goals.',
      'achieving Australia’s economic',
    ],
    ['Explain how the artists have shaped the movement.', 'have shaped'],
    ['Suggest probable future outcomes.', 'suggest probable future'],
    ['Describe the field around a magnet.', 'field around'],
    ['Infer past climates from the record.', 'infer past'],
    ['Describe how the firm can make informed choices.', 'make informed'],
  ])('does not propose the fragment from "%s"', (dotPoint, fragment) => {
    const terms = missingSyllabusTerms(dotPoint, echoed(dotPoint, fragment.replace(/ ?’s/, 's')));
    expect(terms.map((t) => t.toLowerCase())).not.toContain(
      fragment.replace(/’/g, "'").toLowerCase()
    );
  });

  it('keeps a final -ing word after subject matter: problem solving, decision making', () => {
    const terms = missingSyllabusTerms('Analyse the role of problem solving in decision making.', {
      question: 'Analyse the role of problem solving in decision making in a company.',
      scenario: 'A manager uses problem solving and decision making in a dispute.',
      keywords: [],
    });
    expect(terms).toContain('problem solving');
    expect(terms).toContain('decision making');
  });

  it('does not keep a listed verb that ends a phrase: particle moving', () => {
    const terms = missingSyllabusTerms('Describe the force on a particle moving in a field.', {
      question: 'Describe the force on a particle moving in a magnetic field.',
      scenario: 'A particle moving through the field is deflected.',
      keywords: [],
    });
    expect(terms).not.toContain('particle moving');
  });

  it('keeps the terms the syllabus writes, as they were in the syllabus', () => {
    const dotPoint =
      'Analyse human rights and problem solving, including Torres Strait Islander Peoples, ' +
      'import-competing domestic markets and secondary-source investigation.';
    const terms = missingSyllabusTerms(dotPoint, {
      question:
        'Analyse human rights and problem solving, including Torres Strait Islander Peoples, ' +
        'import-competing domestic markets and secondary-source investigation.',
      keywords: [],
    });
    for (const term of [
      'human rights',
      'problem solving',
      'Torres Strait Islander Peoples',
      'import-competing domestic markets',
      'secondary-source investigation',
    ])
      expect(terms, term).toContain(term);
  });

  it('keeps an apostrophe in the display text, and never proposes "Australias"', () => {
    const dotPoint = "Analyse Australia's economic objectives and Australia's policies.";
    const terms = missingSyllabusTerms(dotPoint, {
      question: "Analyse Australia's economic objectives and Australia's policies.",
      scenario: "The government sets Australia's economic objectives.",
      keywords: [],
    });
    expect(terms).toContain("Australia's economic objectives");
    expect(terms.some((t) => /australias/i.test(t))).toBe(false);
  });
});

describe('syllabusTermGaps — the app’s term rule applies to every proposal', () => {
  it('never proposes a word the term rule rejects, even when the question repeats it', () => {
    const dotPoint = 'Analyse the influence and significance of the media on public opinion.';
    const prompt = {
      id: 'p',
      question: 'Analyse the influence and significance of the media on public opinion.',
      scenario: 'A council assesses the influence and significance of its newsletter.',
      verb: 'ANALYSE',
      keywords: [],
    };
    const node = {
      id: 'p',
      type: 'prompt',
      label: 'p',
      dataRef: prompt,
      dotPointText: dotPoint,
      path: {},
      stats: {},
    } as unknown as TreeNode;
    const terms = syllabusTermGaps(node).map((t) => t.toLowerCase());
    expect(terms).not.toContain('influence');
    expect(terms).not.toContain('significance');
  });
});
