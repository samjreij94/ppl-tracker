import { describe, expect, it } from 'vitest';
import { getDays, getToday, nextDayId } from '../logic';
import type { Core } from '../store';
import { makeCore, miniSeed } from './helpers';

/** Start a session and finish it with one done strength set (empty sessions are discarded). */
function runSession(core: Core, dayId: string | undefined, _perf: object) {
  core.startSession(dayId);
  const ei = core.getState().active!.entries.findIndex((e) => e.kind === 'strength');
  core.logSet(ei, 0, { weight: 100, reps: 5, done: true });
  return core.finishSession();
}

const ROT = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b'];

describe('rotation', () => {
  it('6-day: next day follows the last finished session, wraps around', async () => {
    const { core } = await makeCore();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(getToday(core.getState())!.day.id);
      runSession(core, undefined, {});
    }
    expect(seen).toEqual([...ROT, 'push-a', 'pull-a']);
  });

  it('discarded sessions do not advance; an out-of-order day sets the next', async () => {
    const { core } = await makeCore();
    core.startSession();
    core.discardSession();
    expect(getToday(core.getState())!.day.id).toBe('push-a');
    runSession(core, 'legs-b', {});
    expect(getToday(core.getState())).toMatchObject({ day: { id: 'push-a' }, isNext: true, rotationIndex: 0 });
    runSession(core, 'pull-b', {});
    expect(getToday(core.getState())!.day.id).toBe('legs-b');
    expect(getToday(core.getState(), 'push-b')).toMatchObject({ isNext: false, rotationIndex: 3 });
    const days = getDays(core.getState());
    expect(days.map((d) => d.day.id)).toEqual(ROT);
    expect(days.find((d) => d.isNext)!.day.id).toBe('legs-b');
    expect(days.find((d) => d.day.id === 'pull-b')!.lastDoneAt).toBeDefined();
    expect(days.find((d) => d.day.id === 'push-a')!.lastDoneAt).toBeUndefined();
    // deleting the latest session rewinds
    core.deleteSession(core.getState().sessions[1].id);
    expect(getToday(core.getState())!.day.id).toBe('push-a');
  });

  it("3-day uses the seed's three-day rotation; schedule switch picks the other list", async () => {
    const seed = miniSeed();
    expect(seed.seed!.program.rotations).toEqual({ 6: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], 3: ['d1', 'd3', 'd5'] });
    const { core } = await makeCore({ seed });
    core.updateSettings({ schedule: 3 });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(getToday(core.getState())!.day.id);
      runSession(core, undefined, {});
    }
    expect(seen).toEqual(['d1', 'd3', 'd5', 'd1']);
    core.updateSettings({ schedule: 6 });
    expect(getToday(core.getState())!.day.id).toBe('d2');
  });

  it('with the real seed both schedules use push-a … legs-b', async () => {
    const { core } = await makeCore();
    core.updateSettings({ schedule: 3 });
    runSession(core, undefined, {});
    runSession(core, undefined, {});
    runSession(core, undefined, {});
    expect(getToday(core.getState())!.day.id).toBe('push-b'); // A cycle done → B cycle
  });

  it('nextDayId (pure): empty history → first; unknown day ids ignored; empty rotation → null', () => {
    const program = { id: 'p', name: 'p', days: [], rotations: { 3: ['x', 'y'], 6: ['x', 'y'] } };
    const sess = (dayId: string, finishedAt?: string) => ({ id: dayId, programId: 'p', dayId, startedAt: '2026-01-01', finishedAt, unit: 'lb' as const, entries: [] });
    expect(nextDayId(program, [], 6)).toBe('x');
    expect(nextDayId(program, [sess('x', '2026-01-02'), sess('zzz', '2026-01-03')], 6)).toBe('y');
    expect(nextDayId(program, [sess('y', '2026-01-02'), sess('x')], 6)).toBe('x');
    expect(nextDayId({ ...program, rotations: { 3: [], 6: [] } }, [], 6)).toBeNull();
  });
});
