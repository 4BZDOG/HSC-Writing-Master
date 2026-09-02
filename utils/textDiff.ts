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

// Function words carry no lesson on their own: swapping one for another
// ("a" → "the") is lexical noise. A one-word substitution between two of these
// is dropped; a substitution touching a content word is kept, because a single
// word can be the most instructive edit a student makes.
const FUNCTION_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'am',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'into',
  'onto',
  'and',
  'or',
  'but',
  'so',
  'if',
  'then',
  'than',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'their',
  'his',
  'her',
  'our',
  'your',
  'my',
  'i',
  'we',
  'they',
  'he',
  'she',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'will',
  'would',
  'can',
  'could',
]);

// Small words that invert or sharply qualify a claim. Inserting or swapping one
// ("it is fair" → "it is not fair") changes the meaning even though the word
// count barely moves, so it is always worth showing.
const MEANING_FLIPPING = new Set([
  'not',
  'no',
  'never',
  'none',
  'cannot',
  'nor',
  'without',
  'neither',
  'must',
  'should',
  'always',
  'only',
]);

const isFunctionWord = (side: string): boolean => FUNCTION_WORDS.has(normalise(side));
const flipsMeaning = (side: string): boolean => MEANING_FLIPPING.has(normalise(side));

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
 * (≥`minCutWords` words). It ALSO keeps the single-word edits that carry the
 * most meaning for an HSC answer: a genuine one-word substitution (a command-
 * term swap like *describe → analyse*, or a factual reversal like *increases →
 * decreases*) and the insertion of a meaning-flipping word (*it is fair → it is
 * not fair*). Only lexical noise is dropped — a function-word swap (*a → the*),
 * a plain one-word insertion that does not flip meaning, and stray one- or
 * two-word deletions — so the printed "What changed" reads as guidance rather
 * than a wall of fragments while never hiding an edit that changed the argument.
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
    // A single inserted word that inverts the claim ("fair" → "not fair").
    if (addedWords === 1 && removedWords === 0 && flipsMeaning(change.added)) return true;
    // A genuine one-word substitution — command-term swaps, factual reversals —
    // teaches; a function-word-for-function-word swap ("a" → "the") does not.
    if (
      addedWords === 1 &&
      removedWords === 1 &&
      normalise(change.added) !== normalise(change.removed) &&
      !(isFunctionWord(change.added) && isFunctionWord(change.removed))
    ) {
      return true;
    }
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

// ---------------------------------------------------------------------------
// Sentence-level changes, for the printed revision aid
// ---------------------------------------------------------------------------

/** One rewritten sentence: what the student wrote, and what it became. */
export interface SentenceChange {
  before: string;
  after: string;
}

/**
 * Sentences, carrying their own trailing whitespace so joining them reproduces
 * the input. A paragraph break ends a sentence even without a full stop —
 * students write headings and list fragments, and gluing one to the next
 * paragraph makes a "sentence" nobody wrote.
 */
export const tokenizeSentences = (text: string): string[] => {
  if (!text) return [];
  const chunks: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    for (const line of para.split(/\n/)) {
      const matches = line.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g);
      if (matches) chunks.push(...matches);
    }
  }
  return chunks.map((c) => c.trim()).filter(Boolean);
};

/** Sentence identity for the LCS: case, punctuation and spacing are noise. */
const sentenceKey = (sentence: string): string =>
  sentence
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Beyond this many sentences per side the pairing is not worth computing. */
const MAX_SENTENCE_TOKENS = 400;

/** A sentence with its offsets in the text it came from. */
interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

/** Sentences with offsets, so a word-level edit can be traced to the one it fell in. */
const sentenceSpans = (text: string): SentenceSpan[] => {
  const spans: SentenceSpan[] = [];
  const re = /[^\n.!?]*(?:[.!?]+["')\]]*|(?=\n)|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[0];
    if (re.lastIndex === match.index) re.lastIndex += 1; // zero-length guard
    const trimmed = raw.trim();
    if (trimmed) {
      const lead = raw.length - raw.trimStart().length;
      spans.push({
        text: trimmed,
        start: match.index + lead,
        end: match.index + lead + trimmed.length,
      });
    }
    if (re.lastIndex >= text.length) break;
  }
  return spans;
};

/** Indices of the spans overlapping [start, end), or the one containing `start`. */
const spanIndicesTouching = (spans: SentenceSpan[], start: number, end: number): number[] => {
  const hit: number[] = [];
  spans.forEach((s, i) => {
    if (s.start < Math.max(end, start + 1) && s.end > start) hit.push(i);
  });
  if (hit.length) return hit;
  const containing = spans.findIndex((s) => s.start <= start && s.end >= start);
  return containing >= 0 ? [containing] : [];
};

/**
 * At most this many sentences either side of one row.
 *
 * Beyond it the edit is not a sentence-level rewrite at all — it is a passage
 * replaced wholesale, and printing the first two sentences of each side would
 * be a truncated quotation posing as a comparison. Such a group is dropped, and
 * the caller says plainly that the rewrite reworks the response throughout.
 */
const MAX_SPANS_PER_ROW = 2;

/**
 * The revision as a list of REWRITTEN SENTENCES.
 *
 * `groupedChanges` gives every word-level edit, which is the right unit on
 * screen — the words are marked in place, inside the sentence that gives them
 * their sense. On paper the marks cannot sit in place, so each edit is printed
 * as its own row, and a word-level row is a fragment with its sense removed:
 * "− this response I will evaluate how well current practices / + data
 * management, but" is not something a student can learn anything from.
 *
 * So the edits are found at word level, where they are accurate, and then
 * WIDENED to the sentence each one fell in, where they are readable. Edits that
 * land in the same sentence collapse into one row, keyed on the sentence's
 * index rather than its text — which is also what a rewrite that merged three
 * sentences into one should look like: this is what you wrote, this is what it
 * needed to say.
 */
export const sentenceChanges = (original: string, revised: string): SentenceChange[] => {
  const segments = diffWords(original, revised);
  const beforeSpans = sentenceSpans(original);
  const afterSpans = sentenceSpans(revised);
  if (!beforeSpans.length && !afterSpans.length) return [];

  // Walk the segments, tracking where each side has reached, and group runs of
  // non-equal segments into one edit with a span on each side.
  interface Edit {
    removed: string;
    added: string;
    oStart: number;
    oEnd: number;
    rStart: number;
    rEnd: number;
  }
  const edits: Edit[] = [];
  let current: Edit | null = null;
  let oi = 0;
  let ri = 0;
  for (const segment of segments) {
    if (segment.op === 'equal') {
      if (current) edits.push(current);
      current = null;
      oi += (segment.original ?? segment.value).length;
      ri += segment.value.length;
      continue;
    }
    current ??= { removed: '', added: '', oStart: oi, oEnd: oi, rStart: ri, rEnd: ri };
    if (segment.op === 'delete') {
      current.removed += segment.value;
      oi += segment.value.length;
      current.oEnd = oi;
    } else {
      current.added += segment.value;
      ri += segment.value.length;
      current.rEnd = ri;
    }
  }
  if (current) edits.push(current);

  // Group the edits by the sentences they touch. Edits arrive in document
  // order, so an edit either extends the group before it or starts a new one.
  interface Group {
    before: Set<number>;
    after: Set<number>;
  }
  const groups: Group[] = [];
  for (const edit of edits) {
    // The same "is this worth printing?" rule the word-level list used.
    if (!substantiveChanges([{ removed: edit.removed.trim(), added: edit.added.trim() }]).length) {
      continue;
    }
    const before = spanIndicesTouching(beforeSpans, edit.oStart, edit.oEnd);
    const after = spanIndicesTouching(afterSpans, edit.rStart, edit.rEnd);
    if (!before.length && !after.length) continue;

    const last = groups[groups.length - 1];
    const sharesSentence =
      last && (before.some((i) => last.before.has(i)) || after.some((i) => last.after.has(i)));
    const target = sharesSentence ? last : { before: new Set<number>(), after: new Set<number>() };
    before.forEach((i) => target.before.add(i));
    after.forEach((i) => target.after.add(i));
    if (!sharesSentence) groups.push(target);
  }

  const join = (spans: SentenceSpan[], indices: Set<number>): string =>
    [...indices]
      .sort((a, b) => a - b)
      .map((i) => spans[i].text)
      .join(' ');

  return groups
    .filter((g) => g.before.size <= MAX_SPANS_PER_ROW && g.after.size <= MAX_SPANS_PER_ROW)
    .map((g) => ({ before: join(beforeSpans, g.before), after: join(afterSpans, g.after) }))
    .filter((row) => row.before || row.after);
};

/**
 * How much of the response the revision reworked, as a sentence count.
 *
 * The printed report used to state `retention` — "23% of your own writing
 * kept". It is an accurate number and a demoralising one: a rewrite one band up
 * restates most sentences, so the figure is always low, and it reads as a verdict
 * on the student rather than a description of the edit. A count of rewritten
 * sentences says the same thing as a fact they can act on.
 */
export const rewrittenSentenceCount = (
  original: string,
  changes: SentenceChange[]
): { rewritten: number; total: number } => {
  const total = tokenizeSentences(original).length;
  const touched = new Set(changes.map((c) => c.before).filter(Boolean));
  return { rewritten: Math.min(touched.size, total), total };
};
