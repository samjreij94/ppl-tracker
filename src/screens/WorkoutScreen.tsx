import { CardioCard, type CardioTimer } from '../components/CardioCard';
import { ExerciseLog } from '../components/ExerciseLog';
import type { CardioVM, ExerciseVM, SetVM, Unit } from '../ui/types';

interface Props {
  dayName: string;
  unit: Unit;
  startedAt: number;
  cardio: CardioVM | null;
  cardioTimer: CardioTimer;
  exercises: ExerciseVM[];
  prFlash: { exIdx: number; setIdx: number } | null;
  onCardioTimer: (t: CardioTimer) => void;
  onCardioChange: (patch: Partial<CardioVM>) => void;
  onCardioDone: () => void;
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
        <div className="eyebrow">In progress</div>
        <h1>{p.dayName}</h1>
        <div className="sub num">{done}/{total} sets done{p.cardio ? ` · cardio ${p.cardio.done ? '✓' : 'pending'}` : ''}</div>
        <div className="progress-track" aria-hidden="true"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      </header>

      {p.cardio && (
        <CardioCard cardio={p.cardio} unit={p.unit} timer={p.cardioTimer} onTimer={p.onCardioTimer} onChange={p.onCardioChange} onToggleDone={p.onCardioDone} />
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

      <div className="footer-bar">
        <button className="btn btn-primary btn-lg" onClick={p.onFinish} data-testid="finish">Finish Workout</button>
      </div>
    </div>
  );
}
