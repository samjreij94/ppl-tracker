import { useMemo } from 'react';
import { LineChart } from '../components/LineChart';
import { BodyweightCard } from '../components/BodyweightCard';
import { IconTrophy } from '../components/Icons';
import { cardioLabel, fmtNum, fmtVolume, type BodyweightVM, type HistoryItem, type Metric, type SeriesPoint, type Unit } from '../ui/types';

interface Props {
  unit: Unit;
  history: HistoryItem[];
  exercises: { id: string; name: string }[];
  selectedId: string | null;
  series: SeriesPoint[];
  metric: Metric;
  onSelect: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onMetric: (m: Metric) => void;
  cardioMinutes?: { date: number; minutes: number }[];
  bodyweight: BodyweightVM;
  onLogBodyweight: (weight: number) => void;
}

const METRICS: { id: Metric; label: string }[] = [
  { id: 'e1rm', label: 'e1RM' },
  { id: 'top', label: 'Top set' },
  { id: 'volume', label: 'Volume' },
];
export const CARDIO_CHART_ID = '__cardio__';

export function ProgressScreen({ unit, history, exercises, selectedId, series, metric, onSelect, onMetric, cardioMinutes, bodyweight, onLogBodyweight, onDeleteSession }: Props) {
  const isCardio = selectedId === CARDIO_CHART_ID;
  const points = useMemo(() => (isCardio
    ? (cardioMinutes ?? []).map((c) => ({ x: c.date, y: c.minutes }))
    : series.map((s) => ({ x: s.date, y: metric === 'e1rm' ? s.e1rm : metric === 'top' ? s.top : s.volume }))), [isCardio, cardioMinutes, series, metric]);
  const best = points.length ? Math.max(...points.map((p) => p.y)) : 0;
  const last = points.length ? points[points.length - 1].y : 0;
  const first = points.length ? points[0].y : 0;
  const fmt = (v: number) => (metric === 'volume' && !isCardio ? fmtVolume(v) : fmtNum(Math.round(v * 10) / 10));
  const yUnit = isCardio ? 'min' : metric === 'volume' ? `${unit}·reps` : unit;

  return (
    <div className="screen" data-testid="progress">
      <header className="screen-header">
        <div className="eyebrow">Progress</div>
        <h1>Your trends</h1>
      </header>

      <BodyweightCard bw={bodyweight} onLog={onLogBodyweight} />

      <h2 className="section">Lifts</h2>
      <div className="card chart-wrap" data-testid="lift-chart">
        <label className="sr-only" htmlFor="ex-pick">Exercise</label>
        <select id="ex-pick" className="select-native" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
          {exercises.length === 0 && <option value="">No exercises logged yet</option>}
          {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          {cardioMinutes && <option value={CARDIO_CHART_ID}>Cardio minutes (warm-up + finisher)</option>}
        </select>
        {!isCardio && (
          <div className="seg" role="group" aria-label="Metric" style={{ marginTop: 10 }}>
            {METRICS.map((m) => <button key={m.id} aria-pressed={metric === m.id} onClick={() => onMetric(m.id)}>{m.label}</button>)}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <LineChart points={points} label={`${isCardio ? 'Cardio minutes' : METRICS.find((m) => m.id === metric)?.label} over time`} />
        </div>
        {points.length > 0 && (
          <div className="stat-row">
            <div className="stat"><div className="v num">{fmt(last)}</div><div className="k">latest {yUnit}</div></div>
            <div className="stat"><div className="v num">{fmt(best)}</div><div className="k">best</div></div>
            <div className="stat"><div className="v num" style={{ color: last - first >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{last - first >= 0 ? '+' : ''}{fmt(last - first)}</div><div className="k">since first</div></div>
          </div>
        )}
      </div>

      <h2 className="section">History</h2>
      {history.length === 0 ? <div className="card empty">No workouts yet. Finish one and it shows up here.</div> : (
        <div className="card" style={{ padding: '4px 16px' }} data-testid="history">
          {history.map((h, i) => (
            <div key={h.id} className="hist-item" style={i ? { borderTop: '1px solid var(--border)' } : undefined}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d">{h.dayName} <span className="dim" style={{ fontWeight: 500 }}>· {new Date(h.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
                <div className="dim num" style={{ fontSize: 14 }}>
                  {h.sets} sets · {fmtVolume(h.volume)} {unit}
                  {h.cardio ? ` · ${cardioLabel(h.cardio.kind, h.cardio.name)} ${h.cardio.minutes}m` : ''}
                  {h.finisher?.done ? ` + ${h.finisher.minutes}m finisher` : ''}
                </div>
              </div>
              {h.prs > 0 && <span className="pill pill-pr"><IconTrophy width={14} height={14} />{h.prs}</span>}
              {onDeleteSession && (
                <button type="button" className="hist-del" data-testid="delete-session" aria-label={`Delete ${h.dayName} workout`} onClick={() => onDeleteSession(h.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
