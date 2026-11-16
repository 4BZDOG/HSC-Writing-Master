import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { withReofferedShipped } from '../../hooks/useSyllabusData';

const HMS = 'course-hsc-health-and-movement-science';

describe('re-offering a shipped course that was left unticked', () => {
  it('takes Health and Movement Science out of the offered record for a browser older than 2.56.0', () => {
    const next = withReofferedShipped(new Set([HMS, 'course-hsc-biology']), '2.55.0');
    expect(next?.has(HMS)).toBe(false);
    expect(next?.has('course-hsc-biology')).toBe(true);
  });

  it('re-offers it once: a browser already at 2.56.0 keeps its choice', () => {
    expect(withReofferedShipped(new Set([HMS]), '2.56.0')?.has(HMS)).toBe(true);
  });

  it('leaves a browser with no offered record alone (it already gets every missing course)', () => {
    expect(withReofferedShipped(undefined, '2.10.0')).toBeUndefined();
  });

  it('ticks Health and Movement Science by default in the first-run picker', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/courseData/manifest.json'), 'utf8')
    );
    const entry = manifest.entries.find(
      (e: { file: string }) => e.file === 'HSCHealthAndMovementScience.json'
    );
    expect(entry?.selected).toBe(true);
  });
});
