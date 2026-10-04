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
  bodyweightTrend,
  DEFAULT_PROGRESSION_RULES,
  epley,
  getProgression,
  suggestProgression,
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
    expect(hint).toMatchObject({ action: 'increase', newWeight: 140, increment: 5, message: 'add 5 lb', rules: 'cut' });

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

describe('fat-loss additions', () => {
  it('finisher: optional, prefilled from last finisher, clamped, counted as cardio only', async () => {
    const { core } = await makeCore();
    core.startSession();
    expect(core.getState().active!.entries.some((e) => e.kind === 'cardio' && e.role === 'finisher')).toBe(false);
    const idx = core.addFinisher();
    const fin = core.getState().active!.entries[idx];
    expect(fin).toMatchObject({ kind: 'cardio', role: 'finisher', exerciseId: 'incline-treadmill', durationMin: 15 });
    core.logCardio('finisher', { durationMin: 45, done: true });
    expect(core.getState().active!.entries[idx]).toMatchObject({ durationMin: 20, done: true }); // clamped to max
    core.swapExercise('cardio-finisher', 'peloton', 'session');
    core.finishSession();
    core.startSession();
    expect(getToday(core.getState())!.finisher).toMatchObject({ exercise: { id: 'peloton' }, durationMin: 20, intensity: 'zone-2' });
    core.removeFinisher();
  });

  it('cut progression: hold → dropSet → reduceLoad ~5%; base: reduceLoad after 2', () => {
    const fail = { sets: [{ weight: 200, reps: 4, done: true }, { weight: 200, reps: 6, done: true }, { weight: 200, reps: 5, done: true }] };
    const varied = (r: number) => ({ sets: [{ weight: 200, reps: r, done: true }, { weight: 200, reps: 6, done: true }, { weight: 200, reps: 5, done: true }] });
    const base = { exerciseId: 'x', repRange: { min: 5, max: 8 }, targetSets: 3, unit: 'lb' as const, increment: 5, rules: DEFAULT_PROGRESSION_RULES };
    const cut = { ...base, goalType: 'fat-loss' };
    expect(suggestProgression({ ...cut, history: [varied(4), varied(3)] }).action).toBe('hold');
    expect(suggestProgression({ ...cut, history: [varied(4), varied(3), varied(2)] })).toMatchObject({ action: 'dropSet', newSets: 2 });
    expect(suggestProgression({ ...cut, history: [varied(4), varied(3), varied(2), varied(1)] })).toMatchObject({ action: 'reduceLoad', newWeight: 190 });
    // maintaining the same load & reps on a cut is a success, not a stall
    expect(suggestProgression({ ...cut, history: [fail, fail, fail, fail] }).action).toBe('hold');
    expect(suggestProgression({ ...base, history: [varied(4), varied(3)] })).toMatchObject({ action: 'reduceLoad', newWeight: 180, rules: 'base' });
  });

  it('bodyweight: upsert per date, 7-day trend + weekly rate vs goal, export/import', async () => {
    const { core } = await makeCore();
    const goal = core.getState().settings.goal;
    for (let d = 1; d <= 14; d++) core.logBodyweight({ date: `2026-09-${String(d).padStart(2, '0')}`, weight: 200 - d * 0.2 });
    core.logBodyweight({ date: '2026-09-14', weight: 197.2 }); // upsert
    expect(core.getState().bodyweight).toHaveLength(14);
    const t = core.getBodyweightTrend();
    expect(t.weeklyRate!.lossPerWeek).toBeCloseTo(1.4, 1);
    expect(t.status).toBe('onTrack'); // ~0.7 %/wk within 0.5–1.0
    expect(bodyweightTrend([{ date: '2026-09-01', weight: 200, unit: 'lb' }], 'lb', goal).status).toBe('insufficientData');
    const { core: other } = await makeCore();
    const res = await other.importJSON(core.exportJSON());
    expect(res.counts?.bodyweight).toBe(14);
    core.deleteBodyweight('2026-09-01');
    expect(core.getState().bodyweight).toHaveLength(13);
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
      w.result.current.logCardio('warmup', { done: true });
    });
    expect(w.result.current.entries[0].entry).toMatchObject({ kind: 'cardio', done: true });
  });
});
