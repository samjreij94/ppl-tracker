import { cardioSummary } from '../components/CardioCard';
import { cardioLabel, fmtSet, type TodayVM, type Unit } from '../ui/types';

interface Props {
  today: TodayVM | null;
  unit: Unit;
  resuming?: boolean;
  onStart: () => void;
}

/** Next day in the rotation + exercise preview + big Start button (bottom third). */
export function TodayScreen({ today, unit, resuming, onStart }: Props) {
  if (!today) return <div className="screen"><div className="empty">Loading…</div></div>;
  const setCount = today.exercises.reduce((n, e) => n + e.targetSets, 0);
  return (
    <div className="screen has-footer" data-testid="today">
      <header className="screen-header">
        <div className="eyebrow">{today.dayLabel ?? 'Next up'}</div>
        <h1>{today.dayName}</h1>
        <div className="sub num">{today.exercises.length} exercises · {setCount} sets · cardio warm-up</div>
      </header>

      <div className="stack">
        <div className="card ex-card cardio-preview" data-testid="today-cardio">
          <div className="eyebrow">Cardio warm-up</div>
          <div className="name">Cardio · {cardioLabel(today.cardio.kind, today.cardio.name)} · {today.cardio.minutes} min</div>
          {(today.cardio.incline || today.cardio.speed || today.cardio.output || today.cardio.calories) ? (
            <div className="meta num"><span className="last">Last: {cardioSummary(today.cardio, unit)}</span></div>
          ) : null}
        </div>
        {today.exercises.map((ex, i) => (
          <div key={ex.slotId} className="card ex-card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="ex-num num">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{ex.name}</div>
                <div className="meta num">
                  <span className="target">{ex.targetSets} × {ex.targetReps}</span>
                  {ex.lastSets.length > 0
                    ? <span className="last">Last: {ex.lastSets.slice(0, 3).map(fmtSet).join(', ')}{ex.lastSets.length > 3 ? '…' : ''}</span>
                    : <span className="last">First time — pick a starting weight</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="footer-bar">
        <button className="btn btn-primary btn-lg" onClick={onStart} data-testid="start">{resuming ? 'Resume Workout' : 'Start Workout'}</button>
      </div>
    </div>
  );
}
