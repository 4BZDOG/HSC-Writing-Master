/**
 * Word-level text diff, for showing a student exactly what changed between
 * their answer and the AI's improved version.
 *
 * A character diff would highlight the inside of words ("analys|e|→|ing|") and a
 * line diff would mark a whole paragraph changed because one clause moved, so
 * neither says anything a student can act on. Words — with their trailing
 * whitespace carried along so the text still reads normally when the marks are
 * stripped — are the unit an examiner talks in.
 *
 * The algorithm is a standard LCS over tokens, computed on the pruned middle
 * after common prefixes and suffixes are peeled off. On the answers this app
 * handles (tens to a few hundred words, usually sharing most of their text)
 * that leaves a small table; a size guard falls back to a whole-block
 * replacement rather than allocating a matrix for a pathological input.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  op: DiffOp;
  /**
   * The text of this run, including the whitespace that followed each word. For
   * an `equal` run this is the REVISED wording — the version the student is
   * being asked to write.
   */
  value: string;
  /**
   * Only on an `equal` run, and only when the two sides worded it differently:
   * the original text. Tokens are compared ignoring case and punctuation, so
   * "latency" and "Latency." are the same word — but each column still has to
   * show what its own side actually said, or "use this answer" would hand back
   * text the student never read.
   */
  original?: string;
}

/** Beyond this many tokens per side the LCS table is not worth building. */
const MAX_LCS_TOKENS = 1200;

/**
 * Splits into words that carry their own trailing whitespace, so joining the
 * values of every segment reproduces the input exactly.
 */
export const tokenizeWords = (text: string): string[] => {
  if (!text) return [];
  return text.match(/\S+\s*/g) ?? [];
};

/**
 * How two tokens are compared. Punctuation and case are noise here: a sentence
 * that only gained a full stop should not read as a rewritten sentence.
 */
const normalise = (token: string): string =>
  token
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}—–-]/g, '');

interface DiffPart {
  op: DiffOp;
  token: string;
  /** The original side's wording, when it differed only in case/punctuation. */
  originalToken?: string;
}

/** Collapses adjacent same-op tokens into runs, which is what the UI renders. */
const toSegments = (parts: DiffPart[]): DiffSegment[] => {
  const segments: DiffSegment[] = [];
  for (const { op, token, originalToken } of parts) {
    const last = segments[segments.length - 1];
    if (last && last.op === op) {
      // Seed from `value`, not from empty: a run whose earlier tokens were
      // identical on both sides has no `original` yet, and those tokens still
      // belong to the original side.
      if (last.op === 'equal')
        last.original = (last.original ?? last.value) + (originalToken ?? token);
      last.value += token;
    } else {
      segments.push(
        op === 'equal' && originalToken !== undefined
          ? { op, value: token, original: originalToken }
          : { op, value: token }
      );
    }
  }
  // A run only needs its `original` when it actually differs.
  return segments
    .filter((s) => s.value.length > 0)
    .map((s) => (s.original === s.value ? { op: s.op, value: s.value } : s));
};

/** An `equal` part, carrying the original wording when the two sides differ. */
const equalPart = (revisedToken: string, originalToken: string): DiffPart =>
  revisedToken === originalToken
    ? { op: 'equal', token: revisedToken }
    : { op: 'equal', token: revisedToken, originalToken };

/**
 * Diffs two texts at word level.
 *
 * Returns segments in reading order: every `equal` and `delete` segment
 * concatenated reproduces the original, and every `equal` and `insert` segment
 * concatenated reproduces the revision.
 */
export const diffWords = (original: string, revised: string): DiffSegment[] => {
  const a = tokenizeWords(original);
  const b = tokenizeWords(revised);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ op: 'insert', value: b.join('') }];
  if (b.length === 0) return [{ op: 'delete', value: a.join('') }];

  const aKeys = a.map(normalise);
  const bKeys = b.map(normalise);

  // Peel the shared head and tail. Most improved answers keep the student's
  // opening and closing intact, so this alone usually removes most of the work.
  let head = 0;
  while (head < a.length && head < b.length && aKeys[head] === bKeys[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    aKeys[a.length - 1 - tail] === bKeys[b.length - 1 - tail]
  ) {
    tail++;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const midAKeys = aKeys.slice(head, a.length - tail);
  const midBKeys = bKeys.slice(head, b.length - tail);

  const parts: DiffPart[] = [];
  for (let i = 0; i < head; i++) parts.push(equalPart(b[i], a[i]));

  if (midA.length === 0) {
    midB.forEach((token) => parts.push({ op: 'insert', token }));
  } else if (midB.length === 0) {
    midA.forEach((token) => parts.push({ op: 'delete', token }));
  } else if (midA.length * midB.length > MAX_LCS_TOKENS * MAX_LCS_TOKENS) {
    // Too big to align meaningfully — report it as a wholesale replacement
    // rather than spending seconds on a table nobody will read.
    midA.forEach((token) => parts.push({ op: 'delete', token }));
    midB.forEach((token) => parts.push({ op: 'insert', token }));
  } else {
    // LCS lengths table over the pruned middle.
    const n = midA.length;
    const m = midB.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] =
          midAKeys[i] === midBKeys[j]
            ? lcs[i + 1][j + 1] + 1
            : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midAKeys[i] === midBKeys[j]) {
        // Equal by the comparison key, but the revision may have repunctuated
        // or recapitalised it — each side keeps its own surface form.
        parts.push(equalPart(midB[j], midA[i]));
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        parts.push({ op: 'delete', token: midA[i] });
        i++;
      } else {
        parts.push({ op: 'insert', token: midB[j] });
        j++;
      }
    }
    while (i < n) parts.push({ op: 'delete', token: midA[i++] });
    while (j < m) parts.push({ op: 'insert', token: midB[j++] });
  }

  for (let k = 0; k < tail; k++) {
    const index = b.length - tail + k;
    parts.push(equalPart(b[index], a[a.length - tail + k]));
  }

  return toSegments(parts);
};

export interface DiffStats {
  /** Words present only in the revision. */
  added: number;
  /** Words present only in the original. */
  removed: number;
  /** Words carried through unchanged. */
  kept: number;
  originalWords: number;
  revisedWords: number;
  /** Share of the ORIGINAL's words the revision keeps, 0–1. */
  retention: number;
}

/** Headline numbers for the summary strip above a diff. */
export const summariseDiff = (segments: DiffSegment[]): DiffStats => {
  let added = 0;
  let removed = 0;
  let kept = 0;
  for (const segment of segments) {
    const count = tokenizeWords(segment.value).length;
    if (segment.op === 'insert') added += count;
    else if (segment.op === 'delete') removed += count;
    else kept += count;
  }
  const originalWords = kept + removed;
  return {
    added,
    removed,
    kept,
    originalWords,
    revisedWords: kept + added,
    // "Almost all of your own words survived" is the reassurance a student
    // needs before they will read the rest, so it is a first-class figure.
    retention: originalWords === 0 ? 0 : kept / originalWords,
  };
};

/**
 * Groups the diff into CHANGES — a deletion and the insertion that replaced it
 * count as one, because that is how a reader sees them.
 *
 * Returns the index in `segments` of each change's first segment, so the UI can
 * step a student through "change 3 of 11" in a long answer instead of leaving
 * them to hunt for the coloured runs.
 */
export const changeAnchors = (segments: DiffSegment[]): number[] => {
  const anchors: number[] = [];
  let inChange = false;
  segments.forEach((segment, index) => {
    if (segment.op === 'equal') {
      inChange = false;
      return;
    }
    if (!inChange) anchors.push(index);
    inChange = true;
  });
  return anchors;
};

/** A single edit: what the revision took out, and what it put in its place. */
export interface DiffChange {
  removed: string;
  added: string;
}

/**
 * The diff as a list of discrete edits.
 *
 * The on-screen view can afford to mark words inline; a printed page cannot —
 * the PDF's text engine draws whole wrapped lines in one style, so an inline
 * diff there would mean a word-placement engine. A change LIST says the same
 * thing in a form print handles well, and is arguably easier to revise from:
 * "here is what you wrote, here is what it should say", eleven times.
 */
export const groupedChanges = (segments: DiffSegment[]): DiffChange[] => {
  const changes: DiffChange[] = [];
  let current: DiffChange | null = null;

  for (const segment of segments) {
    if (segment.op === 'equal') {
      if (current) changes.push(current);
      current = null;
      continue;
    }
    current ??= { removed: '', added: '' };
    if (segment.op === 'delete') current.removed += segment.value;
    else current.added += segment.value;
  }
  if (current) changes.push(current);

  return changes.map((change) => ({
    removed: change.removed.trim(),
    added: change.added.trim(),
  }));
};

/**
 * Narrow a change list to the edits worth printing in a revision aid.
 *
 * A word-level diff surfaces every edit, but most of a rewrite's deletions are
 * uninstructive on paper: a student learns nothing from "you cut the word
 * *sympathy*". The edits that teach are the ones that ADD wording — a
 * substitution ("makes the system faster" → "reduces latency") or a pure
 * insertion (the quotation the answer was missing) — plus the occasional cut
 * that removes a whole clause of padding rather than a stray word or two.
 *
 * A change earns its place when it adds a real phrase (≥2 words), replaces a
 * phrase (adds something in place of ≥2 removed words), or cuts a whole clause
 * (≥`minCutWords` words). Trivial one-word↔one-word swaps and stray one- or
 * two-word deletions are dropped: they are lexical noise a student can't revise
 * from. This roughly halves a typical list and leaves what remains coherent, so
 * the printed "What changed" reads as guidance rather than a wall of fragments.
 */
export const SUBSTANTIVE_CUT_MIN_WORDS = 6;

export const substantiveChanges = (
  changes: DiffChange[],
  minCutWords: number = SUBSTANTIVE_CUT_MIN_WORDS
): DiffChange[] =>
  changes.filter((change) => {
    const addedWords = tokenizeWords(change.added).length;
    const removedWords = tokenizeWords(change.removed).length;
    if (addedWords >= 2) return true; // a real phrase was added
    if (addedWords >= 1 && removedWords >= 2) return true; // a phrase was rewritten
    if (addedWords === 0 && removedWords >= minCutWords) return true; // a clause was cut
    return false;
  });

/**
 * One side of the side-by-side view: the ops that belong to that column, with
 * each `equal` run resolved to the wording that side actually used. Joining the
 * values reproduces that side's text exactly.
 */
export const segmentsForSide = (
  segments: DiffSegment[],
  side: 'original' | 'revised'
): DiffSegment[] =>
  segments
    .filter((s) => s.op === 'equal' || s.op === (side === 'original' ? 'delete' : 'insert'))
    .map((s) =>
      side === 'original' && s.op === 'equal' && s.original !== undefined
        ? { op: s.op, value: s.original }
        : { op: s.op, value: s.value }
    );
