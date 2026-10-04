import { useEffect, useState } from 'react';
import { Stepper } from './Stepper';
import { IconCheck, IconSwap, IconTrophy } from './Icons';
import { fmtNum, fmtSet, plural, weightStep, type ExerciseVM, type SetVM, type Unit } from '../ui/types';

interface Props {
  ex: ExerciseVM;
  unit: Unit;
  prSetIndex?: number | null;
  onSetChange: (setIdx: number, patch: Partial<SetVM>) => void;
  onToggleDone: (setIdx: number) => void;
  onAddSet: () => void;
  onSwap: () => void;
}

/** One exercise in the workout: header, progression hint, set rows. The active set expands big steppers. */
export function ExerciseLog({ ex, unit, prSetIndex, onSetChange, onToggleDone, onAddSet, onSwap }: Props) {
  const firstOpen = ex.sets.findIndex((s) => !s.done);
  const [active, setActive] = useState<number>(firstOpen);
  // When a set is marked done, move focus to the next open set.
  useEffect(() => { setActive(firstOpen); }, [firstOpen]);
  const allDone = ex.sets.length > 0 && firstOpen === -1;

  return (
    <section className="card ex-log" aria-label={ex.name} data-testid="exercise">
      <div className="ex-log-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{ex.name}{ex.swapped && <span className="pill" style={{ marginLeft: 8, verticalAlign: 'middle' }}>swapped</span>}</div>
          <div className="target num">
            {ex.targetSets} × {ex.targetReps}
            {ex.lastSets.length > 0 && <> · Last: {ex.lastSets.map(fmtSet).join(', ')}</>}
          </div>
        </div>
        <button className="icon-btn" aria-label={`Swap ${ex.name}`} onClick={onSwap}><IconSwap /></button>
      </div>
      {ex.hint && <div className={ex.hintKind === 'deload' ? 'hint hint-deload' : 'hint'} data-testid="hint">{ex.hint}</div>}
      <div className="sets">
        {ex.sets.map((s, i) => {
          const isActive = i === active;
          const isPr = prSetIndex === i;
          return (
            <div key={i} className={`set-row${s.done ? ' done' : ''}${isActive ? ' active' : ''}${isPr ? ' pr' : ''}`} data-testid="set-row">
              <div className="set-line">
                <span className="idx num" aria-hidden="true">{i + 1}</span>
                <button className="set-summary num" onClick={() => setActive(isActive ? -1 : i)} aria-expanded={isActive} aria-label={`Set ${i + 1}: ${fmtNum(s.weight)} ${unit} for ${plural(s.reps, 'rep')}${s.pr ? ', personal record' : ''}. Tap to edit`}>
                  <span className="w">{fmtNum(s.weight)}</span><span className="u">{unit}</span>
                  <span className="x">×</span>
                  <span className="r">{s.reps}</span>
                  {s.pr && <span className="pill pill-pr set-pr" data-testid="set-pr" title={s.prKinds?.join(' + ')}><IconTrophy width={14} height={14} aria-hidden="true" />PR</span>}
                </button>
                <button className="done-btn" aria-pressed={s.done} aria-label={s.done ? `Undo set ${i + 1}` : `Mark set ${i + 1} done`} onClick={() => onToggleDone(i)}>
                  <IconCheck />
                </button>
              </div>
              {isActive && (
                <div className="set-edit">
                  <div>
                    <span className="lbl">Weight ({unit})</span>
                    <Stepper label="Weight" suffix={unit} value={s.weight} step={weightStep(unit)} max={2000} onChange={(v) => onSetChange(i, { weight: v })} />
                  </div>
                  <div>
                    <span className="lbl">Reps</span>
                    <Stepper label="Reps" value={s.reps} step={1} max={100} decimals={0} onChange={(v) => onSetChange(i, { reps: v })} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn btn-ghost add-set" onClick={onAddSet}>+ Add set</button>
      {allDone && <div className="sr-only" role="status">{ex.name} complete</div>}
    </section>
  );
}
