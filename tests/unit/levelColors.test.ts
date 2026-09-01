import { describe, it, expect } from 'vitest';
import {
  LEVEL_HUE,
  LEVEL_ICON_TINT,
  COMPLETION_HUE,
  getLevelHue,
  getLevelIconTint,
  type CurriculumLevel,
} from '../../utils/levelColors';

/**
 * The curriculum path must colour each level with ONE predefined hue
 * everywhere. `utils/levelColors.ts` is the single source of truth; these lock
 * it down so a future edit can't silently reintroduce the old
 * PromptSelector/ContentAuditModal colour drift (course sky vs blue, subTopic
 * indigo vs teal, prompt emerald vs amber).
 */
const LEVELS: CurriculumLevel[] = ['course', 'topic', 'subTopic', 'dotPoint', 'prompt'];

describe('curriculum-level colour palette', () => {
  it('assigns the canonical hue to every level', () => {
    expect(LEVEL_HUE.course).toBe('blue');
    expect(LEVEL_HUE.topic).toBe('purple');
    expect(LEVEL_HUE.subTopic).toBe('teal');
    expect(LEVEL_HUE.dotPoint).toBe('pink');
    expect(LEVEL_HUE.prompt).toBe('amber');
  });

  it('defines all five level keys and nothing else', () => {
    expect(Object.keys(LEVEL_HUE).sort()).toEqual([...LEVELS].sort());
  });

  it('gives every level a distinct hue', () => {
    const hues = LEVELS.map((level) => LEVEL_HUE[level]);
    expect(new Set(hues).size).toBe(LEVELS.length);
  });

  it('never lets a level hue double as the completion (emerald) semantic', () => {
    expect(COMPLETION_HUE).toBe('emerald');
    for (const level of LEVELS) {
      expect(LEVEL_HUE[level]).not.toBe(COMPLETION_HUE);
      expect(LEVEL_ICON_TINT[level]).not.toContain('emerald');
    }
  });
});

describe('level icon tints', () => {
  it('exposes a single-class text-*-400 tint matching each level hue', () => {
    for (const level of LEVELS) {
      expect(LEVEL_ICON_TINT[level]).toBe(`text-${LEVEL_HUE[level]}-400`);
    }
  });

  it('has an icon tint for every level and nothing else', () => {
    expect(Object.keys(LEVEL_ICON_TINT).sort()).toEqual([...LEVELS].sort());
  });
});

describe('level colour accessors', () => {
  it('return the same values as the underlying maps', () => {
    for (const level of LEVELS) {
      expect(getLevelHue(level)).toBe(LEVEL_HUE[level]);
      expect(getLevelIconTint(level)).toBe(LEVEL_ICON_TINT[level]);
    }
  });
});
