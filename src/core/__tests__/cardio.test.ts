import { describe, expect, it } from 'vitest';
import { finisherOffer, getCardioHistory, getExerciseSeries, getPRs, getProgression, getToday } from '../logic';
import type { CardioEntry } from '../types';
import { makeCore, runSession, sets } from './helpers';

const warm = (core: Awaited<ReturnType<typeof makeCore>>['core']) => core.getState().active!.entries[0] as CardioEntry;
const fin = (core: Awaited<ReturnType<typeof makeCore>>['core']) =>
  core.getState().active!.entries.find((e) => e.kind === 'cardio' && e.role === 'finisher') as CardioEntry | undefined;

describe('cardio warm-up', () => {
  it('is always entry 0 (default incline-treadmill, 10 min) on every day; disabled → no warm-up', async () => {
    const { core } = await makeCore();
    for (const day of ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b']) {
      core.startSession(day);
      expect(warm(core)).toMatchObject({ kind: 'cardio', role: 'warmup', slotId: 'cardio-warmup', exerciseId: 'incline-treadmill', durationMin: 10, done: false });
      expect(core.getState().active!.entries.slice(1).every((e) => e.kind === 'strength')).toBe(true);
      core.discardSession();
    }
    core.updateSettings({ cardio: { enabled: false } });
    expect(getToday(core.getState())!.slots[0].kind).toBe('strength');
    core.startSession();
    expect(core.getState().active!.entries[0].kind).toBe('strength');
  });

  it('remembers the last warm-up pick; a permanent swap overrides it; undone warm-ups are not remembered', async () => {
    const { core } = await makeCore();
    core.startSession();
    core.swapExercise('cardio-warmup', 'peloton', 'session');
    core.logCardio('warmup', { durationMin: 12, done: true, metrics: { output: 90 } });
    core.finishSession();
    const t = getToday(core.getState())!;
    expect(t.slots[0]).toMatchObject({ kind: 'cardio', exercise: { id: 'peloton' }, durationMin: 12, swapped: true, metrics: { output: 90 } });

    core.startSession();
    expect(warm(core)).toMatchObject({ exerciseId: 'peloton', durationMin: 12, metrics: { output: 90 } });
    core.swapExercise('cardio-warmup', 'flat-treadmill', 'session');
    expect(warm(core)).toMatchObject({ exerciseId: 'flat-treadmill', durationMin: 10 }); // its own default, no metrics
    expect(warm(core).metrics).toBeUndefined();
    core.finishSession(); // warm-up not done → not remembered
    expect(getToday(core.getState())!.slots[0].exercise.id).toBe('peloton');

    core.swapExercise('cardio-warmup', 'incline-treadmill', 'permanent');
    expect(core.getState().settings.permanentSwaps).toEqual({}); // = programmed default → mapping cleared
    core.swapExercise('cardio-warmup', 'flat-treadmill', 'permanent');
    expect(getToday(core.getState(), 'legs-b')!.slots[0].exercise.id).toBe('flat-treadmill');
  });

  it('prefills duration/metrics from the last SAME-ROLE cardio', async () => {
    const { core } = await makeCore();
    core.startSession();
    core.logCardio('warmup', { durationMin: 8, done: true, metrics: { incline: 12, speed: 3.2 } });
    core.addFinisher();
    core.logCardio('finisher', { durationMin: 18, done: true, metrics: { incline: 4, speed: 3.6 } });
    core.finishSession();
    core.startSession();
    expect(warm(core)).toMatchObject({ durationMin: 8, metrics: { incline: 12, speed: 3.2 } });
    core.addFinisher();
    expect(fin(core)).toMatchObject({ durationMin: 18, metrics: { incline: 4, speed: 3.6 } });
  });

  it('logCardio by role or index; throws when the entry is absent', async () => {
    const { core } = await makeCore();
    expect(() => core.logCardio('warmup', { done: true })).toThrow(/no active session/);
    core.startSession();
    core.logCardio(0, { done: true });
    expect(warm(core).done).toBe(true);
    expect(warm(core).timestamp).toBeDefined();
    core.logCardio('warmup', { done: false });
    expect(warm(core).timestamp).toBeUndefined();
    core.logCardio('warmup', { metrics: { incline: 5 } });
    core.logCardio('warmup', { metrics: { speed: 3 } });
    expect(warm(core).metrics).toEqual({ incline: 5, speed: 3 });
    expect(() => core.logCardio('finisher', { done: true })).toThrow(/no finisher/);
    expect(() => core.logCardio(1, { done: true })).toThrow();
    expect(() => core.logSet(0, 0, { done: true })).toThrow(/cardio/);
  });
});

describe('cardio finisher', () => {
  it('optional: offered, add/remove, idempotent add, clamp 10–20, swap keeps duration', async () => {
    const { core } = await makeCore();
    expect(getToday(core.getState())!.finisher).toMatchObject({ exercise: { id: 'incline-treadmill' }, durationMin: 15, minDurationMin: 10, maxDurationMin: 20, intensity: 'zone-2', autoAdd: false });
    expect(getToday(core.getState())!.finisher!.effortNote).toMatch(/Zone 2/);
    core.startSession();
    expect(fin(core)).toBeUndefined();
    const idx = core.addFinisher();
    expect(idx).toBe(core.getState().active!.entries.length - 1);
    expect(core.addFinisher()).toBe(idx);
    expect(fin(core)).toMatchObject({ role: 'finisher', slotId: 'cardio-finisher', exerciseId: 'incline-treadmill', durationMin: 15 });
    core.logCardio('finisher', { durationMin: 45 });
    expect(fin(core)!.durationMin).toBe(20);
    core.logCardio('finisher', { durationMin: 3 });
    expect(fin(core)!.durationMin).toBe(10);
    core.swapExercise('cardio-finisher', 'peloton', 'session');
    expect(fin(core)).toMatchObject({ exerciseId: 'peloton', durationMin: 10 });
    core.removeFinisher();
    expect(fin(core)).toBeUndefined();
    core.removeFinisher(); // no-op
    expect(core.addFinisher({ exerciseId: 'flat-treadmill', durationMin: 25 })).toBeGreaterThan(0);
    expect(fin(core)).toMatchObject({ exerciseId: 'flat-treadmill', durationMin: 20 });
    expect(() => core.swapExercise('cardio-finisher', 'barbell-bench-press', 'session')).toThrow(/kind mismatch/);
  });

  it('prefills from the last finisher; permanent swap; autoAdd setting', async () => {
    const { core } = await makeCore();
    core.startSession();
    core.addFinisher({ exerciseId: 'peloton' });
    core.logCardio('finisher', { durationMin: 17, done: true });
    core.finishSession();
    expect(finisherOffer(core.getState())).toMatchObject({ exercise: { id: 'peloton' }, durationMin: 17, swapped: true, last: { role: 'finisher', durationMin: 17 } });
    core.swapExercise('cardio-finisher', 'flat-treadmill', 'permanent');
    expect(finisherOffer(core.getState())!.exercise.id).toBe('flat-treadmill');
    core.updateSettings({ finisher: { autoAdd: true } });
    core.startSession();
    expect(fin(core)).toMatchObject({ exerciseId: 'flat-treadmill', durationMin: 17 });
  });

  it('cardio is excluded from PRs, e1RM, volume, series and progression; getCardioHistory lists it', async () => {
    const { core } = await makeCore();
    core.startSession();
    core.logCardio('warmup', { done: true });
    core.addFinisher();
    core.logCardio('finisher', { done: true });
    core.logSet(1, 0, { weight: 135, reps: 5, done: true });
    const r1 = core.finishSession()!;
    expect(r1.prs).toEqual([]);
    runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 140, 5) });
    const s = core.getState();
    expect(getExerciseSeries(s, 'incline-treadmill')).toEqual([]);
    expect(getPRs(s, 'incline-treadmill')).toEqual([]);
    expect(getProgression(s, 'incline-treadmill')).toBeNull();
    const h = getCardioHistory(s);
    expect(h.map((x) => x.role)).toEqual(['warmup', 'finisher']); // 2nd session's warm-up not done
    expect(h[0]).toMatchObject({ exerciseId: 'incline-treadmill', durationMin: 10 });
    expect(getCardioHistory(s, { role: 'finisher' })).toEqual([expect.objectContaining({ durationMin: 15 })]);
    expect(getCardioHistory(s, { exerciseId: 'peloton' })).toEqual([]);
  });
});
