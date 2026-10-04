import { describe, expect, it } from 'vitest';
import { createIdbStorage, createMemoryStorage, STORAGE_KEYS } from '../storage';
import { makeCore, runSession, sets } from './helpers';

describe('storage', () => {
  it('persists sessions, active session, settings, custom exercises and bodyweight; reload restores them', async () => {
    const storage = createMemoryStorage();
    const { core } = await makeCore({ storage });
    runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 135, 8) });
    core.updateSettings({ unit: 'kg', defaultRestSec: 90 });
    const custom = core.addCustomExercise({ name: 'Landmine Press', substitutionGroup: 'vertical-press', equipment: 'barbell' });
    core.logBodyweight({ date: '2026-09-02', weight: 90, note: 'am' });
    core.startSession('pull-a');
    core.logSet(1, 0, { weight: 60, reps: 8, done: true });
    await core.flush();

    const dump = (storage as ReturnType<typeof createMemoryStorage>).dump();
    expect(Object.keys(dump).sort()).toEqual(Object.values(STORAGE_KEYS).sort());

    const { core: re } = await makeCore({ storage });
    const s = re.getState();
    expect(s.status).toBe('ready');
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].dayId).toBe('push-a');
    expect(s.active?.dayId).toBe('pull-a');
    const e = s.active!.entries[1];
    expect(e.kind === 'strength' && e.sets[0]).toMatchObject({ weight: 60, reps: 8, done: true });
    expect(s.settings).toMatchObject({ unit: 'kg', defaultRestSec: 90 });
    expect(s.exercises[custom.id]).toMatchObject({ name: 'Landmine Press', isCustom: true });
    expect(s.groups['vertical-press'].exerciseIds).toContain(custom.id);
    expect(s.bodyweight).toEqual([{ date: '2026-09-02', weight: 90, unit: 'kg', note: 'am' }]);
  });

  it('updateSettings deep-patches increments, cardio, finisher and goal', async () => {
    const { core } = await makeCore();
    const before = core.getState().settings;
    const after = core.updateSettings({
      increments: { lb: { dumbbell: 2.5 } },
      cardio: { defaultDurationMin: 8 },
      finisher: { autoAdd: true },
      goal: { type: 'maintenance' },
    });
    expect(after.increments.lb).toEqual({ ...before.increments.lb, dumbbell: 2.5 });
    expect(after.increments.kg).toEqual(before.increments.kg);
    expect(after.cardio).toEqual({ enabled: true, defaultDurationMin: 8 });
    expect(after.finisher.autoAdd).toBe(true);
    expect(after.goal.type).toBe('maintenance');
    expect(after.goal.targetLossPctBodyweightPerWeek).toEqual(before.goal.targetLossPctBodyweightPerWeek);
  });

  it('stored settings from an older version are merged over current defaults', async () => {
    const storage = createMemoryStorage({ [STORAGE_KEYS.settings]: { unit: 'kg', increments: { kg: { machine: 2 } } } });
    const { core } = await makeCore({ storage });
    const s = core.getState().settings;
    expect(s.unit).toBe('kg');
    expect(s.increments.kg).toMatchObject({ machine: 2, dumbbell: 2.5 });
    expect(s.finisher).toEqual({ autoAdd: false });
    expect(s.goal.type).toBe('fat-loss');
    expect(s.cardio.enabled).toBe(true);
  });

  it('memory storage deep-clones values (no shared references)', async () => {
    const st = createMemoryStorage();
    const v = { a: [1] };
    await st.set('k', v);
    v.a.push(2);
    expect(await st.get('k')).toEqual({ a: [1] });
    await st.del('k');
    expect(await st.get('k')).toBeUndefined();
  });

  it('IndexedDB (fake-indexeddb) round-trip', async () => {
    const storage = createIdbStorage('ppl-roundtrip-test', 'kv');
    const { core } = await makeCore({ storage });
    runSession(core, undefined, { 'barbell-bench-press': sets(4, 100, 6) });
    core.updateSettings({ unit: 'kg', increments: { kg: { machine: 2 } } });
    core.addCustomExercise({ name: 'Cable Press' });
    core.logBodyweight({ date: '2026-09-03', weight: 88.5 });
    core.startSession();
    await core.flush();
    const { core: re } = await makeCore({ storage });
    const s = re.getState();
    expect(s.sessions).toHaveLength(1);
    expect(s.active?.dayId).toBe('pull-a');
    expect(s.settings.increments.kg.machine).toBe(2);
    expect(s.customExercises.map((e) => e.id)).toEqual(['custom-cable-press']);
    expect(s.bodyweight[0]).toMatchObject({ weight: 88.5, unit: 'kg' });
  });
});
