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
  logCardio(which: 'warmup' | 'finisher' | entryIdx, { durationMin?, done?, metrics?: {incline?, speed?, calories?, output?} }): void;
  finisher: TodayFinisher | null; hasFinisher: boolean;                     // optional zone-2 cardio after lifting
  addFinisher(opts?: { exerciseId?, durationMin? }): number; removeFinisher(): void;
  getSwaps(entryIdx): Exercise[];
  swapExercise(slotId, exerciseId, scope: 'session' | 'permanent'): void;
  finishSession(): { session: WorkoutSession; prs: PRResult[] } | null;  discardSession(): void;
}
useExerciseHistory(exerciseId) => { exercise?: Exercise; series: ExerciseSeriesPoint[] /* old→new */;
  prs: PRResult[]; sessions: WorkoutSession[] /* new→old */; last: LastPerformance | null;
  cardio: CardioHistoryItem[] /* cardio exercises: warm-ups + finishers, new→old */ }
useExercises() => { exercises: Exercise[]; byId; groups: Record<id, SubstitutionGroup>; customExercises;
  getSwaps(exerciseId, slotId?): Exercise[]; swapExercise(...); clearPermanentSwap(slotId);
  addCustomExercise(input: CustomExerciseInput): Exercise; removeCustomExercise(id) }
useSettings() => { settings: Settings; goal: Goal; finisherConfig: FinisherConfig; activity: ActivityConfig;
  bodyweightLog: BodyweightLogConfig; updateSettings(patch: SettingsPatch): Settings; clearPermanentSwap(slotId);
  convertWeight(v, from, to); roundToIncrement(v, inc, mode?) }
useBodyweight() => { entries: BodyweightEntry[] /* new→old */; trend: BodyweightTrend; config: BodyweightLogConfig; goal: Goal;
  logBodyweight({ date?: 'YYYY-MM-DD' /* default today */, weight, unit?, note? }): BodyweightEntry /* upsert per date */;
  deleteBodyweight(date): void }
useDataTransfer() => { exportJSON(): string; exportFileName(): string;
  importJSON(json: string | object): Promise<{ ok; errors: string[]; warnings: string[]; counts? }> }
useCore(): Core;  useCoreState(): CoreState;  <CoreProvider core={createCore(...)}> (tests only)
```

## View types

```ts
TodayView { day: ProgramDay; rotationIndex; isNext; slots: TodaySlot[]; finisher: TodayFinisher | null; activeSession }
TodayFinisher { slot: CardioSlot; exercise: CardioExercise; programmedExerciseId; swapped; durationMin /* last finisher or 15 */;
                minDurationMin; maxDurationMin; intensity: 'zone-2'; effortNote?; last: CardioHistoryItem | null; autoAdd }
CardioHistoryItem { sessionId; date; exerciseId; role: 'warmup' | 'finisher'; durationMin }
BodyweightTrend { unit; points: { date; weight; avg }[]; currentAvg; previousAvg;
                  weeklyRate: { lossPerWeek; lossPctPerWeek } | null /* positive = losing */;
                  status: 'tooSlow' | 'onTrack' | 'tooFast' | 'insufficientData'; target: {min, max}; entriesThisWindow }
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
`SessionEntry = StrengthEntry {kind:'strength', slotId, exerciseId, sets, target:{sets, repRange}, restSec} | CardioEntry {kind:'cardio', role:'warmup'|'finisher', slotId:'cardio-warmup'|'cardio-finisher', exerciseId, durationMin, done, timestamp?, metrics?}`,
`SetLog {weight, reps, done, timestamp?}`, `Settings {unit, defaultRestSec, schedule: 3|6, increments, permanentSwaps, cardio:{enabled, defaultDurationMin}, finisher:{autoAdd}, goal: Goal}`,
`Goal {type:'fat-loss', targetLossPctBodyweightPerWeek:{min,max}, proteinGPerLbGoalBodyweight?}`, `BodyweightEntry {date:'YYYY-MM-DD', weight, unit, note?}`,
`PRResult {kind:'e1rm'|'topSet'|'repsAtWeight', exerciseId, value, previous?, weight, reps, date?, sessionId?}`,
`ExerciseSeriesPoint {date, sessionId, e1rm, topSet:{weight, reps}, volume}`,
`ProgressionHint {exerciseId, action:'increase'|'addReps'|'hold'|'dropSet'|'reduceLoad', newWeight?, increment?, targetReps?, newSets?, rules:'base'|'cut', message}`.

## Imperative / pure

`getCore()` → `Core` with all actions above + `getState()`, `subscribe()`, `init()`, `flush()`, `deleteSession(id)`, `exportJSON()`, `importJSON()`,
`logBodyweight`, `deleteBodyweight`, `getBodyweightTrend()`.
Pure (take a `CoreState`): `getToday(state, dayId?)`, `getDays`, `getProgression(state, id, target?)`, `getSwaps(state, id, slotId?)`,
`getSessions(state, {exerciseId?, limit?})`, `getExerciseSeries`, `getPRs`, `getActiveEntries`, `getCardioHistory(state, {exerciseId?, role?})`,
`finisherOffer(state)`, `nextDayId(program, sessions, schedule)`, `bodyweightTrend(entries, unit, goal, windowDays?)`, `localDate()`.
Math: `epley`, `topSet`, `volume`, `bestE1rm`, `doneSets`, `convertWeight`, `roundToIncrement`, `detectPRs`, `prefillFromLast`, `suggestProgression`.

## Behavior details (phase 2)

- **Wait for `status !== 'loading'`** before calling actions (init loads storage asynchronously and replaces the snapshot).
- **Prefill** (`startSession`, session swaps): sets copied per set from the exercise's OWN last finished session
  (extra sets repeat the last one, surplus truncated); no history → weight 0, reps = repRange.min. If that session was
  logged in the other unit, weights are converted and snapped to the exercise increment (e.g. 135 lb → 60 kg).
- **Planned sets**: `TodayStrengthSlot.plannedSets` / `plannedSets(state, id, target)` = slot sets, or the hint's
  `newSets` after a cut `dropSet` (never below 2). `startSession` prefills that many sets and sets `entry.target.sets` to it.
  A dropped-set session whose planned sets all hit repMax counts for `increase`.
- **Progression** `increase.newWeight` = last top-set weight + increment (snapped to the grid if last was logged in the
  other unit). `reduceLoad` rounds to the increment. Per-exercise `increment` overrides convert across units.
- **Warm-up exercise** = permanent swap on `cardio-warmup`, else the **last done warm-up's exercise** (remembered pick),
  else `warmup.defaultExerciseId`. Duration + `metrics` prefill from the last done warm-up with that exercise.
  Finisher: same rule with its own history (`role: 'finisher'`), duration clamped 10–20.
- **Cardio metrics** `{incline?, speed?, distance?, calories?, output?}`: `speed`/`distance` are mph/mi in lb, km/h/km in kg;
  `getCardioHistory` and prefills convert to the current unit (`convertDistance`, `convertCardioMetrics`).
- **PRs** compare against prior sets only (history + earlier done sets this session); a first-ever set is never a PR;
  editing an already-done set doesn't re-fire. `finishSession` returns the best new record per kind per exercise vs history.
- **Custom exercises**: ids are `custom-<slug>[-n]` and never collide with seed ids; `removeCustomExercise` throws if the
  exercise is in the active session; imports whose custom ids collide with seed ids are rejected.
- **Import** validates everything first; any error → `{ok:false, errors}` and nothing changes.

Additive exports in phase 2: `plannedSets`, `prefillSets`, `convertDistance`, `convertCardioMetrics`, type
`ExerciseHistoryItem`; fields `CardioMetrics.distance`, `CardioSlot.metrics`, `TodayCardioSlot.metrics`,
`TodayFinisher.metrics`, `TodayStrengthSlot.plannedSets`, `LastPerformance.sourceUnit`; `prefillFromLast(target, last, {roundTo?})`.
