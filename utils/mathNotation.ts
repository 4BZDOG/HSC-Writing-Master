// utils/mathNotation.ts
//
// Pure, DOM-free LaTeX-ish shorthand -> Unicode conversion helpers. No DOM, no
// React — safe to unit-test under Node, same convention as `pdf/text.ts`.
//
// Shared by `pdf/text.ts` (`toText()`, the PDF export pipeline) and
// `utils/renderUtils.ts` (`renderFormattedText()`/`cleanMarkdown()`, the
// on-screen pipeline) so the two never drift: a formula that prints correctly
// but shows raw backslash text on screen is a disagreement a teacher notices
// and cannot explain — see `projectDocs/Plan-FormulaNotationRendering.md`.

/** Unicode superscript glyphs keyed by their plain counterpart. Ported
 *  verbatim from `pdf/text.ts`'s `SUPERSCRIPTS`. */
export const SUPERSCRIPT_UNICODE: Record<string, string> = {
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

/** Unicode subscript glyphs keyed by their plain counterpart. Ported verbatim
 *  from `pdf/text.ts`'s `SUBSCRIPTS`. */
export const SUBSCRIPT_UNICODE: Record<string, string> = {
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

/** Backslash-token -> Unicode. The first block is ported verbatim from
 *  `pdf/text.ts`'s `SYMBOLS`; the rest are new entries for chemistry
 *  equilibrium arrows, physics/economics operators, and extension-maths set
 *  notation. */
export const MATH_SYMBOLS: Record<string, string> = {
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
  // New — chemistry, physics/economics, geography, extension maths.
  '\\rightleftharpoons': '⇌', // chemical equilibrium
  '\\leftrightarrow': '↔', // resonance structures
  '\\propto': '∝', // physics/economics proportionality
  '\\perp': '⊥', // geometry/physics perpendicular
  '\\parallel': '∥',
  '\\angle': '∠', // geometry / geography bearings
  '\\partial': '∂', // physics/economics partial derivatives
  '\\int': '∫', // extension maths
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\cup': '∪',
  '\\cap': '∩',
};

const mapEach = (token: string, table: Record<string, string>): string =>
  Array.from(token)
    .map((ch) => table[ch] ?? ch)
    .join('');

/** \sqrt{x} -> √x ; \sqrt x -> √x. Ported verbatim from `pdf/text.ts`. */
export const expandSqrt = (text: string): string => {
  let s = text;
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1');
  s = s.replace(/\\sqrt\s+(\w)/g, '√$1');
  return s;
};

/** \frac{a}{b} -> a/b (also \frac12 -> 1/2). PDF-only concern (no stacked
 *  fraction possible in flat text) — the screen renderer deliberately does
 *  NOT call this; it renders \frac{}{} structurally instead (see
 *  `renderUtils.ts`). Also used by `cleanMarkdown` for the same reason
 *  (plain text has the same flattening constraint as PDF). Ported verbatim
 *  from `pdf/text.ts`. */
export const expandFracToSlash = (text: string): string => {
  let s = text;
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
  s = s.replace(/\\frac\s*(\d)\s*(\d)/g, '$1/$2');
  return s;
};

/** \vec{v} -> v followed by a combining arrow-above (U+20D7), e.g. "v⃗".
 *  NEW — physics vector notation, absent from both pipelines today. */
export const expandVector = (text: string): string =>
  text.replace(/\\vec\{([^{}]*)\}/g, (_m, inner: string) => `${inner}⃗`);

/**
 * Strips `$...$` inline-math delimiters. This app's own shorthand never uses
 * them — a formula is written as bare `\sqrt{}`, `^`, `_`, `\frac{}{}` — but
 * Gemini reaches for standard LaTeX dollar-delimited math out of habit
 * regardless of what the system prompt asks for, and nothing downstream
 * strips it: `expandMathSymbolTokens` et al. only rewrite tokens *inside* the
 * text, they don't touch a bare `$`. Left alone, a sample answer shows the
 * delimiters themselves — "the acceleration ($ax$) is 0" — verbatim to the
 * teacher reading it.
 *
 * The disambiguation rule is Pandoc's `tex_math_dollars` one, because the
 * same ambiguity they solved applies here: this app also covers HSC
 * Economics/Business Studies, where a bare `$` is a currency figure, not a
 * delimiter. The opening `$` must be followed by a non-space character, the
 * closing `$` must be preceded by a non-space character and not immediately
 * followed by a digit. `$50,000 and $30,000` has no valid closing `$` under
 * that rule (the run between them ends in a space) and is left untouched;
 * `$ax$` and `$x^2$` are, and lose only the delimiters — the inner content
 * still flows through `expandSqrt`/`expandVector`/`expandMathSymbolTokens`
 * and the sup/sub steps exactly as if it had never been wrapped.
 *
 * Deliberately single-`$` only: HSC short-answer prose has no legitimate use
 * for LaTeX's `$$...$$` display-math form, so widening this to match it would
 * only add another way to misfire on a currency figure.
 */
export const stripInlineMathDollars = (text: string): string =>
  text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, '$1');

/** Longest-token-first symbol replace, so \le doesn't get eaten mid-\leq.
 *  Ported verbatim from `pdf/text.ts`. */
export const expandMathSymbolTokens = (text: string): string => {
  let s = text;
  Object.keys(MATH_SYMBOLS)
    .sort((a, b) => b.length - a.length)
    .forEach((tok) => {
      s = s.split(tok).join(MATH_SYMBOLS[tok]);
    });
  return s;
};

/** ^{...} / ^token -> Unicode superscript glyphs (mappable chars only —
 *  keeps the carat form otherwise, e.g. `x^abc` stays `x^abc`, pinned by
 *  `tests/unit/pdfText.test.ts`). Ported verbatim from `pdf/text.ts`. */
export const expandSuperscriptsToUnicode = (text: string): string => {
  let s = text;
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, g) => mapEach(g, SUPERSCRIPT_UNICODE));
  s = s.replace(/\^([A-Za-z0-9+\-()]+)/g, (m, g: string) => {
    const mapped = mapEach(g, SUPERSCRIPT_UNICODE);
    // Only commit if every char became a real superscript glyph.
    return mapped === g && /[A-Za-z]/.test(g) ? m : mapped;
  });
  return s;
};

/** _{...} / _digits -> Unicode subscript glyphs. Ported verbatim from
 *  `pdf/text.ts`. */
export const expandSubscriptsToUnicode = (text: string): string => {
  let s = text;
  s = s.replace(/_\{([^{}]*)\}/g, (_m, g) => mapEach(g, SUBSCRIPT_UNICODE));
  s = s.replace(/_([0-9+\-()]+)/g, (_m, g: string) => mapEach(g, SUBSCRIPT_UNICODE));
  return s;
};
