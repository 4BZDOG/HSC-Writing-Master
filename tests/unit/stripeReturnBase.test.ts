import { describe, it, expect } from 'vitest';
import { resolveReturnBase } from '../../api/_lib/stripe';

describe('resolveReturnBase', () => {
  const origin = 'https://4bzdog.github.io';

  it('keeps the base path from a same-origin returnUrl (sub-path hosting)', () => {
    expect(resolveReturnBase(origin, undefined, 'https://4bzdog.github.io/HSC-Writing-Master/')).toBe(
      'https://4bzdog.github.io/HSC-Writing-Master/'
    );
  });

  it('appends a trailing slash when the returnUrl lacks one', () => {
    expect(resolveReturnBase(origin, undefined, 'https://4bzdog.github.io/HSC-Writing-Master')).toBe(
      'https://4bzdog.github.io/HSC-Writing-Master/'
    );
  });

  it('rejects a cross-origin returnUrl (no open redirect) and falls back to the Origin header', () => {
    expect(resolveReturnBase(origin, undefined, 'https://evil.example.com/phish/')).toBe(
      'https://4bzdog.github.io/'
    );
  });

  it('rejects non-http(s) schemes', () => {
    expect(resolveReturnBase(origin, undefined, 'javascript:alert(1)')).toBe(
      'https://4bzdog.github.io/'
    );
  });

  it('ignores an unparseable returnUrl', () => {
    expect(resolveReturnBase(origin, undefined, 'not a url')).toBe('https://4bzdog.github.io/');
    expect(resolveReturnBase(origin, undefined, undefined)).toBe('https://4bzdog.github.io/');
  });

  it('strips any query/hash the client accidentally included', () => {
    expect(
      resolveReturnBase(origin, undefined, 'https://4bzdog.github.io/HSC-Writing-Master/?x=1#y')
    ).toBe('https://4bzdog.github.io/HSC-Writing-Master/');
  });

  it('derives the origin from the referer when there is no Origin header', () => {
    expect(resolveReturnBase(undefined, 'https://app.example.com/some/page', undefined)).toBe(
      'https://app.example.com/some/'
    );
  });

  it('falls back to localhost when no headers are present', () => {
    expect(resolveReturnBase(undefined, undefined, undefined)).toBe('http://localhost:3000/');
  });

  it('ignores a returnUrl when no header proves where the request came from', () => {
    // A request with neither Origin nor Referer proves nothing about its
    // source, so trusting its returnUrl would make Stripe's redirect an open
    // redirect. Browsers always send Origin on a cross-site-capable POST.
    expect(resolveReturnBase(undefined, undefined, 'https://evil.example.com/phish/')).toBe(
      'http://localhost:3000/'
    );
  });

  it('validates the returnUrl against the Referer origin when Origin is absent', () => {
    expect(
      resolveReturnBase(undefined, 'https://app.example.com/page', 'https://app.example.com/sub/')
    ).toBe('https://app.example.com/sub/');
    expect(
      resolveReturnBase(undefined, 'https://app.example.com/page', 'https://evil.example.com/')
    ).toBe('https://app.example.com/');
  });

  it('rejects a returnUrl when the Origin header is the opaque "null"', () => {
    expect(resolveReturnBase('null', undefined, 'https://evil.example.com/')).toBe(
      'http://localhost:3000/'
    );
  });
});
