import { describe, it, expect } from 'vitest';
import {
  fitToWidth,
  displayWidth,
  measureBarList,
  measureLineChart,
  measureReportBlock,
  measureStatStrip,
} from '../../pdf/reportGeometry';
import { BAR_LIST, LINE_CHART, STAT_STRIP } from '../../pdf/types';
import type { ContentBlock } from '../../pdf/types';
import { reportMeasurer as measurer } from './pdfReportHelpers';
import type { LineChartData, StatStripData, BarListData } from '../../pdf/reportBlocks';
import type { ReportTrendPoint } from '../../pdf/reportModel';

const finite = (n: number) => expect(Number.isFinite(n)).toBe(true);

const point = (at: string, band: number | null): ReportTrendPoint => ({ at, band, attempts: 1 });
const day = (d: number) => new Date(2026, 6, 14 + d, 12).toISOString();

describe('fitToWidth', () => {
  it('returns the text untouched when it already fits', () => {
    expect(fitToWidth('Remember', 100, (t) => t.length)).toBe('Remember');
  });

  it('cuts to the longest prefix that fits, with an ellipsis', () => {
    const out = fitToWidth('Of the marks on offer', 10, (t) => t.length);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.startsWith('Of the')).toBe(true);
  });

  it('returns nothing rather than overflow when even the ellipsis will not fit', () => {
    expect(fitToWidth('Anything', 0.5, (t) => t.length)).toBe('');
  });

  it('is empty for empty input', () => {
    expect(fitToWidth('', 10, (t) => t.length)).toBe('');
  });
});

describe('displayWidth', () => {
  it('adds the display tracking to the uppercase measure', () => {
    const plain = measurer.measure('LABEL', 7, 'bold');
    expect(displayWidth('label', 7, measurer)).toBeGreaterThan(plain);
  });
});

describe('measureStatStrip', () => {
  const cells = (n: number): StatStripData => ({
    type: 'statStrip',
    cells: Array.from({ length: n }, (_, i) => ({
      label: `Label ${i + 1}`,
      value: `${i + 1}0%`,
      hint: 'a short hint',
    })),
  });

  it('lays cells of equal width across the full width', () => {
    const { layout } = measureStatStrip(cells(5), measurer, 190, 1);
    expect(layout.cells).toHaveLength(5);
    layout.cells.forEach((c, i) => {
      expect(c.x).toBeCloseTo((190 / 5) * i, 6);
    });
  });

  it('uses one value size for every cell, the largest that every value fits', () => {
    const data: StatStripData = {
      type: 'statStrip',
      cells: [
        { label: 'Short', value: '25' },
        { label: 'Long', value: 'Band 4 Excellent' },
      ],
    };
    // 120mm across two cells: "Band 4 Excellent" cannot take the full 21pt.
    const { layout } = measureStatStrip(data, measurer, 120, 1);
    expect(layout.valuePt).toBeLessThan(STAT_STRIP.valuePt);
    expect(layout.valuePt).toBeGreaterThanOrEqual(STAT_STRIP.valueMinPt);
    // Every value fits its cell at that size.
    const textW = 120 / 2 - 2 * STAT_STRIP.padXBaseMm;
    layout.cells.forEach((c) =>
      expect(measurer.measure(c.value, layout.valuePt, 'bold')).toBeLessThanOrEqual(textW + 1e-6)
    );
  });

  it('truncates an over-long label with an ellipsis, inside its cell', () => {
    const data: StatStripData = {
      type: 'statStrip',
      cells: [{ label: 'Of the marks on offer across every single answer', value: '58%' }],
    };
    const { layout } = measureStatStrip(data, measurer, 60, 1);
    expect(layout.cells[0].label.endsWith('…')).toBe(true);
    expect(displayWidth(layout.cells[0].label, layout.labelPt, measurer)).toBeLessThanOrEqual(
      60 - 2 * STAT_STRIP.padXBaseMm + 1e-6
    );
  });

  it('keeps a hint to at most the allowed lines, and never drops its text silently', () => {
    const data: StatStripData = {
      type: 'statStrip',
      cells: [{ label: 'L', value: '1', hint: 'word '.repeat(60).trim() }],
    };
    const { layout } = measureStatStrip(data, measurer, 80, 1);
    expect(layout.cells[0].hintLines.length).toBeLessThanOrEqual(STAT_STRIP.hintMaxLines);
    expect(layout.cells[0].hintLines[layout.cells[0].hintLines.length - 1].endsWith('…')).toBe(
      true
    );
  });

  it('gives a cell with no hint no hint lines', () => {
    const data: StatStripData = { type: 'statStrip', cells: [{ label: 'L', value: '1' }] };
    const { layout } = measureStatStrip(data, measurer, 190, 1);
    expect(layout.cells[0].hintLines).toEqual([]);
  });

  it('is taller at a smaller scale only in proportion to its geometry', () => {
    const big = measureStatStrip(cells(4), measurer, 190, 1).height;
    const small = measureStatStrip(cells(4), measurer, 190, 0.5).height;
    expect(small).toBeLessThan(big);
    expect(small / big).toBeGreaterThan(0.45);
    expect(small / big).toBeLessThan(0.6);
  });

  it('gives finite coordinates for every number it returns', () => {
    const { height, layout } = measureStatStrip(cells(5), measurer, 190, 0.8);
    finite(height);
    layout.cells.forEach((c) => {
      [c.x, c.textX, c.labelBaseline, c.valueBaseline, c.hintBaseline].forEach(finite);
    });
  });
});

describe('measureLineChart', () => {
  const chart = (points: ReportTrendPoint[], over: Partial<LineChartData> = {}): LineChartData => ({
    type: 'lineChart',
    points,
    averageBand: null,
    caption: 'Each point is one marked answer',
    ...over,
  });

  it('draws six gridlines, one per band, with higher bands nearer the top', () => {
    const { layout } = measureLineChart(chart([point(day(0), 3)]), measurer, 190, 1);
    expect(layout.gridlines.map((g) => g.band)).toEqual([1, 2, 3, 4, 5, 6]);
    const ys = layout.gridlines.map((g) => g.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
  });

  it('names each band with getBandName, to the left of the plot', () => {
    const { layout } = measureLineChart(chart([point(day(0), 3)]), measurer, 190, 1);
    expect(layout.gridlines.find((g) => g.band === 4)?.label).toContain('Sound');
    layout.gridlines.forEach((g) => expect(g.labelX).toBeLessThan(layout.plot.left));
  });

  it('places a point on its band gridline, and colours it by that band', () => {
    const { layout } = measureLineChart(chart([point(day(0), 4)]), measurer, 190, 1);
    const band4 = layout.gridlines.find((g) => g.band === 4)!;
    expect(layout.points[0].y).toBeCloseTo(band4.y, 6);
    expect(layout.points[0].band).toBe(4);
  });

  it('orders points by time and spans the plot from first to last', () => {
    const { layout } = measureLineChart(
      chart([point(day(9), 5), point(day(0), 3), point(day(4), 4)]),
      measurer,
      190,
      1
    );
    const xs = layout.points.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBeCloseTo(layout.plot.left + LINE_CHART.edgeInsetBaseMm, 6);
  });

  it('draws a single point as a point at the centre, with its date, never hidden', () => {
    const { layout } = measureLineChart(chart([point(day(0), 3)]), measurer, 190, 1);
    expect(layout.points).toHaveLength(1);
    expect(layout.xLabels).toHaveLength(1);
    expect(layout.xLabels[0].align).toBe('center');
    expect(layout.xLabels[0].text).toBe('14 Jul 2026');
    expect(layout.polylines).toHaveLength(1);
    expect(layout.polylines[0]).toHaveLength(1);
  });

  it('handles zero points: no point drawn, a message in the plot, and no NaN', () => {
    const { layout, height } = measureLineChart(chart([]), measurer, 190, 1);
    expect(layout.points).toEqual([]);
    expect(layout.emptyLabel?.text).toMatch(/No marked answers/);
    finite(height);
    layout.gridlines.forEach((g) => finite(g.y));
  });

  it('breaks the line at a null band, so an unscored week is not drawn as a fall', () => {
    const { layout } = measureLineChart(
      chart([point(day(0), 3), point(day(7), null), point(day(14), 5)]),
      measurer,
      190,
      1
    );
    expect(layout.polylines).toHaveLength(2);
    expect(layout.points).toHaveLength(2);
  });

  it('drops a point whose date will not parse, rather than placing it at the origin', () => {
    const { layout } = measureLineChart(
      chart([point('not a date', 3), point(day(0), 4), point(day(5), 5)]),
      measurer,
      190,
      1
    );
    expect(layout.points).toHaveLength(2);
    layout.points.forEach((p) => {
      finite(p.x);
      finite(p.y);
      expect(p.x).toBeGreaterThan(layout.plot.left);
    });
  });

  it('spreads points that share one instant in order, rather than stacking them', () => {
    const { layout } = measureLineChart(
      chart([point(day(2), 3), point(day(2), 4), point(day(2), 5)]),
      measurer,
      190,
      1
    );
    const xs = layout.points.map((p) => p.x);
    expect(new Set(xs.map((x) => x.toFixed(6))).size).toBe(3);
  });

  it('clamps a band outside 1–6 into the plot, and rounds the colour band', () => {
    const { layout } = measureLineChart(
      chart([point(day(0), 0), point(day(3), 9), point(day(6), 4.4)]),
      measurer,
      190,
      1
    );
    const bands = layout.points.map((p) => p.band);
    expect(bands).toEqual([1, 6, 4]);
    layout.points.forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(layout.plot.top - 1e-6);
      expect(p.y).toBeLessThanOrEqual(layout.plot.top + LINE_CHART.plotHeightBaseMm + 1e-6);
    });
  });

  it('places the dashed average in the margin, labelled on two lines, and never NaN', () => {
    const { layout } = measureLineChart(
      chart([point(day(0), 3), point(day(6), 5)], { averageBand: 4.3 }),
      measurer,
      190,
      1
    );
    expect(layout.average).not.toBeNull();
    expect(layout.average!.lines.map((l) => l.text)).toEqual(['All-time', 'average 4.3']);
    expect(layout.average!.labelX).toBeGreaterThan(layout.plot.right);
    finite(layout.average!.y);
  });

  it('ignores a non-finite average rather than drawing it', () => {
    const { layout } = measureLineChart(
      chart([point(day(0), 3)], { averageBand: Number.NaN }),
      measurer,
      190,
      1
    );
    expect(layout.average).toBeNull();
  });

  it('labels the first and last date at the ends of the plot', () => {
    const { layout } = measureLineChart(
      chart([point(day(0), 3), point(day(40), 4)]),
      measurer,
      190,
      1
    );
    expect(layout.xLabels.map((l) => [l.text, l.align])).toEqual([
      ['14 Jul', 'left'],
      ['23 Aug 2026', 'right'],
    ]);
  });

  it('wraps a long caption to the chart width and reports every line', () => {
    const { layout, height } = measureLineChart(
      chart([point(day(0), 3)], { caption: 'word '.repeat(80).trim() }),
      measurer,
      120,
      1
    );
    expect(layout.captionLines.length).toBeGreaterThan(1);
    finite(height);
  });

  it('keeps every coordinate inside the block and finite at any scale', () => {
    [0.75, 1].forEach((s) => {
      const { layout, height } = measureLineChart(
        chart([point(day(0), 2), point(day(20), 4.6), point(day(60), 6)], { averageBand: 4.1 }),
        measurer,
        190,
        s
      );
      finite(height);
      layout.points.forEach((p) => {
        finite(p.x);
        finite(p.y);
        expect(p.y).toBeLessThanOrEqual(height);
        expect(p.x).toBeLessThanOrEqual(190);
      });
    });
  });
});

describe('measureBarList', () => {
  const bars = (rows: BarListData['rows']): BarListData => ({ type: 'barList', rows });

  it('draws one row per item at the row height', () => {
    const { height, layout } = measureBarList(
      bars([
        { label: 'a', share: 0.5, attempts: 2 },
        { label: 'b', share: 0.8, attempts: 5 },
      ]),
      measurer,
      190,
      1
    );
    expect(layout.rows).toHaveLength(2);
    expect(height).toBeCloseTo(2 * BAR_LIST.rowHeightBaseMm, 6);
  });

  it('fills the track to the share, and states the share and the attempts', () => {
    const { layout } = measureBarList(
      bars([{ label: 'Remember', share: 0.8, attempts: 5 }]),
      measurer,
      190,
      1
    );
    const row = layout.rows[0];
    expect(row.value).toBe('80% · 5 attempts');
    expect(row.fillWidth).toBeCloseTo(0.8 * layout.trackWidth, 6);
    expect(row.notAttempted).toBe(false);
  });

  it('uses the singular for one attempt', () => {
    const { layout } = measureBarList(
      bars([{ label: 'x', share: 0.5, attempts: 1 }]),
      measurer,
      190,
      1
    );
    expect(layout.rows[0].value).toBe('50% · 1 attempt');
  });

  it('reads an item with no attempts as Not attempted, with an empty track', () => {
    const { layout } = measureBarList(
      bars([
        { label: 'Evaluate', share: null, attempts: 0 },
        { label: 'Discuss', share: 0.6, attempts: 0 },
      ]),
      measurer,
      190,
      1
    );
    layout.rows.forEach((r) => {
      expect(r.notAttempted).toBe(true);
      expect(r.value).toBe('Not attempted');
      expect(r.fillWidth).toBe(0);
    });
  });

  it('clamps a share outside 0–1 to the track', () => {
    const { layout } = measureBarList(
      bars([
        { label: 'over', share: 1.7, attempts: 3 },
        { label: 'under', share: -0.2, attempts: 3 },
      ]),
      measurer,
      190,
      1
    );
    expect(layout.rows[0].fillWidth).toBeCloseTo(layout.trackWidth, 6);
    expect(layout.rows[1].fillWidth).toBe(0);
  });

  it('keeps the track and the value clear of one another', () => {
    const { layout } = measureBarList(
      bars([{ label: 'x', share: 0.5, attempts: 2 }]),
      measurer,
      190,
      1
    );
    expect(layout.trackX + layout.trackWidth).toBeLessThan(190 - BAR_LIST.valueWidthBaseMm + 1e-6);
  });

  it('truncates an over-long label inside its column', () => {
    const { layout } = measureBarList(
      bars([{ label: 'A very long tier label that will not fit', share: 0.5, attempts: 2 }]),
      measurer,
      190,
      1
    );
    expect(layout.rows[0].label.endsWith('…')).toBe(true);
  });
});

describe('measureReportBlock', () => {
  const base = (kind: ContentBlock['kind'], report: ContentBlock['report']): ContentBlock => ({
    kind,
    id: 'b',
    runs: [],
    report,
  });

  it('measures nothing for a block with no payload', () => {
    expect(measureReportBlock(base('lineChart', undefined), measurer, 190, 1).height).toBe(0);
  });

  it('skips a block whose payload does not match its kind', () => {
    const mismatched = base('barList', {
      type: 'statStrip',
      cells: [{ label: 'x', value: '1' }],
    });
    expect(measureReportBlock(mismatched, measurer, 190, 1).height).toBe(0);
  });

  it('measures nothing for an empty bar list or strip', () => {
    expect(
      measureReportBlock(base('barList', { type: 'barList', rows: [] }), measurer, 190, 1).height
    ).toBe(0);
    expect(
      measureReportBlock(base('statStrip', { type: 'statStrip', cells: [] }), measurer, 190, 1)
        .height
    ).toBe(0);
  });
});
