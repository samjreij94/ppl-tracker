import { describe, expect, it } from 'vitest';
import { getBundledSeedRaw } from './bundled-seed';
import { loadSeed } from './seed-schema';

const seedJson = getBundledSeedRaw();

describe('research/exercises.json', () => {
  const r = loadSeed(seedJson);

  it('loads without errors', () => {
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('has 92 exercises, 19 patterns, 6 days, 34 slots', () => {
    const s = r.seed!;
    expect(s.exercises).toHaveLength(92);
    expect(s.groups).toHaveLength(19);
    expect(s.program.days).toHaveLength(6);
    expect(s.program.days.reduce((n, d) => n + d.slots.length, 0)).toBe(34);
  });

  it('maps rotation, warm-up, slots and categories', () => {
    const s = r.seed!;
    const rot = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b'];
    expect(s.program.rotations[6]).toEqual(rot);
    expect(s.program.rotations[3]).toEqual(rot);
    expect(s.warmupExerciseId).toBe('incline-treadmill');
    expect(s.exercises.filter((e) => e.kind === 'cardio').map((e) => e.id).sort()).toEqual(
      ['flat-treadmill', 'incline-treadmill', 'peloton'],
    );
    const slot = s.program.days[0].slots[0];
    expect(slot).toMatchObject({ id: 'push-a-1', exerciseId: 'barbell-bench-press', sets: 4, repRange: { min: 5, max: 8 }, restSec: 180, substitutionGroup: 'horizontal-press' });
    expect(s.program.days[0]).toMatchObject({ type: 'push', variant: 'A' });
    expect(s.increments.lb.barbell_lower).toBeGreaterThan(0);
    expect(s.progressionRules.stallConsecutiveSessions).toBe(2);
  });

  it('is tolerant: bad entries are skipped with clear errors, cardio falls back', () => {
    const bad = loadSeed({
      version: 1,
      patterns: [{ id: 'p', name: 'P', exerciseIds: ['a', 'ghost'] }],
      exercises: [{ id: 'a', name: 'A', kind: 'strength', pattern: 'p', equipment: 'barbell' }, { name: 'no id' }],
      days: [{ id: 'd', name: 'Push A', slots: [{ order: 1, pattern: 'p', defaultExerciseId: 'a', sets: 3, repMin: 8, repMax: 12 }, { order: 2, defaultExerciseId: 'nope', sets: 3 }] }],
    });
    expect(bad.ok).toBe(true);
    expect(bad.errors.join('\n')).toMatch(/exercises\[1\]: missing id/);
    expect(bad.errors.join('\n')).toMatch(/days\[0\]\.slots\[1\]: unknown exercise "nope"/);
    expect(bad.errors.join('\n')).toMatch(/unknown exercise "ghost"/);
    expect(bad.seed!.exercises.filter((e) => e.kind === 'cardio')).toHaveLength(3);
    expect(loadSeed('{oops').errors[0]).toMatch(/invalid JSON/);
  });
});
