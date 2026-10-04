import { useEffect, useRef, useState } from 'react';

export interface RestState { endsAt: number; total: number }

/** Sticky countdown bar above the tab bar. Uses an absolute end timestamp so it survives backgrounding. */
export function RestBar({ rest, onAdd, onSkip, onFinished }: { rest: RestState; onAdd: (s: number) => void; onSkip: () => void; onFinished: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => { fired.current = false; }, [rest.endsAt]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      // iOS Safari has no navigator.vibrate; guard so it is a no-op there.
      try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
      onFinished();
    }
  }, [left, onFinished]);
  const pct = rest.total > 0 ? Math.min(100, (left / rest.total) * 100) : 0;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return (
    <div className={left === 0 ? 'restbar finished' : 'restbar'} role="timer" aria-live="off" aria-label="Rest timer" data-testid="restbar">
      <div className="fill" style={{ width: `${pct}%` }} />
      <div style={{ position: 'relative' }}>
        <div className="label">{left === 0 ? 'Rest done — go!' : 'Rest'}</div>
        <div className="time num">{mm}:{ss}</div>
      </div>
      <div className="spacer" />
      <button className="btn btn-sm" onClick={() => onAdd(30)}>+30s</button>
      <button className="btn btn-sm" onClick={onSkip}>{left === 0 ? 'Dismiss' : 'Skip'}</button>
    </div>
  );
}
