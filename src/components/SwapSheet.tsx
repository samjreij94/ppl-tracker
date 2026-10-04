import { useEffect, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import type { SwapOption } from '../ui/types';

export type SwapScope = 'session' | 'permanent';

interface Props {
  open: boolean;
  currentName: string;
  options: SwapOption[];
  onClose: () => void;
  onSwap: (exerciseId: string, scope: SwapScope) => void;
  onAddCustom: (input: { name: string; sets: number; reps: string }, scope: SwapScope) => void;
  defaultSets?: number;
  defaultReps?: string;
}

/** Bottom sheet: like-for-like alternatives, scope choice, custom exercise form. */
export function SwapSheet({ open, currentName, options, onClose, onSwap, onAddCustom, defaultSets = 3, defaultReps = '8-12' }: Props) {
  const [scope, setScope] = useState<SwapScope>('session');
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState(defaultSets);
  const [reps, setReps] = useState(defaultReps);
  useEffect(() => { if (open) { setPicked(null); setCustom(false); setName(''); setScope('session'); setSets(defaultSets); setReps(defaultReps); } }, [open, defaultSets, defaultReps]);

  const canApply = custom ? name.trim().length > 1 : picked != null;
  const apply = () => {
    if (custom) onAddCustom({ name: name.trim(), sets, reps: reps.trim() || defaultReps }, scope);
    else if (picked) onSwap(picked, scope);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`Swap ${currentName}`}>
      <h3>Swap exercise</h3>
      <div className="dim" style={{ marginBottom: 12 }}>Replacing <b style={{ color: 'var(--text)' }}>{currentName}</b></div>

      <div className="seg" role="group" aria-label="Swap scope" style={{ marginBottom: 14 }}>
        <button aria-pressed={scope === 'session'} onClick={() => setScope('session')}>This session</button>
        <button aria-pressed={scope === 'permanent'} onClick={() => setScope('permanent')}>Always</button>
      </div>

      {!custom && (
        <div role="listbox" aria-label="Alternatives">
          {options.length === 0 && <div className="empty">No alternatives in this group yet.</div>}
          {options.map((o) => (
            <button key={o.exerciseId} role="option" aria-selected={picked === o.exerciseId} aria-pressed={picked === o.exerciseId} className="option" onClick={() => setPicked(o.exerciseId)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="o-name">{o.name}</div>
                {o.note && <div className="o-sub">{o.note}</div>}
              </div>
              <span className={`radio${picked === o.exerciseId ? ' on' : ''}`} aria-hidden="true" />
            </button>
          ))}
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => { setCustom(true); setPicked(null); }}>+ Add custom exercise</button>
        </div>
      )}

      {custom && (
        <form onSubmit={(e) => { e.preventDefault(); if (canApply) apply(); }}>
          <label className="field"><span>Exercise name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hammer Strength press" maxLength={60} />
          </label>
          <div className="grid2">
            <label className="field"><span>Sets</span>
              <input inputMode="numeric" value={sets} onChange={(e) => setSets(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} />
            </label>
            <label className="field"><span>Reps</span>
              <input value={reps} onChange={(e) => setReps(e.target.value)} placeholder="8-12" maxLength={7} />
            </label>
          </div>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setCustom(false)}>Back to alternatives</button>
        </form>
      )}

      <div className="grid2" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!canApply} onClick={apply}>{custom ? 'Add & swap' : 'Swap'}</button>
      </div>
    </BottomSheet>
  );
}
