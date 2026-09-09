import { describe, it, expect } from 'vitest';
import {
  SUBJECT_AREAS,
  SUBJECT_AREA_FULL_NAME,
  SUBJECT_AREA_ICON,
  SUBJECT_AREA_ICON_TINT,
  SUBJECT_AREA_RULE,
  SUBJECT_AREA_TILE,
  detectSubjectArea,
  subjectAreaOf,
} from '../../utils/subjectAreas';

/**
 * Faculty is now the top level of the audit tree and the grouping the manifest
 * importer files courses under, and both read this module. Two things need
 * holding: that a course lands in the faculty a teacher would put it in, and
 * that every faculty has a complete set of presentation entries — a missing
 * one is an `undefined` className, which Tailwind renders as no colour at all
 * rather than as an error.
 */
describe('subject areas — filing a course under a faculty', () => {
  it('prefers what the course records over what its name suggests', () => {
    // A school that files Investigating Science under TAS has made a decision.
    expect(subjectAreaOf({ name: 'Investigating Science', subject: 'TAS' })).toBe('TAS');
    expect(detectSubjectArea('Investigating Science')).toBe('Science');
  });

  it('falls back to the name when nothing is recorded', () => {
    // The shipped course JSON files carry no subject of their own — it is
    // attached at import time — so this is the path most libraries take.
    expect(subjectAreaOf({ name: 'HSC Biology' })).toBe('Science');
    expect(subjectAreaOf({ name: 'HSC Software Engineering' })).toBe('TAS');
    expect(subjectAreaOf({ name: 'HSC Enterprise Computing' })).toBe('TAS');
  });

  it('falls back to the name rather than to Other when the recorded value is not a faculty', () => {
    // A typo in one course's metadata must not strand it away from its subject.
    expect(subjectAreaOf({ name: 'HSC Chemistry', subject: 'Sciecne' })).toBe('Science');
    expect(subjectAreaOf({ name: 'HSC Chemistry', subject: '  ' })).toBe('Science');
  });

  it('files what it cannot recognise under Other', () => {
    expect(subjectAreaOf({ name: 'Peer Support' })).toBe('Other');
    expect(detectSubjectArea('')).toBe('Other');
  });

  it.each([
    ['Modern History', 'HSIE'],
    ['English Advanced', 'English'],
    ['Mathematics Extension 1', 'Mathematics'],
    ['Visual Arts', 'Creative Arts'],
    ['PDHPE', 'PDHPE'],
  ])('reads %s as %s', (name, area) => {
    expect(detectSubjectArea(name)).toBe(area);
  });

  it('gives every faculty a name, an icon, a tile, a tint and a rule', () => {
    SUBJECT_AREAS.forEach((area) => {
      expect(SUBJECT_AREA_FULL_NAME[area]).toBeTruthy();
      expect(SUBJECT_AREA_ICON[area]).toBeTruthy();
      expect(SUBJECT_AREA_TILE[area]).toContain('text-');
      expect(SUBJECT_AREA_ICON_TINT[area]).toContain('text-');
      expect(SUBJECT_AREA_RULE[area]).toContain('bg-');
    });
  });

  it('keeps Other last, because it is a bucket rather than a faculty', () => {
    expect(SUBJECT_AREAS[SUBJECT_AREAS.length - 1]).toBe('Other');
  });
});
