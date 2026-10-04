import { IconTrophy } from '../components/Icons';
import { cardioLabel, fmtVolume, plural, pluralWord, type SummaryVM, type Unit } from '../ui/types';

export function SummaryScreen({ summary, unit, onDone }: { summary: SummaryVM; unit: Unit; onDone: () => void }) {
  return (
    <div className="screen has-footer" data-testid="summary">
      <header className="screen-header">
        <div className="eyebrow">Workout complete</div>
        <h1>{summary.dayName} ✓</h1>
      </header>
      <div className="summary-big">
        <div className="stat"><div className="v num">{summary.durationMin}</div><div className="k">{pluralWord(summary.durationMin, 'minute')}</div></div>
        <div className="stat"><div className="v num">{summary.setsDone}</div><div className="k">{pluralWord(summary.setsDone, 'set')}</div></div>
        <div className="stat"><div className="v num">{fmtVolume(summary.volume)}</div><div className="k">{unit} volume</div></div>
      </div>
      {summary.cardio && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Cardio</div>
          <div className="sum-cardio" data-testid="summary-warmup">Warm-up: {cardioLabel(summary.cardio.kind, summary.cardio.name)} · <span className="nowrap">{summary.cardio.minutes} min {summary.cardio.done ? '✓' : '(skipped)'}</span></div>
          {summary.finisher && <div className="sum-cardio" style={{ marginTop: 4 }} data-testid="summary-finisher">Finisher: {cardioLabel(summary.finisher.kind, summary.finisher.name)} · <span className="nowrap">{summary.finisher.minutes} min {summary.finisher.done ? '✓' : '(not done)'}</span></div>}
        </div>
      )}
      <h2 className="section">Personal records{summary.prs.length > 0 && <span className="dim" data-testid="summary-pr-count" style={{ fontWeight: 500 }}> · {plural(summary.prs.length, 'exercise')}</span>}</h2>
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
