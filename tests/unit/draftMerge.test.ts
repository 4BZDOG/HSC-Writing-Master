import { describe, it, expect } from 'vitest';
import type { Course } from '../../types';
import {
  applyAdopted,
  collectDrafts,
  mergeForeignDrafts,
  type DraftBase,
} from '../../utils/draftMerge';

/** A library with two prompts in one dot point, `p1` and `p2`. */
type Fields = Partial<{ userDraft: string; draftElapsedSeconds: number }>;

const library = (p1: Fields = {}, p2: Fields = {}): Course[] =>
  [
    {
      id: 'course-1',
      name: 'Software Engineering',
      outcomes: [],
      topics: [
        {
          id: 'topic-1',
          name: 'Topic',
          subTopics: [
            {
              id: 'sub-1',
              name: 'Sub',
              dotPoints: [
                {
                  id: 'dp-1',
                  description: 'Dot point',
                  prompts: [
                    { id: 'p1', question: 'Q1', ...p1 },
                    { id: 'p2', question: 'Q2', ...p2 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] as unknown as Course[];

const promptOf = (courses: Course[], id: string) => {
  for (const topic of courses[0].topics)
    for (const sub of topic.subTopics ?? [])
      for (const dp of sub.dotPoints ?? [])
        for (const p of dp.prompts ?? []) if (p.id === id) return p;
  throw new Error(`no prompt ${id}`);
};

describe('collectDrafts', () => {
  it('records only prompts that have a draft or a clock', () => {
    const base = collectDrafts(library({ userDraft: 'hello' }, { draftElapsedSeconds: 30 }));
    expect(base.get('p1')).toEqual({ userDraft: 'hello' });
    expect(base.get('p2')).toEqual({ draftElapsedSeconds: 30 });
    expect(base.size).toBe(2);
  });

  it('records nothing for a library with no drafts', () => {
    expect(collectDrafts(library()).size).toBe(0);
  });
});

describe('mergeForeignDrafts', () => {
  it('takes the stored draft when this tab has not changed it since base', () => {
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const local = library({ userDraft: 'old' });
    const stored = library({ userDraft: 'newer, from the other tab' });

    const { merged, adopted } = mergeForeignDrafts(local, stored, base);

    expect(promptOf(merged, 'p1').userDraft).toBe('newer, from the other tab');
    expect(adopted.get('p1')).toEqual({ userDraft: 'newer, from the other tab' });
  });

  it('keeps this tab’s draft when this tab has changed it since base', () => {
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const local = library({ userDraft: 'typed here' });
    const stored = library({ userDraft: 'from the other tab' });

    const { merged, adopted } = mergeForeignDrafts(local, stored, base);

    expect(promptOf(merged, 'p1').userDraft).toBe('typed here');
    expect(adopted.size).toBe(0);
  });

  it('keeps local when both tabs changed the same draft', () => {
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const { merged } = mergeForeignDrafts(
      library({ userDraft: 'local edit' }),
      library({ userDraft: 'other edit' }),
      base
    );
    expect(promptOf(merged, 'p1').userDraft).toBe('local edit');
  });

  it('takes a draft the other tab wrote to a question this tab left empty', () => {
    const { merged, adopted } = mergeForeignDrafts(
      library(),
      library({}, { userDraft: 'beta from the other tab' }),
      new Map()
    );
    expect(promptOf(merged, 'p2').userDraft).toBe('beta from the other tab');
    expect(adopted.get('p2')).toEqual({ userDraft: 'beta from the other tab' });
  });

  it('does not bring back a prompt that exists only in the stored library', () => {
    const local: Course[] = library();
    const stored = library({ userDraft: 'x' });
    // Remove p1 from local entirely, so only the stored copy holds it.
    const trimmed = JSON.parse(JSON.stringify(local)) as Course[];
    trimmed[0].topics[0].subTopics![0].dotPoints![0].prompts = [
      { id: 'p2', question: 'Q2' } as never,
    ];
    const { merged, adopted } = mergeForeignDrafts(trimmed, stored, new Map());
    expect(merged).toBe(trimmed);
    expect(adopted.size).toBe(0);
  });

  it('keeps a prompt that exists only in local, untouched', () => {
    const local = library({ userDraft: 'only here' });
    const stored: Course[] = [{ ...local[0], topics: [] }];
    const { merged, adopted } = mergeForeignDrafts(local, stored, new Map());
    expect(promptOf(merged, 'p1').userDraft).toBe('only here');
    expect(adopted.size).toBe(0);
  });

  it('never takes a smaller elapsed time, and takes the larger one from the other tab', () => {
    const base: DraftBase = new Map([['p1', { draftElapsedSeconds: 100 }]]);
    const stale = mergeForeignDrafts(
      library({ draftElapsedSeconds: 200 }),
      library({ draftElapsedSeconds: 100 }),
      base
    );
    expect(promptOf(stale.merged, 'p1').draftElapsedSeconds).toBe(200);
    expect(stale.adopted.size).toBe(0);

    const ahead = mergeForeignDrafts(
      library({ draftElapsedSeconds: 100 }),
      library({ draftElapsedSeconds: 400 }),
      base
    );
    expect(promptOf(ahead.merged, 'p1').draftElapsedSeconds).toBe(400);
    expect(ahead.adopted.get('p1')).toEqual({ draftElapsedSeconds: 400 });
  });

  it('returns the same reference when nothing is adopted', () => {
    const local = library({ userDraft: 'same' });
    const stored = library({ userDraft: 'same' });
    const result = mergeForeignDrafts(local, stored, collectDrafts(local));
    expect(result.merged).toBe(local);
    expect(result.adopted.size).toBe(0);
  });

  it('changes nothing but the two draft fields', () => {
    const local = library({ userDraft: 'old' });
    const stored = library({ userDraft: 'new' });
    const { merged } = mergeForeignDrafts(local, stored, collectDrafts(local));
    const a = promptOf(local, 'p1');
    const b = promptOf(merged, 'p1');
    expect(b.question).toBe(a.question);
    expect(b.userDraft).toBe('new');
    expect(merged[0].name).toBe(local[0].name);
    expect(merged[0].topics[0].name).toBe(local[0].topics[0].name);
  });

  it('does not mutate its inputs', () => {
    const local = library({ userDraft: 'old' });
    const stored = library({ userDraft: 'new' });
    const localBefore = JSON.stringify(local);
    const storedBefore = JSON.stringify(stored);
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const { merged } = mergeForeignDrafts(local, stored, base);
    expect(JSON.stringify(local)).toBe(localBefore);
    expect(JSON.stringify(stored)).toBe(storedBefore);
    expect(merged).not.toBe(local);
    expect(base.get('p1')).toEqual({ userDraft: 'old' });
  });
});

describe('applyAdopted', () => {
  it('applies an adopted draft where the state still holds the base value', () => {
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const draft = library({ userDraft: 'old' });
    const applied = applyAdopted(draft, new Map([['p1', { userDraft: 'from elsewhere' }]]), base);
    expect(applied).toBe(1);
    expect(promptOf(draft, 'p1').userDraft).toBe('from elsewhere');
  });

  it('leaves a draft the student has typed in since', () => {
    const base: DraftBase = new Map([['p1', { userDraft: 'old' }]]);
    const draft = library({ userDraft: 'typed since' });
    const applied = applyAdopted(draft, new Map([['p1', { userDraft: 'from elsewhere' }]]), base);
    expect(applied).toBe(0);
    expect(promptOf(draft, 'p1').userDraft).toBe('typed since');
  });
});
