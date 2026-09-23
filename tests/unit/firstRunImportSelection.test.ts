import { describe, it, expect } from 'vitest';
import { untickUnplaceableTopics, type DiscoveredDoc } from '../../hooks/useSyllabusData';
import type { Course, Topic } from '../../types';

/**
 * The first-run import pre-ticked a topic whose course a new workspace does not
 * have, so a student's first action ended in "One topic was left out because
 * the course it belongs to is not in your workspace" about a topic they never
 * chose.
 */
const course = (name: string): DiscoveredDoc => ({
  id: `course:${name}`,
  name,
  source: 'test',
  subject: 'Science',
  type: 'course',
  data: { id: name, name, topics: [] } as unknown as Course,
  selected: true,
});

const topic = (targetCourseName: string): DiscoveredDoc => ({
  id: `topic:${targetCourseName}`,
  name: 'Heredity',
  source: 'test',
  subject: 'Science',
  type: 'topic',
  data: { id: 't', name: 'Heredity' } as unknown as Topic,
  selected: true,
  targetCourseName,
});

describe('first-run import selection', () => {
  it('unticks a topic whose course is not ticked', () => {
    const docs = untickUnplaceableTopics([course('HSC Biology (Advanced)'), topic('HSC Biology')]);
    expect(docs[1].selected).toBe(false);
    // The course the student is getting stays ticked.
    expect(docs[0].selected).toBe(true);
  });

  it('keeps a topic ticked when its course is ticked alongside it', () => {
    const docs = untickUnplaceableTopics([course('HSC Biology'), topic('HSC Biology')]);
    expect(docs[1].selected).toBe(true);
  });

  it('leaves unticked topics alone', () => {
    const docs = untickUnplaceableTopics([
      course('HSC Biology'),
      { ...topic('HSC Biology'), selected: false },
    ]);
    expect(docs[1].selected).toBe(false);
  });
});
