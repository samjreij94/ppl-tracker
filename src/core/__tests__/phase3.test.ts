/**
 * Phase 3: suggested-weight prefill, deload protocol, per-session PRs, cardio prescriptions.
 */
import { describe, expect, it } from 'vitest';
import { deloadDue, deloadSets, finisherPrescription, getActiveEntries, getProgression, getSessions, getToday, prefillSets } from '../logic';
import { createMemoryStorage, STORAGE_KEYS } from '../storage';
import { validateExport } from '../transfer';
import type { StrengthEntry, WorkoutSession } from '../types';
import { FINISHER_SLOT_ID } from '../types';
import { entryIdx, makeCore, runSession, SEED, sets } from './helpers';

const BENCH = 'barbell-bench-press';
const OHP = 'barbell-overhead-press';
const INCLINE_DB = 'incline-dumbbell-press';
const DAY = 86_400_000;
type CoreT = Awaited<ReturnType<typeof makeCore>>['core'];

const entry = (core: CoreT, id: string) => core.getState().active!.entries[entryIdx(core, id)] as StrengthEntry;
const ws = (core: CoreT, id: string) => entry(core, id).sets.map((s) => [s.weight, s.reps]);
const strengthSlot = (core: CoreT, id: string, dayId = 'push-a') => {
  const t = getToday(core.getState(), dayId)!.slots.find((s) => s.kind === 'strength' && s.exercise.id === id);
  if (!t || t.kind !== 'strength') throw new Error('slot not found');
  return t;
};

/** Controllable clock: each call advances 1 minute; `advanceDays` jumps forward. */
function manualClock(start = '2026-09-01T10:00:00Z') {
  let t = Date.parse(start);
  return {
    now: () => new Date((t += 60_000)),
    advanceDays: (d: number) => {
      t += d * DAY;
    },
  };
}
/** Base (non-cut) rules: any goal type other than fat-loss. */
const useBaseRules = (core: CoreT) => core.updateSettings({ goal: { type: 'maintenance' } });

describe('prefill applies the progression hint', () => {
  it("'increase' → working sets get hint.newWeight, reps reset to repRange.min", async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    expect(strengthSlot(core, BENCH).progression).toMatchObject({ action: 'increase', newWeight: 140, targetReps: 5 });
    core.startSession('push-a');
    expect(ws(core, BENCH)).toEqual(sets(4, 140, 5));
  });

  it("'increase' keeps lighter back-off sets at their last weight/reps", async () => {
    const { core } = await makeCore();
    // incline DB slot: 2 sets 8-12; a third, lighter back-off set
    runSession(core, 'push-a', { [INCLINE_DB]: [[50, 12], [50, 12], [40, 12]] });
    const out = prefillSets(core.getState(), INCLINE_DB, { sets: 3, repRange: { min: 8, max: 12 } });
    expect(out.map((s) => [s.weight, s.reps, s.done])).toEqual([
      [55, 8, false],
      [55, 8, false],
      [40, 12, false],
    ]);
  });

  it("'reduceLoad' → working sets get the reduced weight × repRange.min", async () => {
    const { core } = await makeCore();
    useBaseRules(core);
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 5], [135, 4], [135, 4]] });
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 4], [135, 4], [135, 3]] });
    expect(strengthSlot(core, BENCH).progression).toMatchObject({ action: 'reduceLoad', newWeight: 120 });
    core.startSession('push-a');
    expect(ws(core, BENCH)).toEqual(sets(4, 120, 5));
  });

  it("'addReps' keeps last weight and reps", async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [135, 7], [135, 6], [135, 6]] });
    expect(strengthSlot(core, BENCH).progression.action).toBe('addReps');
    core.startSession('push-a');
    expect(ws(core, BENCH)).toEqual([[135, 8], [135, 7], [135, 6], [135, 6]]);
  });

  it("'hold' keeps last weight and reps", async () => {
    const { core } = await makeCore();
    useBaseRules(core);
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 5], [135, 4], [135, 4]] });
    expect(strengthSlot(core, BENCH).progression.action).toBe('hold');
    core.startSession('push-a');
    expect(ws(core, BENCH)).toEqual([[135, 6], [135, 5], [135, 4], [135, 4]]);
  });
});

describe('deload protocol', () => {
  it('seed parsing + defaults', async () => {
    const { core } = await makeCore();
    const st = core.getState();
    expect(st.settings.deload).toEqual({ active: false, weekLength: 7 });
    expect(st.progressionRules.deload).toMatchObject({ setReductionPct: 50, loadReductionPct: 10, frequencyWeeks: { min: 6, max: 8 }, targetRir: '3-4' });
    expect(st.progressionRules.cut?.deloadFrequencyWeeks).toEqual({ min: 5, max: 6 });
    expect([1, 2, 3, 4, 5].map((n) => deloadSets(n))).toEqual([1, 1, 2, 2, 3]);
  });

  it('while active: half sets (floor 1), −10% snapped weight, deload hint, flagged session, PRs still detected', async () => {
    const c = manualClock();
    const { core } = await makeCore({ now: c.now });
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8), [INCLINE_DB]: sets(2, 50, 10) });
    const status = core.startDeload();
    expect(status).toMatchObject({ active: true, due: false, daysLeft: 7 });
    expect(core.getState().settings.deload).toMatchObject({ active: true, weekLength: 7 });

    const bench = strengthSlot(core, BENCH);
    expect(bench.plannedSets).toBe(2);
    expect(bench.progression).toMatchObject({ action: 'deload', newWeight: 120, newSets: 2, targetReps: 5 });
    expect(bench.progression.message).toContain('deload week');
    expect(strengthSlot(core, INCLINE_DB).plannedSets).toBe(1); // 2 sets → ceil(1) = 1
    expect(strengthSlot(core, INCLINE_DB).progression.newWeight).toBe(45); // 50 × 0.9 = 45
    expect(getToday(core.getState(), 'push-a', c.now())!.deload.active).toBe(true);

    const s = core.startSession('push-a');
    expect(s.deload).toBe(true);
    expect(ws(core, BENCH)).toEqual([[120, 5], [120, 5]]);
    expect(entry(core, BENCH).target.sets).toBe(2);
    expect(ws(core, INCLINE_DB)).toEqual([[45, 8]]);
    // a PR during a deload is still detected
    const { prs } = core.logSet(entryIdx(core, BENCH), 0, { weight: 145, reps: 5, done: true });
    expect(prs.map((p) => p.kind)).toContain('topSet');
    const fin = core.finishSession()!;
    expect(fin.session.deload).toBe(true);
    expect(fin.session.prs?.some((p) => p.kind === 'topSet' && p.value === 145)).toBe(true);
  });

  it('deload sessions are excluded from progression: after the deload the hint/prefill resume from pre-deload work', async () => {
    const c = manualClock();
    const { core } = await makeCore({ now: c.now });
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    core.startDeload();
    runSession(core, 'push-a', { [BENCH]: sets(2, 120, 5) });
    core.endDeload();
    expect(core.getState().settings.deload.active).toBe(false);
    expect(core.getState().settings.deload.lastEndedAt).toBeDefined();
    const t = strengthSlot(core, BENCH);
    expect(t.last!.sets[0].weight).toBe(120); // `last` is factual (the deload session)
    expect(t.progression).toMatchObject({ action: 'increase', newWeight: 140 });
    core.startSession('push-a');
    expect(ws(core, BENCH)).toEqual(sets(4, 140, 5));
  });

  it('deload sessions do not count toward a stall (no reduceLoad)', async () => {
    const { core } = await makeCore();
    useBaseRules(core);
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 5], [135, 4], [135, 4]] });
    expect(strengthSlot(core, BENCH).progression.action).toBe('hold');
    core.startDeload();
    runSession(core, 'push-a', { [BENCH]: [[135, 3], [135, 3]] }); // a "stall" inside the deload
    core.endDeload();
    expect(strengthSlot(core, BENCH).progression.action).toBe('hold');
    // the same session outside a deload would trigger reduceLoad
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 4], [135, 4], [135, 3]] });
    expect(strengthSlot(core, BENCH).progression.action).toBe('reduceLoad');
  });

  it('auto-ends after weekLength days (on startSession and on init)', async () => {
    const c = manualClock();
    const storage = createMemoryStorage();
    const { core } = await makeCore({ storage, now: c.now });
    core.startDeload({ weekLength: 5 });
    const startedAt = core.getState().settings.deload.startedAt!;
    c.advanceDays(4);
    expect(core.getDeloadStatus()).toMatchObject({ active: true, daysLeft: 1 });
    expect(core.startSession('push-a').deload).toBe(true);
    core.discardSession();
    c.advanceDays(1);
    const s = core.startSession('push-a');
    expect(s.deload).toBeUndefined();
    expect(core.getState().settings.deload).toEqual({ active: false, weekLength: 5, lastEndedAt: new Date(Date.parse(startedAt) + 5 * DAY).toISOString() });
    core.discardSession();

    // init(): a fresh core over the same storage auto-ends an expired deload
    core.startDeload();
    await core.flush();
    c.advanceDays(8);
    const { core: core2 } = await makeCore({ storage, now: c.now });
    expect(core2.getState().settings.deload.active).toBe(false);
    expect(core2.getState().settings.deload.lastEndedAt).toBeDefined();
  });

  it('deloadDue: 5 weeks under the fat-loss cut (deloadNote), 6 weeks otherwise; resets after a deload', async () => {
    const c = manualClock();
    const { core } = await makeCore({ now: c.now });
    expect(core.getDeloadStatus()).toMatchObject({ due: false, weeksSinceLast: null, reason: null, dueAfterWeeks: 5 });
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    c.advanceDays(28);
    expect(core.getDeloadStatus()).toMatchObject({ due: false, weeksSinceLast: 4 });
    c.advanceDays(7);
    expect(core.getDeloadStatus()).toMatchObject({ due: true, weeksSinceLast: 5, reason: '5 weeks since you started' });
    expect(getToday(core.getState(), undefined, c.now())!.deload.due).toBe(true);

    useBaseRules(core);
    expect(core.getDeloadStatus()).toMatchObject({ due: false, weeksSinceLast: 5, dueAfterWeeks: 6 });
    c.advanceDays(7);
    expect(core.getDeloadStatus()).toMatchObject({ due: true, weeksSinceLast: 6 });

    core.startDeload();
    expect(core.getDeloadStatus()).toMatchObject({ active: true, due: false });
    core.endDeload();
    expect(core.getDeloadStatus()).toMatchObject({ active: false, due: false, weeksSinceLast: 0 });
    // weeks since the last deload, and only once training resumes
    c.advanceDays(43);
    expect(core.getDeloadStatus().due).toBe(false); // no training since the deload
    runSession(core, 'push-a', { [BENCH]: sets(4, 140, 8) });
    expect(core.getDeloadStatus()).toMatchObject({ due: true, weeksSinceLast: 6, reason: '6 weeks since last deload' });
  });

  it('deloadDue early trigger: 3+ exercises stalled within 2 weeks', async () => {
    const c = manualClock();
    const { core } = await makeCore({ now: c.now });
    useBaseRules(core);
    const stall = { [BENCH]: sets(4, 135, 4), [OHP]: sets(3, 95, 4), [INCLINE_DB]: sets(2, 50, 6) };
    runSession(core, 'push-a', stall);
    expect(core.getDeloadStatus().due).toBe(false); // k = 1 → hold
    c.advanceDays(3);
    runSession(core, 'push-a', stall);
    expect(core.getDeloadStatus()).toMatchObject({ due: true, reason: '3 exercises stalled in the last 2 weeks' });
    c.advanceDays(15);
    expect(core.getDeloadStatus().due).toBe(false); // stalls older than 2 weeks no longer count
  });

  it('deload settings survive export/import; pure deloadDue matches the store', async () => {
    const c = manualClock();
    const { core } = await makeCore({ now: c.now });
    core.startDeload({ weekLength: 6 });
    const { core: other } = await makeCore({ now: c.now });
    await other.importJSON(core.exportJSON());
    expect(other.getState().settings.deload).toEqual(core.getState().settings.deload);
    const at = new Date(Date.parse(core.getState().settings.deload.startedAt!) + DAY);
    expect(deloadDue(other.getState(), at)).toMatchObject({ active: true, daysLeft: 5 });
  });
});

describe('per-session PRs', () => {
  it('finishSession persists session.prs; getSessions exposes it; export/import round-trips it', async () => {
    const { core, storage } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    expect(getSessions(core.getState())[0].prs).toEqual([]); // first-ever session: no PRs
    const fin = runSession(core, 'push-a', { [BENCH]: [[140, 8], [140, 8], [140, 8], [140, 8]] })!;
    expect(fin.prs.length).toBeGreaterThan(0);
    expect(fin.session.prs).toEqual(fin.prs);
    expect(fin.prs.every((p) => p.sessionId === fin.session.id)).toBe(true);
    const latest = getSessions(core.getState())[0];
    expect(latest.prs).toEqual(fin.prs);
    await core.flush();
    const stored = (await storage.get<WorkoutSession[]>(STORAGE_KEYS.sessions))!;
    expect(stored[stored.length - 1].prs).toEqual(fin.prs);

    const { core: other } = await makeCore();
    const res = await other.importJSON(core.exportJSON());
    expect(res.ok).toBe(true);
    expect(getSessions(other.getState())[0].prs).toEqual(fin.prs);
  });

  it('old sessions without prs still load; malformed prs are rejected on import', async () => {
    const old: WorkoutSession = {
      id: 'old-1',
      programId: 'ppl',
      dayId: 'push-a',
      startedAt: '2026-08-01T10:00:00Z',
      finishedAt: '2026-08-01T11:00:00Z',
      unit: 'lb',
      entries: [{ kind: 'strength', slotId: 'push-a-1', exerciseId: BENCH, sets: [{ weight: 135, reps: 8, done: true }], target: { sets: 4, repRange: { min: 5, max: 8 } }, restSec: 180 }],
    };
    const { core } = await makeCore({ storage: createMemoryStorage({ [STORAGE_KEYS.sessions]: [old] }) });
    expect(getSessions(core.getState())[0].prs).toBeUndefined();
    expect(strengthSlot(core, BENCH).last!.sets[0].weight).toBe(135);
    const file = JSON.parse(core.exportJSON());
    file.sessions[0].prs = 'nope';
    expect(validateExport(file).errors.join()).toContain('prs must be an array');
    file.sessions[0].prs = [];
    file.sessions[0].deload = 'yes';
    expect(validateExport(file).errors.join()).toContain('deload must be a boolean');
  });
});

describe('cardio prescriptions', () => {
  it('warm-up uses the exercise defaultPrescription; finisher uses its own 15-min text', async () => {
    const { core } = await makeCore();
    const today = getToday(core.getState(), 'push-a')!;
    const warm = today.slots[0];
    expect(warm.kind === 'cardio' && warm.prescription).toBe(
      (SEED.seed!.exercises.find((e) => e.id === 'incline-treadmill') as { defaultPrescription?: string }).defaultPrescription,
    );
    expect(warm.kind === 'cardio' && warm.prescription).toMatch(/^10 min walk/);
    expect(today.finisher!.prescription).toBe(
      '15 min Incline Treadmill Walk, easy zone 2: conversational pace, you can speak in full sentences (RPE 3-4)',
    );
    expect(today.finisher!.prescription).not.toContain('10 min');
  });

  it('finisher prescription follows the chosen exercise and duration (also on active entries)', async () => {
    const { core } = await makeCore();
    core.swapExercise(FINISHER_SLOT_ID, 'peloton', 'permanent');
    expect(getToday(core.getState(), 'push-a')!.finisher!.prescription).toMatch(/^15 min Peloton \/ Stationary Bike, easy zone 2/);
    core.startSession('push-a');
    core.addFinisher({ durationMin: 20 });
    const views = getActiveEntries(core.getState());
    expect(views.find((v) => v.entry.kind === 'cardio' && v.entry.role === 'finisher')!.prescription).toMatch(/^20 min Peloton/);
    expect(views[0].prescription).toMatch(/^10 min/); // warm-up
    expect(views.find((v) => v.entry.kind === 'strength')!.prescription).toBeUndefined();
  });

  it('finisherPrescription: short notes are used whole; no note → just duration + intensity', () => {
    expect(finisherPrescription({ intensity: 'zone-2', effortNote: 'Easy, nose breathing.' }, { name: 'Bike' }, 12)).toBe('12 min Bike, easy zone 2: Easy, nose breathing');
    expect(finisherPrescription({ intensity: 'zone-2' }, { name: 'Bike' }, 15)).toBe('15 min Bike, easy zone 2');
    expect(finisherPrescription({ intensity: 'tempo' }, { name: 'Row' }, 10)).toBe('10 min Row, tempo');
  });
});

describe('getProgression (pure) honours settings.deload', () => {
  it("returns a 'deload' hint without history too", async () => {
    const { core } = await makeCore();
    core.startDeload();
    expect(getProgression(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })).toMatchObject({ action: 'deload', newSets: 2, targetReps: 5 });
    expect(getProgression(core.getState(), BENCH)!.newWeight).toBeUndefined();
  });
});
