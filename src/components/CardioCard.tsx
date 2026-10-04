import { useEffect, useRef, useState } from 'react';
import { Stepper } from './Stepper';
import { useCountdown } from '../ui/useCountdown';
import { IconCheck } from './Icons';
import { cardioLabel, fmtNum, type CardioKind, type CardioVM, type Unit } from '../ui/types';

const KINDS: { id: CardioKind; short: string }[] = [
  { id: 'incline-treadmill', short: 'Incline' },
  { id: 'flat-treadmill', short: 'Flat' },
  { id: 'peloton', short: 'Peloton' },
];

export interface CardioTimer { endsAt: number | null; pausedLeftSec: number | null }

interface Props {
  cardio: CardioVM;
  unit: Unit;
  timer: CardioTimer;
  onTimer: (t: CardioTimer) => void;
  onChange: (patch: Partial<CardioVM>) => void;
  onToggleDone: () => void;
  /** Finisher only: drop the optional block from this session. */
  onRemove?: () => void;
}

function vibrate() {
  try { if ('vibrate' in navigator && typeof navigator.vibrate === 'function') navigator.vibrate([300, 120, 300]); } catch { /* iOS: no-op */ }
}

export function cardioSummary(c: CardioVM, unit: Unit) {
  const bits = [`${c.minutes} min`];
  if (c.kind !== 'peloton') {
    if (c.incline) bits.push(`${fmtNum(c.incline)}%`);
    if (c.speed) bits.push(`${fmtNum(c.speed)} ${unit === 'kg' ? 'km/h' : 'mph'}`);
  } else {
    if (c.output) bits.push(`${c.output} kJ`);
    if (c.calories) bits.push(`${c.calories} cal`);
  }
  return bits.join(' · ');
}

/** Cardio block: the warm-up (always first) or the optional zone-2 finisher (last). */
export function CardioCard({ cardio, unit, timer, onTimer, onChange, onToggleDone, onRemove }: Props) {
  const isFinisher = cardio.role === 'finisher';
  const title = isFinisher ? 'Cardio finisher · zone 2' : 'Cardio warm-up';
  const [expanded, setExpanded] = useState(!cardio.done);
  const fired = useRef(false);
  useEffect(() => { if (cardio.done) setExpanded(false); }, [cardio.done]);
  useEffect(() => { fired.current = false; }, [timer.endsAt]);
  const counted = useCountdown(timer.endsAt);

  const running = timer.endsAt != null;
  const leftSec = running ? counted : timer.pausedLeftSec ?? cardio.minutes * 60;
  useEffect(() => {
    if (running && leftSec === 0 && !fired.current) {
      fired.current = true;
      vibrate();
      onTimer({ endsAt: null, pausedLeftSec: 0 });
    }
  }, [running, leftSec, onTimer]);
  const mm = Math.floor(leftSec / 60), ss = String(leftSec % 60).padStart(2, '0');
  const finished = !running && timer.pausedLeftSec === 0;

  const start = () => onTimer({ endsAt: Date.now() + (leftSec > 0 ? leftSec : cardio.minutes * 60) * 1000, pausedLeftSec: null });
  const pause = () => onTimer({ endsAt: null, pausedLeftSec: leftSec });
  const reset = () => onTimer({ endsAt: null, pausedLeftSec: null });
  const speedUnit = unit === 'kg' ? 'km/h' : 'mph';

  if (!expanded) {
    return (
      <section className={`card cardio-card collapsed${cardio.done ? ' done' : ''}`} aria-label={title} data-testid={isFinisher ? 'finisher' : 'cardio'}>
        <div className="row">
          <div className={`cardio-check${cardio.done ? ' on' : ''}`} aria-hidden="true"><IconCheck /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{title}</div>
            <div className="name">{cardioLabel(cardio.kind, cardio.name)}</div>
            <div className="dim num" style={{ fontSize: 14 }}>{cardioSummary(cardio, unit)}</div>
          </div>
          <button className="btn btn-sm" onClick={() => setExpanded(true)}>Edit</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`card cardio-card${cardio.done ? ' done' : ''}`} aria-label={title} data-testid={isFinisher ? 'finisher' : 'cardio'}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{title}</div>
          <div className="name">{cardioLabel(cardio.kind, cardio.name)}</div>
        </div>
        {cardio.done && <button className="btn btn-sm" onClick={() => setExpanded(false)}>Collapse</button>}
        {!cardio.done && onRemove && <button className="btn btn-sm" onClick={() => { reset(); onRemove(); }}>Skip</button>}
      </div>
      {cardio.hint && <div className="hint cardio-hint" data-testid="cardio-hint">{cardio.hint}</div>}
      <div className="seg seg-lg" role="group" aria-label="Cardio type">
        {KINDS.map((k) => (
          <button key={k.id} aria-pressed={cardio.kind === k.id} onClick={() => onChange({ kind: k.id })}>{k.short}</button>
        ))}
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field-s"><span className="lbl">Minutes{cardio.minMinutes != null && cardio.maxMinutes != null ? <em> {cardio.minMinutes}–{cardio.maxMinutes}</em> : null}</span>
          <Stepper label={isFinisher ? 'Finisher minutes' : 'Minutes'} value={cardio.minutes} step={1} min={cardio.minMinutes ?? 1} max={cardio.maxMinutes ?? 180} decimals={0} onChange={(v) => { onChange({ minutes: v }); if (!running) reset(); }} />
        </label>
        <div className="cardio-timer">
          <span className="lbl">Timer</span>
          <div className={`timer-box num${running ? ' running' : ''}${finished ? ' finished' : ''}`} role="timer" aria-label="Cardio timer">{mm}:{ss}</div>
        </div>
      </div>

      {cardio.kind !== 'peloton' ? (
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="field-s"><span className="lbl">Incline % <em>optional</em></span>
            <Stepper label="Incline percent" value={cardio.incline ?? 0} step={0.5} max={30} onChange={(v) => onChange({ incline: v })} />
          </label>
          <label className="field-s"><span className="lbl">Speed {speedUnit} <em>optional</em></span>
            <Stepper label={`Speed ${speedUnit}`} value={cardio.speed ?? 0} step={0.1} max={20} onChange={(v) => onChange({ speed: v })} />
          </label>
        </div>
      ) : (
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="field-s"><span className="lbl">Output kJ <em>optional</em></span>
            <Stepper label="Output kJ" value={cardio.output ?? 0} step={5} max={2000} decimals={0} onChange={(v) => onChange({ output: v })} />
          </label>
          <label className="field-s"><span className="lbl">Calories <em>optional</em></span>
            <Stepper label="Calories" value={cardio.calories ?? 0} step={5} max={3000} decimals={0} onChange={(v) => onChange({ calories: v })} />
          </label>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 12 }}>
        {running
          ? <button className="btn" onClick={pause}>Pause</button>
          : <button className="btn" onClick={finished ? reset : start}>{finished ? 'Reset' : timer.pausedLeftSec != null ? 'Resume' : 'Start'}</button>}
        <button className={cardio.done ? 'btn' : 'btn btn-primary'} aria-pressed={cardio.done} onClick={() => { if (running) pause(); onToggleDone(); }}>
          <IconCheck width={22} height={22} />{cardio.done ? 'Done' : 'Mark done'}
        </button>
      </div>
    </section>
  );
}
