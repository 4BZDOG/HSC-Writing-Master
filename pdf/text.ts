// pdf/text.ts
//
// Pure text-fidelity helpers. No DOM, no jsPDF — safe to unit-test under Node.
//
//  - toText():        app markup (**bold**, ^sup, _sub, \frac, LaTeX-ish
//                     symbols) -> selectable Unicode.
//  - degradeToAscii(): Unicode -> WinAnsi-safe ASCII for the built-in helvetica
//                     fallback (so a CDN-blocked export reads "pi", "sqrt",
//                     "x^6" instead of mojibake).
//  - containsEmoji(): Unicode property-escape detection used to route a string
//                     to the canvas raster path.

/** Unicode superscript glyphs keyed by their plain counterpart. */
const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

/** Unicode subscript glyphs keyed by their plain counterpart. */
const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

/** LaTeX-ish / shorthand tokens -> Unicode symbol. */
const SYMBOLS: Record<string, string> = {
  '\\times': '×',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\le': '≤',
  '\\leq': '≤',
  '\\ge': '≥',
  '\\geq': '≥',
  '\\ne': '≠',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\equiv': '≡',
  '\\infty': '∞',
  '\\to': '→',
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\cdot': '·',
  '\\bullet': '•',
  '\\deg': '°',
  '\\degree': '°',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\Delta': 'Δ',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\sigma': 'σ',
  '\\Sigma': 'Σ',
  '\\phi': 'φ',
  '\\omega': 'ω',
  '\\Omega': 'Ω',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\sqrt': '√',
  '\\neq ': '≠ ',
};

const mapEach = (token: string, table: Record<string, string>): string =>
  Array.from(token)
    .map((ch) => table[ch] ?? ch)
    .join('');

/**
 * Convert a single line of app markup into selectable Unicode plain text.
 * `^token` / `_token` become true super/subscripts when every char is mappable
 * (otherwise the carat form is kept so it stays legible, e.g. `x^abc`).
 */
export const toText = (input: string): string => {
  if (!input) return '';
  let s = input;

  // \frac{a}{b} -> a/b  (also \frac12 -> 1/2)
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
  s = s.replace(/\\frac\s*(\d)\s*(\d)/g, '$1/$2');

  // \sqrt{x} -> √x  ;  \sqrt x -> √x
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1');
  s = s.replace(/\\sqrt\s+(\w)/g, '√$1');

  // Named symbol tokens (longest-first to avoid \le matching inside \leq).
  Object.keys(SYMBOLS)
    .sort((a, b) => b.length - a.length)
    .forEach((tok) => {
      s = s.split(tok).join(SYMBOLS[tok]);
    });

  // Strip markdown emphasis markers but keep the inner text.
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(?<![A-Za-z0-9])(\*|_)(?=\S)([^*_]+?)(?<=\S)\1(?![A-Za-z0-9])/g, '$2');

  // Superscripts: ^{...} or ^token.
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, g) => mapEach(g, SUPERSCRIPTS));
  s = s.replace(/\^([A-Za-z0-9+\-()]+)/g, (m, g: string) => {
    const mapped = mapEach(g, SUPERSCRIPTS);
    // Only commit if every char became a real superscript glyph.
    return mapped === g && /[A-Za-z]/.test(g) ? m : mapped;
  });

  // Subscripts: _{...} or _digits.
  s = s.replace(/_\{([^{}]*)\}/g, (_m, g) => mapEach(g, SUBSCRIPTS));
  s = s.replace(/_([0-9+\-()]+)/g, (_m, g: string) => mapEach(g, SUBSCRIPTS));

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

const SUPERSCRIPT_TO_ASCII: Record<string, string> = invert(SUPERSCRIPTS);
const SUBSCRIPT_TO_ASCII: Record<string, string> = invert(SUBSCRIPTS);

function invert(table: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [plain, uni] of Object.entries(table)) out[uni] = plain;
  return out;
}

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
  '…': '...',
  ' ': ' ',
};

const isCombiningSuper = (ch: string) => ch in SUPERSCRIPT_TO_ASCII;
const isCombiningSub = (ch: string) => ch in SUBSCRIPT_TO_ASCII;

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
      while (i < chars.length && isCombiningSuper(chars[i])) {
        run += SUPERSCRIPT_TO_ASCII[chars[i]];
        i++;
      }
      out += '^' + run;
      continue;
    }
    if (isCombiningSub(ch)) {
      let run = '';
      while (i < chars.length && isCombiningSub(chars[i])) {
        run += SUBSCRIPT_TO_ASCII[chars[i]];
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
