import { describe, it, expect } from 'vitest';
import {
  MATH_SYMBOLS,
  SUPERSCRIPT_UNICODE,
  SUBSCRIPT_UNICODE,
  expandFracToSlash,
  expandSqrt,
  expandVector,
  expandMathSymbolTokens,
  expandSuperscriptsToUnicode,
  expandSubscriptsToUnicode,
  stripInlineMathDollars,
} from '../../utils/mathNotation';

const COMBINING_ARROW = '\u20D7';

describe('expandFracToSlash', () => {
  it('converts \\frac{a}{b} to a/b', () => {
    expect(expandFracToSlash('\\frac{a}{b}')).toBe('a/b');
    expect(expandFracToSlash('\\frac{PV}{nR}')).toBe('PV/nR');
  });

  it('converts \\frac12 (single-digit shorthand) to 1/2', () => {
    expect(expandFracToSlash('\\frac12')).toBe('1/2');
  });

  it('leaves non-matching text untouched', () => {
    expect(expandFracToSlash('no fractions here')).toBe('no fractions here');
  });
});

describe('expandSqrt', () => {
  it('converts \\sqrt{x} to \u221ax', () => {
    expect(expandSqrt('\\sqrt{x}')).toBe('\u221ax');
  });

  it('converts \\sqrt x (no braces) to \u221ax', () => {
    expect(expandSqrt('\\sqrt x')).toBe('\u221ax');
  });
});

describe('expandVector (new)', () => {
  it('converts \\vec{v} to v followed by a combining arrow-above', () => {
    expect(expandVector('\\vec{v}')).toBe(`v${COMBINING_ARROW}`);
  });

  it('handles physics notation like \\vec{F} = m\\vec{a}', () => {
    expect(expandVector('\\vec{F} = m\\vec{a}')).toBe(
      `F${COMBINING_ARROW} = ma${COMBINING_ARROW}`
    );
  });

  it('leaves text without \\vec untouched', () => {
    expect(expandVector('plain text')).toBe('plain text');
  });
});

describe('expandMathSymbolTokens', () => {
  it('maps existing symbol tokens', () => {
    expect(expandMathSymbolTokens('a \\le b')).toBe('a \u2264 b');
    expect(expandMathSymbolTokens('\\pi r')).toBe('\u03c0 r');
  });

  it('does not let \\le get eaten mid-\\leq (longest-token-first)', () => {
    expect(expandMathSymbolTokens('a \\leq b')).toBe('a \u2264 b');
  });

  it('maps the new chemistry equilibrium arrow', () => {
    expect(expandMathSymbolTokens('H_2O \\rightleftharpoons H^+ + OH^-')).toBe(
      'H_2O \u21cc H^+ + OH^-'
    );
  });

  it('maps the new resonance / proportionality / perpendicular / parallel symbols', () => {
    expect(expandMathSymbolTokens('\\leftrightarrow')).toBe('\u2194');
    expect(expandMathSymbolTokens('y \\propto x')).toBe('y \u221d x');
    expect(expandMathSymbolTokens('AB \\perp CD')).toBe('AB \u22a5 CD');
    expect(expandMathSymbolTokens('AB \\parallel CD')).toBe('AB \u2225 CD');
  });

  it('maps the new geometry/bearing and calculus symbols', () => {
    expect(expandMathSymbolTokens('\\angle ABC')).toBe('\u2220 ABC');
    expect(expandMathSymbolTokens('\\partial y / \\partial x')).toBe('\u2202 y / \u2202 x');
    expect(expandMathSymbolTokens('\\int f(x) dx')).toBe('\u222b f(x) dx');
  });

  it('maps the new set-notation symbols', () => {
    expect(expandMathSymbolTokens('x \\in S')).toBe('x \u2208 S');
    expect(expandMathSymbolTokens('x \\notin S')).toBe('x \u2209 S');
    expect(expandMathSymbolTokens('A \\subset B')).toBe('A \u2282 B');
    expect(expandMathSymbolTokens('A \\cup B')).toBe('A \u222a B');
    expect(expandMathSymbolTokens('A \\cap B')).toBe('A \u2229 B');
  });

  it('every new MATH_SYMBOLS entry from the plan is present', () => {
    const newEntries = [
      '\\rightleftharpoons',
      '\\leftrightarrow',
      '\\propto',
      '\\perp',
      '\\parallel',
      '\\angle',
      '\\partial',
      '\\int',
      '\\in',
      '\\notin',
      '\\subset',
      '\\cup',
      '\\cap',
    ];
    newEntries.forEach((tok) => expect(MATH_SYMBOLS[tok]).toBeTruthy());
  });
});

describe('expandSuperscriptsToUnicode', () => {
  it('converts ^digits to Unicode superscripts', () => {
    expect(expandSuperscriptsToUnicode('x^2')).toBe('x\u00b2');
    expect(expandSuperscriptsToUnicode('10^-6')).toBe('10\u207b\u2076');
    expect(expandSuperscriptsToUnicode('a^{12}')).toBe('a\u00b9\u00b2');
  });

  it('keeps the carat form when the exponent is non-mappable text', () => {
    expect(expandSuperscriptsToUnicode('x^abc')).toBe('x^abc');
  });
});

describe('expandSubscriptsToUnicode', () => {
  it('converts _digits to Unicode subscripts', () => {
    expect(expandSubscriptsToUnicode('H_2O')).toBe('H\u2082O');
    expect(expandSubscriptsToUnicode('x_{10}')).toBe('x\u2081\u2080');
  });
});

describe('stripInlineMathDollars', () => {
  it('strips $...$ around a bare variable Gemini wraps out of habit', () => {
    expect(
      stripInlineMathDollars(
        'the constant horizontal acceleration ($ax$) is 0 m/s²'
      )
    ).toBe('the constant horizontal acceleration (ax) is 0 m/s²');
  });

  it('strips multiple pairs in the same sentence, each independently', () => {
    expect(stripInlineMathDollars('$ax$ is 0 and $ay$ is $g$')).toBe('ax is 0 and ay is g');
  });

  it('leaves the inner content for the rest of the pipeline to expand', () => {
    expect(expandSuperscriptsToUnicode(stripInlineMathDollars('$x^2$'))).toBe('x²');
  });

  it('does not touch a currency figure with no matching close', () => {
    expect(stripInlineMathDollars('costs increased from $50,000 to $80,000')).toBe(
      'costs increased from $50,000 to $80,000'
    );
  });

  it('does not touch a single dollar figure in prose', () => {
    expect(stripInlineMathDollars('a cost of $5 per unit')).toBe('a cost of $5 per unit');
  });

  it('leaves text with no dollar signs untouched', () => {
    expect(stripInlineMathDollars('no math here')).toBe('no math here');
  });
});

describe('SUPERSCRIPT_UNICODE / SUBSCRIPT_UNICODE tables', () => {
  it('map digits and common punctuation', () => {
    expect(SUPERSCRIPT_UNICODE['2']).toBe('\u00b2');
    expect(SUBSCRIPT_UNICODE['2']).toBe('\u2082');
  });
});
