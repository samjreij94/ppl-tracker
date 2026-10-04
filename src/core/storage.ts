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
 *
 * Settings and the active session are ALSO mirrored synchronously to localStorage
 * (`MIRROR_KEYS`) by the app's default core; on init the newer copy wins.
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

/**
 * Synchronous key-value store (the `localStorage` shape). Used as a write-through MIRROR of the
 * settings and the active session so a change survives the app being killed right after a tap
 * (IndexedDB writes are async and can be lost).
 */
export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage keys of the synchronous mirror. */
export const MIRROR_KEYS = {
  /** JSON Settings (with `updatedAt`). */
  settings: 'ppl-tracker/v1/settings',
  /** JSON `{ savedAt: ISO, value: WorkoutSession | null }`. */
  active: 'ppl-tracker/v1/active',
} as const;

/** `window.localStorage` when usable (browser, not blocked), else undefined. Never throws. */
export function browserLocalStorage(): SyncStorage | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const probe = 'ppl-tracker/probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** In-memory SyncStorage for tests. */
export function createMemorySyncStorage(initial: Record<string, string> = {}): SyncStorage & { dump(): Record<string, string> } {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}
