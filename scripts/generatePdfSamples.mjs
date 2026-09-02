#!/usr/bin/env node
// scripts/generatePdfSamples.mjs
//
// Render the marking-feedback PDF for a set of realistic fixtures, so a change
// to the exporter can be LOOKED AT rather than reasoned about. The unit tests
// pin what the layout engine computes; they cannot tell anyone whether the page
// reads well, and every design regression this exporter has had was invisible
// to them.
//
//   npm run samples:pdf              # -> .pdf-samples/*.pdf
//   npm run samples:pdf -- --png     # also rasterise (needs poppler's pdftoppm)
//
// Bundled with esbuild (already a devDependency) rather than run through a TS
// loader: the exporter reaches `pdf/` -> `utils/` -> `react`, and Node's
// strip-types mode rejects the parameter properties in `PdfExportError`.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.pdf-samples');
const BUNDLE = path.join(OUT_DIR, '.entry.mjs');

// `fetch` shim + jsPDF's own Node save path both need CommonJS `require` inside
// an ES bundle; esbuild's shim throws without it.
const BANNER = [
  'import { createRequire as __createRequire } from "node:module";',
  'import __fs from "node:fs";',
  'import __path from "node:path";',
  'const require = __createRequire(import.meta.url);',
  `const __publicDir = ${JSON.stringify(path.join(ROOT, 'public'))};`,
  'const __realFetch = globalThis.fetch;',
  'globalThis.fetch = async (url, init) => {',
  '  const u = String(url);',
  '  if (u.startsWith("/")) return new Response(__fs.readFileSync(__path.join(__publicDir, u)));',
  '  return __realFetch(url, init);',
  '};',
].join('\n');

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'scripts/pdfSamples/entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: BUNDLE,
  banner: { js: BANNER },
  // `import.meta.env` is Vite's, and the font loader reads BASE_URL from it.
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  logLevel: 'warning',
});

console.log('Rendering samples…');
execFileSync(process.execPath, [BUNDLE], { cwd: OUT_DIR, stdio: 'inherit' });
fs.rmSync(BUNDLE, { force: true });

if (process.argv.includes('--png')) {
  for (const file of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf'))) {
    const stem = path.join(OUT_DIR, path.basename(file, '.pdf'));
    try {
      execFileSync('pdftoppm', ['-png', '-r', '110', path.join(OUT_DIR, file), stem]);
    } catch {
      console.warn('pdftoppm not found — install poppler-utils to rasterise.');
      break;
    }
  }
}

console.log(`Done — ${path.relative(process.cwd(), OUT_DIR)}`);
