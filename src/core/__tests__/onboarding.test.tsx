/**
 * First-run onboarding: Settings.profile / onboardedAt, completeOnboarding, updateProfile,
 * migration of existing data (init + import), goal-type switching (cut vs base rules, deload weeks).
 */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { bodyweightTrend } from '../bodyweight';
import { CoreProvider, useOnboarding, useSettings, type Core } from '../index';
import { getProgression } from '../logic';
import { createMemoryStorage, STORAGE_KEYS, type Storage } from '../storage';
import type { Settings, WorkoutSession } from '../types';
import { makeCore, runSession, sets } from './helpers';

const BENCH = 'barbell-bench-press';
const DAY = 86_400_000;
const T = { sets: 4, repRange: { min: 5, max: 8 } };
const wrap = (core: Core) =>
  function Wrapper({ children }: { children?: ReactNode }) {
    return <CoreProvider core={core}>{children}</CoreProvider>;
  };

/** Count settings writes on a storage. */
function countingStorage(inner = createMemoryStorage()) {
  const writes: string[] = [];
  const storage: Storage = {
    get: (k) => inner.get(k),
    set: (k, v) => {
      writes.push(k);
      return inner.set(k, v);
    },
    del: (k) => inner.del(k),
  };
  return { storage, writes, inner };
}

const oldSession: WorkoutSession = {
  id: 'old-1',
  programId: 'ppl',
  dayId: 'push-a',
  startedAt: '2026-08-01T10:00:00.000Z',
  finishedAt: '2026-08-01T11:00:00.000Z',
  unit: 'lb',
  entries: [{ kind: 'strength', slotId: 'push-a-1', exerciseId: BENCH, sets: [{ weight: 135, reps: 8, done: true }], target: T, restSec: 180 }],
};

describe('onboarding', () => {
  it('fresh install: not onboarded, empty profile, nothing written', async () => {
    const { storage, writes } = countingStorage();
    const { core } = await makeCore({ storage });
    const st = core.getState().settings;
    expect(st.onboardedAt).toBeUndefined();
    expect(st.profile).toEqual({ name: '' });
    expect(st.goal.type).toBe('fat-loss'); // seed default until chosen
    await core.flush();
    expect(writes).toEqual([]);
    // a reload of a still-fresh install stays un-onboarded
    const { core: again } = await makeCore({ storage });
    expect(again.getState().settings.onboardedAt).toBeUndefined();
  });

  it('completeOnboarding sets profile, goal, unit, schedule and onboardedAt atomically (one update, one write) and persists', async () => {
    const { storage, writes, inner } = countingStorage();
    const { core } = await makeCore({ storage });
    let notified = 0;
    core.subscribe(() => notified++);
    const out = core.completeOnboarding({ name: '  Karyn ', goal: 'build-muscle', experience: 'intermediate', unit: 'kg', schedule: 3 });
    expect(notified).toBe(1);
    expect(out).toBe(core.getState().settings);
    expect(out).toMatchObject({ unit: 'kg', schedule: 3, goal: { type: 'build-muscle' }, profile: { name: 'Karyn', experience: 'intermediate' } });
    expect(Date.parse(out.onboardedAt!)).not.toBeNaN();
    expect(out.goal.targetLossPctBodyweightPerWeek).toEqual({ min: 0.5, max: 1 }); // rest of goal kept
    await core.flush();
    expect(writes).toEqual([STORAGE_KEYS.settings]);
    expect(await inner.get<Settings>(STORAGE_KEYS.settings)).toEqual(out);
    const { core: re } = await makeCore({ storage });
    expect(re.getState().settings).toEqual(out);

    // goal also accepted as {type}; invalid unit/schedule/experience are ignored
    const o2 = core.completeOnboarding({ name: 'K', goal: { type: 'general-strength' }, experience: 'expert' as never, unit: 'st' as never, schedule: 4 as never });
    expect(o2).toMatchObject({ unit: 'kg', schedule: 3, goal: { type: 'general-strength' }, profile: { name: 'K', experience: 'intermediate' } });
  });

  it('updateProfile and updateSettings (deep patch) edit the profile', async () => {
    const { core } = await makeCore();
    core.completeOnboarding({ name: 'Samir', goal: 'fat-loss', experience: 'advanced', unit: 'lb', schedule: 6 });
    expect(core.updateProfile({ name: ' Sam ' }).profile).toEqual({ name: 'Sam', experience: 'advanced' });
    expect(core.updateProfile({ experience: 'beginner' }).profile).toEqual({ name: 'Sam', experience: 'beginner' });
    expect(core.updateSettings({ profile: { experience: 'intermediate' } }).profile).toEqual({ name: 'Sam', experience: 'intermediate' });
    expect(core.updateSettings({ goal: { type: 'build-muscle' } }).goal.type).toBe('build-muscle');
    expect(core.getState().settings.onboardedAt).toBeDefined();
  });

  it('migration: existing stored data without onboardedAt is marked onboarded (goal fat-loss if missing) and persisted', async () => {
    // settings only (old shape, no goal)
    const s1 = createMemoryStorage({ [STORAGE_KEYS.settings]: { unit: 'lb', defaultRestSec: 90 } });
    const { core: c1 } = await makeCore({ storage: s1 });
    expect(c1.getState().settings).toMatchObject({ goal: { type: 'fat-loss' }, profile: { name: '' }, defaultRestSec: 90 });
    expect(c1.getState().settings.onboardedAt).toBeDefined();
    await c1.flush();
    expect((await s1.get<Settings>(STORAGE_KEYS.settings))!.onboardedAt).toBe(c1.getState().settings.onboardedAt);

    // sessions only
    const { core: c2 } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.sessions]: [oldSession] }) });
    expect(c2.getState().settings.onboardedAt).toBeDefined();

    // bodyweight only (e.g. a logged weight before any settings write)
    const { core: c3 } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.bodyweight]: [{ date: '2026-09-01', weight: 190, unit: 'lb' }] }) });
    expect(c3.getState().settings.onboardedAt).toBeDefined();

    // a stored goal type is kept; an existing onboardedAt is never overwritten
    const { core: c4 } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.settings]: { goal: { type: 'general-strength' } } }) });
    expect(c4.getState().settings.goal.type).toBe('general-strength');
    const at = '2026-01-01T00:00:00.000Z';
    const { core: c5 } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.settings]: { onboardedAt: at, profile: { name: 'Karyn' } } }) });
    expect(c5.getState().settings).toMatchObject({ onboardedAt: at, profile: { name: 'Karyn' } });
  });

  it('import migration: files without onboardedAt are marked onboarded (goal fat-loss if missing); files with it keep it', async () => {
    const { core: src } = await makeCore();
    runSession(src, 'push-a', { [BENCH]: sets(4, 135, 8) });
    const file = JSON.parse(src.exportJSON());
    expect(file.settings.onboardedAt).toBeUndefined();
    delete file.settings.goal;
    const { core: dst } = await makeCore();
    expect(dst.getState().settings.onboardedAt).toBeUndefined();
    expect((await dst.importJSON(file)).ok).toBe(true);
    expect(dst.getState().settings.onboardedAt).toBeDefined();
    expect(dst.getState().settings.goal.type).toBe('fat-loss');

    file.settings.onboardedAt = '2026-02-02T00:00:00.000Z';
    file.settings.goal = { type: 'build-muscle' };
    file.settings.profile = { name: 'Karyn', experience: 'beginner' };
    await dst.importJSON(file);
    expect(dst.getState().settings).toMatchObject({ onboardedAt: '2026-02-02T00:00:00.000Z', goal: { type: 'build-muscle' }, profile: { name: 'Karyn', experience: 'beginner' } });
  });

  it('goal type switches between cut and base progression rules and deload cadence', async () => {
    let t = Date.parse('2026-09-01T10:00:00Z');
    const now = () => new Date((t += 60_000));
    const { core } = await makeCore({ now });
    core.completeOnboarding({ name: 'Samir', goal: 'fat-loss', experience: 'advanced', unit: 'lb', schedule: 6 });
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 5], [135, 4], [135, 4]] });
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 4], [135, 4], [135, 3]] });
    expect(getProgression(core.getState(), BENCH, T)).toMatchObject({ rules: 'cut', action: 'hold' }); // cut: 3-session stall
    expect(core.getDeloadStatus().dueAfterWeeks).toBe(5);

    for (const goal of ['build-muscle', 'general-strength', 'something-else'] as const) {
      core.updateSettings({ goal: { type: goal } });
      expect(getProgression(core.getState(), BENCH, T)).toMatchObject({ rules: 'base', action: 'reduceLoad', newWeight: 120 }); // base: 2 / −10%
      expect(core.getDeloadStatus().dueAfterWeeks).toBe(6);
    }

    // maintain counts as success only on the cut
    const { core: m } = await makeCore();
    runSession(m, 'push-a', { [BENCH]: [[135, 6], [135, 4], [135, 4], [135, 4]] });
    runSession(m, 'push-a', { [BENCH]: [[135, 6], [135, 4], [135, 4], [135, 4]] });
    m.completeOnboarding({ name: 'K', goal: 'fat-loss', experience: 'beginner', unit: 'lb', schedule: 6 });
    expect(getProgression(m.getState(), BENCH, T)!.action).toBe('hold');
    m.updateProfile({ experience: 'advanced' }); // experience: no logic effect
    expect(getProgression(m.getState(), BENCH, T)!.action).toBe('hold');
    m.updateSettings({ goal: { type: 'build-muscle' } });
    expect(getProgression(m.getState(), BENCH, T)!.action).toBe('reduceLoad');

    // deload due after 5 weeks on fat-loss, 6 otherwise
    t += 35 * DAY;
    core.updateSettings({ goal: { type: 'fat-loss' } });
    expect(core.getDeloadStatus()).toMatchObject({ due: true, weeksSinceLast: 5 });
    core.updateSettings({ goal: { type: 'build-muscle' } });
    expect(core.getDeloadStatus()).toMatchObject({ due: false, weeksSinceLast: 5 });
  });

  it('bodyweight trend verdict only for fat-loss (other goals: goalApplies false, neutral status)', () => {
    const entries = ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10'].map((date, i) => ({ date, weight: 200 - i * 1.5, unit: 'lb' as const }));
    const goal = { type: 'fat-loss', targetLossPctBodyweightPerWeek: { min: 0.5, max: 1 } };
    const fl = bodyweightTrend(entries, 'lb', goal);
    expect(fl.goalApplies).toBe(true);
    expect(['tooSlow', 'onTrack', 'tooFast']).toContain(fl.status);
    const bm = bodyweightTrend(entries, 'lb', { ...goal, type: 'build-muscle' });
    expect(bm).toMatchObject({ goalApplies: false, status: 'insufficientData' });
    expect(bm.weeklyRate).toEqual(fl.weeklyRate); // rate still computed
  });
});

describe('onboarding hooks', () => {
  it('useOnboarding / useSettings expose onboarded, profile, completeOnboarding, updateProfile', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => ({ o: useOnboarding(), s: useSettings() }), { wrapper: wrap(core) });
    expect(result.current.o).toMatchObject({ status: 'ready', onboarded: false, profile: { name: '' } });
    expect(result.current.s.onboarded).toBe(false);
    act(() => {
      result.current.o.completeOnboarding({ name: 'Karyn', goal: 'general-strength', experience: 'beginner', unit: 'kg', schedule: 3 });
    });
    expect(result.current.o.onboarded).toBe(true);
    expect(result.current.o.onboardedAt).toBeDefined();
    expect(result.current.s.profile).toEqual({ name: 'Karyn', experience: 'beginner' });
    expect(result.current.s.settings).toMatchObject({ unit: 'kg', schedule: 3, goal: { type: 'general-strength' } });
    act(() => {
      result.current.s.updateProfile({ name: 'Kay' });
    });
    expect(result.current.o.profile.name).toBe('Kay');
  });
});
