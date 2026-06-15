import { describe, it, expect } from 'vitest';
import { hasValidFontSignature, bytesToBase64 } from '../../pdf/fontLoader';
import { sanitizeFilename } from '../../pdf/exportEvaluation';

describe('hasValidFontSignature', () => {
  it('accepts TrueType (0x00010000)', () => {
    expect(hasValidFontSignature(new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x12]))).toBe(true);
  });
  it("accepts OpenType/CFF 'OTTO' (0x4F54544F)", () => {
    expect(hasValidFontSignature(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]))).toBe(true);
  });
  it("accepts legacy 'true' (0x74727565)", () => {
    expect(hasValidFontSignature(new Uint8Array([0x74, 0x72, 0x75, 0x65]))).toBe(true);
  });
  it('rejects HTML/error payloads and short buffers', () => {
    expect(hasValidFontSignature(new Uint8Array([0x3c, 0x21, 0x44, 0x4f]))).toBe(false); // "<!DO"
    expect(hasValidFontSignature(new Uint8Array([0x00, 0x01]))).toBe(false);
  });
});

describe('bytesToBase64', () => {
  it('encodes bytes (chunked) to base64 matching Buffer', () => {
    const bytes = new Uint8Array(20000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const expected = Buffer.from(bytes).toString('base64');
    expect(bytesToBase64(bytes)).toBe(expected);
  });
});

describe('sanitizeFilename', () => {
  it('strips hostile characters and appends .pdf', () => {
    expect(sanitizeFilename('My/Report:?*')).toBe('MyReport.pdf');
  });
  it('does not double the extension', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
  });
  it('falls back to a default when empty', () => {
    expect(sanitizeFilename('')).toBe('export.pdf');
    expect(sanitizeFilename('///')).toBe('export.pdf');
  });
});
