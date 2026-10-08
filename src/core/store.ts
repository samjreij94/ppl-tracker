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
  computeSessionPRs,
  deloadDue,
  detectPRs,
  finisherOffer,
  getToday,
  getCardioHistory,
  prefillSets,
  priorSetsFor,
} from './logic';
import { convertWeight } from './math';
import { deriveCategory, type SeedLoadResult } from './seed-schema';
import type { CoreState } from './state';
import { MIRROR_KEYS, STORAGE_KEYS, type Storage, type SyncStorage } from './storage';
import { EXPORT_VERSION, validateExport, type ExportFile, type ImportResult } from './transfer';
import type {
  BodyweightEntry,
  BodyweightTrend,
  CardioEntry,
  CardioMetrics,
  CardioRole,
  DeloadStatus,
  Equipment,
  Exercise,
  ExerciseCategory,
  Experience,
  Goal,
  GoalType,
  Profile,
  Schedule,
  Unit,
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
export type SettingsPatch = Partial<Omit<Settings, 'increments' | 'cardio' | 'finisher' | 'goal' | 'deload' | 'profile'>> & {
  increments?: { [U in keyof Increments]?: Partial<Increments[U]> };
  cardio?: Partial<Settings['cardio']>;
  finisher?: Partial<Settings['finisher']>;
  goal?: Partial<Settings['goal']>;
  deload?: Partial<Settings['deload']>;
  profile?: Partial<Profile>;
};

/** Input for `completeOnboarding`. `goal` is a goal type string (or a partial Goal with `type`). */
export interface OnboardingInput {
  name: string;
  goal: GoalType | (Partial<Goal> & { type: GoalType });
  experience: Experience;
  unit: Unit;
  schedule: Schedule;
}

/** Patch for `updateProfile`. */
export interface ProfilePatch {
  name?: string;
  experience?: Experience;
}

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
  /**
   * Synchronous write-through mirror for settings + the active session (the app's default core
   * passes `window.localStorage`). Omit/null = no mirror (tests).
   */
  mirror?: SyncStorage | null;
  /**
   * Register `pagehide` / `visibilitychange` (hidden) listeners that call `flush()` (browser only).
   * Default true; `core.dispose()` removes them.
   */
  lifecycle?: boolean;
}

/** A core instance. Hooks use the default one (or a `CoreProvider` value). */
export interface Core {
  getState(): CoreState;
  subscribe(listener: () => void): () => void;
  /** Load persisted data. Idempotent (returns the same promise). */
  init(): Promise<void>;
  /** Resolves when all pending writes are persisted. */
  flush(): Promise<void>;
  /** Remove the browser lifecycle listeners (pagehide / visibilitychange). */
  dispose(): void;

  /** Start a session for `dayId` (default: next in rotation). Returns the existing active session if one is in progress. */
  startSession(dayId?: string): WorkoutSession;
  /**
   * Update a set of the active session (marks it `touched`). CARRY-OVER: when the patch marks the
   * set done or enters weight/reps, every LATER set of the entry that is untouched, not done and
   * has no per-set history prefill (`prefill !== 'history'`; legacy sets: weight 0) gets this
   * set's weight and reps. Throws if no active session / bad indexes / cardio entry.
   */
  logSet(entryIdx: number, setIdx: number, patch: SetPatch): LogSetResult;
  /**
   * Append a set: copies the previous set's weight/reps (`prefill: 'default'`, untouched, so a later
   * carry-over can still fill it) unless `init` is given (then it counts as touched). Returns its index.
   */
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
  /**
   * Finish the active session (moves it to history). Returns null if none.
   * A session with NO done strength set and NO done cardio is not saved: it is discarded
   * (like `discardSession`), the rotation does not advance, and null is returned.
   * The returned PRs (`computeSessionPRs`: at most one per exercise per kind, vs history before
   * this session) are also persisted on the session as `session.prs`.
   */
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

  /**
   * First-run setup: sets profile {name (trimmed), experience}, goal.type, unit, schedule and
   * `onboardedAt = now` in ONE state update / ONE settings write. Returns the new Settings.
   * Invalid unit/schedule/experience values are ignored (current values kept).
   */
  completeOnboarding(input: OnboardingInput): Settings;
  /** Update name (trimmed) and/or experience. Returns the new Settings. */
  updateProfile(patch: ProfilePatch): Settings;

  /**
   * Start a deload week now (`settings.deload = {active: true, startedAt: now, weekLength}`).
   * Sessions STARTED while active are flagged `deload: true` and prefilled with
   * ceil(sets × 50%) sets (≥ 1) at the last working weight −10%. No-op if already active.
   */
  startDeload(opts?: { weekLength?: number }): DeloadStatus;
  /** End the deload now (`active: false`, `lastEndedAt: now`). No-op if not active. */
  endDeload(): DeloadStatus;
  /** Current deload status (`deloadDue(state, now)`). */
  getDeloadStatus(): DeloadStatus;

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
    deload: { ...base.deload, ...patch.deload },
    profile: { ...base.profile, ...patch.profile },
    permanentSwaps: patch.permanentSwaps ?? base.permanentSwaps,
  };
}

const EXPERIENCES: readonly string[] = ['beginner', 'intermediate', 'advanced'];
const isExperience = (v: unknown): v is Experience => typeof v === 'string' && EXPERIENCES.includes(v);

/**
 * Migration for data written before onboarding existed: mark as onboarded (`at`) and default
 * goal.type to 'fat-loss' when the STORED settings had no goal type.
 */
function migrateOnboarded(settings: Settings, stored: unknown, at: string): Settings {
  if (settings.onboardedAt) return settings;
  const storedGoal = typeof stored === 'object' && stored !== null ? (stored as { goal?: { type?: unknown } }).goal : undefined;
  const hasType = typeof storedGoal?.type === 'string' && storedGoal.type !== '';
  return { ...settings, onboardedAt: at, goal: hasType ? settings.goal : { ...settings.goal, type: 'fat-loss' } };
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

  const mirror = opts.mirror ?? null;
  const mirrorSet = (key: string, value: unknown) => {
    if (!mirror) return;
    try {
      mirror.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Quota/blocked: drop the copy so a STALE mirror can never win over IndexedDB.
      try {
        mirror.removeItem(key);
      } catch {
        /* ignore */
      }
      console.warn('[core] mirror write failed', e);
    }
  };
  const mirrorGet = <T,>(key: string): T | undefined => {
    if (!mirror) return undefined;
    try {
      const raw = mirror.getItem(key);
      return raw == null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  };

  const persist = (keys: Array<keyof typeof STORAGE_KEYS>) => {
    const snap = state;
    const values: Record<keyof typeof STORAGE_KEYS, unknown> = {
      settings: snap.settings,
      customExercises: snap.customExercises,
      sessions: snap.sessions,
      active: snap.active,
      bodyweight: snap.bodyweight,
    };
    // Synchronous mirror first (survives an immediate kill). A null active session is mirrored
    // only AFTER IndexedDB has the new state, so a just-finished session can't vanish from both.
    if (keys.includes('settings')) mirrorSet(MIRROR_KEYS.settings, snap.settings);
    const savedAt = now().toISOString();
    if (keys.includes('active') && snap.active) mirrorSet(MIRROR_KEYS.active, { savedAt, value: snap.active });
    writes = writes
      .then(() => Promise.all(keys.map((k) => opts.storage.set(STORAGE_KEYS[k], values[k]))))
      .then(
        () => {
          if (keys.includes('active') && !snap.active && state.active === null) mirrorSet(MIRROR_KEYS.active, { savedAt, value: null });
        },
        (e) => console.error('[core] persist failed', e),
      );
  };
  const setState = (patch: Partial<CoreState>, keys: Array<keyof typeof STORAGE_KEYS> = []) => {
    state = { ...state, ...patch };
    // Every settings write is stamped (newest copy wins on init: IndexedDB vs mirror).
    if (keys.includes('settings')) state = { ...state, settings: { ...state.settings, updatedAt: now().toISOString() } };
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
  const slotSets = (slotId: string, fallback: number) =>
    state.program.days.flatMap((d) => d.slots).find((s) => s.id === slotId)?.sets ?? fallback;
  const clampFinisher = (n: number) => Math.min(state.finisher.maxDurationMin, Math.max(state.finisher.minDurationMin, n));
  const finisherEntry = (exerciseId: string, durationMin: number, metrics?: CardioMetrics): CardioEntry => ({
    kind: 'cardio',
    role: 'finisher',
    slotId: FINISHER_SLOT_ID,
    exerciseId,
    durationMin,
    done: false,
    ...(metrics ? { metrics: { ...metrics } } : {}),
  });
  /** Finisher metrics prefill for a given exercise (last finisher with it). */
  const finisherMetrics = (exerciseId: string) => getCardioHistory(state, { role: 'finisher', exerciseId })[0]?.metrics;
  /** Auto-end a deload `weekLength` days after it started (lastEndedAt = the scheduled end). */
  const autoEndDeload = () => {
    const dl = state.settings.deload;
    if (!dl?.active || !dl.startedAt) return;
    const end = Date.parse(dl.startedAt) + Math.max(1, dl.weekLength || 7) * 86_400_000;
    if (Number.isFinite(end) && now().getTime() >= end) {
      const { startedAt: _s, ...rest } = dl;
      setState({ settings: { ...state.settings, deload: { ...rest, active: false, lastEndedAt: new Date(end).toISOString() } } }, ['settings']);
    }
  };

  // Browser lifecycle: flush pending IndexedDB writes when the page is hidden / unloaded (iOS may
  // kill a backgrounded PWA right away). Guarded for non-browser environments.
  let removeLifecycle = () => {};
  if (opts.lifecycle !== false && typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
    const onPageHide = () => {
      void core.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void core.flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    removeLifecycle = () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  const core: Core = {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    init() {
      return (initP ??= (async () => {
        const [idbSettings, custom, sessions, idbActive, bodyweight] = await Promise.all([
          opts.storage.get<Partial<Settings>>(STORAGE_KEYS.settings),
          opts.storage.get<Exercise[]>(STORAGE_KEYS.customExercises),
          opts.storage.get<WorkoutSession[]>(STORAGE_KEYS.sessions),
          opts.storage.get<WorkoutSession | null>(STORAGE_KEYS.active),
          opts.storage.get<BodyweightEntry[]>(STORAGE_KEYS.bodyweight),
        ]);
        // Synchronous mirror: settings → the newer `updatedAt` wins (missing = oldest, tie → IndexedDB).
        const mSettings = mirrorGet<Partial<Settings>>(MIRROR_KEYS.settings);
        const useMirrorSettings =
          !!mSettings && typeof mSettings === 'object' && (!idbSettings || (mSettings.updatedAt ?? '') > (idbSettings.updatedAt ?? ''));
        const settings = useMirrorSettings ? mSettings : idbSettings;
        // Active session → the mirror (written synchronously on every change) unless that session
        // is already in the finished history (finish landed in IndexedDB, mirror not yet cleared).
        const mActive = mirrorGet<{ savedAt?: string; value?: WorkoutSession | null }>(MIRROR_KEYS.active);
        const mValue = mActive && 'value' in mActive ? (mActive.value ?? null) : undefined;
        const useMirrorActive =
          mValue !== undefined &&
          !(mValue && (sessions ?? []).some((s) => s.id === mValue.id)) &&
          JSON.stringify(mValue) !== JSON.stringify(idbActive ?? null);
        const active = useMirrorActive ? mValue : idbActive;
        // Existing install (any stored user data) without onboardedAt → migrate as onboarded.
        // A truly fresh install (nothing stored) stays un-onboarded.
        const hasData =
          (settings !== undefined && settings !== null) ||
          !!sessions?.length ||
          !!custom?.length ||
          !!bodyweight?.length ||
          !!active;
        let merged = mergeSettings(baseSettings, settings as SettingsPatch | undefined);
        const migrate = hasData && !merged.onboardedAt;
        if (migrate) merged = migrateOnboarded(merged, settings, now().toISOString());
        // Repair IndexedDB from the mirror (only keys that need it; migration stamps settings).
        const keys: Array<keyof typeof STORAGE_KEYS> = [];
        if (migrate || useMirrorSettings) keys.push('settings');
        if (useMirrorActive) keys.push('active');
        setState({
          status: opts.seed.ok ? 'ready' : 'error',
          settings: merged,
          sessions: sessions ?? [],
          active: active ?? null,
          bodyweight: bodyweight ?? [],
          ...compose(custom ?? []),
        }, keys);
        autoEndDeload();
      })());
    },
    flush: () => writes,
    dispose() {
      removeLifecycle();
    },

    startSession(dayId) {
      if (state.active) return state.active;
      autoEndDeload();
      const today = getToday(state, dayId, now());
      if (!today) throw new Error(`unknown day "${dayId ?? ''}"`);
      const entries: SessionEntry[] = today.slots.map((t): SessionEntry => {
        if (t.kind === 'cardio') {
          return {
            kind: 'cardio',
            role: 'warmup',
            slotId: CARDIO_SLOT_ID,
            exerciseId: t.exercise.id,
            durationMin: t.durationMin,
            done: false,
            ...(t.metrics ? { metrics: { ...t.metrics } } : {}),
          };
        }
        const sets = prefillSets(state, t.exercise.id, t.target);
        return {
          kind: 'strength',
          slotId: t.slot.id,
          exerciseId: t.exercise.id,
          sets,
          target: { sets: sets.length, repRange: t.target.repRange },
          restSec: t.target.restSec,
        };
      });
      if (state.settings.finisher.autoAdd && today.finisher) {
        entries.push(finisherEntry(today.finisher.exercise.id, today.finisher.durationMin, today.finisher.metrics));
      }
      const session: WorkoutSession = {
        id: uid(),
        programId: state.program.id,
        dayId: today.day.id,
        startedAt: now().toISOString(),
        unit: state.settings.unit,
        entries,
        ...(state.settings.deload?.active ? { deload: true } : {}),
      };
      setState({ active: session }, ['active']);
      return session;
    },

    logSet(entryIdx, setIdx, patch) {
      const a = requireActive();
      const e = strengthEntry(a, entryIdx);
      const cur = e.sets[setIdx];
      if (!cur) throw new Error(`set ${setIdx} out of range`);
      const next: SetLog = { ...cur, ...patch, touched: patch.touched ?? true };
      if (patch.done === true && !cur.done && !patch.timestamp) next.timestamp = now().toISOString();
      if (patch.done === false) delete next.timestamp;
      const prior = priorSetsFor(state, e.exerciseId, { entryIdx, setIdx });
      const display = { ...next, weight: convertWeight(next.weight, a.unit, state.settings.unit) };
      // Store prKinds whenever the set is done (recomputed on edit); return prs only when becoming done.
      const computed = next.done ? detectPRs(e.exerciseId, display, prior) : [];
      if (computed.length) next.prKinds = computed.map((p) => p.kind);
      else delete next.prKinds;
      const prs = next.done && !cur.done ? computed : [];
      // Carry-over: completing a set or entering weight/reps fills later untouched default sets.
      const carry = patch.done === true || patch.weight !== undefined || patch.reps !== undefined;
      const isCarryTarget = (s: SetLog) =>
        !s.touched && !s.done && (s.prefill === 'default' || (s.prefill === undefined && s.weight === 0));
      const sets = e.sets.map((s, i) => {
        if (i === setIdx) return next;
        if (carry && i > setIdx && isCarryTarget(s)) return { ...s, weight: next.weight, reps: next.reps, prefill: 'default' as const };
        return s;
      });
      setState({ active: replaceEntry(a, entryIdx, { ...e, sets }) }, ['active']);
      return { prs };
    },

    addSet(entryIdx, init) {
      const a = requireActive();
      const e = strengthEntry(a, entryIdx);
      const last = e.sets[e.sets.length - 1];
      const given = !!init && (init.weight !== undefined || init.reps !== undefined || init.done !== undefined);
      const s: SetLog = {
        weight: last?.weight ?? 0,
        reps: last?.reps ?? e.target.repRange.min,
        prefill: 'default',
        ...(given ? { touched: true } : {}),
        ...init,
        done: init?.done ?? false,
      };
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
      const entry = finisherEntry(
        exId,
        clampFinisher(o.durationMin ?? offer?.durationMin ?? state.finisher.defaultDurationMin),
        finisherMetrics(exId),
      );
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
      // Nothing done (no done strength set, no done cardio) → not a workout: discard, keep the rotation.
      const anyDone = a.entries.some((e) => (e.kind === 'strength' ? e.sets.some((x) => x.done) : e.done));
      if (!anyDone) {
        setState({ active: null }, ['active']);
        return null;
      }
      // Active-only set flags (touched/prefill/prKinds) are not part of history.
      const clean = (x: SetLog): SetLog => {
        const { touched: _t, prefill: _p, prKinds: _k, ...rest } = x;
        return rest;
      };
      const session: WorkoutSession = {
        ...a,
        entries: a.entries.map((e) => (e.kind === 'strength' ? { ...e, sets: e.sets.map(clean) } : e)),
        finishedAt: now().toISOString(),
      };
      // Canonical PRs: at most one per exercise per kind, vs history BEFORE this session.
      const prs: PRResult[] = computeSessionPRs(session, state.sessions, state.settings.unit);
      session.prs = prs;
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
            // finisher keeps its duration; metrics re-prefilled for the new machine
            const m = finisherMetrics(exerciseId);
            next = { ...e, exerciseId, metrics: m ? { ...m } : undefined };
            if (!m) delete next.metrics;
          } else if (e.kind === 'cardio') {
            const c = cardioSlot({ ...state, settings: { ...state.settings, permanentSwaps: { ...state.settings.permanentSwaps, [CARDIO_SLOT_ID]: exerciseId } } });
            next = { ...e, exerciseId, durationMin: c?.slot.durationMin ?? e.durationMin };
            if (c?.slot.metrics) next.metrics = { ...c.slot.metrics };
            else delete next.metrics;
          } else {
            const sets = prefillSets(state, exerciseId, { sets: slotSets(slotId, e.target.sets), repRange: e.target.repRange });
            next = { ...e, exerciseId, sets, target: { ...e.target, sets: sets.length } };
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
      if (state.active?.entries.some((e) => e.exerciseId === exerciseId)) {
        throw new Error(`"${exerciseId}" is in the active session; swap it out first`);
      }
      const swaps = Object.fromEntries(Object.entries(state.settings.permanentSwaps).filter(([, v]) => v !== exerciseId));
      setState(
        { ...compose(state.customExercises.filter((e) => e.id !== exerciseId)), settings: { ...state.settings, permanentSwaps: swaps } },
        ['customExercises', 'settings'],
      );
    },

    updateSettings(patch) {
      const settings = mergeSettings(state.settings, patch);
      setState({ settings }, ['settings']);
      return state.settings;
    },

    completeOnboarding(input) {
      const cur = state.settings;
      const g = typeof input.goal === 'string' ? { type: input.goal } : (input.goal ?? {});
      const settings: Settings = {
        ...cur,
        unit: input.unit === 'lb' || input.unit === 'kg' ? input.unit : cur.unit,
        schedule: input.schedule === 3 || input.schedule === 6 ? input.schedule : cur.schedule,
        goal: { ...cur.goal, ...g, type: typeof g.type === 'string' && g.type ? g.type : cur.goal.type },
        profile: {
          ...cur.profile,
          name: typeof input.name === 'string' ? input.name.trim() : cur.profile.name,
          ...(isExperience(input.experience) ? { experience: input.experience } : {}),
        },
        onboardedAt: now().toISOString(),
      };
      setState({ settings }, ['settings']);
      return state.settings;
    },

    updateProfile(patch) {
      const cur = state.settings;
      const settings: Settings = {
        ...cur,
        profile: {
          ...cur.profile,
          ...(typeof patch.name === 'string' ? { name: patch.name.trim() } : {}),
          ...(isExperience(patch.experience) ? { experience: patch.experience } : {}),
        },
      };
      setState({ settings }, ['settings']);
      return state.settings;
    },

    startDeload(o = {}) {
      autoEndDeload();
      const dl = state.settings.deload;
      if (!dl.active) {
        const weekLength = o.weekLength && o.weekLength > 0 ? Math.round(o.weekLength) : dl.weekLength || 7;
        setState({ settings: { ...state.settings, deload: { ...dl, active: true, startedAt: now().toISOString(), weekLength } } }, ['settings']);
      }
      return deloadDue(state, now());
    },

    endDeload() {
      const dl = state.settings.deload;
      if (dl.active) {
        const { startedAt: _s, ...rest } = dl;
        setState({ settings: { ...state.settings, deload: { ...rest, active: false, lastEndedAt: now().toISOString() } } }, ['settings']);
      }
      return deloadDue(state, now());
    },

    getDeloadStatus: () => deloadDue(state, now()),

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
      const clash = file.customExercises.filter((e) => seedExercises.some((x) => x.id === e.id));
      if (clash.length) {
        return { ok: false, errors: clash.map((e) => `customExercises: id "${e.id}" collides with a seed exercise`), warnings };
      }
      const sessions = [...file.sessions].filter((s) => s.finishedAt).sort((x, y) => (x.finishedAt! < y.finishedAt! ? -1 : 1));
      if (sessions.length !== file.sessions.length) warnings.push('unfinished sessions in "sessions" were skipped');
      setState(
        {
          settings: migrateOnboarded(mergeSettings(baseSettings, file.settings as SettingsPatch), file.settings, now().toISOString()),
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
