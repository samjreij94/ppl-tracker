/**
 * Export / import of user data (settings, custom exercises, sessions).
 * The seed itself is never exported.
 */
import type { BodyweightEntry, Exercise, Settings, WorkoutSession } from './types';

export const EXPORT_VERSION = 1;

/** Shape of an export file. */
export interface ExportFile {
  app: 'ppl-tracker';
  version: number;
  /** ISO time */
  exportedAt: string;
  settings: Settings;
  customExercises: Exercise[];
  sessions: WorkoutSession[];
  active: WorkoutSession | null;
  /** Optional on import (older exports). */
  bodyweight: BodyweightEntry[];
}

/** Result of `importJSON`. On any error nothing is changed (`ok: false`). */
export interface ImportResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Present when ok. */
  counts?: { sessions: number; customExercises: number; bodyweight: number };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkSession(s: unknown, at: string, errors: string[]): s is WorkoutSession {
  const start = errors.length;
  const bad = (m: string) => {
    errors.push(`${at}: ${m}`);
  };
  if (!isObj(s)) {
    bad('not an object');
    return false;
  }
  for (const k of ['id', 'programId', 'dayId', 'startedAt'] as const) {
    if (typeof s[k] !== 'string') bad(`${k} must be a string`);
  }
  if (s.unit !== 'lb' && s.unit !== 'kg') bad('unit must be "lb" or "kg"');
  if (!Array.isArray(s.entries)) {
    bad('entries must be an array');
    return false;
  }
  s.entries.forEach((e, i) => {
    if (!isObj(e) || typeof e.slotId !== 'string' || typeof e.exerciseId !== 'string') {
      bad(`entries[${i}] invalid`);
    } else if (e.kind === 'cardio') {
      if (typeof e.durationMin !== 'number') bad(`entries[${i}].durationMin must be a number`);
    } else if (
      !Array.isArray(e.sets) ||
      !e.sets.every((x) => isObj(x) && typeof x.weight === 'number' && typeof x.reps === 'number' && typeof x.done === 'boolean')
    ) {
      bad(`entries[${i}].sets invalid`);
    }
  });
  return errors.length === start;
}

/** Validate a parsed/unparsed export. Pure; does not apply anything. */
export function validateExport(input: unknown): { file: ExportFile | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { file: null, errors: [`invalid JSON: ${(e as Error).message}`], warnings };
    }
  }
  if (!isObj(raw)) return { file: null, errors: ['root must be an object'], warnings };
  if (raw.app !== undefined && raw.app !== 'ppl-tracker') errors.push(`not a ppl-tracker export (app="${String(raw.app)}")`);
  if (typeof raw.version !== 'number') errors.push('version missing');
  else if (raw.version > EXPORT_VERSION) errors.push(`version ${raw.version} is newer than supported ${EXPORT_VERSION}`);
  if (!isObj(raw.settings)) errors.push('settings missing');
  if (!Array.isArray(raw.sessions)) errors.push('sessions must be an array');
  else raw.sessions.forEach((s, i) => checkSession(s, `sessions[${i}]`, errors));
  const custom = raw.customExercises ?? [];
  if (!Array.isArray(custom)) errors.push('customExercises must be an array');
  else custom.forEach((e, i) => {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.name !== 'string' || (e.kind !== 'strength' && e.kind !== 'cardio')) errors.push(`customExercises[${i}] invalid`);
  });
  if (raw.active != null) checkSession(raw.active, 'active', errors);
  const bw = raw.bodyweight ?? [];
  if (!Array.isArray(bw)) errors.push('bodyweight must be an array');
  else bw.forEach((e, i) => {
    if (!isObj(e) || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || typeof e.weight !== 'number' || !(e.weight > 0) || (e.unit !== 'lb' && e.unit !== 'kg')) {
      errors.push(`bodyweight[${i}] invalid (need {date:'YYYY-MM-DD', weight>0, unit})`);
    }
  });
  if (errors.length) return { file: null, errors, warnings };
  return {
    file: {
      app: 'ppl-tracker',
      version: raw.version as number,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      settings: raw.settings as Settings,
      customExercises: custom as Exercise[],
      sessions: raw.sessions as WorkoutSession[],
      active: (raw.active as WorkoutSession | null) ?? null,
      bodyweight: bw as BodyweightEntry[],
    },
    errors,
    warnings,
  };
}
