/**
 * Persistence behind a tiny key-value interface. The UI never touches this;
 * the store reads/writes through it. Production: IndexedDB via idb-keyval
 * (DB `ppl-tracker`, object store `kv`). Tests: in-memory adapter.
 *
 * Keys (all values are plain JSON):
 *   `v1/settings` → Settings
 *   `v1/customExercises` → Exercise[]
 *   `v1/sessions` → WorkoutSession[] (finished)
 *   `v1/active` → WorkoutSession | null
 *   `v1/bodyweight` → BodyweightEntry[] (sorted by date, one per date)
 * Weights are stored AS ENTERED with `WorkoutSession.unit` (not normalized).
 */
import { createStore, del, get, set } from 'idb-keyval';

/** Minimal async key-value storage. */
export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  settings: 'v1/settings',
  customExercises: 'v1/customExercises',
  sessions: 'v1/sessions',
  active: 'v1/active',
  bodyweight: 'v1/bodyweight',
} as const;

/** IndexedDB-backed storage (idb-keyval). */
export function createIdbStorage(dbName = 'ppl-tracker', storeName = 'kv'): Storage {
  const store = createStore(dbName, storeName);
  return {
    get: <T,>(key: string) => get<T>(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  };
}

/** In-memory storage for tests (values are deep-cloned like IndexedDB would). */
export function createMemoryStorage(initial: Record<string, unknown> = {}): Storage & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  return {
    get: async <T,>(key: string) => (m.has(key) ? (structuredClone(m.get(key)) as T) : undefined),
    set: async (key, value) => void m.set(key, structuredClone(value)),
    del: async (key) => void m.delete(key),
    dump: () => Object.fromEntries(structuredClone([...m.entries()])),
  };
}
