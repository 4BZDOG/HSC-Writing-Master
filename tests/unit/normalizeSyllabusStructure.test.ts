import { describe, it, expect } from 'vitest';
import { normalizeSyllabusStructure } from '../../utils/dataManagerUtils';

/**
 * normalizeSyllabusStructure is the reliability backbone of syllabus import: it
 * turns whatever the AI returns into clean, crash-proof preview data. These
 * tests pin the shapes we've seen the model produce.
 */
describe('normalizeSyllabusStructure', () => {
  it('passes through a clean array unchanged (trimmed)', () => {
    const out = normalizeSyllabusStructure([
      { name: '  Software Dev  ', subTopics: [{ name: 'Testing', dotPoints: ['unit', ' e2e '] }] },
    ]);
    expect(out).toEqual([
      { name: 'Software Dev', subTopics: [{ name: 'Testing', dotPoints: ['unit', 'e2e'] }] },
    ]);
  });

  it('unwraps an object wrapped under topics/data', () => {
    const wrapped = { topics: [{ name: 'T', subTopics: [{ name: 'S', dotPoints: ['a'] }] }] };
    expect(normalizeSyllabusStructure(wrapped)).toHaveLength(1);
    const dataWrapped = { data: [{ name: 'T', subTopics: [] }] };
    expect(normalizeSyllabusStructure(dataWrapped)[0].name).toBe('T');
  });

  it('accepts a single topic object', () => {
    const out = normalizeSyllabusStructure({
      name: 'Solo',
      subTopics: [{ name: 'X', dotPoints: [] }],
    });
    expect(out).toEqual([{ name: 'Solo', subTopics: [{ name: 'X', dotPoints: [] }] }]);
  });

  it('coerces dot points that arrive as objects', () => {
    const out = normalizeSyllabusStructure([
      {
        name: 'T',
        subTopics: [
          {
            name: 'S',
            dotPoints: [{ description: 'from description' }, { text: 'from text' }, 'plain'],
          },
        ],
      },
    ]);
    expect(out[0].subTopics[0].dotPoints).toEqual(['from description', 'from text', 'plain']);
  });

  it('promotes topic-level dot points into a "General" sub-topic', () => {
    const out = normalizeSyllabusStructure([{ name: 'T', dotPoints: ['x', 'y'] }]);
    expect(out[0].subTopics).toEqual([{ name: 'General', dotPoints: ['x', 'y'] }]);
  });

  it('handles renamed keys (subtopics / dotpoints / points)', () => {
    const out = normalizeSyllabusStructure([
      { name: 'T', subtopics: [{ name: 'S', points: ['p1'] }] },
    ]);
    expect(out[0].subTopics[0].dotPoints).toEqual(['p1']);
  });

  it('accepts bare-string sub-topics', () => {
    const out = normalizeSyllabusStructure([{ name: 'T', subTopics: ['Just a name'] }]);
    expect(out[0].subTopics).toEqual([{ name: 'Just a name', dotPoints: [] }]);
  });

  it('drops empty/garbage nodes and never throws', () => {
    expect(normalizeSyllabusStructure(null)).toEqual([]);
    expect(normalizeSyllabusStructure('not json')).toEqual([]);
    expect(normalizeSyllabusStructure([null, 42, {}, { name: '   ' }])).toEqual([]);
    // a topic whose only sub-topic is empty is dropped entirely
    expect(
      normalizeSyllabusStructure([{ name: '', subTopics: [{ name: '', dotPoints: [] }] }])
    ).toEqual([]);
  });

  it('defaults missing names but keeps content', () => {
    const out = normalizeSyllabusStructure([{ subTopics: [{ dotPoints: ['keep me'] }] }]);
    expect(out).toEqual([
      { name: 'Untitled Topic', subTopics: [{ name: 'General', dotPoints: ['keep me'] }] },
    ]);
  });

  it('recombines dot points split from a parent ending with "including:"', () => {
    const out = normalizeSyllabusStructure([
      {
        name: 'T',
        subTopics: [
          {
            name: 'S',
            dotPoints: [
              'explore models of training ML including:',
              'supervised learning',
              'unsupervised learning',
              'reinforcement learning',
              'Analyse the impact of AI on society',
            ],
          },
        ],
      },
    ]);
    expect(out[0].subTopics[0].dotPoints).toEqual([
      'explore models of training ML including supervised learning, unsupervised learning, reinforcement learning',
      'Analyse the impact of AI on society',
    ]);
  });

  it('recombines dot points split from a parent ending with "such as"', () => {
    const out = normalizeSyllabusStructure([
      {
        name: 'T',
        subTopics: [
          {
            name: 'S',
            dotPoints: [
              'investigate data types such as',
              'integer',
              'string',
              'boolean',
            ],
          },
        ],
      },
    ]);
    expect(out[0].subTopics[0].dotPoints).toEqual([
      'investigate data types including integer, string, boolean',
    ]);
  });

  it('leaves dot points alone when no parent-child pattern detected', () => {
    const out = normalizeSyllabusStructure([
      {
        name: 'T',
        subTopics: [
          {
            name: 'S',
            dotPoints: ['Explain concept A', 'Analyse concept B', 'Evaluate concept C'],
          },
        ],
      },
    ]);
    expect(out[0].subTopics[0].dotPoints).toEqual([
      'Explain concept A',
      'Analyse concept B',
      'Evaluate concept C',
    ]);
  });
});
