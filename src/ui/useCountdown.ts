import { useEffect, useState } from 'react';

const secsLeft = (endsAt: number | null) => (endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

/**
 * Whole seconds left until `endsAt` (ms epoch), driven by requestAnimationFrame so it stays in
 * lock-step with the display (60/120 Hz) but only re-renders when the second actually changes.
 * rAF pauses in the background; on return the value is recomputed from the clock, so it never drifts.
 * When `endsAt` changes, the first render already returns the fresh value (no stale 0 → no false "finished").
 */
export function useCountdown(endsAt: number | null): number {
  const [st, setSt] = useState(() => ({ endsAt, left: secsLeft(endsAt) }));
  useEffect(() => {
    if (endsAt == null) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const v = secsLeft(endsAt);
      if (v !== last) { last = v; setSt({ endsAt, left: v }); }
      if (v > 0) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  return st.endsAt === endsAt ? st.left : secsLeft(endsAt);
}
