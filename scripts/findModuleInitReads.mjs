/**
 * Static scan for the crash class that took production down:
 *
 *   A module reads an IMPORTED value at module-init time (top level, outside any
 *   function body). If the bundler places the reader and the definer in
 *   different chunks, and those chunks import each other, the reader executes
 *   first and hits a temporal-dead-zone error:
 *   "Cannot access 'X' before initialization" — a blank page, in production
 *   only, because dev serves modules unbundled.
 *
 * Run: npm run check:eager-reads   (or: node scripts/findModuleInitReads.mjs [--json])
 *
 * ADVISORY. This finds reads that COULD break if the bundler ever splits the
 * two modules into chunks that import each other. Whether that is true today is
 * decided by `npm run check:bundle`, which inspects the real build output and
 * is the gate that runs in CI. Use this one when you want to know where the
 * landmines are before they go off.
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** Client source that Vite bundles. `api/` is serverless and never chunked. */
const SCAN_DIRS = ['components', 'services', 'utils', 'data', 'hooks', 'pdf', 'contexts'];
const SCAN_FILES = ['App.tsx', 'index.tsx', 'types.ts'];

const walk = (dir) => {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
};

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))),
  ...SCAN_FILES.map((f) => join(ROOT, f)).filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  }),
];

/** Imported VALUE bindings (type-only imports cannot exist at runtime). */
const collectImports = (sourceFile) => {
  const bindings = new Map(); // local name → module specifier
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause) return;
    // `import type { X }` — erased entirely.
    if (node.importClause.isTypeOnly) return;
    const spec = node.moduleSpecifier.text;
    // Only our own modules matter: a cycle needs both ends in the app graph.
    if (!spec.startsWith('.')) return;
    const clause = node.importClause;
    if (clause.name) bindings.set(clause.name.text, spec);
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        if (el.isTypeOnly) continue; // `import { type X }`
        bindings.set(el.name.text, spec);
      }
    } else if (named && ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, spec);
    }
  });
  return bindings;
};

/**
 * Reads that are eager but STRUCTURALLY safe, with the reason. Anything not on
 * this list should either be moved inside a function or explained here.
 */
const KNOWN_SAFE = [
  {
    file: 'data/seedData.ts',
    reason:
      'Only ever reached through a dynamic import() in hooks/useSyllabusData.ts, so it executes ' +
      'long after every eager chunk has initialised, and performanceBands never imports it back.',
  },
  {
    file: 'index.tsx',
    reason:
      'The application entry rendering <App/>. Nothing imports the entry, so it cannot sit on a ' +
      'cycle — by the time its body runs, everything it imported has initialised.',
  },
];

const findings = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // Kind BY EXTENSION. Parsing a .ts file as TSX reinterprets `<Type>value`
  // assertions as JSX, producing a mangled tree whose parent chain no longer
  // reaches the enclosing function — which made this scanner report code that
  // was plainly inside a function body.
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports = collectImports(sf);
  if (imports.size === 0) continue;

  const isFunctionLike = (n) =>
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessor(n) ||
    ts.isSetAccessor(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isClassDeclaration(n) ||
    ts.isClassExpression(n);

  /**
   * True when the node sits inside a function body (so it runs on call, long
   * after every module has initialised) or in a type position (erased).
   *
   * Decided by walking ANCESTORS rather than by pruning during descent — the
   * earlier version pruned, and leaked on node shapes whose parent chain it
   * never visited, producing false "eager read" reports for code that was
   * plainly inside a function.
   */
  const isDeferred = (node) => {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (isFunctionLike(cur)) return true;
      if (ts.isTypeNode(cur) || ts.isTypeAliasDeclaration(cur) || ts.isInterfaceDeclaration(cur)) {
        return true;
      }
      if (ts.isImportDeclaration(cur) || ts.isExportDeclaration(cur)) return true;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isIdentifier(node) && imports.has(node.text) && !isDeferred(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      findings.push({
        file: relative(ROOT, file),
        line: line + 1,
        binding: node.text,
        from: imports.get(node.text),
        snippet: text.split('\n')[line].trim().slice(0, 110),
      });
    }
    node.forEachChild(visit);
  };
  visit(sf);
}

const safeFor = (file) => KNOWN_SAFE.find((k) => k.file === file);
const review = findings.filter((f) => !safeFor(f.file));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ review, accepted: findings.filter((f) => safeFor(f.file)) }, null, 2));
  process.exit(0);
}

const group = (list) => {
  const byFile = new Map();
  for (const f of list) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  return [...byFile].sort();
};

if (review.length === 0) {
  console.log('No unexplained eager reads of imported values.\n');
} else {
  console.log(`${review.length} eager read(s) to review — move each inside a function, or add it`);
  console.log('to KNOWN_SAFE in this script with the reason it cannot sit on a chunk cycle.\n');
  for (const [file, hits] of group(review)) {
    console.log(file);
    for (const h of hits) console.log(`  :${h.line} ${h.binding}  ← ${h.from}\n      ${h.snippet}`);
    console.log();
  }
}

const accepted = group(findings.filter((f) => safeFor(f.file)));
if (accepted.length > 0) {
  console.log('Accepted as safe:');
  for (const [file, hits] of accepted) {
    console.log(`  ${file} (${hits.length}) — ${safeFor(file).reason}`);
  }
}

process.exit(review.length === 0 ? 0 : 1);
