/**
 * The core store: immutable `CoreState` snapshots + subscribe (for
 * useSyncExternalStore) + actions. Every action updates state synchronously
 * and persists in the background (`flush()` awaits pending writes).
 */
import { bodyweightTrend, localDate } from './bodyweight';
import {
  BUILTIN_CARDIO,
  BUILTIN_CARDIO_GROUP,
  DEFAULT_ACTIVITY,
  DEFAULT_BODYWEIGHT_LOG,
  DEFAULT_FINISHER,
  DEFAULT_GOAL,
  DEFAULT_PROGRESSION_RULES,
  defaultSettings,
} from './defaults';
import {
  cardioSlot,
  detectPRs,
  finisherOffer,
  exerciseHistory,
  getToday,
  lastPerformance,
  prefillFromLast,
  priorSetsFor,
} from './logic';
import { convertWeight, doneSets } from './math';
import { deriveCategory, type SeedLoadResult } from './seed-schema';
import type { CoreState } from './state';
import { STORAGE_KEYS, type Storage } from './storage';
import { EXPORT_VERSION, validateExport, type ExportFile, type ImportResult } from './transfer';
import type {
  BodyweightEntry,
  BodyweightTrend,
  CardioEntry,
  CardioMetrics,
  CardioRole,
  Equipment,
  Exercise,
  ExerciseCategory,
  Increments,
  Muscle,
  PRResult,
  RepRange,
  SessionEntry,
  Settings,
  SetLog,
  StrengthEntry,
  SubstitutionGroup,
  WorkoutSession,
} from './types';
import { CARDIO_GROUP_ID, CARDIO_SLOT_ID, FINISHER_SLOT_ID } from './types';

/** Input for `addCustomExercise`. */
export interface CustomExerciseInput {
  name: string;
  /** Default 'strength'. */
  kind?: 'strength' | 'cardio';
  /** Strength: derived from equipment + name if omitted. */
  category?: ExerciseCategory;
  equipment?: Equipment;
  primaryMuscles?: Muscle[];
  /** Join a swap group (pattern id) so it shows up in `getSwaps` for that group. Cardio: forced to `cardio-warmup`. */
  substitutionGroup?: string;
  /** Strength default 8-12. */
  repRange?: RepRange;
  /** Strength default 3. */
  defaultSets?: number;
  /** Increment override in the CURRENT display unit. */
  increment?: number;
  unilateral?: boolean;
  /** Cardio default 10. */
  defaultDurationMin?: number;
  notes?: string;
}

/** Deep-partial settings patch for `updateSettings`. */
export type SettingsPatch = Partial<Omit<Settings, 'increments' | 'cardio' | 'finisher' | 'goal'>> & {
  increments?: { [U in keyof Increments]?: Partial<Increments[U]> };
  cardio?: Partial<Settings['cardio']>;
  finisher?: Partial<Settings['finisher']>;
  goal?: Partial<Settings['goal']>;
};

/** Input for `logBodyweight`. `date` defaults to today (local), `unit` to settings.unit. */
export interface BodyweightInput {
  date?: string;
  weight: number;
  unit?: Settings['unit'];
  note?: string;
}

/** Patch for `logCardio`. Finisher durations are clamped to finisher min..max. `metrics` are merged. */
export interface CardioPatch {
  durationMin?: number;
  done?: boolean;
  metrics?: CardioMetrics;
}

/** Patch for `logSet`. Marking `done: true` stamps `timestamp` (unless given). */
export type SetPatch = Partial<SetLog>;

/** Result of `logSet`: PRs set by THIS set (vs history + earlier sets this session). */
export interface LogSetResult {
  prs: PRResult[];
}

/** Result of `finishSession`. */
export interface FinishResult {
  session: WorkoutSession;
  /** Best new record per kind per exercise achieved in the session (vs previous history). */
  prs: PRResult[];
}

export interface CreateCoreOptions {
  storage: Storage;
  seed: SeedLoadResult;
  /** Clock override for tests. */
  now?: () => Date;
}

/** A core instance. Hooks use the default one (or a `CoreProvider` value). */
export interface Core {
  getState(): CoreState;
  subscribe(listener: () => void): () => void;
  /** Load persisted data. Idempotent (returns the same promise). */
  init(): Promise<void>;
  /** Resolves when all pending writes are persisted. */
  flush(): Promise<void>;

  /** Start a session for `dayId` (default: next in rotation). Returns the existing active session if one is in progress. */
  startSession(dayId?: string): WorkoutSession;
  /** Update a set of the active session. Throws if no active session / bad indexes / cardio entry. */
  logSet(entryIdx: number, setIdx: number, patch: SetPatch): LogSetResult;
  /** Append a set (copies the last set's weight/reps unless `init` given; `done: false`). Returns its index. */
  addSet(entryIdx: number, init?: Partial<SetLog>): number;
  removeSet(entryIdx: number, setIdx: number): void;
  /**
   * Update the warm-up or finisher entry of the active session. `which` is the
   * role ('warmup' | 'finisher'); a number (entry index) is also accepted for
   * compatibility. Throws if the entry is absent.
   */
  logCardio(which: CardioRole | number, patch: CardioPatch): void;
  /**
   * Add the optional finisher as the LAST entry (prefilled from the last finisher,
   * see `finisherOffer`). No-op returning the existing index if already added.
   */
  addFinisher(opts?: { exerciseId?: string; durationMin?: number }): number;
  /** Remove (skip) the finisher from the active session. */
  removeFinisher(): void;
  /** Finish the active session (moves it to history). Returns null if none. */
  finishSession(): FinishResult | null;
  /** Drop the active session without saving. */
  discardSession(): void;
  /** Delete a finished session from history. */
  deleteSession(sessionId: string): void;

  /**
   * Swap the exercise in a slot. `session`: only the active session's entry
   * (its sets are re-prefilled from the new exercise's OWN history).
   * `permanent`: saved in settings.permanentSwaps (and applied to the active
   * session if that entry has no done sets). Swapping back to the programmed
   * exercise permanently clears the mapping. Throws on unknown exercise / kind mismatch.
   */
  swapExercise(slotId: string, exerciseId: string, scope: 'session' | 'permanent'): void;
  clearPermanentSwap(slotId: string): void;
  /** Create a custom exercise (persisted). Returns it with its generated id `custom-<slug>`. */
  addCustomExercise(input: CustomExerciseInput): Exercise;
  /** Remove a custom exercise (history keeps its entries; permanent swaps to it are cleared). */
  removeCustomExercise(exerciseId: string): void;

  updateSettings(patch: SettingsPatch): Settings;

  /** Upsert one reading per local date (weight > 0). Returns the stored entry. */
  logBodyweight(entry: BodyweightInput): BodyweightEntry;
  deleteBodyweight(date: string): void;
  /** 7-day moving-average trend + weekly loss rate vs goal (display unit). */
  getBodyweightTrend(): BodyweightTrend;

  /** Serialize user data (pretty JSON string, `ExportFile`). */
  exportJSON(): string;
  /** Validate + REPLACE all user data. On error nothing changes. */
  importJSON(json: string | unknown): Promise<ImportResult>;
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'exercise';

function mergeSettings(base: Settings, patch: SettingsPatch | undefined): Settings {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    increments: {
      lb: { ...base.increments.lb, ...patch.increments?.lb },
      kg: { ...base.increments.kg, ...patch.increments?.kg },
    },
    cardio: { ...base.cardio, ...patch.cardio },
    finisher: { ...base.finisher, ...patch.finisher },
    goal: { ...base.goal, ...patch.goal },
    permanentSwaps: patch.permanentSwaps ?? base.permanentSwaps,
  };
}

function buildGroups(seedGroups: SubstitutionGroup[], custom: Exercise[]): Record<string, SubstitutionGroup> {
  const out: Record<string, SubstitutionGroup> = {};
  for (const g of seedGroups) out[g.id] = { ...g, exerciseIds: [...g.exerciseIds] };
  for (const e of custom) {
    if (!e.substitutionGroup) continue;
    const g = (out[e.substitutionGroup] ??= { id: e.substitutionGroup, name: e.substitutionGroup, exerciseIds: [] });
    if (!g.exerciseIds.includes(e.id)) g.exerciseIds.push(e.id);
  }
  return out;
}

/** Create a core instance (use `createMemoryStorage()` in tests). */
export function createCore(opts: CreateCoreOptions): Core {
  const now = opts.now ?? (() => new Date());
  const seed = opts.seed.seed;
  const seedExercises: Exercise[] = seed?.exercises ?? structuredClone(BUILTIN_CARDIO);
  const seedGroups: SubstitutionGroup[] = seed?.groups ?? [structuredClone(BUILTIN_CARDIO_GROUP)];
  const baseSettings = defaultSettings({
    unit: seed?.unitDefault ?? 'lb',
    increments: structuredClone(seed?.increments ?? defaultSettings().increments),
    goal: structuredClone(seed?.goal ?? DEFAULT_GOAL),
  });

  const compose = (custom: Exercise[]) => ({
    customExercises: custom,
    exercises: Object.fromEntries([...seedExercises, ...custom].map((e) => [e.id, e])),
    groups: buildGroups(seedGroups, custom),
  });

  let state: CoreState = {
    status: 'loading',
    seedErrors: opts.seed.errors,
    seedWarnings: opts.seed.warnings,
    program: seed?.program ?? { id: 'ppl', name: 'Push / Pull / Legs', days: [], rotations: { 3: [], 6: [] } },
    warmupExerciseId: seed?.warmupExerciseId ?? BUILTIN_CARDIO[0].id,
    progressionRules: seed?.progressionRules ?? DEFAULT_PROGRESSION_RULES,
    finisher: seed?.finisher ?? DEFAULT_FINISHER,
    activity: seed?.activity ?? DEFAULT_ACTIVITY,
    bodyweightLog: seed?.bodyweightLog ?? DEFAULT_BODYWEIGHT_LOG,
    bodyweight: [],
    sessions: [],
    active: null,
    settings: baseSettings,
    ...compose([]),
  };
  const listeners = new Set<() => void>();
  let writes: Promise<void> = Promise.resolve();
  let initP: Promise<void> | undefined;

  const persist = (keys: Array<keyof typeof STORAGE_KEYS>) => {
    const snap = state;
    const values: Record<keyof typeof STORAGE_KEYS, unknown> = {
      settings: snap.settings,
      customExercises: snap.customExercises,
      sessions: snap.sessions,
      active: snap.active,
      bodyweight: snap.bodyweight,
    };
    writes = writes
      .then(() => Promise.all(keys.map((k) => opts.storage.set(STORAGE_KEYS[k], values[k]))))
      .then(
        () => undefined,
        (e) => console.error('[core] persist failed', e),
      );
  };
  const setState = (patch: Partial<CoreState>, keys: Array<keyof typeof STORAGE_KEYS> = []) => {
    state = { ...state, ...patch };
    if (keys.length) persist(keys);
    listeners.forEach((l) => l());
  };

  const requireActive = (): WorkoutSession => {
    if (!state.active) throw new Error('no active session');
    return state.active;
  };
  const strengthEntry = (a: WorkoutSession, entryIdx: number): StrengthEntry => {
    const e = a.entries[entryIdx];
    if (!e) throw new Error(`entry ${entryIdx} out of range`);
    if (e.kind !== 'strength') throw new Error(`entry ${entryIdx} is cardio; use logCardio`);
    return e;
  };
  const replaceEntry = (a: WorkoutSession, idx: number, entry: SessionEntry): WorkoutSession => ({
    ...a,
    entries: a.entries.map((e, i) => (i === idx ? entry : e)),
  });
  const prefillFor = (exerciseId: string, target: { sets: number; repRange: RepRange }) =>
    prefillFromLast(target, lastPerformance(state, exerciseId));
  const clampFinisher = (n: number) => Math.min(state.finisher.maxDurationMin, Math.max(state.finisher.minDurationMin, n));
  const finisherEntry = (exerciseId: string, durationMin: number): CardioEntry => ({
    kind: 'cardio',
    role: 'finisher',
    slotId: FINISHER_SLOT_ID,
    exerciseId,
    durationMin,
    done: false,
  });

  const core: Core = {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    init() {
      return (initP ??= (async () => {
        const [settings, custom, sessions, active, bodyweight] = await Promise.all([
          opts.storage.get<Partial<Settings>>(STORAGE_KEYS.settings),
          opts.storage.get<Exercise[]>(STORAGE_KEYS.customExercises),
          opts.storage.get<WorkoutSession[]>(STORAGE_KEYS.sessions),
          opts.storage.get<WorkoutSession | null>(STORAGE_KEYS.active),
          opts.storage.get<BodyweightEntry[]>(STORAGE_KEYS.bodyweight),
        ]);
        setState({
          status: opts.seed.ok ? 'ready' : 'error',
          settings: mergeSettings(baseSettings, settings as SettingsPatch | undefined),
          sessions: sessions ?? [],
          active: active ?? null,
          bodyweight: bodyweight ?? [],
          ...compose(custom ?? []),
        });
      })());
    },
    flush: () => writes,

    startSession(dayId) {
      if (state.active) return state.active;
      const today = getToday(state, dayId);
      if (!today) throw new Error(`unknown day "${dayId ?? ''}"`);
      const entries: SessionEntry[] = today.slots.map((t): SessionEntry =>
        t.kind === 'cardio'
          ? { kind: 'cardio', role: 'warmup', slotId: CARDIO_SLOT_ID, exerciseId: t.exercise.id, durationMin: t.durationMin, done: false }
          : {
              kind: 'strength',
              slotId: t.slot.id,
              exerciseId: t.exercise.id,
              sets: prefillFromLast(t.target, t.last),
              target: { sets: t.target.sets, repRange: t.target.repRange },
              restSec: t.target.restSec,
            },
      );
      if (state.settings.finisher.autoAdd && today.finisher) entries.push(finisherEntry(today.finisher.exercise.id, today.finisher.durationMin));
      const session: WorkoutSession = {
        id: uid(),
        programId: state.program.id,
        dayId: today.day.id,
        startedAt: now().toISOString(),
        unit: state.settings.unit,
        entries,
      };
      setState({ active: session }, ['active']);
      return session;
    },

    logSet(entryIdx, setIdx, patch) {
      const a = requireActive();
      const e = strengthEntry(a, entryIdx);
      const cur = e.sets[setIdx];
      if (!cur) throw new Error(`set ${setIdx} out of range`);
      const next: SetLog = { ...cur, ...patch };
      if (patch.done === true && !cur.done && !patch.timestamp) next.timestamp = now().toISOString();
      if (patch.done === false) delete next.timestamp;
      const prior = priorSetsFor(state, e.exerciseId, { entryIdx, setIdx });
      const display = { ...next, weight: convertWeight(next.weight, a.unit, state.settings.unit) };
      const prs = next.done && !cur.done ? detectPRs(e.exerciseId, display, prior) : [];
      const sets = e.sets.map((s, i) => (i === setIdx ? next : s));
      setState({ active: replaceEntry(a, entryIdx, { ...e, sets }) }, ['active']);
      return { prs };
    },

    addSet(entryIdx, init) {
      const a = requireActive();
      const e = strengthEntry(a, entryIdx);
      const last = e.sets[e.sets.length - 1];
      const s: SetLog = { weight: last?.weight ?? 0, reps: last?.reps ?? e.target.repRange.min, ...init, done: init?.done ?? false };
      setState({ active: replaceEntry(a, entryIdx, { ...e, sets: [...e.sets, s] }) }, ['active']);
      return e.sets.length;
    },

    removeSet(entryIdx, setIdx) {
      const a = requireActive();
      const e = strengthEntry(a, entryIdx);
      if (!e.sets[setIdx]) throw new Error(`set ${setIdx} out of range`);
      setState({ active: replaceEntry(a, entryIdx, { ...e, sets: e.sets.filter((_, i) => i !== setIdx) }) }, ['active']);
    },

    logCardio(which, patch) {
      const a = requireActive();
      const idx =
        typeof which === 'number' ? which : a.entries.findIndex((e) => e.kind === 'cardio' && (e.role ?? 'warmup') === which);
      const e = a.entries[idx];
      if (!e || e.kind !== 'cardio') throw new Error(`no ${String(which)} cardio entry in the active session`);
      const next: CardioEntry = { ...e, ...patch, ...(patch.metrics ? { metrics: { ...e.metrics, ...patch.metrics } } : {}) };
      if (e.role === 'finisher' && patch.durationMin !== undefined) next.durationMin = clampFinisher(patch.durationMin);
      if (patch.done === true && !e.done) next.timestamp = now().toISOString();
      if (patch.done === false) delete next.timestamp;
      setState({ active: replaceEntry(a, idx, next) }, ['active']);
    },

    addFinisher(o = {}) {
      const a = requireActive();
      const existing = a.entries.findIndex((e) => e.kind === 'cardio' && e.role === 'finisher');
      if (existing >= 0) return existing;
      const offer = finisherOffer(state);
      const exId = o.exerciseId ?? offer?.exercise.id;
      if (!exId || state.exercises[exId]?.kind !== 'cardio') throw new Error('no cardio exercise available for the finisher');
      const entry = finisherEntry(exId, clampFinisher(o.durationMin ?? offer?.durationMin ?? state.finisher.defaultDurationMin));
      setState({ active: { ...a, entries: [...a.entries, entry] } }, ['active']);
      return a.entries.length;
    },

    removeFinisher() {
      const a = requireActive();
      if (!a.entries.some((e) => e.kind === 'cardio' && e.role === 'finisher')) return;
      setState({ active: { ...a, entries: a.entries.filter((e) => !(e.kind === 'cardio' && e.role === 'finisher')) } }, ['active']);
    },

    finishSession() {
      const a = state.active;
      if (!a) return null;
      const session: WorkoutSession = { ...a, finishedAt: now().toISOString() };
      // PRs: per exercise, best of the session vs all previous history
      const prs: PRResult[] = [];
      const unit = state.settings.unit;
      const ids = [...new Set(a.entries.filter((e) => e.kind === 'strength').map((e) => e.exerciseId))];
      for (const id of ids) {
        const prior = exerciseHistory(state.sessions, id, unit).flatMap((h) => h.sets);
        const mine = a.entries
          .flatMap((e) => (e.kind === 'strength' && e.exerciseId === id ? doneSets(e.sets) : []))
          .map((s) => ({ ...s, weight: convertWeight(s.weight, a.unit, unit) }));
        const best = new Map<string, PRResult>();
        for (const s of mine) {
          for (const pr of detectPRs(id, s, prior)) {
            const key = pr.kind === 'repsAtWeight' ? `r${pr.weight}` : pr.kind;
            const cur = best.get(key);
            if (!cur || pr.value > cur.value) best.set(key, { ...pr, sessionId: session.id, date: session.startedAt });
          }
        }
        prs.push(...best.values());
      }
      setState({ active: null, sessions: [...state.sessions, session] }, ['active', 'sessions']);
      return { session, prs };
    },

    discardSession() {
      if (state.active) setState({ active: null }, ['active']);
    },

    deleteSession(sessionId) {
      setState({ sessions: state.sessions.filter((s) => s.id !== sessionId) }, ['sessions']);
    },

    swapExercise(slotId, exerciseId, scope) {
      const ex = state.exercises[exerciseId];
      if (!ex) throw new Error(`unknown exercise "${exerciseId}"`);
      const isCardio = slotId === CARDIO_SLOT_ID || slotId === FINISHER_SLOT_ID;
      if (isCardio !== (ex.kind === 'cardio')) throw new Error(`kind mismatch: cannot put ${ex.kind} "${exerciseId}" in slot "${slotId}"`);
      const programmed =
        slotId === CARDIO_SLOT_ID
          ? state.warmupExerciseId
          : slotId === FINISHER_SLOT_ID
            ? state.finisher.defaultExerciseId
            : state.program.days.flatMap((d) => d.slots).find((s) => s.id === slotId)?.exerciseId;
      if (!programmed) throw new Error(`unknown slot "${slotId}"`);

      const patch: Partial<CoreState> = {};
      const keys: Array<keyof typeof STORAGE_KEYS> = [];
      if (scope === 'permanent') {
        const swaps = { ...state.settings.permanentSwaps };
        if (exerciseId === programmed) delete swaps[slotId];
        else swaps[slotId] = exerciseId;
        patch.settings = { ...state.settings, permanentSwaps: swaps };
        keys.push('settings');
      }
      const a = state.active;
      const idx = a ? a.entries.findIndex((e) => e.slotId === slotId) : -1;
      if (a && idx >= 0) {
        const e = a.entries[idx];
        const untouched = e.kind === 'cardio' ? !e.done : !e.sets.some((s) => s.done);
        if (scope === 'session' || untouched) {
          let next: SessionEntry;
          if (e.kind === 'cardio' && e.role === 'finisher') {
            next = { ...e, exerciseId }; // finisher keeps its duration
          } else if (e.kind === 'cardio') {
            next = { ...e, exerciseId, durationMin: cardioSlot({ ...state, settings: { ...state.settings, permanentSwaps: { [CARDIO_SLOT_ID]: exerciseId } } })?.slot.durationMin ?? e.durationMin };
          } else {
            next = { ...e, exerciseId, sets: prefillFor(exerciseId, e.target) };
          }
          patch.active = replaceEntry(a, idx, next);
          keys.push('active');
        }
      } else if (scope === 'session') {
        throw new Error('no active session entry for this slot');
      }
      setState(patch, keys);
    },

    clearPermanentSwap(slotId) {
      if (!(slotId in state.settings.permanentSwaps)) return;
      const swaps = { ...state.settings.permanentSwaps };
      delete swaps[slotId];
      setState({ settings: { ...state.settings, permanentSwaps: swaps } }, ['settings']);
    },

    addCustomExercise(input) {
      const name = input.name?.trim();
      if (!name) throw new Error('name is required');
      let id = `custom-${slug(name)}`;
      for (let n = 2; state.exercises[id]; n++) id = `custom-${slug(name)}-${n}`;
      const base = {
        id,
        name,
        equipment: input.equipment,
        primaryMuscles: input.primaryMuscles,
        notes: input.notes,
        isCustom: true as const,
      };
      const ex: Exercise =
        input.kind === 'cardio'
          ? { ...base, kind: 'cardio', substitutionGroup: CARDIO_GROUP_ID, defaultDurationMin: input.defaultDurationMin ?? 10 }
          : {
              ...base,
              kind: 'strength',
              substitutionGroup: input.substitutionGroup,
              category: input.category ?? deriveCategory(input.equipment, `${name} ${input.substitutionGroup ?? ''}`),
              repRange: input.repRange ?? { min: 8, max: 12 },
              defaultSets: input.defaultSets ?? 3,
              increment: input.increment,
              incrementUnit: input.increment ? state.settings.unit : undefined,
              unilateral: input.unilateral || undefined,
            };
      setState(compose([...state.customExercises, ex]), ['customExercises']);
      return ex;
    },

    removeCustomExercise(exerciseId) {
      if (!state.customExercises.some((e) => e.id === exerciseId)) return;
      const swaps = Object.fromEntries(Object.entries(state.settings.permanentSwaps).filter(([, v]) => v !== exerciseId));
      setState(
        { ...compose(state.customExercises.filter((e) => e.id !== exerciseId)), settings: { ...state.settings, permanentSwaps: swaps } },
        ['customExercises', 'settings'],
      );
    },

    updateSettings(patch) {
      const settings = mergeSettings(state.settings, patch);
      setState({ settings }, ['settings']);
      return settings;
    },

    logBodyweight(input) {
      if (!(input.weight > 0)) throw new Error('weight must be > 0');
      const date = input.date ?? localDate(now());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
      const entry: BodyweightEntry = { date, weight: input.weight, unit: input.unit ?? state.settings.unit, ...(input.note ? { note: input.note } : {}) };
      const bodyweight = [...state.bodyweight.filter((e) => e.date !== date), entry].sort((a, b) => (a.date < b.date ? -1 : 1));
      setState({ bodyweight }, ['bodyweight']);
      return entry;
    },

    deleteBodyweight(date) {
      setState({ bodyweight: state.bodyweight.filter((e) => e.date !== date) }, ['bodyweight']);
    },

    getBodyweightTrend() {
      return bodyweightTrend(state.bodyweight, state.settings.unit, state.settings.goal, state.bodyweightLog.trendWindowDays);
    },

    exportJSON() {
      const file: ExportFile = {
        app: 'ppl-tracker',
        version: EXPORT_VERSION,
        exportedAt: now().toISOString(),
        settings: state.settings,
        customExercises: state.customExercises,
        sessions: state.sessions,
        active: state.active,
        bodyweight: state.bodyweight,
      };
      return JSON.stringify(file, null, 2);
    },

    async importJSON(json) {
      const { file, errors, warnings } = validateExport(json);
      if (!file) return { ok: false, errors, warnings };
      const sessions = [...file.sessions].filter((s) => s.finishedAt).sort((x, y) => (x.finishedAt! < y.finishedAt! ? -1 : 1));
      if (sessions.length !== file.sessions.length) warnings.push('unfinished sessions in "sessions" were skipped');
      setState(
        {
          settings: mergeSettings(baseSettings, file.settings as SettingsPatch),
          sessions,
          active: file.active,
          bodyweight: [...file.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1)),
          ...compose(file.customExercises.map((e) => ({ ...e, isCustom: true }))),
        },
        ['settings', 'customExercises', 'sessions', 'active', 'bodyweight'],
      );
      await writes;
      return {
        ok: true,
        errors: [],
        warnings,
        counts: { sessions: sessions.length, customExercises: file.customExercises.length, bodyweight: file.bodyweight.length },
      };
    },
  };
  return core;
}
