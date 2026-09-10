import { describe, it, expect } from 'vitest';
import { classifySyllabusTerms } from '../../utils/syllabusTermSource';

/**
 * Which listed terms the Syllabus Terms panel calls must-use.
 *
 * The rule this pins down replaced one that read the dot point and nothing
 * else, and the case that broke it is the first test below: a question whose
 * own stem names two of its terms, filed under a dot point that names neither,
 * showed every term on its list as merely supporting.
 */
describe('classifySyllabusTerms', () => {
  const TESTING = {
    topicName: 'Software automation',
    subTopicName: 'Testing and debugging',
    dotPointText: 'apply testing methodologies to a software solution',
    question:
      'Assess the effectiveness of implementing an automated unit testing methodology compared to manual ad-hoc testing for maintaining code reliability in the library management system.',
    scenario:
      'A development team is finalising a library management system. The team needs to decide between relying on manual ad hoc testing performed by developers or investing time in developing a suite of automated unit tests.',
  };

  it('promotes the terms the question is built on, not just the dot point’s', () => {
    const found = classifySyllabusTerms(
      ['automated unit testing', 'manual ad-hoc testing', 'regression testing', 'test scripts'],
      TESTING
    );

    expect(found.get('automated unit testing')).toBe('question');
    expect(found.get('manual ad-hoc testing')).toBe('question');
    // Neither the question nor its syllabus names these — they stay supporting.
    expect(found.has('regression testing')).toBe(false);
    expect(found.has('test scripts')).toBe(false);
  });

  it('reads a term through a moved inflection', () => {
    // The scenario writes "a suite of automated unit tests"; the listed term is
    // "automated unit testing". Only the LAST word moved, and the shared
    // keyword matcher bends a phrase once, so it cannot reach this.
    const found = classifySyllabusTerms(['automated unit testing'], {
      scenario: TESTING.scenario,
    });
    expect(found.get('automated unit testing')).toBe('scenario');
  });

  it('reads hyphens and spaces as the same word break', () => {
    const found = classifySyllabusTerms(['ad hoc testing'], { question: TESTING.question });
    expect(found.get('ad hoc testing')).toBe('question');
  });

  it('names the strongest source when several would do', () => {
    const found = classifySyllabusTerms(['software solution', 'testing methodologies'], TESTING);

    // Only the dot point says this one...
    expect(found.get('software solution')).toBe('dotPoint');
    // ...while this one is in the dot point AND the question's own stem, and a
    // student needs to hear the stronger of the two.
    expect(found.get('testing methodologies')).toBe('question');
  });

  it('accepts the sub-topic and the topic as sources', () => {
    const found = classifySyllabusTerms(['debugging', 'software automation', 'peer review'], {
      topicName: TESTING.topicName,
      subTopicName: TESTING.subTopicName,
    });

    expect(found.get('debugging')).toBe('subTopic');
    expect(found.get('software automation')).toBe('topic');
    expect(found.has('peer review')).toBe(false);
  });

  it('never promotes a word the whole course is written in, from any source', () => {
    // A lone "testing" is the wallpaper of a sub-topic called "Testing and
    // debugging", and the question stem says it too — which proves nothing
    // about THIS question. It stays on the list as a supporting term.
    expect(classifySyllabusTerms(['testing'], TESTING).has('testing')).toBe(false);
    expect(classifySyllabusTerms(['testing'], { question: TESTING.question }).has('testing')).toBe(
      false
    );

    // The same word inside a phrase is subject matter and still counts.
    expect(
      classifySyllabusTerms(['automated unit testing'], TESTING).get('automated unit testing')
    ).toBe('question');
  });

  it('never promotes the instruction itself', () => {
    // A keyword list carrying "evaluate" told a student the command verb was a
    // syllabus term to weave in — and told the exemplar writer to build an
    // answer around it. A phrase with a verb in it is untouched: the subject
    // matter is in the noun.
    const found = classifySyllabusTerms(['evaluate', 'evaluating test data'], {
      question: 'Evaluate the testing strategy, evaluating test data as you go.',
    });

    expect(found.has('evaluate')).toBe(false);
    expect(found.get('evaluating test data')).toBe('question');
  });

  it('keeps the matcher’s own knowledge of initialisms and spellings', () => {
    const found = classifySyllabusTerms(['multi-factor authentication', 'data modelling'], {
      question: 'Explain how MFA and data modeling protect a payroll system.',
    });

    expect(found.get('multi-factor authentication')).toBe('question');
    expect(found.get('data modelling')).toBe('question');
  });

  it('matches whole words only', () => {
    const found = classifySyllabusTerms(['class', 'test'], {
      question: 'Describe the classification of a latest release.',
    });
    expect(found.size).toBe(0);
  });

  it('returns nothing when there is no context to read', () => {
    expect(classifySyllabusTerms(['encryption'], {}).size).toBe(0);
    expect(classifySyllabusTerms([], TESTING).size).toBe(0);
  });
});
