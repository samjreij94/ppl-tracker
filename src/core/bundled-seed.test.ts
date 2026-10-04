import { expect, it } from 'vitest';
import { getBundledSeed } from './bundled-seed';

it('bundles research/exercises.json via Vite', () => {
  const r = getBundledSeed();
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
  expect(r.warnings).toEqual([]);
});
