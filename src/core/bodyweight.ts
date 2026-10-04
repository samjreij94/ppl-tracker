/** Bodyweight log helpers (pure). */
import { convertWeight } from './math';
import type { BodyweightEntry, BodyweightTrend, BodyweightTrendPoint, Goal, Unit } from './types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Local date `YYYY-MM-DD` for a Date (default now). */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const dayNum = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

/**
 * 7-day (trendWindowDays) moving-average trend in `unit`.
 * currentAvg = mean of readings in the window ending at the latest entry;
 * previousAvg = window ending `windowDays` earlier. Each window needs ≥ 2
 * readings, else status 'insufficientData'.
 * lossPctPerWeek = (previousAvg − currentAvg) / previousAvg × 100 (positive = losing),
 * compared with goal.targetLossPctBodyweightPerWeek {min, max}.
 */
export function bodyweightTrend(
  entries: readonly BodyweightEntry[],
  unit: Unit,
  goal: Goal,
  windowDays = 7,
): BodyweightTrend {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const conv = sorted.map((e) => ({ date: e.date, n: dayNum(e.date), w: convertWeight(e.weight, e.unit, unit) }));
  const windowAvg = (end: number) => {
    const inW = conv.filter((c) => c.n <= end && c.n > end - windowDays);
    return { count: inW.length, avg: inW.length ? inW.reduce((a, c) => a + c.w, 0) / inW.length : null };
  };
  const points: BodyweightTrendPoint[] = conv.map((c) => ({ date: c.date, weight: r2(c.w), avg: r2(windowAvg(c.n).avg!) }));
  const target = goal.targetLossPctBodyweightPerWeek;
  const base = { unit, points, target };
  if (!conv.length) return { ...base, currentAvg: null, previousAvg: null, weeklyRate: null, status: 'insufficientData', entriesThisWindow: 0 };
  const lastN = conv[conv.length - 1].n;
  const cur = windowAvg(lastN);
  const prev = windowAvg(lastN - windowDays);
  const currentAvg = cur.avg === null ? null : r2(cur.avg);
  const previousAvg = prev.avg === null ? null : r2(prev.avg);
  if (cur.count < 2 || prev.count < 2 || cur.avg === null || prev.avg === null) {
    return { ...base, currentAvg, previousAvg, weeklyRate: null, status: 'insufficientData', entriesThisWindow: cur.count };
  }
  const perWeek = ((prev.avg - cur.avg) * 7) / windowDays;
  const pct = (perWeek / prev.avg) * 100;
  const status = pct < target.min ? 'tooSlow' : pct > target.max ? 'tooFast' : 'onTrack';
  return {
    ...base,
    currentAvg,
    previousAvg,
    weeklyRate: { lossPerWeek: r2(perWeek), lossPctPerWeek: r2(pct) },
    status,
    entriesThisWindow: cur.count,
  };
}
