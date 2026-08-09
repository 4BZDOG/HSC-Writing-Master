// pdf/index.ts — public surface for the client-side vector-PDF exporter.

export { exportEvaluationPdf, sanitizeFilename } from './exportEvaluation';
export type { ExportEvaluationOptions } from './exportEvaluation';
export { buildEvaluationBlocks, bandColor, COLORS } from './buildBlocks';
export type { EvaluationExportData } from './buildBlocks';
export { toText, degradeToAscii, containsEmoji, stripBasicHtml, normalizeContent } from './text';
export { parseInlineSpans, spansToText } from './inline';
export type { InlineOptions } from './inline';
export { wrapRich } from './wrapRich';
export type { InlineSpan } from './types';
export {
  computeGeometry,
  flowBlocks,
  measureBlocks,
  chooseScale,
  getPageDimensions,
} from './layout';
export type { PageSizeName } from './types';
