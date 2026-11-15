import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Content-Security-Policy in vercel.json. It is the only thing standing
 * between a stray inline script or an unexpected origin and the student's
 * session, so these checks pin the properties that must not regress.
 *
 * The inline-script hashes are checked against index.html as it is in source.
 * The build copies those two scripts through byte for byte (verified against
 * dist/index.html), so the source hash is the deployed hash. If Vite ever starts
 * rewriting inline scripts, this test fails and the hashes must be recomputed
 * from dist/index.html. Adding a new inline script means adding its hash too.
 */

const root = process.cwd();
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

const globalBlock = vercel.headers.find((h) => h.source === '/(.*)');
const csp = globalBlock?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

/** Directive name → its source expressions, e.g. script-src → ["'self'", "'sha256-…'"]. */
const parse = (policy: string): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const raw of policy.split(';')) {
    const [name, ...sources] = raw.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
};

const directives = parse(csp);

/** The sha256 hash of every inline (src-less, non-module) script body in index.html. */
const inlineScriptHashes = (html: string): string[] => {
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g;
  const hashes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const digest = createHash('sha256').update(match[1], 'utf8').digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
};

describe('vercel.json Content-Security-Policy', () => {
  it('is set on the global source, alongside the existing security headers', () => {
    expect(globalBlock).toBeDefined();
    const keys = globalBlock!.headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Content-Security-Policy',
      ])
    );
    expect(csp.length).toBeGreaterThan(0);
  });

  it('is enforcing, not report-only', () => {
    const keys = globalBlock!.headers.map((h) => h.key);
    expect(keys).not.toContain('Content-Security-Policy-Report-Only');
  });

  it("sets default-src 'self', object-src 'none', base-uri 'self' and frame-ancestors", () => {
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.has('frame-ancestors')).toBe(true);
    expect(directives.get('frame-ancestors')).toEqual(["'self'"]);
  });

  it("does not allow 'unsafe-inline' or 'unsafe-eval' for scripts", () => {
    const scriptSrc = directives.get('script-src') ?? [];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'wasm-unsafe-eval'");
  });

  it('allows exactly the inline scripts in index.html, by sha256 hash', () => {
    const inline = inlineScriptHashes(indexHtml);
    expect(inline.length).toBeGreaterThan(0);
    const scriptHashes = (directives.get('script-src') ?? []).filter((s) =>
      s.startsWith("'sha256-")
    );
    expect([...scriptHashes].sort()).toEqual([...inline].sort());
  });

  it('keeps the connect-src to same-origin, Supabase and the AI hosts the browser calls', () => {
    const connect = directives.get('connect-src') ?? [];
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://*.supabase.co');
    expect(connect).toContain('wss://*.supabase.co');
    // No wildcard origins beyond the Supabase project wildcard.
    expect(connect.filter((s) => s.includes('*'))).toEqual([
      'https://*.supabase.co',
      'wss://*.supabase.co',
    ]);
  });

  it('does not allow any remote script, style, font or object origin', () => {
    for (const name of ['script-src', 'style-src', 'font-src', 'object-src', 'form-action']) {
      const sources = directives.get(name) ?? [];
      expect(
        sources.filter((s) => /^https?:|^wss?:/.test(s)),
        name
      ).toEqual([]);
    }
  });
});
