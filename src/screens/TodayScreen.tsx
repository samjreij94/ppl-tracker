import { useState } from 'react';
import { cardioSummary } from '../components/CardioCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { cardioLabel, fmtNum, fmtSet, plural, type TodayVM, type Unit } from '../ui/types';

interface Props {
  today: TodayVM | null;
  unit: Unit;
  resuming?: boolean;
  /** Today's bodyweight if logged. */
  bodyweightToday?: number;
  onStart: () => void;
  onLogBodyweight: () => void;
  onStartDeload?: () => void;
  /** Profile name for the greeting (empty → no greeting). */
  name?: string;
}

const greet = (h: number) => (h < 5 ? 'Hi' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');

/** Next day in the rotation + exercise preview + big Start button (bottom third). */
export function TodayScreen({ today, unit, resuming, bodyweightToday, onStart, onLogBodyweight, onStartDeload, name }: Props) {
  const [confirmDeload, setConfirmDeload] = useState(false);
  if (!today) return <div className="screen"><div className="empty">Loading…</div></div>;
  const dl = today.deload;
  const setCount = today.exercises.reduce((n, e) => n + e.targetSets, 0);
  return (
    <div className="screen has-footer" data-testid="today">
      <header className="screen-header">
        {name && <div className="greeting" data-testid="greeting">{greet(new Date().getHours())}, {name}</div>}
        <div className="eyebrow">{today.dayLabel ?? 'Next up'}</div>
        <h1>{today.dayName}</h1>
        <div className="sub num">{plural(today.exercises.length, 'exercise')} · {plural(setCount, 'set')} · cardio warm-up</div>
        {dl?.active && (
          <div className="pill pill-deload num" data-testid="deload-badge">
            Deload week{dl.daysLeft != null ? ` · ${plural(dl.daysLeft, 'day')} left` : ''}
          </div>
        )}
      </header>

      {dl?.due && !dl.active && (
        <section className="card deload-card" aria-label="Deload recommended" data-testid="deload-card">
          <div className="eyebrow">Recovery</div>
          <div className="name">Time for a deload week</div>
          <p className="dim note">{dl.reason ? `${dl.reason.charAt(0).toUpperCase()}${dl.reason.slice(1)}. ` : ''}Half the sets at about 90% of your working weight, stopping 3–4 reps short. You’ll come back stronger.</p>
          <button className="btn" onClick={() => setConfirmDeload(true)} data-testid="start-deload">Start deload week</button>
        </section>
      )}

      <div className="today-stats">
        {today.stepTarget != null && (
          <div className="stat" data-testid="steps">
            <div className="v num">{today.stepTarget.toLocaleString()}</div>
            <div className="k">daily step target</div>
          </div>
        )}
        <button className="stat stat-btn" onClick={onLogBodyweight} data-testid="today-bw">
          <div className="v num">{bodyweightToday != null ? <>{fmtNum(bodyweightToday)}<small> {unit}</small></> : 'Log'}</div>
          <div className="k">{bodyweightToday != null ? 'bodyweight ✓' : 'bodyweight today →'}</div>
        </button>
      </div>

      <div className="stack">
        <div className="card ex-card cardio-preview" data-testid="today-cardio">
          <div className="eyebrow">Cardio warm-up</div>
          <div className="name">Cardio · {cardioLabel(today.cardio.kind, today.cardio.name)} · {today.cardio.minutes} min</div>
          {today.cardio.hint && <div className="dim note" data-testid="today-cardio-rx">{today.cardio.hint}</div>}
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
        {today.finisherOffer && today.finisherByDefault !== false && (
          <div className="card ex-card finisher-preview" data-testid="today-finisher">
            <div className="eyebrow">Optional finisher · {today.finisherOffer.intensity.replace('-', ' ')}</div>
            <div className="name">{cardioLabel(today.finisherOffer.kind, today.finisherOffer.name)} · {today.finisherOffer.minutes} min</div>
            {today.finisherOffer.note && <div className="dim note" data-testid="today-finisher-rx">{today.finisherOffer.note}</div>}
          </div>
        )}
      </div>

      <div className="footer-bar">
        <button className="btn btn-primary btn-lg" onClick={onStart} data-testid="start">{resuming ? 'Resume Workout' : 'Start Workout'}</button>
      </div>

      {confirmDeload && (
        <ConfirmDialog
          title="Start a deload week?"
          body="For the next 7 days every exercise drops to half the sets at about 90% of your working weight. PRs still count; progression picks up where you left off afterwards. You can end it early in Settings."
          confirmLabel="Start deload"
          onCancel={() => setConfirmDeload(false)}
          onConfirm={() => { setConfirmDeload(false); onStartDeload?.(); }}
        />
      )}
    </div>
  );
}
