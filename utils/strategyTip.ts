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
