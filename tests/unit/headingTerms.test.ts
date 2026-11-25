import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { courseWideWords, missingSyllabusTerms } from '../../utils/syllabusTermGaps';
import {
  buildAuditTree,
  syllabusTermGaps,
  type TreeNode,
} from '../../components/admin/contentAudit/auditModel';
import type { Course } from '../../types';

/**
 * Missing Terms could not see a one-word concept. Economics 2024 22(a) asks
 * "Outline ONE cause of inflation in Australia." under the sub-topic
 * "Inflation", and its list read "cost inflation", "inflation rate"... — every
 * check counted "inflation" as covered by "cost inflation". A term the heading
 * names, that the dot point and question both use, must be listed in its own
 * right (`missingSyllabusTerms` with a context).
 */

const INFLATION_DP =
  'Types and causes of inflation, including demand-pull, cost-push, inflationary expectations, imported inflation';
const wide = new Set(['economy', 'economic', 'australian', 'australia']);

describe('terms a syllabus heading names', () => {
  const prompt = {
    question: 'Outline ONE cause of inflation in Australia.',
    keywords: [
      'cost inflation',
      'raw materials',
      'labour',
      'goods and services',
      'inflation rate',
      'profits',
    ],
  };

  it('proposes the heading concept the list only carries inside longer phrases', () => {
    const terms = missingSyllabusTerms(INFLATION_DP, prompt, {
      headings: ['Inflation', 'Economic issues in the Australian economy'],
      courseWideWords: wide,
    });
    expect(terms).toContain('inflation');
  });

  it('stays silent without the headings, as before', () => {
    expect(missingSyllabusTerms(INFLATION_DP, prompt)).not.toContain('inflation');
  });

  it('is satisfied once the term is listed on its own', () => {
    const terms = missingSyllabusTerms(
      INFLATION_DP,
      { ...prompt, keywords: [...prompt.keywords, 'Inflation'] },
      { headings: ['Inflation'], courseWideWords: wide }
    );
    expect(terms).not.toContain('inflation');
  });

  it('never proposes a word on most of the course’s pages', () => {
    const terms = missingSyllabusTerms(
      'The Australian economy and its performance',
      { question: 'Describe the performance of the Australian economy.', keywords: ['growth'] },
      { headings: ['Economy'], courseWideWords: wide }
    );
    expect(terms.map((t) => t.toLowerCase())).not.toContain('economy');
  });

  it('treats a name the dot point capitalises as the setting, not a term', () => {
    const terms = missingSyllabusTerms(
      'Australia’s foreign policy between 1918 and 1949',
      { question: 'Explain how Australia’s foreign policy changed.', keywords: ['foreign policy'] },
      { headings: ['Australia and the world 1918–1949'] }
    );
    expect(terms).toEqual([]);
  });

  it('takes a heading whole, not a word from inside it', () => {
    const terms = missingSyllabusTerms(
      'US foreign policy from isolationism to involvement',
      {
        question: 'How successful was US foreign policy in this period?',
        keywords: ['isolationism'],
      },
      { headings: ['US foreign policy 1919–1941'] }
    );
    expect(terms.map((t) => t.toLowerCase())).not.toContain('foreign');
  });

  it('skips a lone word before "and" that modifies the noun after it', () => {
    const terms = missingSyllabusTerms(
      'Personal interests and their influence',
      { question: 'Explain how personal interests influence choices.', keywords: ['influence'] },
      { headings: ['Personal and group interests'] }
    );
    expect(terms.map((t) => t.toLowerCase())).not.toContain('personal');
  });

  it('finds words written on more than 6% of a course’s dot points', () => {
    const texts = [...Array(20)].map((_, i) => (i < 5 ? 'the economy grows' : `topic ${i}`));
    const words = courseWideWords(texts);
    expect(words.has('economy')).toBe(true);
    expect(words.has('topic')).toBe(true);
    expect(words.has('grow')).toBe(true);
  });
});

describe('the Content Studio sees the heading rule on the shipped library', () => {
  it('flags Economics 2024 22(a) until "inflation" is listed in its own right', () => {
    const file = join(process.cwd(), 'public/courseData/HSCEconomics.json');
    const courses = JSON.parse(readFileSync(file, 'utf8')) as Course[];
    const find = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const n of nodes) {
        if (n.id === 'prompt-eco-hsc-2024-22a') return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    const node = find(buildAuditTree(courses));
    expect(node).toBeDefined();
    const listed = ((node!.dataRef as { keywords?: string[] }).keywords ?? []).map((k) =>
      k.toLowerCase()
    );
    const gaps = syllabusTermGaps(node!).map((t) => t.toLowerCase());
    // Either the shipped list already carries the term, or the audit asks for it.
    expect(listed.includes('inflation') || gaps.includes('inflation')).toBe(true);
  });
});
