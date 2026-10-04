/**
 * Seed-data schema for `research/exercises.json` and its tolerant loader.
 *
 * SOURCE OF TRUTH: research/SCHEMA.md (Theodore). The TS types below mirror
 * that file (version 1) exactly. The loader additionally tolerates a few
 * aliases (`substitutionGroups` for `patterns`, `substitutionGroup` for
 * `pattern`, `exerciseId` for `defaultExerciseId`, `repRange{min,max}` for
 * `repMin/repMax`, snake_case schedule keys) and ignores unknown fields.
 * See docs/seed-schema.md.
 */
import { BUILTIN_CARDIO, BUILTIN_CARDIO_GROUP, DEFAULT_INCREMENTS, DEFAULT_PROGRESSION_RULES } from './defaults';
import type {
  CardioExercise,
  DayType,
  DayVariant,
  Exercise,
  ExerciseCategory,
  Increments,
  Program,
  ProgramDay,
  RepRange,
  Muscle,
  ProgressionRules,
  RirClass,
  Schedule,
  Slot,
  StrengthExercise,
  SubstitutionGroup,
  Unit,
} from './types';
import { CARDIO_GROUP_ID, EXERCISE_CATEGORIES } from './types';

/** Current seed schema version. */
export const SEED_VERSION = 1;

/** Root of research/exercises.json. */
export interface SeedFile {
  /** Must be 1. */
  version: number;
  /** Default display unit for new users. */
  units: { default: Unit };
  /** Increment per category (exactly the 4). Used as default `Settings.increments`. */
  progressionCategories: Record<ExerciseCategory, SeedProgressionCategory>;
  progressionRules: SeedProgressionRules;
  /** Human-readable equipment → category rule. */
  categoryMappingRule?: string;
  /** Cardio warm-up auto-inserted at the start of every day. */
  warmup: { pattern: 'cardio-warmup'; defaultExerciseId: string; appliesTo: 'all-days' };
  /** Substitution groups. */
  patterns: SeedPattern[];
  exercises: SeedExercise[];
  /** Rotation orders (day ids). */
  schedules: { 'six-day': string[]; 'three-day': { rotation: string[]; note?: string } };
  /** The 6 rotation days. No program wrapper (program id/name default to `ppl` / `Push / Pull / Legs`). */
  days: SeedDay[];
}

export interface SeedProgressionRules {
  method: 'double_progression';
  description?: string;
  increaseWhen?: string;
  afterIncrease?: string;
  stallRule?: string;
  targetRir?: { compound?: string; isolation?: string };
  stallConsecutiveSessions: number;
  stallLoadReductionPct: number;
  deload?: {
    frequencyWeeks?: string;
    trigger?: string;
    protocol?: string;
    setReductionPct?: number;
    loadReductionPct?: number;
    targetRir?: string;
  };
}

export interface SeedProgressionCategory {
  incrementLb: number;
  incrementKg: number;
  note?: string;
}

/** A substitution group ("pattern"), e.g. `horizontal-press`. */
export interface SeedPattern {
  id: string;
  name: string;
  /** `null` only for `cardio-warmup`. */
  rirClass: RirClass | null;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  exerciseIds: string[];
}

/** A seed exercise. Rep ranges live on slots, not here. */
export interface SeedExercise {
  /** Permanent kebab-case id — history is keyed by it. */
  id: string;
  name: string;
  kind: 'strength' | 'cardio';
  /** Substitution group (pattern id); cardio: `cardio-warmup`. */
  pattern: string;
  /** Strength: barbell|dumbbell|machine|cable|bodyweight|smith|ez_bar|kettlebell. Cardio: treadmill|bike. */
  equipment: string;
  /** `null` for cardio. If missing/invalid on a strength exercise the loader derives it (categoryMappingRule). */
  progressionCategory: ExerciseCategory | null;
  primaryMuscles: Muscle[];
  /** Present (true) only when reps and load are per side. */
  unilateral?: true;
  /** Cardio only (10). */
  defaultDurationMin?: number;
  /** Cardio only. */
  defaultPrescription?: string;
  notes?: string;
}

/** A program day, e.g. `push-a`. */
export interface SeedDay {
  id: string;
  name: string;
  focus?: string;
  slots: SeedSlot[];
}

/** A strength slot. Cardio is NOT listed here (core inserts it). */
export interface SeedSlot {
  /** 1..n; core slot id = `${dayId}-${order}` (e.g. `push-a-1`). */
  order: number;
  /** Substitution group for swaps (never `cardio-warmup`). */
  pattern: string;
  /** Strength exercise in `pattern`. */
  defaultExerciseId: string;
  /** 1–6 */
  sets: number;
  repMin: number;
  repMax: number;
  /** 45–240 */
  restSec: number;
}

/** Normalized seed, ready for the store. */
export interface LoadedSeed {
  version: number;
  unitDefault: Unit;
  exercises: Exercise[];
  groups: SubstitutionGroup[];
  program: Program;
  increments: Increments;
  progressionRules: ProgressionRules;
  /** Default cardio warm-up exercise id (`warmup.defaultExerciseId`). */
  warmupExerciseId: string;
}

/**
 * Result of `loadSeed`.
 * - `ok`: the seed is usable (≥1 day with ≥1 slot). Bad entries are skipped, not fatal.
 * - `errors`: entries that were DROPPED, with a path, e.g. `days[0].slots[2]: unknown exercise "foo"`.
 * - `warnings`: values that were defaulted/derived.
 */
export interface SeedLoadResult {
  ok: boolean;
  seed: LoadedSeed | null;
  errors: string[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strArr = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

const CATEGORY_ALIASES: Record<string, ExerciseCategory> = {
  barbellupper: 'barbell_upper',
  barbelllower: 'barbell_lower',
  dumbbell: 'dumbbell',
  kettlebell: 'dumbbell',
  machine: 'machine',
  cable: 'machine',
};
const LOWER_RE = /squat|deadlift|\brdl\b|romanian|hinge|thrust|lunge|split|step.?up|good.?morning|leg|calf|glute/i;

/** Map any category spelling to an ExerciseCategory, or undefined. */
export function normalizeCategory(v: unknown): ExerciseCategory | undefined {
  const s = str(v);
  if (!s) return undefined;
  if ((EXERCISE_CATEGORIES as readonly string[]).includes(s)) return s as ExerciseCategory;
  return CATEGORY_ALIASES[s.toLowerCase().replace(/[^a-z]/g, '')];
}

/** categoryMappingRule: derive a category from equipment + name/pattern. */
export function deriveCategory(equipment: string | undefined, nameOrPattern: string): ExerciseCategory {
  const eq = (equipment ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (eq === 'barbell') return LOWER_RE.test(nameOrPattern) ? 'barbell_lower' : 'barbell_upper';
  if (eq === 'ezbar') return 'barbell_upper';
  if (eq === 'dumbbell' || eq === 'kettlebell') return 'dumbbell';
  return 'machine';
}

function readRange(o: Obj): RepRange | undefined {
  const rr = isObj(o.repRange) ? o.repRange : undefined;
  const min = num(rr?.min) ?? num(o.repMin);
  const max = num(rr?.max) ?? num(o.repMax);
  if (min === undefined && max === undefined) return undefined;
  const lo = min ?? max!;
  const hi = max ?? min!;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

function inferDay(id: string, name: string): { type?: DayType; variant?: DayVariant } {
  const s = `${id} ${name}`.toLowerCase();
  const type: DayType | undefined = s.includes('push') ? 'push' : s.includes('pull') ? 'pull' : s.includes('leg') ? 'legs' : undefined;
  const m = /[\s_-]([ab])\b/.exec(` ${id.toLowerCase()} ${name.toLowerCase()}`);
  return { type, variant: m ? (m[1].toUpperCase() as DayVariant) : undefined };
}

/**
 * Parse + normalize seed JSON (string or already-parsed object). Never throws.
 * Tolerant: aliases accepted, bad entries skipped with an error message,
 * missing optional values defaulted with a warning. If the seed has no cardio
 * exercises, the three built-in warm-ups are added.
 */
export function loadSeed(input: unknown): SeedLoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, seed: null, errors: [`invalid JSON: ${(e as Error).message}`], warnings };
    }
  }
  if (!isObj(raw)) return { ok: false, seed: null, errors: ['seed root must be an object'], warnings };

  const version = num(raw.version);
  if (version === undefined) warnings.push('version missing; assuming 1');
  else if (version > SEED_VERSION) warnings.push(`version ${version} is newer than supported ${SEED_VERSION}; loading best-effort`);

  const unitRaw = (isObj(raw.units) ? raw.units.default : undefined) ?? raw.unitDefault;
  const unitDefault: Unit = unitRaw === 'kg' ? 'kg' : 'lb';
  if (unitRaw !== 'kg' && unitRaw !== 'lb') warnings.push('units.default missing/invalid; using "lb"');

  // Increments
  const increments: Increments = structuredClone(DEFAULT_INCREMENTS);
  if (isObj(raw.progressionCategories)) {
    for (const [k, v] of Object.entries(raw.progressionCategories)) {
      const cat = normalizeCategory(k);
      if (!cat || !isObj(v)) {
        warnings.push(`progressionCategories.${k}: unknown category, ignored`);
        continue;
      }
      const lb = num(v.incrementLb);
      const kg = num(v.incrementKg);
      if (lb && lb > 0) increments.lb[cat] = lb;
      if (kg && kg > 0) increments.kg[cat] = kg;
    }
  }

  // Groups
  const groupsRaw = Array.isArray(raw.patterns) ? raw.patterns : Array.isArray(raw.substitutionGroups) ? raw.substitutionGroups : [];
  const groups = new Map<string, SubstitutionGroup>();
  groupsRaw.forEach((g, i) => {
    if (!isObj(g) || !str(g.id)) {
      errors.push(`patterns[${i}]: missing id, skipped`);
      return;
    }
    const id = str(g.id)!;
    const rir = g.rirClass === 'compound' || g.rirClass === 'isolation' ? g.rirClass : undefined;
    groups.set(id, {
      id,
      name: str(g.name) ?? id,
      exerciseIds: strArr(g.exerciseIds) ?? [],
      rirClass: rir,
      primaryMuscles: strArr(g.primaryMuscles),
      secondaryMuscles: strArr(g.secondaryMuscles),
    });
  });

  // Days (raw) — needed first to derive default rep ranges per pattern
  const programRaw = isObj(raw.program) ? raw.program : {};
  const daysRaw = Array.isArray(raw.days) ? raw.days : Array.isArray(programRaw.days) ? programRaw.days : [];
  const rangeByGroup = new Map<string, RepRange>();
  const rangeByExercise = new Map<string, RepRange>();
  for (const d of daysRaw) {
    if (!isObj(d) || !Array.isArray(d.slots)) continue;
    for (const s of d.slots) {
      if (!isObj(s)) continue;
      const r = readRange(s);
      const g = str(s.pattern) ?? str(s.substitutionGroup);
      const ex = str(s.defaultExerciseId) ?? str(s.exerciseId);
      if (r && g && !rangeByGroup.has(g)) rangeByGroup.set(g, r);
      if (r && ex && !rangeByExercise.has(ex)) rangeByExercise.set(ex, r);
    }
  }

  // Exercises
  const exercises = new Map<string, Exercise>();
  const exRaw = Array.isArray(raw.exercises) ? raw.exercises : [];
  if (!Array.isArray(raw.exercises)) errors.push('exercises: missing array');
  exRaw.forEach((e, i) => {
    const at = `exercises[${i}]`;
    if (!isObj(e)) return void errors.push(`${at}: not an object, skipped`);
    const id = str(e.id);
    const name = str(e.name);
    if (!id) return void errors.push(`${at}: missing id, skipped`);
    if (exercises.has(id)) return void errors.push(`${at}: duplicate id "${id}", skipped`);
    if (!name) warnings.push(`${at} (${id}): missing name; using id`);
    const group = str(e.pattern) ?? str(e.substitutionGroup);
    const g = group ? groups.get(group) : undefined;
    const base = {
      id,
      name: name ?? id,
      equipment: str(e.equipment),
      primaryMuscles: strArr(e.primaryMuscles) ?? g?.primaryMuscles,
      substitutionGroup: group,
      notes: str(e.notes),
    };
    if (e.kind === 'cardio' || group === CARDIO_GROUP_ID) {
      const c: CardioExercise = {
        ...base,
        kind: 'cardio',
        substitutionGroup: group ?? CARDIO_GROUP_ID,
        defaultDurationMin: num(e.defaultDurationMin),
        defaultPrescription: str(e.defaultPrescription),
      };
      exercises.set(id, c);
      return;
    }
    let category = normalizeCategory(e.progressionCategory ?? e.category);
    if (!category) {
      category = deriveCategory(base.equipment, `${name ?? id} ${group ?? ''}`);
      warnings.push(`${at} (${id}): no valid progressionCategory; derived "${category}"`);
    }
    const rirClass = g?.rirClass;
    const repRange =
      readRange(e) ??
      rangeByExercise.get(id) ??
      (group ? rangeByGroup.get(group) : undefined) ??
      (rirClass === 'isolation' ? { min: 10, max: 15 } : rirClass === 'compound' ? { min: 6, max: 10 } : { min: 8, max: 12 });
    const s: StrengthExercise = {
      ...base,
      kind: 'strength',
      category,
      repRange,
      defaultSets: num(e.defaultSets) ?? 3,
      rirClass,
      unilateral: e.unilateral === true ? true : undefined,
      secondaryMuscles: g?.secondaryMuscles,
      increment: num(e.increment),
    };
    exercises.set(id, s);
  });

  // Group membership: union both directions
  for (const g of groups.values()) {
    g.exerciseIds = g.exerciseIds.filter((id) => {
      if (exercises.has(id)) return true;
      errors.push(`patterns "${g.id}": unknown exercise "${id}", removed from group`);
      return false;
    });
  }
  for (const ex of exercises.values()) {
    if (!ex.substitutionGroup) continue;
    let g = groups.get(ex.substitutionGroup);
    if (!g) {
      g = { id: ex.substitutionGroup, name: ex.substitutionGroup, exerciseIds: [] };
      groups.set(g.id, g);
      warnings.push(`exercise "${ex.id}": group "${ex.substitutionGroup}" not in patterns; created`);
    }
    if (!g.exerciseIds.includes(ex.id)) g.exerciseIds.push(ex.id);
  }

  // Cardio fallback
  let cardio = [...exercises.values()].filter((e) => e.kind === 'cardio');
  if (cardio.length === 0) {
    warnings.push('no cardio exercises; using built-in warm-ups');
    for (const c of BUILTIN_CARDIO) exercises.set(c.id, structuredClone(c));
    cardio = BUILTIN_CARDIO;
    const g = groups.get(CARDIO_GROUP_ID);
    if (g) g.exerciseIds = [...new Set([...g.exerciseIds, ...BUILTIN_CARDIO_GROUP.exerciseIds])];
    else groups.set(CARDIO_GROUP_ID, structuredClone(BUILTIN_CARDIO_GROUP));
  }
  const warmupRaw = isObj(raw.warmup) ? str(raw.warmup.defaultExerciseId) : undefined;
  let warmupExerciseId = cardio[0].id;
  if (warmupRaw && exercises.get(warmupRaw)?.kind === 'cardio') warmupExerciseId = warmupRaw;
  else if (warmupRaw) warnings.push(`warmup.defaultExerciseId "${warmupRaw}" is not a cardio exercise; using "${warmupExerciseId}"`);

  // Days
  const days: ProgramDay[] = [];
  daysRaw.forEach((d, di) => {
    const at = `days[${di}]`;
    if (!isObj(d) || !str(d.id)) return void errors.push(`${at}: missing id, skipped`);
    const dayId = str(d.id)!;
    if (days.some((x) => x.id === dayId)) return void errors.push(`${at}: duplicate day id "${dayId}", skipped`);
    const name = str(d.name) ?? dayId;
    const slots: Slot[] = [];
    const slotsRaw = Array.isArray(d.slots) ? d.slots : [];
    slotsRaw.forEach((s, si) => {
      const sat = `${at}.slots[${si}]`;
      if (!isObj(s)) return void errors.push(`${sat}: not an object, skipped`);
      const exerciseId = str(s.defaultExerciseId) ?? str(s.exerciseId);
      const ex = exerciseId ? exercises.get(exerciseId) : undefined;
      if (!exerciseId || !ex) return void errors.push(`${sat}: unknown exercise "${exerciseId ?? ''}", skipped`);
      if (ex.kind !== 'strength') return void errors.push(`${sat}: "${exerciseId}" is cardio (cardio is auto-inserted), skipped`);
      const order = num(s.order) ?? si + 1;
      let id = str(s.id) ?? `${dayId}-${order}`;
      while (slots.some((x) => x.id === id)) id += '+';
      const repRange = readRange(s) ?? ex.repRange;
      if (!readRange(s)) warnings.push(`${sat}: no repMin/repMax; using exercise default`);
      const sets = num(s.sets) ?? ex.defaultSets;
      slots.push({
        id,
        kind: 'strength',
        exerciseId,
        sets,
        repRange,
        restSec: num(s.restSec),
        substitutionGroup: str(s.pattern) ?? str(s.substitutionGroup) ?? ex.substitutionGroup,
        order,
      });
    });
    slots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    days.push({ id: dayId, name, focus: str(d.focus), ...inferDay(dayId, name), slots });
  });

  // Rotations
  const sched = isObj(raw.schedules) ? raw.schedules : {};
  const readRotation = (key: string, v: unknown): string[] => {
    const arr = isObj(v) ? strArr(v.rotation) : strArr(v);
    if (!arr || !arr.length) {
      warnings.push(`schedules.${key} missing; using days order`);
      return days.map((d) => d.id);
    }
    const valid = arr.filter((id) => days.some((d) => d.id === id));
    if (valid.length !== arr.length) errors.push(`schedules.${key}: unknown day ids removed`);
    return valid.length ? valid : days.map((d) => d.id);
  };
  const six = sched['six-day'] ?? sched.six_day ?? programRaw.rotation;
  const three = sched['three-day'] ?? sched.three_day ?? six;
  const rotations: Record<Schedule, string[]> = { 6: readRotation('six-day', six), 3: readRotation('three-day', three) };

  // Progression rules
  const pr = isObj(raw.progressionRules) ? raw.progressionRules : {};
  const dl = isObj(pr.deload) ? pr.deload : {};
  const rir = isObj(pr.targetRir) ? pr.targetRir : {};
  const progressionRules: ProgressionRules = {
    stallConsecutiveSessions: num(pr.stallConsecutiveSessions) ?? DEFAULT_PROGRESSION_RULES.stallConsecutiveSessions,
    stallLoadReductionPct: num(pr.stallLoadReductionPct) ?? DEFAULT_PROGRESSION_RULES.stallLoadReductionPct,
    deload: {
      setReductionPct: num(dl.setReductionPct) ?? DEFAULT_PROGRESSION_RULES.deload.setReductionPct,
      loadReductionPct: num(dl.loadReductionPct) ?? DEFAULT_PROGRESSION_RULES.deload.loadReductionPct,
    },
    targetRir: { compound: str(rir.compound) ?? '1-3', isolation: str(rir.isolation) ?? '0-2' },
  };
  if (pr.method !== undefined && pr.method !== 'double_progression') {
    warnings.push(`progressionRules.method "${String(pr.method)}" unsupported; using double_progression`);
  }

  const program: Program = {
    id: str(programRaw.id) ?? 'ppl',
    name: str(programRaw.name) ?? 'Push / Pull / Legs',
    days,
    rotations,
  };
  const ok = days.some((d) => d.slots.length > 0);
  if (!ok) errors.push('no usable program days');
  return {
    ok,
    seed: ok
      ? {
          version: version ?? 1,
          unitDefault,
          exercises: [...exercises.values()],
          groups: [...groups.values()],
          program,
          increments,
          progressionRules,
          warmupExerciseId,
        }
      : null,
    errors,
    warnings,
  };
}
