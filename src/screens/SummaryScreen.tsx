import { IconTrophy } from '../components/Icons';
import { CARDIO_LABEL, fmtVolume, type SummaryVM, type Unit } from '../ui/types';

export function SummaryScreen({ summary, unit, onDone }: { summary: SummaryVM; unit: Unit; onDone: () => void }) {
  return (
    <div className="screen has-footer" data-testid="summary">
      <header className="screen-header">
        <div className="eyebrow">Workout complete</div>
        <h1>{summary.dayName} ✓</h1>
      </header>
      <div className="summary-big">
        <div className="stat"><div className="v num">{summary.durationMin}</div><div className="k">minutes</div></div>
        <div className="stat"><div className="v num">{summary.setsDone}</div><div className="k">sets</div></div>
        <div className="stat"><div className="v num">{fmtVolume(summary.volume)}</div><div className="k">{unit} volume</div></div>
      </div>
      {summary.cardio && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Cardio</div>
          <div style={{ fontWeight: 700 }}>{CARDIO_LABEL[summary.cardio.kind]} · {summary.cardio.minutes} min {summary.cardio.done ? '✓' : '(skipped)'}</div>
        </div>
      )}
      <h2 className="section">Personal records</h2>
      {summary.prs.length === 0 ? <div className="card dim">No new PRs this time. Consistency wins.</div> : (
        <div className="stack">
          {summary.prs.map((pr, i) => (
            <div key={i} className="card row pr-card"><IconTrophy width={24} height={24} style={{ color: 'var(--pr)' }} /><div><div style={{ fontWeight: 700 }}>{pr.name}</div><div className="dim num">{pr.text}</div></div></div>
          ))}
        </div>
      )}
      <div className="footer-bar">
        <button className="btn btn-primary btn-lg" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
