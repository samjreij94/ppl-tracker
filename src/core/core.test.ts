import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { getBundledSeedRaw } from './bundled-seed';
import {
  CARDIO_SLOT_ID,
  CoreProvider,
  createCore,
  createIdbStorage,
  createMemoryStorage,
  epley,
  getProgression,
  getSwaps,
  getToday,
  loadSeed,
  useToday,
  useWorkout,
} from './index';

const seed = loadSeed(getBundledSeedRaw());
let t = Date.parse('2026-10-01T10:00:00Z');
const now = () => new Date((t += 60_000));

async function makeCore() {
  const storage = createMemoryStorage();
  const core = createCore({ storage, seed, now });
  await core.init();
  return { core, storage };
}

/** Do every strength set of the active session at `weight` x `reps`. */
function doAll(core: Awaited<ReturnType<typeof makeCore>>['core'], weight: number, reps: number) {
  core.getState().active!.entries.forEach((e, ei) => {
    if (e.kind === 'strength') e.sets.forEach((_, si) => core.logSet(ei, si, { weight, reps, done: true }));
  });
}

describe('math', () => {
  it('epley', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.33, 2);
    expect(epley(100, 0)).toBe(0);
  });
});

describe('core store', () => {
  it('rotation, cardio first, prefill, PRs, progression, swaps', async () => {
    const { core } = await makeCore();
    const s0 = core.getState();
    expect(s0.status).toBe('ready');
    const today = getToday(s0)!;
    expect(today.day.id).toBe('push-a');
    expect(today.slots[0]).toMatchObject({ kind: 'cardio', exercise: { id: 'incline-treadmill' }, durationMin: 10 });

    core.startSession();
    doAll(core, 135, 8); // bench 4x8 at repMax
    const { session } = core.finishSession()!;
    expect(session.dayId).toBe('push-a');
    expect(getToday(core.getState())!.day.id).toBe('pull-a');

    // progression: all sets hit max → add 5 lb
    const hint = getProgression(core.getState(), 'barbell-bench-press', { sets: 4, repRange: { min: 5, max: 8 } })!;
    expect(hint).toMatchObject({ action: 'increase', newWeight: 140, increment: 5, message: 'add 5 lb' });

    // prefill from last + PR on next session
    core.startSession('push-a');
    const a = core.getState().active!;
    expect(a.entries[0].kind).toBe('cardio');
    const bench = a.entries[1];
    expect(bench.kind === 'strength' && bench.sets[0]).toMatchObject({ weight: 135, reps: 8, done: false });
    const { prs } = core.logSet(1, 0, { weight: 140, reps: 6, done: true });
    expect(prs.map((p) => p.kind).sort()).toEqual(['topSet']);
    const r2 = core.logSet(1, 1, { weight: 140, reps: 8, done: true });
    expect(r2.prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'repsAtWeight']);

    // swaps: same pattern, session scope re-prefills from the substitute's own (empty) history
    const swaps = getSwaps(core.getState(), 'barbell-overhead-press', 'push-a-2');
    expect(swaps.length).toBeGreaterThan(2);
    core.swapExercise('push-a-2', swaps[0].id, 'session');
    const e2 = core.getState().active!.entries[2];
    expect(e2.exerciseId).toBe(swaps[0].id);
    expect(e2.kind === 'strength' && e2.sets[0].weight).toBe(0);
    core.discardSession();

    // permanent cardio swap applies to every day
    core.swapExercise(CARDIO_SLOT_ID, 'peloton', 'permanent');
    expect(getToday(core.getState(), 'legs-b')!.slots[0].exercise.id).toBe('peloton');
  });

  it('custom exercises join swap groups; export/import round-trips', async () => {
    const { core } = await makeCore();
    const ex = core.addCustomExercise({ name: 'Landmine Press', equipment: 'barbell', substitutionGroup: 'vertical-press' });
    expect(ex.id).toBe('custom-landmine-press');
    expect(getSwaps(core.getState(), 'barbell-overhead-press').map((e) => e.id)).toContain(ex.id);
    core.startSession();
    doAll(core, 100, 6);
    core.finishSession();
    const json = core.exportJSON();

    const { core: other } = await makeCore();
    const res = await other.importJSON(json);
    expect(res).toMatchObject({ ok: true, counts: { sessions: 1, customExercises: 1 } });
    expect(other.getState().sessions).toHaveLength(1);
    expect((await other.importJSON('{"version":99}')).ok).toBe(false);
  });

  it('persists to IndexedDB (fake-indexeddb) and reloads', async () => {
    const storage = createIdbStorage('ppl-test', 'kv');
    const c1 = createCore({ storage, seed, now });
    await c1.init();
    c1.updateSettings({ unit: 'kg', increments: { kg: { machine: 2 } } });
    await c1.flush();
    const c2 = createCore({ storage, seed, now });
    await c2.init();
    expect(c2.getState().settings.unit).toBe('kg');
    expect(c2.getState().settings.increments.kg.machine).toBe(2);
    expect(c2.getState().settings.increments.kg.dumbbell).toBe(2.5);
  });
});

describe('hooks', () => {
  it('useToday + useWorkout', async () => {
    const { core } = await makeCore();
    const wrapper = ({ children }: { children?: ReactNode }) => createElement(CoreProvider, { core }, children);
    const today = renderHook(() => useToday(), { wrapper });
    expect(today.result.current.today?.day.name).toBe('Push A');
    const w = renderHook(() => useWorkout(), { wrapper });
    act(() => {
      w.result.current.startSession();
    });
    expect(w.result.current.session?.dayId).toBe('push-a');
    expect(w.result.current.entries[1].exercise.id).toBe('barbell-bench-press');
    act(() => {
      w.result.current.logCardio(0, { done: true });
    });
    expect(w.result.current.entries[0].entry).toMatchObject({ kind: 'cardio', done: true });
  });
});
