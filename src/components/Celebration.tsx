import { useEffect, useMemo } from 'react';

const COLORS = ['#c6ff00', '#ffb800', '#4cc9f0', '#ff5a5f', '#f4f6f8'];

/** Tiny CSS-only confetti + toast. Confetti is hidden by CSS under prefers-reduced-motion. */
export function Celebration({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  const bits = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, delay: `${(i % 6) * 0.07}s`, bg: COLORS[i % COLORS.length], rot: `${(i * 47) % 360}deg`,
  })), []);
  return (
    <>
      <div className="confetti" aria-hidden="true">
        {bits.map((b, i) => <i key={i} style={{ left: b.left, animationDelay: b.delay, background: b.bg, transform: `rotate(${b.rot})` }} />)}
      </div>
      <div className="toast" role="status" aria-live="polite">{message}</div>
    </>
  );
}
