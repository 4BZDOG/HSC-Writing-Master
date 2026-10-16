// scripts/pdfSamples/demoEntry.ts
//
// Renders the demo progress-report sample set with the real exporter, under Node.
// Bundled and executed by ../generateDemoReports.mjs, not meant to be run directly.
// It needs the same two shims as ./entry.ts: `fetch` for the /fonts requests (the
// runner serves them from public/), and a save sink (the runner chdir's into the
// output directory first). The course files are read from HSC_DEMO_ROOT, which the
// runner sets to the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { exportProgressReportPdf } from '../../pdf/exportProgressReport';
import {
  buildDemoReportSamples,
  DEMO_COURSE_FILES,
  sampleSummary,
  type DemoCourseTree,
} from './demoReports';

const root = process.env.HSC_DEMO_ROOT;
if (!root)
  throw new Error('demoEntry: HSC_DEMO_ROOT is not set. Run it via generateDemoReports.mjs.');

const readCourse = (file: string): DemoCourseTree => {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(root, 'public', 'courseData', file), 'utf8')
  );
  return (Array.isArray(parsed) ? parsed[0] : parsed) as DemoCourseTree;
};

const trees = {
  enterprise: readCourse(DEMO_COURSE_FILES.enterprise),
  software: readCourse(DEMO_COURSE_FILES.software),
};

const samples = buildDemoReportSamples({ trees, now: new Date() });
for (const sample of samples) {
  const { pages } = await exportProgressReportPdf({
    report: sample.report,
    filename: sample.name,
    pageSize: sample.pageSize,
    onToast: () => {},
    onProgress: () => {},
  });
  console.log(
    `  ${sample.name}.pdf — ${pages} page${pages === 1 ? '' : 's'} · ${sampleSummary(sample.report)}`
  );
}
