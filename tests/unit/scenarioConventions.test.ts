import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildScenarioRules, SCENARIO_TYPE_BRIEF } from '../../utils/scenarioConventions';

/**
 * The scenario conventions are rules the AI generators are handed, so these tests pin
 * what they say: the general rules on every call, one course rule for a known course,
 * none for an unknown one, and no instruction to cast several named characters.
 */

/** The course rules' leading words, as they appear in the rules text. */
const COURSE_RULE_PREFIXES = [
  'Business Studies:',
  'Economics:',
  'Legal Studies:',
  'Geography:',
  'Science:',
  'PDHPE / Health and Movement Science:',
  'Software Engineering / Enterprise Computing:',
  'English:',
  'History:',
];

const bulletsOf = (rules: string): string[] =>
  rules.split('\n').filter((line) => line.startsWith('- '));

const courseBulletsOf = (rules: string): string[] =>
  bulletsOf(rules).filter((line) =>
    COURSE_RULE_PREFIXES.some((prefix) => line.startsWith(`- ${prefix}`))
  );

describe('buildScenarioRules: the general conventions', () => {
  it('opens with the heading and carries the general rules', () => {
    const rules = buildScenarioRules('Business Studies');
    expect(rules.startsWith('SCENARIO CONVENTIONS (as NSW HSC papers write them):')).toBe(true);
    expect(rules).toContain('Default to an unlocated situation named by role');
    expect(rules).toContain('Name Australia only when the question is about Australia');
    expect(rules).toContain('Start an invented scenario with "Hypothetical:".');
  });

  it('gives an unknown course exactly the general rules and no course rule', () => {
    const rules = buildScenarioRules('Mathematics Advanced');
    expect(courseBulletsOf(rules)).toEqual([]);
    expect(bulletsOf(rules).length).toBeGreaterThan(0);
  });

  it('treats a missing or empty course name as unknown', () => {
    expect(courseBulletsOf(buildScenarioRules(''))).toEqual([]);
    expect(courseBulletsOf(buildScenarioRules(undefined as unknown as string))).toEqual([]);
  });

  it('adds exactly one bullet to the general rules for a matched course', () => {
    const general = bulletsOf(buildScenarioRules('Mathematics Advanced'));
    const matchedRules = buildScenarioRules('Business Studies');
    const matched = bulletsOf(matchedRules);
    expect(matched).toHaveLength(general.length + 1);
    expect(matched.filter((line) => !courseBulletsOf(matchedRules).includes(line))).toEqual(
      general
    );
  });
});

describe('buildScenarioRules: the matching course rule', () => {
  it.each([
    ['Business Studies', 'Business Studies:'],
    ['HSC Business Studies', 'Business Studies:'],
    ['Economics', 'Economics:'],
    ['Legal Studies', 'Legal Studies:'],
    ['Geography', 'Geography:'],
    ['Biology', 'Science:'],
    ['Software Engineering', 'Software Engineering / Enterprise Computing:'],
    ['English Advanced', 'English:'],
    ['PDHPE', 'PDHPE / Health and Movement Science:'],
  ])('%s gets exactly one course rule, starting "%s"', (courseName, prefix) => {
    const bullets = courseBulletsOf(buildScenarioRules(courseName));
    expect(bullets).toHaveLength(1);
    expect(bullets[0].startsWith(`- ${prefix}`)).toBe(true);
  });

  // The PDHPE / Health rule is matched before Science, which the course name would also hit.
  it('gives Health and Movement Science the PDHPE / Health rule, not the Science rule', () => {
    const bullets = courseBulletsOf(buildScenarioRules('Health and Movement Science'));
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toMatch(/^- PDHPE \/ Health and Movement Science:/);
  });
});

describe('buildScenarioRules: no stereotyped casts', () => {
  const rules = buildScenarioRules('Business Studies');

  it('prohibits kangaroos and the other cultural shorthand', () => {
    expect(rules).toContain('No kangaroos');
  });

  it('asks for roles rather than a cast of named people', () => {
    expect(rules).toContain('People are roles');
    expect(rules).toContain('Name at most one person');
    expect(rules).toContain('Never give several characters names');
    expect(rules).toContain('never use names to signal diversity or background');
  });

  it('never instructs naming several people', () => {
    const positiveNaming = bulletsOf(rules).filter(
      (line) =>
        /\b(two|three|several|multiple|cast of)\b/i.test(line) &&
        /\bnames?\b/i.test(line) &&
        !/\bnever\b/i.test(line)
    );
    expect(positiveNaming).toEqual([]);
  });
});

describe('SCENARIO_TYPE_BRIEF', () => {
  // The ids the generator modal offers. Read from the source so a new type there
  // fails here until it has a brief.
  const modalSource = readFileSync(
    resolve(__dirname, '../../components/PromptGeneratorModal.tsx'),
    'utf8'
  );
  const start = modalSource.indexOf('const SCENARIO_TYPES = [');
  const end = modalSource.indexOf('];', start);
  const modalTypeIds = [...modalSource.slice(start, end).matchAll(/\bid: '([^']+)'/g)].map(
    (m) => m[1]
  );

  it('reads the scenario type ids from the generator modal', () => {
    expect(start).toBeGreaterThan(-1);
    expect(modalTypeIds.length).toBeGreaterThan(0);
  });

  it.each(modalTypeIds)('has a brief for the "%s" scenario type', (id) => {
    const brief = SCENARIO_TYPE_BRIEF[id];
    expect(typeof brief).toBe('string');
    expect(brief.trim().length).toBeGreaterThan(0);
  });

  it('describes the scenario types in words, not by their ids', () => {
    for (const id of modalTypeIds) {
      expect(SCENARIO_TYPE_BRIEF[id]).not.toBe(id);
    }
  });
});
