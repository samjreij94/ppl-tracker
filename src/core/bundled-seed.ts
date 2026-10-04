/**
 * The app's seed: imported DIRECTLY from Theodore's research/exercises.json
 * (Vite JSON import via an eager `import.meta.glob`, bundled at build time),
 * so his edits flow through on the next build/dev reload with no copy step.
 * The glob form keeps the build green even if the file is absent (the store
 * then reports status 'error' with seedErrors). Validated by `loadSeed`.
 */
import { loadSeed, type SeedLoadResult } from './seed-schema';

const files = import.meta.glob('../../research/exercises.json', { eager: true, import: 'default' });

let cached: SeedLoadResult | undefined;

/** The raw parsed research/exercises.json, or undefined if it wasn't present at build time. */
export function getBundledSeedRaw(): unknown {
  return Object.values(files)[0];
}

/** Parse + validate the bundled seed (memoized). */
export function getBundledSeed(): SeedLoadResult {
  if (cached) return cached;
  const raw = getBundledSeedRaw();
  cached = raw
    ? loadSeed(raw)
    : { ok: false, seed: null, errors: ['research/exercises.json not found at build time'], warnings: [] };
  return cached;
}
