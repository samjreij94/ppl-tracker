import { useEffect, useState } from 'react';
import { Stepper } from './Stepper';
import { LineChart } from './LineChart';
import { fmtNum, type BodyweightVM } from '../ui/types';

const STATUS: Record<string, { label: string; cls: string }> = {
  onTrack: { label: 'On track', cls: 'chip-ok' },
  tooSlow: { label: 'Too slow', cls: 'chip-warn' },
  tooFast: { label: 'Too fast', cls: 'chip-bad' },
};

/** Bodyweight: one-per-day quick log + 7-day average trend + weekly-rate status vs goal. */
export function BodyweightCard({ bw, onLog }: { bw: BodyweightVM; onLog: (weight: number) => void }) {
  const fallback = bw.unit === 'kg' ? 80 : 180;
  const [val, setVal] = useState<number>(bw.today ?? bw.latest ?? fallback);
  useEffect(() => { setVal(bw.today ?? bw.latest ?? fallback); }, [bw.today, bw.latest, fallback]);
  const [saved, setSaved] = useState(false);
  const status = bw.showRate && bw.status !== 'insufficientData' ? STATUS[bw.status] : null;
  const step = bw.unit === 'kg' ? 0.1 : 0.2;

  return (
    <section className="card bw-card" aria-label="Bodyweight" data-testid="bodyweight">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{bw.goalLabel}</div>
          <div className="name">Bodyweight</div>
        </div>
        {status && <span className={`chip ${status.cls}`} data-testid="bw-status">{status.label}</span>}
      </div>

      <div className="bw-log">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="lbl">Today ({bw.unit}){bw.today != null && <em> · logged {fmtNum(bw.today)}</em>}</span>
          <Stepper label="Bodyweight" suffix={bw.unit} value={val} step={step} min={20} max={1000} onChange={(v) => { setVal(v); setSaved(false); }} />
        </div>
        <button className="btn btn-primary bw-save" data-testid="bw-save" onClick={() => { onLog(val); setSaved(true); }}>
          {saved ? 'Saved ✓' : bw.today != null ? 'Update' : 'Log'}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <LineChart
          label="Bodyweight with 7-day average"
          points={bw.points.map((p) => ({ x: p.date, y: p.weight }))}
          trend={bw.points.map((p) => ({ x: p.date, y: p.avg }))}
          empty="Log your weight a few mornings a week to see the 7-day trend."
        />
      </div>
      {bw.points.length > 0 && (
        <div className="stat-row">
          <div className="stat"><div className="v num">{bw.currentAvg != null ? fmtNum(Math.round(bw.currentAvg * 10) / 10) : '–'}</div><div className="k">7-day avg {bw.unit}</div></div>
          <div className="stat"><div className="v num">{bw.weeklyLoss != null ? `${bw.weeklyLoss >= 0 ? '−' : '+'}${fmtNum(Math.abs(Math.round(bw.weeklyLoss * 10) / 10))}` : '–'}</div><div className="k">{bw.unit} / week</div></div>
          {bw.showRate
            ? <div className="stat"><div className="v num">{bw.weeklyLossPct != null ? `${bw.weeklyLossPct.toFixed(2)}%` : '–'}</div><div className="k">target {bw.target.min}–{bw.target.max}%</div></div>
            : <div className="stat"><div className="v num">{bw.points.length}</div><div className="k">weigh-ins</div></div>}
        </div>
      )}
    </section>
  );
}
