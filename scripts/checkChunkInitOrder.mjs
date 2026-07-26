/**
 * Guard against the crash class that took production down:
 *
 *   Uncaught ReferenceError: Cannot access 'Cs' before initialization
 *
 * A chunk that reads an imported binding at its TOP LEVEL is only safe if the
 * chunk defining that binding has finished executing first. Rollup guarantees
 * that for an acyclic graph — but when two chunks import each other, one of
 * them runs first and any top-level read of the other's `const` throws, killing
 * the whole page.
 *
 * This runs on the REAL BUILD OUTPUT, so unlike a source-level heuristic it
 * cannot be fooled by how the bundler decided to split things — which is the
 * only thing that actually determines whether the bug fires.
 *
 * Dev never reproduces it (Vite serves modules unbundled), `vite build`
 * succeeds, and unit tests pass, so this check is the only automated thing
 * standing between the bug and a blank page.
 *
 * Usage: npm run build && node scripts/checkChunkInitOrder.mjs [dist]
 * Exit code 1 = a top-level read crosses a chunk cycle.
 */
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const assetsDir = join(distDir, 'assets');

const chunkFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));

/** name → { imports: Map<chunkName, string[] bindings>, eagerReads: Set<binding> } */
const chunks = new Map();

for (const file of chunkFiles) {
  const code = readFileSync(join(assetsDir, file), 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  const imports = new Map(); // local binding → source chunk file
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    const target = basename(node.moduleSpecifier.text);
    if (!target.endsWith('.js')) return;
    const clause = node.importClause;
    if (!clause) return;
    if (clause.name) imports.set(clause.name.text, target);
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) imports.set(el.name.text, target);
    } else if (named && ts.isNamespaceImport(named)) {
      imports.set(named.name.text, target);
    }
  });

  // Top-level reads: walk every top-level statement, stopping at any function
  // boundary (a body runs when called, long after all chunks have initialised).
  const eagerReads = new Map(); // binding → source chunk
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

  const walk = (node) => {
    if (isFunctionLike(node)) return;
    if (ts.isIdentifier(node)) {
      const from = imports.get(node.text);
      if (from && from !== file) eagerReads.set(node.text, from);
      return;
    }
    node.forEachChild(walk);
  };

  sf.forEachChild((stmt) => {
    if (ts.isImportDeclaration(stmt)) return;
    // `export { a as b } from './x.js'` is a re-export, not a read.
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) return;
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) return;
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) if (d.initializer) walk(d.initializer);
      return;
    }
    walk(stmt);
  });

  chunks.set(file, { imports, eagerReads });
}

/** Chunk-level import graph. */
const graph = new Map();
for (const [file, info] of chunks) {
  graph.set(file, new Set([...info.imports.values()].filter((t) => t !== file)));
}

/** Every chunk pair that imports the other, directly or transitively. */
const reaches = (from, to) => {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of graph.get(cur) ?? []) stack.push(next);
  }
  return false;
};

const problems = [];
for (const [file, info] of chunks) {
  for (const [binding, source] of info.eagerReads) {
    // The read is dangerous only if the defining chunk can reach back to this
    // one — i.e. the two sit on a cycle and execution order is not guaranteed.
    if (reaches(source, file)) {
      problems.push({ chunk: file, binding, source });
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ ${chunks.size} chunks checked — no top-level read crosses a chunk cycle.`);
  process.exit(0);
}

console.error(
  `✗ ${problems.length} top-level read(s) of an imported binding across a CHUNK CYCLE.\n` +
    '  These throw "Cannot access \'X\' before initialization" at load — a blank page.\n' +
    '  Fix by moving the read inside a function so it happens after module init,\n' +
    '  or by moving the value into an import-free leaf module.\n'
);
for (const p of problems) {
  console.error(`  ${p.chunk}  reads '${p.binding}'  from  ${p.source}  (which imports it back)`);
}
process.exit(1);
