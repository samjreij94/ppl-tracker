/**
 * QC fixes: set carry-over prefill, durable settings/active (localStorage mirror), canonical
 * session PRs, empty finish = discard, per-set prKinds on active session.
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CoreProvider, useExerciseHistory, type Core } from '../index';
import { getSessions, getToday, sessionPRs } from '../logic';
import { createMemoryStorage, createMemorySyncStorage, MIRROR_KEYS, STORAGE_KEYS, type Storage } from '../storage';
import { createCore } from '../store';
import type { Settings, StrengthEntry, WorkoutSession } from '../types';
import { clock, entryIdx, makeCore, runSession, SEED, sets } from './helpers';

const BENCH = 'barbell-bench-press';
const entry = (core: Core, id = BENCH) => core.getState().active!.entries[entryIdx(core, id)] as StrengthEntry;
const wr = (core: Core, id = BENCH) => entry(core, id).sets.map((s) => [s.weight, s.reps]);

/** Storage whose writes to `blockKeys` never land (simulates the app being killed mid-write). */
function lossyStorage(inner: Storage, blockKeys: string[]): Storage {
  return {
    get: (k) => inner.get(k),
    set: (k, v) => (blockKeys.includes(k) ? new Promise<void>(() => {}) : inner.set(k, v)),
    del: (k) => inner.del(k),
  };
}

describe('set carry-over prefill', () => {
  it('first-time exercise: completing set 1 (135×8) fills sets 2..N', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    expect(wr(core)).toEqual(sets(4, 0, 5));
    core.logSet(ei, 0, { weight: 135, reps: 8, done: true });
    expect(wr(core)).toEqual(sets(4, 135, 8));
    expect(entry(core).sets.slice(1).every((s) => !s.done && !s.touched && s.prefill === 'default')).toBe(true);
    expect(entry(core).sets[0]).toMatchObject({ done: true, touched: true });
  });

  it('entering weight/reps (without done) also carries; later edits re-carry to still-untouched sets', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    core.logSet(ei, 0, { weight: 100 });
    expect(wr(core)).toEqual(sets(4, 100, 5));
    core.logSet(ei, 0, { reps: 7 });
    expect(wr(core)).toEqual(sets(4, 100, 7));
  });

  it('never overwrites a set the user edited or marked done; carries only to LATER sets', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    core.logSet(ei, 2, { weight: 95 }); // user edit on set 3 (carries to set 4 only)
    expect(wr(core)).toEqual([[0, 5], [0, 5], [95, 5], [95, 5]]);
    core.logSet(ei, 0, { weight: 135, reps: 8, done: true });
    expect(wr(core)).toEqual([[135, 8], [135, 8], [95, 5], [135, 8]]);
    core.logSet(ei, 1, { done: true }); // done → carries 135×8 again; done set 2 is now protected
    core.logSet(ei, 0, { weight: 140, reps: 5 });
    expect(wr(core)).toEqual([[140, 5], [135, 8], [95, 5], [140, 5]]);
  });

  it('with history: per-set history prefill is kept; sets beyond last time carry over', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [130, 7]] });
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    expect(entry(core).sets.map((s) => s.prefill)).toEqual(['history', 'history', 'default', 'default']);
    expect(wr(core)).toEqual([[135, 8], [130, 7], [130, 7], [130, 7]]);
    core.logSet(ei, 0, { weight: 140, reps: 8, done: true });
    expect(wr(core)).toEqual([[140, 8], [130, 7], [140, 8], [140, 8]]);
  });

  it('addSet copies the previous set and stays a carry target; flags are stripped on finish', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    core.logSet(ei, 0, { weight: 135, reps: 8, done: true });
    const ni = core.addSet(ei);
    expect(entry(core).sets[ni]).toMatchObject({ weight: 135, reps: 8, done: false, prefill: 'default' });
    expect(entry(core).sets[ni].touched).toBeUndefined();
    core.logSet(ei, 1, { weight: 140, reps: 6, done: true });
    expect(entry(core).sets[ni]).toMatchObject({ weight: 140, reps: 6 });
    const given = core.addSet(ei, { weight: 50 });
    expect(entry(core).sets[given]).toMatchObject({ weight: 50, touched: true });
    const fin = core.finishSession()!;
    const e = fin.session.entries.find((x) => x.kind === 'strength' && x.exerciseId === BENCH) as StrengthEntry;
    expect(e.sets.every((s) => !('touched' in s) && !('prefill' in s) && !('prKinds' in s))).toBe(true);
  });

  it('legacy active sets (no prefill marker): only weight-0 untouched sets are carried', async () => {
    const legacy: WorkoutSession = {
      id: 'a1',
      programId: 'ppl',
      dayId: 'push-a',
      startedAt: '2026-09-01T10:00:00.000Z',
      unit: 'lb',
      entries: [
        {
          kind: 'strength',
          slotId: 'push-a-1',
          exerciseId: BENCH,
          target: { sets: 3, repRange: { min: 5, max: 8 } },
          restSec: 180,
          sets: [
            { weight: 0, reps: 5, done: false },
            { weight: 120, reps: 5, done: false },
            { weight: 0, reps: 5, done: false },
          ],
        },
      ],
    };
    const { core } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.active]: legacy }) });
    core.logSet(0, 0, { weight: 135, reps: 8, done: true });
    expect(wr(core)).toEqual([[135, 8], [120, 5], [135, 8]]);
  });
});

describe('per-set prKinds on active session', () => {
  it('stores prKinds when logSet returns PRs; clears on undo or when no longer a PR; strips on finish', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    const { prs } = core.logSet(ei, 0, { weight: 145, reps: 8, done: true });
    expect(prs.map((p) => p.kind)).toContain('topSet');
    expect(entry(core).sets[0].prKinds).toEqual(prs.map((p) => p.kind));
    // Edit down while still done → no longer a topSet PR (same weight as history)
    core.logSet(ei, 0, { weight: 135, reps: 8 });
    expect(entry(core).sets[0].prKinds).toBeUndefined();
    // Heavier again → PR returns
    core.logSet(ei, 0, { weight: 150, reps: 5 });
    expect(entry(core).sets[0].prKinds).toContain('topSet');
    // Undo done → cleared
    core.logSet(ei, 0, { done: false });
    expect(entry(core).sets[0].done).toBe(false);
    expect(entry(core).sets[0].prKinds).toBeUndefined();
    // Finish strips (even if PR was set)
    core.logSet(ei, 0, { weight: 150, reps: 5, done: true });
    expect(entry(core).sets[0].prKinds?.length).toBeGreaterThan(0);
    const fin = core.finishSession()!;
    const e = fin.session.entries.find((x) => x.kind === 'strength' && x.exerciseId === BENCH) as StrengthEntry;
    expect(e.sets.every((s) => !('prKinds' in s))).toBe(true);
    expect(fin.session.prs?.some((p) => p.kind === 'topSet')).toBe(true);
  });

  it('prKinds survives a core re-init (active session + localStorage mirror)', async () => {
    const inner = createMemoryStorage();
    const mirror = createMemorySyncStorage();
    const now = clock();
    const c1 = createCore({ storage: lossyStorage(inner, [STORAGE_KEYS.active]), seed: SEED, now, mirror });
    await c1.init();
    runSession(c1, 'push-a', { [BENCH]: sets(4, 135, 8) });
    c1.startSession('push-a');
    const ei = entryIdx(c1, BENCH);
    const { prs } = c1.logSet(ei, 0, { weight: 145, reps: 8, done: true });
    expect(prs.length).toBeGreaterThan(0);
    expect(entry(c1).sets[0].prKinds).toEqual(prs.map((p) => p.kind));
    expect(await inner.get(STORAGE_KEYS.active)).toBeUndefined(); // IndexedDB never landed

    const c2 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c2.init();
    expect(entry(c2).sets[0]).toMatchObject({ weight: 145, reps: 8, done: true });
    expect(entry(c2).sets[0].prKinds).toEqual(prs.map((p) => p.kind));
  });
});

describe('durable settings + active session (localStorage mirror)', () => {
  it('settings are mirrored synchronously and stamped with updatedAt', async () => {
    const mirror = createMemorySyncStorage();
    const core = createCore({ storage: createMemoryStorage(), seed: SEED, now: clock(), mirror });
    await core.init();
    const s = core.updateSettings({ unit: 'kg' });
    expect(s.updatedAt).toBeDefined();
    const m = JSON.parse(mirror.getItem(MIRROR_KEYS.settings)!) as Settings; // no await: already there
    expect(m).toMatchObject({ unit: 'kg', updatedAt: s.updatedAt });
  });

  it('an IndexedDB settings write that never lands: the newer localStorage copy survives reinit (and repairs IndexedDB)', async () => {
    const inner = createMemoryStorage();
    const mirror = createMemorySyncStorage();
    const now = clock();
    const c1 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c1.init();
    c1.updateSettings({ defaultRestSec: 100 }); // lands everywhere
    await c1.flush();
    const lossy = createCore({ storage: lossyStorage(inner, [STORAGE_KEYS.settings]), seed: SEED, now, mirror });
    await lossy.init();
    lossy.updateSettings({ unit: 'kg' }); // IndexedDB write never lands ("killed")
    expect((await inner.get<Settings>(STORAGE_KEYS.settings))!.unit).toBe('lb');

    const c2 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c2.init();
    expect(c2.getState().settings).toMatchObject({ unit: 'kg', defaultRestSec: 100 });
    await c2.flush();
    expect((await inner.get<Settings>(STORAGE_KEYS.settings))!.unit).toBe('kg');
  });

  it('an older mirror loses to a newer IndexedDB copy; no mirror data = normal fresh install', async () => {
    const mirror = createMemorySyncStorage({
      [MIRROR_KEYS.settings]: JSON.stringify({ unit: 'kg', updatedAt: '2026-01-01T00:00:00.000Z' }),
    });
    const inner = createMemoryStorage({ [STORAGE_KEYS.settings]: { unit: 'lb', updatedAt: '2026-02-01T00:00:00.000Z', onboardedAt: '2026-01-01T00:00:00.000Z' } });
    const c = createCore({ storage: inner, seed: SEED, now: clock(), mirror });
    await c.init();
    expect(c.getState().settings.unit).toBe('lb');

    const fresh = createCore({ storage: createMemoryStorage(), seed: SEED, now: clock(), mirror: createMemorySyncStorage() });
    await fresh.init();
    expect(fresh.getState().settings.onboardedAt).toBeUndefined();
  });

  it('a set logged right before a kill survives (active session mirror)', async () => {
    const inner = createMemoryStorage();
    const mirror = createMemorySyncStorage();
    const now = clock();
    const c1 = createCore({ storage: lossyStorage(inner, [STORAGE_KEYS.active]), seed: SEED, now, mirror });
    await c1.init();
    c1.startSession('push-a');
    c1.logSet(entryIdx(c1, BENCH), 0, { weight: 135, reps: 8, done: true });
    expect(await inner.get(STORAGE_KEYS.active)).toBeUndefined(); // never landed

    const c2 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c2.init();
    expect(entry(c2).sets[0]).toMatchObject({ weight: 135, reps: 8, done: true });
  });

  it('finishing: the active mirror is cleared only after IndexedDB has the session; a stale mirror of a finished session is ignored', async () => {
    const inner = createMemoryStorage();
    const mirror = createMemorySyncStorage();
    const now = clock();
    const c1 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c1.init();
    c1.startSession('push-a');
    c1.logSet(entryIdx(c1, BENCH), 0, { weight: 135, reps: 8, done: true });
    const staleMirror = mirror.getItem(MIRROR_KEYS.active)!;
    const { session } = c1.finishSession()!;
    await c1.flush();
    expect(JSON.parse(mirror.getItem(MIRROR_KEYS.active)!).value).toBeNull();

    // killed after IndexedDB landed but before the mirror was cleared
    mirror.setItem(MIRROR_KEYS.active, staleMirror);
    const c2 = createCore({ storage: inner, seed: SEED, now, mirror });
    await c2.init();
    expect(c2.getState().active).toBeNull();
    expect(c2.getState().sessions.map((s) => s.id)).toEqual([session.id]);
  });

  it('pagehide / visibilitychange(hidden) call flush(); dispose() removes the listeners', async () => {
    const { core } = await makeCore();
    const spy = vi.spyOn(core, 'flush');
    window.dispatchEvent(new Event('pagehide'));
    expect(spy).toHaveBeenCalledTimes(1);
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(2);
    core.dispose();
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(2);
    vis.mockRestore();
    const noLc = createCore({ storage: createMemoryStorage(), seed: SEED, lifecycle: false });
    const spy2 = vi.spyOn(noLc, 'flush');
    window.dispatchEvent(new Event('pagehide'));
    expect(spy2).not.toHaveBeenCalled();
  });
});

describe('canonical session PRs', () => {
  it('at most one PR per exercise per kind (best of each); summary count = history count', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[140, 6], [135, 8], [135, 8], [135, 8]] });
    const fin = runSession(core, 'push-a', { [BENCH]: [[140, 8], [135, 10], [135, 9], [130, 10]] })!;
    // candidates: repsAtWeight @140 (8>6) and @135 (10>8, 9>8) → keep the heaviest (140×8);
    // e1rm: 135×10 (180) beats 140×8 (177.3); topSet: none (140 is not > 140)
    const bench = fin.prs.filter((p) => p.exerciseId === BENCH);
    expect(bench.map((p) => [p.kind, p.weight, p.reps])).toEqual([
      ['e1rm', 135, 10],
      ['repsAtWeight', 140, 8],
    ]);
    const kinds = fin.prs.map((p) => `${p.exerciseId}/${p.kind}`);
    expect(new Set(kinds).size).toBe(kinds.length);
    const st = core.getState();
    expect(fin.session.prs).toEqual(fin.prs);
    expect(sessionPRs(st, fin.session.id)).toEqual(fin.prs);
    expect(sessionPRs(st, getSessions(st)[0]).length).toBe(fin.prs.length);
    const { result } = renderHook(() => useExerciseHistory(BENCH), {
      wrapper: ({ children }: { children?: ReactNode }) => <CoreProvider core={core}>{children}</CoreProvider>,
    });
    expect(result.current.sessionPRs(fin.session.id)).toEqual(fin.prs);
    expect(sessionPRs(st, 'nope')).toEqual([]);
  });

  it('logSet keeps returning per-set PRs (live pill)', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    core.startSession('push-a');
    const ei = entryIdx(core, BENCH);
    expect(core.logSet(ei, 0, { weight: 140, reps: 8, done: true }).prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'topSet']);
    expect(core.logSet(ei, 1, { weight: 145, reps: 8, done: true }).prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'topSet']);
    expect(core.finishSession()!.prs.filter((p) => p.exerciseId === BENCH)).toHaveLength(2); // e1rm + topSet (145×8)
  });

  it('old sessions without prs: computed with the same rules against the sessions before them', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[140, 6], [135, 8], [135, 8], [135, 8]] });
    const fin = runSession(core, 'push-a', { [BENCH]: [[140, 8], [135, 10], [135, 9], [130, 10]] })!;
    const old = core.getState().sessions.map(({ prs: _p, ...s }) => s);
    const { core: legacy } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.sessions]: old, [STORAGE_KEYS.settings]: { onboardedAt: '2026-01-01T00:00:00.000Z' } }) });
    const st = legacy.getState();
    expect(st.sessions[1].prs).toBeUndefined();
    expect(sessionPRs(st, fin.session.id)).toEqual(fin.prs);
    expect(sessionPRs(st, st.sessions[0].id)).toEqual([]); // first-ever: no PRs
  });

  it('deleteSession leaves later sessions’ stored prs as they were', async () => {
    const { core } = await makeCore();
    const first = runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) })!;
    const second = runSession(core, 'push-a', { [BENCH]: sets(4, 140, 8) })!;
    expect(second.prs.length).toBeGreaterThan(0);
    core.deleteSession(first.session.id);
    expect(sessionPRs(core.getState(), second.session.id)).toEqual(second.prs);
  });
});

describe('finishSession with nothing done', () => {
  it('no done strength set and no done cardio → discarded, returns null, rotation unchanged', async () => {
    const { core, storage } = await makeCore();
    core.startSession('push-a');
    core.logSet(entryIdx(core, BENCH), 0, { weight: 135, reps: 8 }); // edited but not done
    expect(core.finishSession()).toBeNull();
    expect(core.getState().active).toBeNull();
    expect(core.getState().sessions).toHaveLength(0);
    expect(getToday(core.getState())!.day.id).toBe('push-a');
    await core.flush();
    expect(await storage.get(STORAGE_KEYS.active)).toBeNull();
    expect(core.finishSession()).toBeNull(); // no active session
  });

  it('only done cardio → saved and advances the rotation', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    core.logCardio('warmup', { done: true });
    const fin = core.finishSession()!;
    expect(fin.session.dayId).toBe('push-a');
    expect(fin.prs).toEqual([]);
    expect(getToday(core.getState())!.day.id).toBe('pull-a');
  });

  it('discardSession drops the active session; deleteSession rewinds the rotation', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    core.discardSession();
    expect(core.getState().active).toBeNull();
    expect(getToday(core.getState())!.day.id).toBe('push-a');
    const fin = runSession(core, 'push-a', { [BENCH]: sets(1, 135, 8) })!;
    expect(getToday(core.getState())!.day.id).toBe('pull-a');
    core.deleteSession(fin.session.id);
    expect(getToday(core.getState())!.day.id).toBe('push-a');
  });
});
