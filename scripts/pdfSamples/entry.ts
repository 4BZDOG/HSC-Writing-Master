// scripts/pdfSamples/entry.ts
//
// Runs the real exporter under Node and writes one PDF per fixture. Bundled and
// executed by ../generatePdfSamples.mjs — not meant to be run directly, because
// it needs two shims the browser provides for free:
//
//   * `fetch` — the font loader asks for `/fonts/Inter-*.ttf`, a same-origin URL
//     with no origin here. Root-relative requests are served from `public/`, so
//     the samples embed the same Inter the app ships and the line breaks match
//     what a teacher actually gets. Without it every sample silently falls back
//     to Helvetica and reviews the wrong document.
//   * a save sink — jsPDF's Node `save()` writes to the process working
//     directory; the runner chdir's into the output directory so it lands there.

import { exportEvaluationPdf } from '../../pdf/exportEvaluation';
import { SAMPLES } from './fixtures';

const main = async (): Promise<void> => {
  for (const sample of SAMPLES) {
    const { pages } = await exportEvaluationPdf({
      data: sample.data,
      filename: sample.name,
      subtitle: sample.subtitle,
      onToast: () => {},
      onProgress: () => {},
    });
    console.log(`  ${sample.name}.pdf — ${pages} page${pages === 1 ? '' : 's'}`);
  }
};

await main();
