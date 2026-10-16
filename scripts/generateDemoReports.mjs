#!/usr/bin/env node
// scripts/generateDemoReports.mjs
//
// Render the progress-report sample set built from the demo accounts' own data
// (scripts/pdfSamples/demoReports.ts): 23 PDFs covering the student, teacher and
// school audiences, with the same exporter the app uses. Its own output directory,
// so it never disturbs the marking-feedback samples.
//
//   npm run samples:demo-reports              # -> .pdf-samples/demo/*.pdf
//   npm run samples:demo-reports -- --png     # also rasterise each page
//
// PNGs land in .pdf-samples/demo/png/<sample>/page-N.png (needs poppler's pdftoppm).
// Bundled with esbuild and run under Node, like generatePdfSamples.mjs, for the same
// reasons: the exporter reaches pdf/ -> utils/ -> react, and the two shims below.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.pdf-samples', 'demo');
const PNG_DIR = path.join(OUT_DIR, 'png');
const BUNDLE = path.join(OUT_DIR, '.demo-entry.mjs');

// `fetch` shim + jsPDF's own Node save path both need CommonJS `require` inside
// an ES bundle; esbuild's shim throws without it. Mirrors generatePdfSamples.mjs.
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

// Only this run's own directory is cleared; the marking-feedback pipeline's output
// sits beside it in .pdf-samples/.
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'scripts/pdfSamples/demoEntry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: BUNDLE,
  banner: { js: BANNER },
  // `import.meta.env` is Vite's, and the font loader reads BASE_URL from it.
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  logLevel: 'warning',
});

console.log('Rendering demo progress reports…');
execFileSync(process.execPath, [BUNDLE], {
  cwd: OUT_DIR,
  stdio: 'inherit',
  env: { ...process.env, HSC_DEMO_ROOT: ROOT },
});
fs.rmSync(BUNDLE, { force: true });

if (process.argv.includes('--png')) {
  const pdfs = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf'));
  try {
    for (const file of pdfs) {
      const stem = path.basename(file, '.pdf');
      const dir = path.join(PNG_DIR, stem);
      fs.mkdirSync(dir, { recursive: true });
      execFileSync('pdftoppm', [
        '-png',
        '-r',
        '110',
        path.join(OUT_DIR, file),
        path.join(dir, 'page'),
      ]);
    }
  } catch {
    console.warn('pdftoppm not found — install poppler-utils to rasterise.');
  }
}

console.log(`Done — ${path.relative(process.cwd(), OUT_DIR)}`);
