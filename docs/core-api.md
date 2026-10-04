# Core API (`src/core`) — for the UI

Import everything from `src/core` (`import { useToday } from '../core'`). Never touch storage.
All weights in/out are in `settings.unit` (sessions store weights as entered + `session.unit`; reads convert).

## Hooks (re-render on any store change; `status` is `'loading' | 'ready' | 'error'`)

```ts
useToday(dayId?) => {
  status; today: TodayView | null; days: DaySummary[]; activeSession: WorkoutSession | null;
  startSession(dayId?): WorkoutSession            // returns the existing active session if any
}
useWorkout() => {
  status; session: WorkoutSession | null; entries: ActiveEntryView[]; unit: Unit;
  startSession(dayId?): WorkoutSession;
  logSet(entryIdx, setIdx, patch: Partial<SetLog>): { prs: PRResult[] }   // PRs only when set becomes done
  addSet(entryIdx, init?: Partial<SetLog>): number;  removeSet(entryIdx, setIdx): void;
  logCardio(entryIdx, { durationMin?, done? }): void;                      // entry 0 = cardio when enabled
  getSwaps(entryIdx): Exercise[];
  swapExercise(slotId, exerciseId, scope: 'session' | 'permanent'): void;
  finishSession(): { session: WorkoutSession; prs: PRResult[] } | null;  discardSession(): void;
}
useExerciseHistory(exerciseId) => { exercise?: Exercise; series: ExerciseSeriesPoint[] /* old→new */;
  prs: PRResult[]; sessions: WorkoutSession[] /* new→old */; last: LastPerformance | null }
useExercises() => { exercises: Exercise[]; byId; groups: Record<id, SubstitutionGroup>; customExercises;
  getSwaps(exerciseId, slotId?): Exercise[]; swapExercise(...); clearPermanentSwap(slotId);
  addCustomExercise(input: CustomExerciseInput): Exercise; removeCustomExercise(id) }
useSettings() => { settings: Settings; updateSettings(patch: SettingsPatch): Settings; clearPermanentSwap(slotId);
  convertWeight(v, from, to); roundToIncrement(v, inc, mode?) }
useDataTransfer() => { exportJSON(): string; exportFileName(): string;
  importJSON(json: string | object): Promise<{ ok; errors: string[]; warnings: string[]; counts? }> }
useCore(): Core;  useCoreState(): CoreState;  <CoreProvider core={createCore(...)}> (tests only)
```

## View types

```ts
TodayView { day: ProgramDay; rotationIndex; isNext; slots: TodaySlot[]; activeSession }
TodaySlot = TodayCardioSlot | TodayStrengthSlot
TodayCardioSlot   { kind:'cardio'; slot: CardioSlot; exercise: CardioExercise; programmedExerciseId; swapped;
                    durationMin; last: { sessionId; date; durationMin } | null }
TodayStrengthSlot { kind:'strength'; slot: Slot; exercise: StrengthExercise; programmedExerciseId; swapped;
                    target: { sets; repRange: {min,max}; restSec }; last: LastPerformance | null; progression: ProgressionHint }
LastPerformance   { sessionId; date; sets: SetLog[] }
DaySummary        { day; rotationIndex; isNext; lastDoneAt? }
ActiveEntryView   { index; entry: SessionEntry; exercise; programmedExerciseId; swapped;
                    last: LastPerformance | null; progression: ProgressionHint | null }
```

## Domain types (see `types.ts` JSDoc)

`Unit`, `ExerciseCategory = 'barbell_upper'|'barbell_lower'|'dumbbell'|'machine'`, `Exercise = StrengthExercise | CardioExercise`,
`Program {id, name, days, rotations: {3: DayId[], 6: DayId[]}}`, `ProgramDay {id, name, type?, variant?, focus?, slots}`,
`Slot {id:'push-a-1', kind:'strength', exerciseId, sets, repRange, restSec?, substitutionGroup?, order?}`,
`CardioSlot {id:'cardio-warmup', kind:'cardio', exerciseId, durationMin, substitutionGroup:'cardio-warmup'}`,
`WorkoutSession {id, programId, dayId, startedAt, finishedAt?, unit, entries}`,
`SessionEntry = StrengthEntry {kind:'strength', slotId, exerciseId, sets, target:{sets, repRange}, restSec} | CardioEntry {kind:'cardio', slotId, exerciseId, durationMin, done, timestamp?}`,
`SetLog {weight, reps, done, timestamp?}`, `Settings {unit, defaultRestSec, schedule: 3|6, increments, permanentSwaps, cardio:{enabled, defaultDurationMin}}`,
`PRResult {kind:'e1rm'|'topSet'|'repsAtWeight', exerciseId, value, previous?, weight, reps, date?, sessionId?}`,
`ExerciseSeriesPoint {date, sessionId, e1rm, topSet:{weight, reps}, volume}`,
`ProgressionHint {exerciseId, action:'increase'|'hold'|'addReps'|'reduce', newWeight?, increment?, targetReps?, message}`.

## Imperative / pure

`getCore()` → `Core` with all actions above + `getState()`, `subscribe()`, `init()`, `flush()`, `deleteSession(id)`, `exportJSON()`, `importJSON()`.
Pure (take a `CoreState`): `getToday(state, dayId?)`, `getDays`, `getProgression(state, id, target?)`, `getSwaps(state, id, slotId?)`,
`getSessions(state, {exerciseId?, limit?})`, `getExerciseSeries`, `getPRs`, `getActiveEntries`, `nextDayId(program, sessions, schedule)`.
Math: `epley`, `topSet`, `volume`, `bestE1rm`, `doneSets`, `convertWeight`, `roundToIncrement`, `detectPRs`, `prefillFromLast`, `suggestProgression`.
