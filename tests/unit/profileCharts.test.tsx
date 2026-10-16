import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import {
  BandProgressChart,
  ProfileScoreboard,
  RecentAttemptsList,
  TierStrengthChart,
} from '../../components/ProfileCharts';
import type { OwnAttempt, OwnHistory } from '../../utils/profileHistory';
import { getBandRgb, getBandInkRgb } from '../../utils/renderUtils';

/**
 * The profile's visualisations, rendered from realistic fixtures: no history,
 * one attempt, and many. The rules under test are the ones a student would
 * otherwise meet as a broken chart — a NaN in a path, a band drawn in the wrong
 * colour, a figure with no words beside it, or an empty chart that reads as
 * "nothing happened".
 */

afterEach(cleanup);

const day = (n: number, hour = 10) => new Date(Date.UTC(2026, 8, n, hour)).toISOString();

const att = (
  n: number,
  band: number | null,
  verb: string | null = 'EXPLAIN',
  mark: number | null = 3,
  totalMarks: number | null = 6
): OwnAttempt => ({
  at: day(n),
  band,
  mark,
  totalMarks,
  verb,
  wordCount: 100,
});

const ready = (attempts: OwnAttempt[]): OwnHistory => ({ status: 'ready', attempts });

/** No attribute on any SVG node may carry NaN or undefined. */
const expectFiniteSvg = (container: HTMLElement) => {
  for (const el of Array.from(container.querySelectorAll('svg, svg *'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.value, `${el.tagName}[${attr.name}]`).not.toMatch(/NaN|undefined/);
    }
  }
};

describe('ProfileScoreboard', () => {
  it('states each figure beside its caption, as a description list', () => {
    render(
      <ProfileScoreboard
        cells={[
          { label: 'Answers marked', value: '39' },
          { label: 'Avg mark', value: '90%' },
          { label: 'Words', value: '2.0k' },
          { label: 'Day streak', value: '5' },
        ]}
      />
    );
    const dt = screen.getByText('Avg mark');
    expect(dt.tagName).toBe('DT');
    expect(dt.nextElementSibling?.textContent).toBe('90%');
    expect(screen.getByText('Answers marked').nextElementSibling?.textContent).toBe('39');
  });
});

describe('BandProgressChart', () => {
  it('says what is missing when there is no online account', () => {
    const { container } = render(
      <BandProgressChart history={{ status: 'local' }} averageBand={3} questionsAnswered={4} />
    );
    expect(screen.getByText(/not connected to one/i)).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('announces that the history is loading, rather than drawing nothing', () => {
    render(
      <BandProgressChart history={{ status: 'loading' }} averageBand={null} questionsAnswered={0} />
    );
    expect(screen.getByRole('status').textContent).toMatch(/Loading your history/);
  });

  it('says the history could not be loaded and that the totals are unchanged', () => {
    render(
      <BandProgressChart history={{ status: 'error' }} averageBand={null} questionsAnswered={0} />
    );
    expect(screen.getByText(/Could not load your history/)).toBeTruthy();
    expect(screen.getByText(/totals above are unchanged/)).toBeTruthy();
  });

  it('invites a first answer when there is none yet', () => {
    const { container } = render(
      <BandProgressChart history={ready([])} averageBand={null} questionsAnswered={0} />
    );
    expect(screen.getByText(/Mark a response to a question/)).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('explains a gap rather than plotting one, when earlier answers have no history', () => {
    render(<BandProgressChart history={ready([])} averageBand={3} questionsAnswered={12} />);
    expect(
      screen.getByText(/Your 12 earlier answers were marked before attempt history was kept/)
    ).toBeTruthy();
  });

  it('draws a single attempt as a point, and says a second one draws the line', () => {
    const { container } = render(
      <BandProgressChart history={ready([att(1, 3)])} averageBand={null} questionsAnswered={1} />
    );
    const img = screen.getByRole('img', { name: /across 1 marked answer, oldest to latest: 3/ });
    expect(img).toBeTruthy();
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getByText(/A second one draws the line/)).toBeTruthy();
    expectFiniteSvg(container);
  });

  it('says how many of the answers are plotted when the totals run ahead of the history', () => {
    // `user.stats` counts answers from before history was kept, so the average
    // line is all-time while the points are only what history holds.
    render(
      <BandProgressChart
        history={ready([att(1, 3), att(2, 4), att(3, 5)])}
        averageBand={4.1}
        questionsAnswered={9}
      />
    );
    expect(screen.getByText('3 of 9 answers plotted')).toBeTruthy();
    expect(screen.getByText(/All-time average 4.1/)).toBeTruthy();
  });

  it('plots many attempts on the band ladder, with the rungs named and an average label', () => {
    const bands = [2, 3, 3, 4, 5, 6, 4, 5, 5, 6, 6, 4];
    const attempts = bands.map((b, i) => att(i + 1, b));
    const { container } = render(
      <BandProgressChart history={ready(attempts)} averageBand={4.3} questionsAnswered={12} />
    );

    for (let b = 1; b <= 6; b++) expect(screen.getByText(`Band ${b}`)).toBeTruthy();
    expect(screen.getByText(/All-time average 4.3/)).toBeTruthy();

    const img = screen.getByRole('img', { name: /Band progress across 12 marked answers/ });
    expect(img.getAttribute('aria-label')).toContain(bands.join(', '));
    expect(img.getAttribute('aria-label')).toContain('All-time average band 4.3');

    expect(container.querySelectorAll('circle')).toHaveLength(12);
    expect(container.querySelector('polyline')).not.toBeNull();
    expectFiniteSvg(container);

    // The trend line names the change, which the chart alone would leave to the eye.
    expect(screen.getByText('Band 2 → 4')).toBeTruthy();
    expect(screen.getByText('▲ +2')).toBeTruthy();
  });

  it('colours each point by the band it earned, in the band palette', () => {
    const bands = [1, 6];
    const { container } = render(
      <BandProgressChart
        history={ready(bands.map((b, i) => att(i + 1, b)))}
        averageBand={null}
        questionsAnswered={2}
      />
    );
    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles).toHaveLength(2);
    bands.forEach((band, i) => {
      const group = circles[i].parentElement as HTMLElement;
      expect(group.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(band));
      expect(group.style.getPropertyValue('--band-ink')).toBe(getBandInkRgb(band));
      expect(circles[i].getAttribute('class')).toContain('fill-[rgb(var(--band-ink))]');
      expect(circles[i].getAttribute('class')).toContain('dark:fill-[rgb(var(--band-rgb))]');
    });
  });

  it('gives a screen reader the same attempts as a table, one row each', () => {
    render(
      <BandProgressChart
        history={ready([att(1, 2, 'DEFINE', 2, 2), att(2, 4, 'ANALYSE', null, null)])}
        averageBand={3}
        questionsAnswered={2}
      />
    );
    const table = screen.getByRole('table', { name: /Band history, one row per marked answer/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + two attempts
    expect(within(table).getByText('Define')).toBeTruthy();
    expect(within(table).getByText('Not recorded')).toBeTruthy();
  });
});

describe('TierStrengthChart', () => {
  it('lists all six command tiers, with the untried ones named as such', () => {
    render(
      <TierStrengthChart
        history={ready([att(1, 3, 'EXPLAIN', 3, 6), att(2, 3, 'EXPLAIN', 6, 6)])}
      />
    );
    const list = screen.getByRole('list', { name: /Share of marks earned, by command tier/ });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(within(items[2]).getByText('75%')).toBeTruthy();
    expect(within(items[2]).getByText('2 tries')).toBeTruthy();
    expect(within(list).getAllByText('Not attempted')).toHaveLength(5);
  });

  it('draws each filled bar in its tier colour and sizes it to the mark share', () => {
    const { container } = render(
      <TierStrengthChart history={ready([att(1, 3, 'EXPLAIN', 3, 6)])} />
    );
    const bars = Array.from(container.querySelectorAll('ul li div.h-full'));
    expect(bars).toHaveLength(1);
    const bar = bars[0] as HTMLElement;
    expect(bar.style.width).toBe('50%');
    expect(bar.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
  });

  it('says a tier with attempts but no recorded marks has no marks, not zero', () => {
    render(<TierStrengthChart history={ready([att(1, 3, 'EXPLAIN', null, null)])} />);
    expect(screen.getByText('No marks')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('explains what closes the gap when no attempt carries a command verb', () => {
    render(<TierStrengthChart history={ready([att(1, 3, null)])} />);
    expect(
      screen.getByText(/appears once you have marked a response to a question with a command verb/)
    ).toBeTruthy();
  });

  it('shows the no-account state rather than six empty tiers', () => {
    render(<TierStrengthChart history={{ status: 'local' }} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/not connected to one/)).toBeTruthy();
  });
});

describe('RecentAttemptsList', () => {
  it('shows the six latest attempts, newest first, each with its band and marks', () => {
    const bands = [1, 2, 3, 4, 5, 6, 1, 2];
    const attempts = bands.map((b, i) => att(i + 1, b, 'EXPLAIN', 7, 10));
    render(<RecentAttemptsList history={ready(attempts)} />);
    const list = screen.getByRole('list', { name: /Recent attempts, newest first/ });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    // Newest is day 8, band 2; the sixth is day 3, band 3.
    expect(items[0].textContent).toContain('Band 2');
    expect(items[5].textContent).toContain('Band 3');
    expect(items[0].textContent).toContain('7/10');
  });

  it('colours each band chip from the band palette', () => {
    render(<RecentAttemptsList history={ready([att(1, 6)])} />);
    const chip = screen.getByText('Band 6');
    expect(chip.className).toContain('text-purple-300');
  });

  it('lists nothing as a plain sentence, not as an empty list', () => {
    render(<RecentAttemptsList history={ready([])} />);
    expect(screen.getByText(/No marked responses yet/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('names the verb as a state when the question has none', () => {
    render(<RecentAttemptsList history={ready([att(1, 2, null, null, null)])} />);
    expect(screen.getByText('No command verb')).toBeTruthy();
  });
});

describe('an answer total with no history behind it', () => {
  it('names the earlier answers in the band chart, rather than inviting a first one', () => {
    render(<BandProgressChart history={ready([])} averageBand={3} questionsAnswered={25} />);
    expect(
      screen.getByText(/Your 25 earlier answers were marked before attempt history was kept/)
    ).toBeTruthy();
    expect(screen.queryByText(/Mark a response to a question/)).toBeNull();
  });

  it('says the same in the recent list', () => {
    render(<RecentAttemptsList history={ready([])} questionsAnswered={25} />);
    expect(screen.getByText(/Your 25 earlier answers were marked/)).toBeTruthy();
    expect(screen.queryByText(/No marked responses yet/)).toBeNull();
  });

  it('says the same in the tier chart, rather than asking for a verb', () => {
    render(<TierStrengthChart history={ready([])} questionsAnswered={25} />);
    expect(screen.getByText(/Your 25 earlier answers were marked/)).toBeTruthy();
    expect(screen.queryByText(/appears once you have marked/)).toBeNull();
  });

  it('keeps the first-answer copy when there are no answers at all', () => {
    render(<RecentAttemptsList history={ready([])} questionsAnswered={0} />);
    expect(screen.getByText(/No marked responses yet/)).toBeTruthy();
    expect(screen.queryByText(/earlier answer/)).toBeNull();
  });

  it('keeps the verb copy when answers are scored but none carries a verb', () => {
    render(<TierStrengthChart history={ready([att(1, 3, null)])} questionsAnswered={1} />);
    expect(screen.getByText(/appears once you have marked a response/)).toBeTruthy();
    expect(screen.queryByText(/earlier answer/)).toBeNull();
  });
});

describe('the tier names in the strength chart', () => {
  it('names a tier by its full group title, so DESCRIBE is not filed under DEFINE', () => {
    render(<TierStrengthChart history={ready([att(1, 2, 'DESCRIBE', 4, 6)])} />);
    expect(screen.getByText('Define & Describe')).toBeTruthy();
    expect(screen.queryByText('Define')).toBeNull();
  });

  it('gives the verbs a tier holds as a tooltip on its name', () => {
    render(<TierStrengthChart history={ready([att(1, 2, 'DESCRIBE', 4, 6)])} />);
    const name = screen.getByTitle(/^Define & Describe: .*Describe/);
    expect(name.textContent).toContain('Define & Describe');
  });

  it('lets a long group title wrap rather than cut it off', () => {
    render(<TierStrengthChart history={ready([att(1, 6, 'EVALUATE', 3, 6)])} />);
    const name = screen.getByText('Evaluate, Synthesise & Create');
    expect(name.className).not.toContain('truncate');
  });
});
