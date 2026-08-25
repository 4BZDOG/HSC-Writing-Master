// pdf/text.ts
//
// Pure text-fidelity helpers. No DOM, no jsPDF — safe to unit-test under Node.
//
//  - toText():        app markup (**bold**, ^sup, _sub, \frac, LaTeX-ish
//                     symbols) -> selectable Unicode.
//  - degradeToAscii(): Unicode -> WinAnsi-safe ASCII for the built-in helvetica
//                     fallback (so a font-less export reads "pi", "sqrt",
//                     "x^6" instead of mojibake).
//  - containsEmoji(): Unicode property-escape detection used to route a string
//                     to the canvas raster path.
//
// The `\frac`/`\sqrt`/`\vec`/symbol/superscript/subscript conversion tables
// and logic live in `../utils/mathNotation` — shared with the on-screen
// renderer (`utils/renderUtils.ts`) so a formula never prints correctly but
// shows raw backslash text on screen, or vice versa.

import {
  SUPERSCRIPT_UNICODE,
  SUBSCRIPT_UNICODE,
  stripInlineMathDollars,
  expandFracToSlash,
  expandSqrt,
  expandVector,
  expandMathSymbolTokens,
  expandSuperscriptsToUnicode,
  expandSubscriptsToUnicode,
} from '../utils/mathNotation';

/**
 * Convert a single line of app markup into selectable Unicode plain text.
 * `^token` / `_token` become true super/subscripts when every char is mappable
 * (otherwise the carat form is kept so it stays legible, e.g. `x^abc`).
 */
export const toText = (input: string): string => {
  if (!input) return '';
  let s = input;

  // $ax$ -> ax ; leaves a bare currency figure like $50,000 untouched.
  s = stripInlineMathDollars(s);

  // \frac{a}{b} -> a/b  (also \frac12 -> 1/2)
  s = expandFracToSlash(s);

  // \sqrt{x} -> √x  ;  \sqrt x -> √x
  s = expandSqrt(s);

  // \vec{v} -> v with a combining arrow-above.
  s = expandVector(s);

  // Named symbol tokens (longest-first to avoid \le matching inside \leq).
  s = expandMathSymbolTokens(s);

  // Strip markdown emphasis markers but keep the inner text.
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(?<![A-Za-z0-9])(\*|_)(?=\S)([^*_]+?)(?<=\S)\1(?![A-Za-z0-9])/g, '$2');

  // Superscripts: ^{...} or ^token.
  s = expandSuperscriptsToUnicode(s);

  // Subscripts: _{...} or _digits.
  s = expandSubscriptsToUnicode(s);

  return s;
};

// --- HTML stripping (whitelist-based, comparison-safe) ---------------------

// Only real HTML element names are stripped, so code/maths like `List<T>` or
// `x < y` (no whitelisted tag name) survive untouched.
const HTML_TAG_NAMES =
  'p|br|hr|div|span|strong|b|em|i|u|s|ul|ol|li|h[1-6]|a|code|pre|blockquote|sup|sub|table|thead|tbody|tr|td|th|small|mark';
const BLOCK_CLOSERS = new RegExp(`</\\s*(?:p|div|li|h[1-6]|tr|blockquote|ul|ol)\\s*>`, 'gi');
const BR_TAG = /<\s*br\s*\/?\s*>/gi;
const ANY_HTML_TAG = new RegExp(`</?\\s*(?:${HTML_TAG_NAMES})(?:\\s[^>]*)?/?>`, 'gi');

const NAMED_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&nbsp;': ' ',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&times;': '×',
  '&deg;': '°',
};

/**
 * Remove whitelisted HTML tags and decode common entities WITHOUT corrupting
 * bare `<`/`>` used in prose, code, or maths. Block-level closers and <br>
 * become newlines so structure is preserved as plain text.
 */
export const stripBasicHtml = (input: string): string => {
  if (!input) return '';
  let s = input.replace(BR_TAG, '\n').replace(BLOCK_CLOSERS, '\n').replace(ANY_HTML_TAG, '');

  for (const [entity, ch] of Object.entries(NAMED_ENTITIES)) {
    if (s.includes(entity)) s = s.split(entity).join(ch);
  }
  // Numeric entities (&#160; / &#x41;).
  s = s.replace(/&#(\d+);/g, (_m, n: string) => safeCodePoint(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => safeCodePoint(parseInt(n, 16)));

  // Collapse runs of blank lines and trim trailing spaces per line.
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const safeCodePoint = (cp: number): string => {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
};

/** Normalise host content for the PDF: strip HTML, then markup -> Unicode. */
export const normalizeContent = (input: string): string => toText(stripBasicHtml(input ?? ''));

// --- ASCII degradation -----------------------------------------------------

function invert(table: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [plain, uni] of Object.entries(table)) out[uni] = plain;
  return out;
}

// Lazily computed (not at module-init) so this module never reads another
// module's exports eagerly on a possible chunk-load cycle — see
// scripts/findModuleInitReads.mjs. Memoized since degradeToAscii can be
// called many times per export.
let superscriptToAsciiCache: Record<string, string> | null = null;
const getSuperscriptToAscii = (): Record<string, string> =>
  (superscriptToAsciiCache ??= invert(SUPERSCRIPT_UNICODE));

let subscriptToAsciiCache: Record<string, string> | null = null;
const getSubscriptToAscii = (): Record<string, string> =>
  (subscriptToAsciiCache ??= invert(SUBSCRIPT_UNICODE));

/** Unicode symbol / Greek -> readable ASCII. */
const ASCII_SYMBOLS: Record<string, string> = {
  '×': 'x',
  '÷': '/',
  '±': '+/-',
  '∓': '-/+',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~',
  '≡': '==',
  '∞': 'inf',
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '·': '*',
  '•': '*',
  '°': 'deg',
  '√': 'sqrt',
  '∑': 'sum',
  '∏': 'prod',
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  Δ: 'Delta',
  θ: 'theta',
  λ: 'lambda',
  μ: 'mu',
  π: 'pi',
  σ: 'sigma',
  Σ: 'Sigma',
  φ: 'phi',
  ω: 'omega',
  Ω: 'Omega',
  // Common "smart" punctuation that is not WinAnsi-safe in helvetica.
  '—': '-',
  '–': '-',
  '−': '-', // U+2212 MINUS SIGN — used as the diff "cut" marker; not in WinAnsi.
  '…': '...',
  ' ': ' ',
};

const isCombiningSuper = (ch: string) => ch in getSuperscriptToAscii();
const isCombiningSub = (ch: string) => ch in getSubscriptToAscii();

/**
 * Map non-WinAnsi glyphs to ASCII so the built-in helvetica fallback stays
 * legible. Runs of superscripts collapse to `^123`; subscripts to `_123`.
 */
export const degradeToAscii = (input: string): string => {
  if (!input) return '';
  const chars = Array.from(input);
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (isCombiningSuper(ch)) {
      let run = '';
      const superscriptToAscii = getSuperscriptToAscii();
      while (i < chars.length && isCombiningSuper(chars[i])) {
        run += superscriptToAscii[chars[i]];
        i++;
      }
      out += '^' + run;
      continue;
    }
    if (isCombiningSub(ch)) {
      let run = '';
      const subscriptToAscii = getSubscriptToAscii();
      while (i < chars.length && isCombiningSub(chars[i])) {
        run += subscriptToAscii[chars[i]];
        i++;
      }
      out += '_' + run;
      continue;
    }
    if (ch in ASCII_SYMBOLS) {
      out += ASCII_SYMBOLS[ch];
      i++;
      continue;
    }
    // Quotes.
    if (ch === '“' || ch === '”') {
      out += '"';
      i++;
      continue;
    }
    if (ch === '‘' || ch === '’') {
      out += "'";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
};

// --- Emoji detection -------------------------------------------------------

// Lazily built so a runtime without the `u` regex flag (very old engines)
// degrades gracefully rather than throwing at module load.
let emojiRegex: RegExp | null | undefined;
function getEmojiRegex(): RegExp | null {
  if (emojiRegex !== undefined) return emojiRegex;
  try {
    emojiRegex = /\p{Extended_Pictographic}/u;
  } catch {
    emojiRegex = null;
  }
  return emojiRegex;
}

/** True when the string contains at least one emoji / pictographic glyph. */
export const containsEmoji = (input: string): boolean => {
  if (!input) return false;
  const re = getEmojiRegex();
  return re ? re.test(input) : false;
};
