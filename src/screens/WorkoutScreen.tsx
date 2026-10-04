import { CardioCard, type CardioTimer } from '../components/CardioCard';
import { ExerciseLog } from '../components/ExerciseLog';
import { FinisherOffer } from '../components/FinisherOffer';
import type { CardioVM, ExerciseVM, FinisherOfferVM, SetVM, Unit } from '../ui/types';

export type CardioRole = 'warmup' | 'finisher';

interface Props {
  dayName: string;
  unit: Unit;
  startedAt: number;
  deload?: boolean;
  cardio: CardioVM | null;
  finisher: CardioVM | null;
  finisherOffer: FinisherOfferVM | null;
  timers: Record<CardioRole, CardioTimer>;
  exercises: ExerciseVM[];
  prFlash: { exIdx: number; setIdx: number } | null;
  onCardioTimer: (role: CardioRole, t: CardioTimer) => void;
  onCardioChange: (role: CardioRole, patch: Partial<CardioVM>) => void;
  onCardioDone: (role: CardioRole) => void;
  onAddFinisher: () => void;
  onRemoveFinisher: () => void;
  onSetChange: (exIdx: number, setIdx: number, patch: Partial<SetVM>) => void;
  onToggleDone: (exIdx: number, setIdx: number) => void;
  onAddSet: (exIdx: number) => void;
  onSwap: (exIdx: number) => void;
  onFinish: () => void;
}

export function WorkoutScreen(p: Props) {
  const total = p.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = p.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return (
    <div className="screen has-footer" data-testid="workout">
      <header className="screen-header">
        <div className="eyebrow">In progress{p.deload ? ' · deload week' : ''}</div>
        <h1>{p.dayName}</h1>
        <div className="sub num">{done}/{total} sets{p.cardio ? ` · warm-up ${p.cardio.done ? '✓' : 'pending'}` : ''}{p.finisher ? ` · finisher ${p.finisher.done ? '✓' : 'pending'}` : ''}</div>
        <div className="progress-track" aria-hidden="true"><div style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
      </header>

      {p.cardio && (
        <CardioCard cardio={p.cardio} unit={p.unit} timer={p.timers.warmup} onTimer={(t) => p.onCardioTimer('warmup', t)}
          onChange={(c) => p.onCardioChange('warmup', c)} onToggleDone={() => p.onCardioDone('warmup')} />
      )}

      <div style={{ marginTop: 14 }}>
        {p.exercises.map((ex, i) => (
          <ExerciseLog
            key={ex.slotId + ex.exerciseId}
            ex={ex}
            unit={p.unit}
            prSetIndex={p.prFlash?.exIdx === i ? p.prFlash.setIdx : null}
            onSetChange={(s, patch) => p.onSetChange(i, s, patch)}
            onToggleDone={(s) => p.onToggleDone(i, s)}
            onAddSet={() => p.onAddSet(i)}
            onSwap={() => p.onSwap(i)}
          />
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        {p.finisher ? (
          <CardioCard cardio={p.finisher} unit={p.unit} timer={p.timers.finisher} onTimer={(t) => p.onCardioTimer('finisher', t)}
            onChange={(c) => p.onCardioChange('finisher', c)} onToggleDone={() => p.onCardioDone('finisher')} onRemove={p.onRemoveFinisher} />
        ) : p.finisherOffer ? (
          <FinisherOffer offer={p.finisherOffer} onAdd={p.onAddFinisher} />
        ) : null}
      </div>

      <div className="footer-bar">
        <button className="btn btn-primary btn-lg" onClick={p.onFinish} data-testid="finish">Finish Workout</button>
      </div>
    </div>
  );
}
