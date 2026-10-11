/**
 * Structure for a command term's writing tip.
 *
 * The tips in `data/commandTerms.ts` are newline-separated and follow a
 * consistent shape that plain `whitespace-pre-line` throws away:
 *
 *     Chain every sentence with linking words:      <- a point, introducing…
 *     because, leads to, results in, therefore.     <- …a list of terms
 *     Facts alone don't explain — connections do.   <- another point
 *
 *     Use a balanced structure:                     <- a point, introducing…
 *     "Both X and Y... However, X... whereas Y..."  <- …a template to copy
 *     Discuss the significance of each point.       <- another point
 *
 * A line that FOLLOWS one ending in a colon is not another instruction — it is
 * the thing the instruction was pointing at. Parsing that out lets the editor
 * show points as bullets and set the examples apart, instead of rendering
 * three visually identical lines.
 */
export type TipSegment =
  | { kind: 'point'; text: string }
  /** A sentence template or worked example to copy the shape of. */
  | { kind: 'example'; text: string }
  /** A short comma-separated list — rendered as individual terms. */
  | { kind: 'terms'; items: string[] };

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
];

/** A quoted line is a template to imitate, e.g. `"X is... whereas Y is..."`. */
const isQuoted = (line: string): boolean =>
  QUOTE_PAIRS.some(
    ([open, close]) => line.length > 1 && line.startsWith(open) && line.endsWith(close)
  );

/**
 * A bare list of short items, e.g. `because, leads to, results in, therefore.`
 * Requires at least three parts, all short and none containing sentence
 * punctuation, so ordinary prose that happens to use commas is not mangled
 * into chips.
 */
const asTerms = (line: string): string[] | null => {
  const items = line
    .replace(/[.]$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (items.length < 3) return null;
  if (items.some((item) => item.length > 24 || /[.!?;:]/.test(item))) return null;
  return items;
};

/**
 * Parses a raw tip into renderable segments. Returns an empty array for an
 * empty tip so callers can skip the block entirely.
 */
export const parseStrategyTip = (tip: string | undefined | null): TipSegment[] => {
  if (!tip) return [];

  const lines = tip
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, i) => {
    const introduced = i > 0 && lines[i - 1].endsWith(':');
    if (introduced) {
      const terms = isQuoted(line) ? null : asTerms(line);
      if (terms) return { kind: 'terms' as const, items: terms };
      return { kind: 'example' as const, text: line };
    }
    return { kind: 'point' as const, text: line };
  });
};

/** What a point can introduce: never another point. */
export type TipDetail = Exclude<TipSegment, { kind: 'point' }>;

/** A point, together with the example or term list it introduces. */
export interface TipMove {
  text: string;
  detail: TipDetail[];
}

/**
 * Re-groups flat segments into moves. `parseStrategyTip` already knows that a
 * line following one that ends in a colon belongs to it; this attaches it.
 */
export const groupStrategyMoves = (segments: TipSegment[]): TipMove[] => {
  const moves: TipMove[] = [];
  for (const segment of segments) {
    if (segment.kind === 'point') {
      moves.push({ text: segment.text, detail: [] });
    } else if (moves.length > 0) {
      moves[moves.length - 1].detail.push(segment);
    }
  }
  return moves;
};

/**
 * Cues that a move names what to avoid or what it costs, not what to do. The
 * tips are written that way: a method line, then a line on what it costs
 * ("Explanations waste time…", "Facts alone don't explain…"). Matched on the
 * words themselves rather than per verb, so a new tip is classified by what it
 * says.
 */
const CAVEAT_CUE =
  /\b(alone|only|not|no|never|don['’]?t|doesn['’]?t|do not|avoid|waste[sd]?|zero|instead|rather than|without|save|more than|too|over-\w+)\b/i;

/** Whether a move reads as a caveat or a cost rather than a step to take. */
export const isCaveatMove = (move: TipMove): boolean => CAVEAT_CUE.test(move.text);

/**
 * The moves a student follows, and the ones they should watch for.
 *
 * `method[0]` is always the lead: the first move leads, whatever it says. The
 * rest split by what they say. A step to take is numbered after it, and a
 * caveat goes under "Watch for".
 */
export const splitMethodMoves = (moves: TipMove[]): { method: TipMove[]; watch: TipMove[] } => {
  const [lead, ...rest] = moves;
  return {
    method: lead ? [lead, ...rest.filter((move) => !isCaveatMove(move))] : [],
    watch: rest.filter(isCaveatMove),
  };
};

/**
 * Every term list and template a tip offers, gathered across all its moves.
 * Terms are de-duplicated and keep the order the tip gives them in.
 */
export const collectStrategyDetail = (
  moves: TipMove[]
): { terms: string[]; examples: string[] } => {
  const terms = new Set<string>();
  const examples: string[] = [];
  for (const move of moves) {
    for (const segment of move.detail) {
      if (segment.kind === 'terms') segment.items.forEach((item) => terms.add(item));
      else examples.push(segment.text);
    }
  }
  return { terms: [...terms], examples };
};
