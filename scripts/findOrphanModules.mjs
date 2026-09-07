/**
 * Static scan for source modules that nothing imports.
 *
 * Dead modules are not a crash, they are a slow tax: they get read during a
 * review, they get updated by a codemod, they turn up in a grep and send the
 * next person down a path that leads nowhere — and one of the four this was
 * written to remove (`utils/importBackupUtils.ts`) was a second, unwired
 * implementation of merge/validate/backup logic that already ships, which is
 * worse than dead, because wiring it up would have given the app two answers to
 * the same question.
 *
 * `projectDocs/Plan-NextImprovements-2.md` found one of them by hand and filed
 * it as "worth a sweep when something else is open in those files". A sweep
 * that has to be remembered is a sweep that stops happening, so this is the
 * sweep as a gate.
 *
 * Run: npm run check:dead-code
 *   (or: node scripts/findOrphanModules.mjs [rootDir] [--json])
 *
 * `rootDir` defaults to the repository. It is a parameter so the guard can be
 * run over a fixture tree by its own test — a check nobody has tested is a
 * check that silently stops checking.
 *
 * WHAT COUNTS AS IMPORTED. Any static `from '...'` or dynamic `import('...')`
 * with a relative specifier, anywhere in the source tree INCLUDING tests,
 * scripts and the Supabase tooling — a module used only by a test is not dead,
 * it is under test. Entry points are exempt: nothing imports the thing at the
 * root of the graph.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, normalize } from 'node:path';

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const ROOT = resolve(args.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '..'));

/** Directories whose modules must be reachable from somewhere. */
const SCAN_DIRS = ['components', 'hooks', 'services', 'utils', 'data', 'pdf', 'api', 'contexts'];

/** Everything that can name a module, including the places outside SCAN_DIRS. */
const IMPORTER_DIRS = [...SCAN_DIRS, 'tests', 'scripts', 'supabase'];

/**
 * Roots of the module graph. Nothing imports an entry point, so an entry point
 * being unimported says nothing.
 */
const ENTRY_POINTS = new Set(
  [
    'App.tsx',
    'index.tsx',
    'types.ts',
    'vite.config.ts',
    'vitest.config.ts',
    'playwright.config.ts',
    'vite-env.d.ts',
  ].map((f) => join(ROOT, f))
);

/**
 * Modules that are legitimately unimported. Each needs a reason — the point of
 * the gate is that adding an entry is a decision someone made in writing, not a
 * silent exemption.
 */
const KNOWN_UNIMPORTED = [
  // e.g. { file: 'utils/example.ts', reason: 'Loaded by URL at runtime.' },
];

const walk = (dir, test) => {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, test));
    else if (test(entry)) out.push(full);
  }
  return out;
};

const isSource = (name) => /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name);
const isImporter = (name) => /\.(tsx?|mjs|js)$/.test(name);

const scanned = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), isSource)).filter(
  (f) => !ENTRY_POINTS.has(f)
);

const importerFiles = [
  ...IMPORTER_DIRS.flatMap((d) => walk(join(ROOT, d), isImporter)),
  ...[...ENTRY_POINTS].filter((f) => existsSync(f)),
];

/**
 * Every relative specifier, resolved to an extension-less absolute path. Both
 * forms are collected because a specifier may or may not carry its extension,
 * and a directory specifier means that directory's `index`.
 */
const imported = new Set();
// `import './x'` — a side-effect import, with no binding and no `from` — is a
// real importer and the easiest shape to miss. Missing it would report a live
// module as dead, which is the failure that matters: a false negative leaves
// dead code, a false positive deletes working code.
const SPECIFIER =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

for (const file of importerFiles) {
  const src = readFileSync(file, 'utf8');
  let match;
  while ((match = SPECIFIER.exec(src)) !== null) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const abs = normalize(join(dirname(file), spec));
    imported.add(abs);
    imported.add(abs.replace(/\.(tsx?|jsx?)$/, ''));
    imported.add(join(abs, 'index'));
  }
}

const isReferenced = (file) => {
  const noExt = file.replace(/\.(tsx?)$/, '');
  return imported.has(file) || imported.has(noExt);
};

const allowed = new Map(KNOWN_UNIMPORTED.map((k) => [join(ROOT, k.file), k.reason]));

const orphans = scanned.filter((f) => !isReferenced(f) && !allowed.has(f));
const exempt = scanned.filter((f) => !isReferenced(f) && allowed.has(f));

if (AS_JSON) {
  console.log(JSON.stringify(orphans.map((f) => relative(ROOT, f)).sort(), null, 2));
} else if (orphans.length === 0) {
  console.log(`No unimported modules across ${scanned.length} scanned source files.\n`);
} else {
  console.log(
    `${orphans.length} module(s) that nothing imports — delete each, wire it up, or add it`
  );
  console.log('to KNOWN_UNIMPORTED in this script with the reason it has no importer.\n');
  for (const file of orphans.sort()) {
    console.log(`  ${relative(ROOT, file)}  (${statSync(file).size} bytes)`);
  }
  console.log();
}

if (exempt.length > 0) {
  console.log('Accepted as unimported:');
  for (const file of exempt.sort()) {
    console.log(`  ${relative(ROOT, file)} — ${allowed.get(file)}`);
  }
}

process.exit(orphans.length === 0 ? 0 : 1);
