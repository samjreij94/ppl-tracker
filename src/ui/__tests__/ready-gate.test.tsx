/**
 * UI ready-gate: no core action may run while the store is 'loading' (init would replace it
 * with the stored snapshot), and data logged through the UI survives a "reload" (new core on the
 * same storage).
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { CoreProvider, createCore, createMemoryStorage, getBundledSeed, type Core, type Storage } from '../../core';
import { useUi } from '../adapter';

/** Storage whose reads block until `release()` — simulates slow IndexedDB on app start. */
function slowStorage(inner: Storage) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const s: Storage = { get: async (k) => { await gate; return inner.get(k); }, set: (k, v) => inner.set(k, v), del: (k) => inner.del(k) };
  return { storage: s, release };
}
const wrap = (core: Core) => ({ children }: { children: ReactNode }) => <CoreProvider core={core}>{children}</CoreProvider>;

describe('UI ready gate', () => {
  it('shows a loading state and ignores actions until core is ready; stored data is kept', async () => {
    // Existing stored data: an active session with one done set.
    const mem = createMemoryStorage();
    const seed = getBundledSeed();
    const c1 = createCore({ storage: mem, seed });
    await c1.init();
    c1.startSession();
    const ei = c1.getState().active!.entries.findIndex((e) => e.kind === 'strength');
    c1.logSet(ei, 0, { weight: 123, reps: 7, done: true });
    c1.updateSettings({ defaultRestSec: 95 });
    await c1.flush();

    // "Reload": new core, slow storage.
    const { storage, release } = slowStorage(createMemoryStorage(mem.dump()));
    const c2 = createCore({ storage, seed });
    void c2.init();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = render(<App />, { wrapper: wrap(c2) });
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByTestId('start')).toBeNull();
    app.unmount();

    // Fire every kind of action while loading — all must be ignored.
    const { result } = renderHook(() => useUi(), { wrapper: wrap(c2) });
    expect(result.current.ready).toBe(false);
    act(() => {
      result.current.start();
      result.current.updateSettings({ restSec: 30, unit: 'kg' });
      result.current.logBodyweight(200);
      result.current.addFinisher();
    });
    await expect(result.current.importText('{}')).rejects.toThrow(/loading/i);
    await expect(result.current.finish()).rejects.toThrow(/loading/i);
    expect(c2.getState().status).toBe('loading');
    expect(c2.getState().active).toBeNull();
    expect(warn).toHaveBeenCalled();

    await act(async () => { release(); await c2.init(); });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const st = c2.getState();
    expect(st.settings.defaultRestSec).toBe(95);
    expect(st.settings.unit).toBe('lb');
    expect(st.bodyweight).toHaveLength(0);
    const set = (st.active!.entries[ei] as { sets: { weight: number; reps: number; done: boolean }[] }).sets[0];
    expect(set).toMatchObject({ weight: 123, reps: 7, done: true });
    warn.mockRestore();
  });

  it('a set logged through the UI persists across a reload', async () => {
    const mem = createMemoryStorage();
    const seed = getBundledSeed();
    const c1 = createCore({ storage: mem, seed });
    void c1.init();
    const first = render(<App />, { wrapper: wrap(c1) });
    fireEvent.click(await screen.findByTestId('start'));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Increase Weight' }))[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark set 1 done' })[0]);
    await c1.flush();
    first.unmount();

    // Reload on the same stored data.
    const c2 = createCore({ storage: createMemoryStorage(mem.dump()), seed });
    void c2.init();
    render(<App />, { wrapper: wrap(c2) });
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    // Active session resumes straight into the workout with set 1 still done.
    expect(await screen.findByTestId('workout')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Undo set 1' }).length).toBeGreaterThan(0);
    const e = c2.getState().active!.entries.find((x) => x.kind === 'strength') as { sets: { weight: number; done: boolean }[] };
    expect(e.sets[0]).toMatchObject({ weight: 5, done: true }); // first-ever exercise prefills 0 → +5
  });
});
