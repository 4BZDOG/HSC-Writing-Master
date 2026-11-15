/**
 * Switches Zod to its interpreted (jitless) object parser.
 *
 * Zod 4 normally builds a faster object parser at schema construction by
 * calling `new Function`, after probing whether the page allows eval at all.
 * Under the production Content-Security-Policy in vercel.json (no
 * 'unsafe-eval') that probe is reported as a violation on every load, even
 * though Zod catches the refusal and carries on. Jitless mode skips the probe
 * and runs the same validation logic without generating code: slower on very
 * large inputs, identical in what it accepts and rejects.
 *
 * This module must be the FIRST import of index.tsx. ES modules run imports in
 * order, so this assignment lands before any sibling module constructs a
 * schema. Do not move it below an import that builds schemas at module load.
 */
import { config } from 'zod';

config({ jitless: true });
