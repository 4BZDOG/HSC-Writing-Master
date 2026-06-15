import { describe, it, expect } from 'vitest';
import { toText, degradeToAscii, containsEmoji } from '../../pdf/text';

describe('toText', () => {
  it('converts ^digits to Unicode superscripts', () => {
    expect(toText('x^2')).toBe('x²');
    expect(toText('10^-6')).toBe('10⁻⁶');
    expect(toText('a^{12}')).toBe('a¹²');
  });

  it('converts _digits to Unicode subscripts', () => {
    expect(toText('H_2O')).toBe('H₂O');
    expect(toText('x_{10}')).toBe('x₁₀');
  });

  it('keeps the carat form when the exponent is non-mappable text', () => {
    expect(toText('x^abc')).toBe('x^abc');
  });

  it('maps LaTeX-ish symbol tokens', () => {
    expect(toText('a \\le b')).toBe('a ≤ b');
    expect(toText('\\pi r^2')).toBe('π r²');
    expect(toText('\\sqrt{x}')).toBe('√x');
    expect(toText('\\frac{a}{b}')).toBe('a/b');
  });

  it('strips markdown emphasis but keeps the text', () => {
    expect(toText('**bold** and *italic*')).toBe('bold and italic');
  });

  it('returns empty string for empty input', () => {
    expect(toText('')).toBe('');
  });
});

describe('degradeToAscii', () => {
  it('maps symbols and Greek letters to ASCII', () => {
    expect(degradeToAscii('π')).toBe('pi');
    expect(degradeToAscii('√x')).toBe('sqrtx');
    expect(degradeToAscii('a ≤ b')).toBe('a <= b');
    expect(degradeToAscii('5°C')).toBe('5degC');
  });

  it('collapses superscript runs to ^n and subscripts to _n', () => {
    expect(degradeToAscii('x²')).toBe('x^2');
    expect(degradeToAscii('10⁻⁶')).toBe('10^-6');
    expect(degradeToAscii('H₂O')).toBe('H_2O');
  });

  it('normalises smart punctuation', () => {
    expect(degradeToAscii('“quote”')).toBe('"quote"');
    expect(degradeToAscii('a — b')).toBe('a - b');
  });

  it('round-trips toText output to legible ASCII', () => {
    expect(degradeToAscii(toText('x^6'))).toBe('x^6');
    expect(degradeToAscii(toText('\\pi'))).toBe('pi');
  });

  it('leaves plain ASCII untouched', () => {
    expect(degradeToAscii('Plain text 123.')).toBe('Plain text 123.');
  });
});

describe('containsEmoji', () => {
  it('detects emoji', () => {
    expect(containsEmoji('great work 🎉')).toBe(true);
    expect(containsEmoji('✅ done')).toBe(true);
  });

  it('returns false for plain text and math', () => {
    expect(containsEmoji('x² + π ≤ 5')).toBe(false);
    expect(containsEmoji('')).toBe(false);
  });
});
