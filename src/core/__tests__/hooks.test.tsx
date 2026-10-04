import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  CoreProvider,
  useBodyweight,
  useCore,
  useCoreState,
  useDataTransfer,
  useDeload,
  useExerciseHistory,
  useExercises,
  useSettings,
  useToday,
  useWorkout,
  type Core,
} from '../index';
import { createMemoryStorage } from '../storage';
import { createCore } from '../store';
import { clock, makeCore, runSession, SEED, sets } from './helpers';

const wrap = (core: Core) =>
  function Wrapper({ children }: { children?: ReactNode }) {
    return <CoreProvider core={core}>{children}</CoreProvider>;
  };

describe('hooks', () => {
  it('useCore / useCoreState: provider core, loading → ready', async () => {
    const core = createCore({ storage: createMemoryStorage(), seed: SEED, now: clock() });
    const { result } = renderHook(() => ({ core: useCore(), state: useCoreState() }), { wrapper: wrap(core) });
    expect(result.current.core).toBe(core);
    expect(result.current.state.status).toBe('loading');
    await act(() => core.init());
    expect(result.current.state.status).toBe('ready');
  });

  it('useToday: next day, finisher offer, days, startSession', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => useToday(), { wrapper: wrap(core) });
    expect(result.current.status).toBe('ready');
    expect(result.current.today).toMatchObject({ day: { id: 'push-a', name: 'Push A' }, isNext: true });
    expect(result.current.today!.slots[0].kind).toBe('cardio');
    expect(result.current.today!.finisher!.durationMin).toBe(15);
    expect(result.current.days).toHaveLength(6);
    act(() => void result.current.startSession());
    expect(result.current.activeSession?.dayId).toBe('push-a');
    const preview = renderHook(() => useToday('legs-b'), { wrapper: wrap(core) });
    expect(preview.result.current.today).toMatchObject({ day: { id: 'legs-b' }, isNext: false });
  });

  it('useWorkout: session, entries, logSet PRs, sets, cardio, finisher, swaps, finish', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 135, 8) });
    const { result } = renderHook(() => useWorkout(), { wrapper: wrap(core) });
    expect(result.current.session).toBeNull();
    act(() => void result.current.startSession('push-a'));
    expect(result.current.entries[1]).toMatchObject({ exercise: { id: 'barbell-bench-press' }, swapped: false, progression: { action: 'increase' } });
    let prs: unknown[] = [];
    act(() => void (prs = result.current.logSet(1, 0, { weight: 140, reps: 8, done: true }).prs));
    expect(prs.length).toBeGreaterThan(0);
    act(() => void result.current.addSet(1));
    expect(result.current.entries[1].entry.kind === 'strength' && result.current.entries[1].entry.sets).toHaveLength(5);
    act(() => result.current.removeSet(1, 4));
    act(() => result.current.logCardio('warmup', { done: true }));
    expect(result.current.hasFinisher).toBe(false);
    expect(result.current.finisher?.exercise.id).toBe('incline-treadmill');
    act(() => void result.current.addFinisher());
    expect(result.current.hasFinisher).toBe(true);
    act(() => result.current.removeFinisher());
    expect(result.current.hasFinisher).toBe(false);
    const swaps = result.current.getSwaps(1);
    expect(swaps.map((e) => e.id)).toContain('dumbbell-bench-press');
    act(() => result.current.swapExercise('push-a-2', 'arnold-press', 'session'));
    expect(result.current.entries[2]).toMatchObject({ exercise: { id: 'arnold-press' }, swapped: true });
    expect(result.current.unit).toBe('lb');
    let done: ReturnType<Core['finishSession']> = null;
    act(() => void (done = result.current.finishSession()));
    expect(done!.session.finishedAt).toBeDefined();
    expect(result.current.session).toBeNull();
    act(() => void result.current.startSession());
    act(() => result.current.discardSession());
    expect(result.current.session).toBeNull();
  });

  it('useExerciseHistory: series, prs, sessions, last; cardio history for cardio ids', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 135, 8) });
    const { result } = renderHook(() => useExerciseHistory('barbell-bench-press'), { wrapper: wrap(core) });
    expect(result.current.exercise?.name).toBe('Barbell Bench Press');
    expect(result.current.series).toHaveLength(1);
    expect(result.current.prs.length).toBeGreaterThan(0);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.last!.sets).toHaveLength(4);
    expect(result.current.cardio).toEqual([]);
    act(() => void runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 140, 8) }));
    expect(result.current.series).toHaveLength(2);
    const cardio = renderHook(() => useExerciseHistory('incline-treadmill'), { wrapper: wrap(core) });
    expect(cardio.result.current.series).toEqual([]);
  });

  it('useExercises: library, groups, swaps, custom add/remove, permanent swap', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => useExercises(), { wrapper: wrap(core) });
    expect(result.current.exercises).toHaveLength(92);
    expect(Object.keys(result.current.groups)).toHaveLength(19);
    let id = '';
    act(() => void (id = result.current.addCustomExercise({ name: 'Floor Press', substitutionGroup: 'horizontal-press' }).id));
    expect(result.current.customExercises.map((e) => e.id)).toEqual([id]);
    expect(result.current.byId[id]).toBeDefined();
    expect(result.current.getSwaps('barbell-bench-press').map((e) => e.id)).toContain(id);
    act(() => result.current.swapExercise('push-a-1', id, 'permanent'));
    expect(core.getState().settings.permanentSwaps['push-a-1']).toBe(id);
    act(() => result.current.clearPermanentSwap('push-a-1'));
    act(() => result.current.removeCustomExercise(id));
    expect(result.current.exercises).toHaveLength(92);
  });

  it('useSettings: settings, seed configs, updateSettings, unit helpers', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => useSettings(), { wrapper: wrap(core) });
    expect(result.current.settings.unit).toBe('lb');
    expect(result.current.goal.type).toBe('fat-loss');
    expect(result.current.finisherConfig).toMatchObject({ minDurationMin: 10, maxDurationMin: 20 });
    expect(result.current.activity.dailyStepTarget).toBe(8000);
    expect(result.current.bodyweightLog.trendWindowDays).toBe(7);
    act(() => void result.current.updateSettings({ unit: 'kg', schedule: 3 }));
    expect(result.current.settings).toMatchObject({ unit: 'kg', schedule: 3 });
    expect(result.current.convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.46, 2);
    expect(result.current.roundToIncrement(61.2, 2.5)).toBe(60);
    act(() => result.current.clearPermanentSwap('push-a-1'));
  });

  it('useBodyweight: entries newest first, trend, log/delete', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => useBodyweight(), { wrapper: wrap(core) });
    expect(result.current.trend.status).toBe('insufficientData');
    act(() => {
      for (let i = 1; i <= 14; i++) result.current.logBodyweight({ date: `2026-09-${String(i).padStart(2, '0')}`, weight: 200 - i * 0.2 });
    });
    expect(result.current.entries[0].date).toBe('2026-09-14');
    expect(result.current.trend.status).toBe('onTrack');
    expect(result.current.config.trendWindowDays).toBe(7);
    expect(result.current.goal.targetLossPctBodyweightPerWeek).toEqual({ min: 0.5, max: 1 });
    act(() => result.current.deleteBodyweight('2026-09-14'));
    expect(result.current.entries).toHaveLength(13);
  });

  it('useDataTransfer: export, file name, import (async)', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { 'barbell-bench-press': sets(4, 135, 8) });
    const { result } = renderHook(() => useDataTransfer(), { wrapper: wrap(core) });
    const json = result.current.exportJSON();
    expect(result.current.exportFileName()).toMatch(/^ppl-tracker-\d{4}-\d{2}-\d{2}\.json$/);
    const { core: other } = await makeCore();
    const r2 = renderHook(() => ({ dt: useDataTransfer(), state: useCoreState() }), { wrapper: wrap(other) });
    let res: Awaited<ReturnType<Core['importJSON']>> | undefined;
    await act(async () => {
      res = await r2.result.current.dt.importJSON(json);
    });
    expect(res!.ok).toBe(true);
    await waitFor(() => expect(r2.result.current.state.sessions).toHaveLength(1));
  });

  it('useDeload / useSettings: deload status + start/end actions', async () => {
    const { core } = await makeCore();
    const { result } = renderHook(() => ({ d: useDeload(), s: useSettings() }), { wrapper: wrap(core) });
    expect(result.current.d.status).toMatchObject({ active: false, due: false });
    expect(result.current.s.deload.active).toBe(false);
    act(() => {
      result.current.d.startDeload();
    });
    expect(result.current.d.status.active).toBe(true);
    expect(result.current.s.settings.deload.active).toBe(true);
    expect(result.current.s.deload.active).toBe(true);
    act(() => {
      result.current.s.endDeload();
    });
    expect(result.current.d.status.active).toBe(false);
    expect(result.current.s.settings.deload.lastEndedAt).toBeDefined();
  });
});
