import { describe, expect, it } from 'vitest';
import { validateExport } from '../transfer';
import { makeCore, runSession, sets } from './helpers';

async function populated() {
  const { core, storage } = await makeCore();
  core.updateSettings({ defaultRestSec: 100, increments: { lb: { dumbbell: 2.5 } }, finisher: { autoAdd: true } });
  const custom = core.addCustomExercise({ name: 'Floor Press', substitutionGroup: 'horizontal-press', increment: 2.5 });
  core.swapExercise('push-a-1', custom.id, 'permanent');
  runSession(core, 'push-a', { [custom.id]: sets(4, 100, 8) });
  core.startSession();
  core.logCardio('warmup', { done: true, metrics: { incline: 10, speed: 3 } });
  core.logBodyweight({ date: '2026-09-01', weight: 200, note: 'x' });
  core.logBodyweight({ date: '2026-09-02', weight: 90.5, unit: 'kg' });
  await core.flush();
  return { core, storage };
}

const strip = (json: string) => {
  const o = JSON.parse(json);
  delete o.exportedAt;
  return o;
};

describe('export / import', () => {
  it('round trip is lossless (settings, custom exercises, sessions, active session, bodyweight)', async () => {
    const { core } = await populated();
    const json = core.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({ app: 'ppl-tracker', version: 1 });
    expect(parsed.bodyweight).toHaveLength(2);
    expect(parsed.customExercises).toHaveLength(1);

    const { core: other, storage } = await makeCore();
    const res = await other.importJSON(json);
    expect(res).toEqual({ ok: true, errors: [], warnings: [], counts: { sessions: 1, customExercises: 1, bodyweight: 2 } });
    expect(strip(other.exportJSON())).toEqual(strip(json));
    expect(other.getState().groups['horizontal-press'].exerciseIds).toContain('custom-floor-press');
    // persisted
    const { core: re } = await makeCore({ storage });
    expect(strip(re.exportJSON())).toEqual(strip(json));
    // also accepts an already-parsed object
    expect((await other.importJSON(parsed)).ok).toBe(true);
  });

  it('rejects bad input with errors and leaves data unchanged', async () => {
    const { core } = await populated();
    const before = core.exportJSON();
    const good = JSON.parse(before);
    const cases: Array<[unknown, RegExp]> = [
      ['{not json', /invalid JSON/],
      ['[]', /root must be an object/],
      [{ ...good, version: 99 }, /newer than supported/],
      [{ ...good, version: undefined }, /version missing/],
      [{ ...good, app: 'other-app' }, /not a ppl-tracker export/],
      [{ ...good, settings: undefined }, /settings missing/],
      [{ ...good, sessions: 'nope' }, /sessions must be an array/],
      [{ ...good, sessions: [{ ...good.sessions[0], unit: 'stone' }] }, /sessions\[0\]: unit/],
      [{ ...good, sessions: [{ ...good.sessions[0], entries: [{ kind: 'strength', slotId: 'x', exerciseId: 'y', sets: [{ weight: '1', reps: 1, done: true }] }] }] }, /sets invalid/],
      [{ ...good, sessions: [{ ...good.sessions[0], entries: [{ kind: 'cardio', slotId: 'x', exerciseId: 'y' }] }] }, /durationMin/],
      [{ ...good, customExercises: [{ id: 'x', name: 'X', kind: 'yoga' }] }, /customExercises\[0\] invalid/],
      [{ ...good, customExercises: [{ id: 'barbell-bench-press', name: 'X', kind: 'strength' }] }, /collides with a seed exercise/],
      [{ ...good, bodyweight: [{ date: '2026/09/01', weight: 200, unit: 'lb' }] }, /bodyweight\[0\] invalid/],
      [{ ...good, bodyweight: [{ date: '2026-09-01', weight: -1, unit: 'lb' }] }, /bodyweight\[0\] invalid/],
      [{ ...good, active: { id: 1 } }, /active: id must be a string/],
    ];
    for (const [input, re] of cases) {
      const res = await core.importJSON(input);
      expect(res.ok, String(re)).toBe(false);
      expect(res.errors.join('\n')).toMatch(re);
      expect(res.counts).toBeUndefined();
    }
    expect(core.exportJSON().replace(/"exportedAt": "[^"]+"/, '')).toBe(before.replace(/"exportedAt": "[^"]+"/, ''));
  });

  it('older exports without bodyweight import fine; unfinished sessions in "sessions" are skipped with a warning', async () => {
    const { core } = await populated();
    const good = JSON.parse(core.exportJSON());
    delete good.bodyweight;
    const { core: other } = await makeCore();
    expect((await other.importJSON(good)).counts?.bodyweight).toBe(0);
    good.sessions.push({ ...good.sessions[0], id: 'open', finishedAt: undefined });
    const res = await other.importJSON(good);
    expect(res.ok).toBe(true);
    expect(res.warnings.join()).toMatch(/unfinished/);
    expect(other.getState().sessions).toHaveLength(1);
  });

  it('validateExport (pure) returns a normalized file', () => {
    const r = validateExport({ version: 1, settings: {}, sessions: [] });
    expect(r.errors).toEqual([]);
    expect(r.file).toMatchObject({ app: 'ppl-tracker', customExercises: [], bodyweight: [], active: null });
  });
});
