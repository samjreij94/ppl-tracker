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
  logSet(entryIdx, setIdx, patch: Partial<SetLog>): { prs: PRResult[] }   // per-set PRs (live pill), only when set becomes done; carry-over to later untouched sets
  addSet(entryIdx, init?: Partial<SetLog>): number;  removeSet(entryIdx, setIdx): void;
  logCardio(which: 'warmup' | 'finisher' | entryIdx, { durationMin?, done?, metrics?: {incline?, speed?, calories?, output?} }): void;
  finisher: TodayFinisher | null; hasFinisher: boolean;                     // optional zone-2 cardio after lifting
  addFinisher(opts?: { exerciseId?, durationMin? }): number; removeFinisher(): void;
  getSwaps(entryIdx): Exercise[];
  swapExercise(slotId, exerciseId, scope: 'session' | 'permanent'): void;
  finishSession(): { session: WorkoutSession; prs: PRResult[] } | null;  // null (and discarded) if nothing was done
  discardSession(): void;
}
useExerciseHistory(exerciseId) => { exercise?: Exercise; series: ExerciseSeriesPoint[] /* old→new */;
  prs: PRResult[]; sessions: WorkoutSession[] /* new→old */; last: LastPerformance | null;
  cardio: CardioHistoryItem[] /* cardio exercises: warm-ups + finishers, new→old */;
  sessionPRs(sessionOrId): PRResult[] /* canonical PRs of a session, see "What counts as a PR" */ }
useExercises() => { exercises: Exercise[]; byId; groups: Record<id, SubstitutionGroup>; customExercises;
  getSwaps(exerciseId, slotId?): Exercise[]; swapExercise(...); clearPermanentSwap(slotId);
  addCustomExercise(input: CustomExerciseInput): Exercise; removeCustomExercise(id) }
useSettings() => { settings: Settings; goal: Goal; finisherConfig: FinisherConfig; activity: ActivityConfig;
  bodyweightLog: BodyweightLogConfig; updateSettings(patch: SettingsPatch): Settings; clearPermanentSwap(slotId);
  convertWeight(v, from, to); roundToIncrement(v, inc, mode?);
  deload: DeloadStatus; startDeload(opts?: { weekLength? }): DeloadStatus; endDeload(): DeloadStatus;
  profile: Profile; onboarded: boolean; completeOnboarding(input: OnboardingInput): Settings; updateProfile(patch: ProfilePatch): Settings }
useOnboarding() => { status; onboarded: boolean; onboardedAt?: string; profile: Profile;
  completeOnboarding(input: OnboardingInput): Settings; updateProfile(patch: ProfilePatch): Settings }
useDeload() => { status: DeloadStatus; startDeload(opts?: { weekLength? }): DeloadStatus; endDeload(): DeloadStatus }
useBodyweight() => { entries: BodyweightEntry[] /* new→old */; trend: BodyweightTrend; config: BodyweightLogConfig; goal: Goal;
  logBodyweight({ date?: 'YYYY-MM-DD' /* default today */, weight, unit?, note? }): BodyweightEntry /* upsert per date */;
  deleteBodyweight(date): void }
useDataTransfer() => { exportJSON(): string; exportFileName(): string;
  importJSON(json: string | object): Promise<{ ok; errors: string[]; warnings: string[]; counts? }> }
useCore(): Core;  useCoreState(): CoreState;  <CoreProvider core={createCore(...)}> (tests only)
```

## View types

```ts
TodayView { day: ProgramDay; rotationIndex; isNext; slots: TodaySlot[]; finisher: TodayFinisher | null; activeSession;
            deload: DeloadStatus }
DeloadStatus { active; startedAt?; endsAt?; daysLeft?; due; weeksSinceLast: number | null; reason: string | null; dueAfterWeeks }
TodayFinisher { slot: CardioSlot; exercise: CardioExercise; programmedExerciseId; swapped; durationMin /* last finisher or 15 */;
                minDurationMin; maxDurationMin; intensity: 'zone-2'; effortNote?; prescription: string; last: CardioHistoryItem | null; autoAdd }
CardioHistoryItem { sessionId; date; exerciseId; role: 'warmup' | 'finisher'; durationMin }
BodyweightTrend { unit; points: { date; weight; avg }[]; currentAvg; previousAvg;
                  weeklyRate: { lossPerWeek; lossPctPerWeek } | null /* positive = losing */;
                  status: 'tooSlow' | 'onTrack' | 'tooFast' | 'insufficientData'; target: {min, max}; entriesThisWindow }
TodaySlot = TodayCardioSlot | TodayStrengthSlot
TodayCardioSlot   { kind:'cardio'; slot: CardioSlot; exercise: CardioExercise; programmedExerciseId; swapped;
                    durationMin; last: { sessionId; date; durationMin } | null; prescription? /* exercise defaultPrescription */ }
TodayStrengthSlot { kind:'strength'; slot: Slot; exercise: StrengthExercise; programmedExerciseId; swapped;
                    target: { sets; repRange: {min,max}; restSec }; last: LastPerformance | null; progression: ProgressionHint }
LastPerformance   { sessionId; date; sets: SetLog[] }
DaySummary        { day; rotationIndex; isNext; lastDoneAt? }
ActiveEntryView   { index; entry: SessionEntry; exercise; programmedExerciseId; swapped;
                    last: LastPerformance | null; progression: ProgressionHint | null; prescription? /* cardio only */ }
```

## Domain types (see `types.ts` JSDoc)

`Unit`, `ExerciseCategory = 'barbell_upper'|'barbell_lower'|'dumbbell'|'machine'`, `Exercise = StrengthExercise | CardioExercise`,
`Program {id, name, days, rotations: {3: DayId[], 6: DayId[]}}`, `ProgramDay {id, name, type?, variant?, focus?, slots}`,
`Slot {id:'push-a-1', kind:'strength', exerciseId, sets, repRange, restSec?, substitutionGroup?, order?}`,
`CardioSlot {id:'cardio-warmup', kind:'cardio', exerciseId, durationMin, substitutionGroup:'cardio-warmup'}`,
`WorkoutSession {id, programId, dayId, startedAt, finishedAt?, unit, entries, deload?: boolean, prs?: PRResult[]}`,
`SessionEntry = StrengthEntry {kind:'strength', slotId, exerciseId, sets, target:{sets, repRange}, restSec} | CardioEntry {kind:'cardio', role:'warmup'|'finisher', slotId:'cardio-warmup'|'cardio-finisher', exerciseId, durationMin, done, timestamp?, metrics?}`,
`SetLog {weight, reps, done, timestamp?}`, `Settings {unit, defaultRestSec, schedule: 3|6, increments, permanentSwaps, cardio:{enabled, defaultDurationMin}, finisher:{autoAdd}, goal: Goal, deload: {active, startedAt?, weekLength /* days, 7 */, lastEndedAt?}, profile: {name, experience?}, onboardedAt?}`,
`Goal {type:'fat-loss'|'build-muscle'|'general-strength', targetLossPctBodyweightPerWeek:{min,max}, proteinGPerLbGoalBodyweight?}`,
`Experience = 'beginner'|'intermediate'|'advanced'`, `Profile {name: string, experience?: Experience}`, `BodyweightEntry {date:'YYYY-MM-DD', weight, unit, note?}`,
`PRResult {kind:'e1rm'|'topSet'|'repsAtWeight', exerciseId, value, previous?, weight, reps, date?, sessionId?}`,
`ExerciseSeriesPoint {date, sessionId, e1rm, topSet:{weight, reps}, volume}`,
`ProgressionHint {exerciseId, action:'increase'|'addReps'|'hold'|'dropSet'|'reduceLoad'|'deload', newWeight?, increment?, targetReps?, newSets?, rules:'base'|'cut', message}`.

## Imperative / pure

`getCore()` → `Core` with all actions above + `getState()`, `subscribe()`, `init()`, `flush()`, `deleteSession(id)`, `exportJSON()`, `importJSON()`,
`logBodyweight`, `deleteBodyweight`, `getBodyweightTrend()`, `completeOnboarding(input)`, `updateProfile(patch)`, `startDeload(opts?)`, `endDeload()`, `getDeloadStatus()`.
Pure (take a `CoreState`): `getToday(state, dayId?, now?)`, `deloadDue(state, now?)`, `deloadSets(sets, pct?)`,
`finisherPrescription(finisherConfig, exercise, durationMin)`, `warmupPrescription(exercise, durationMin)`, `getDays`, `getProgression(state, id, target?)`, `getSwaps(state, id, slotId?)`,
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
- **PRs** (see "What counts as a PR" below for the canonical per-session definition): `logSet` compares against prior sets only (history + earlier done sets this session); a first-ever set is never a PR;
  editing an already-done set doesn't re-fire. `finishSession` returns the best new record per kind per exercise vs history.
- **Custom exercises**: ids are `custom-<slug>[-n]` and never collide with seed ids; `removeCustomExercise` throws if the
  exercise is in the active session; imports whose custom ids collide with seed ids are rejected.
- **Import** validates everything first; any error → `{ok:false, errors}` and nothing changes.

Additive exports in phase 2: `plannedSets`, `prefillSets`, `convertDistance`, `convertCardioMetrics`, type
`ExerciseHistoryItem`; fields `CardioMetrics.distance`, `CardioSlot.metrics`, `TodayCardioSlot.metrics`,
`TodayFinisher.metrics`, `TodayStrengthSlot.plannedSets`, `LastPerformance.sourceUnit`; `prefillFromLast(target, last, {roundTo?})`.

## Behavior details (phase 3)

- **Prefill applies the hint** (`prefillSets` / `startSession` / session swaps). Prefill source = the exercise's last
  **non-deload** session. Then:
  - `increase` / `reduceLoad`: every **working set** (source set at the last top-set weight) gets `hint.newWeight` and
    reps **reset to `repRange.min`** (= `hint.targetReps`; double progression restarts at the bottom of the range after a
    load change, per the seed's `afterIncrease`). Lighter back-off sets keep their last weight/reps.
  - `addReps` / `hold` / `dropSet`: last weight and reps unchanged (dropSet only changes the set count).
  - `deload`: all (reduced) sets get `hint.newWeight` × `repRange.min`.
- **Deload** (seed `progressionRules.deload`; the cut keeps the same protocol, only the cadence changes):
  - `startDeload({weekLength?})` → `settings.deload = {active: true, startedAt, weekLength (7)}`; `endDeload()` →
    `{active: false, lastEndedAt}`. The store **auto-ends** an expired deload (`startedAt + weekLength` days) on `init()`
    and `startSession()`, setting `lastEndedAt` to the scheduled end.
  - While active: `plannedSets` = `deloadSets(sets)` = **max(1, ceil(sets × 0.5))** (floor 1 = the seed formula;
    a 2-set slot becomes 1 set); hint `{action: 'deload', newSets, newWeight: last working weight × 0.9 snapped to the
    increment (nearest), targetReps: repRange.min, message: 'deload week: 2 × 5 at 120 lb, stop at RIR 3-4'}` (no
    `newWeight` without history). Sessions **started** while active get `session.deload = true` (an already-running
    session is not changed).
  - Deload sessions: PRs are still detected (logSet + finishSession, stored in `session.prs`); they appear in history,
    series, PRs and `TodayStrengthSlot.last` (factual), but are **excluded from progression** (stall counting, hint,
    prefill source), so they never trigger `reduceLoad`; after the deload, prefill resumes from pre-deload work.
  - `deloadDue(state, now?)` / `TodayView.deload` / `useDeload().status` / `useSettings().deload`:
    `weeksSinceLast` = whole weeks since `lastEndedAt` (else the newest deload session, else the first session; null with
    none). `dueAfterWeeks` = **5 under the fat-loss cut** (`cutAdjustments.deloadNote` "around every 5-6 weeks"),
    else `deload.frequencyWeeks.min` = **6**. `due` when `weeksSinceLast ≥ dueAfterWeeks` and there has been ≥ 1
    non-deload session finished at or after the anchor (reason `"6 weeks since last deload"` / `"5 weeks since you started"`), or
    early when **≥ 3 exercises** trained in the last 14 days currently have a `reduceLoad`/`dropSet` hint (seed trigger;
    reason `"3 exercises stalled in the last 2 weeks"`). Never due while active. Due is advisory: nothing auto-starts.
- **Per-session PRs**: `finishSession` stores its returned PRs on `session.prs` (computed vs prior history at finish time,
  display unit at that time; `[]` when none). Old sessions have no `prs` (undefined) and load fine; export/import
  round-trips it (`validateExport` rejects a non-array `prs` / non-boolean `deload`).
- **Prescriptions**: `TodayCardioSlot.prescription` = the warm-up exercise's seed `defaultPrescription` (fallback
  `"<min> min easy-moderate"`). `TodayFinisher.prescription` = `finisherPrescription(finisher, exercise, durationMin)`,
  e.g. `"15 min Incline Treadmill Walk, easy zone 2: conversational pace, you can speak in full sentences (RPE 3-4)"`
  (never the 10-min warm-up text; follows swaps and the chosen duration). `ActiveEntryView.prescription` gives the same
  for cardio entries (finisher uses `entry.durationMin`). Seed fields are untouched.

Additive in phase 3: `Settings.deload`, `WorkoutSession.deload?`, `WorkoutSession.prs?`, `ProgressionAction | 'deload'`,
`ProgressionRules.deload.frequencyWeeks?/targetRir?`, `CutAdjustments.deloadFrequencyWeeks?/deloadNote?`, types
`DeloadSettings`, `DeloadStatus`, `UseDeload`; `TodayView.deload`, `TodayFinisher.prescription`,
`TodayCardioSlot.prescription?`, `ActiveEntryView.prescription?`, `ExerciseHistoryItem.deload?`; `Core.startDeload/endDeload/getDeloadStatus`,
`useDeload`, `useSettings().deload/startDeload/endDeload`, `SettingsPatch.deload?`; pure `deloadDue`, `deloadSets`,
`finisherPrescription`, `warmupPrescription`, `DEFAULT_DELOAD_WEEK_LENGTH`; optional params `getToday(state, dayId?, now?)`,
`exerciseHistory(sessions, id, unit, {excludeDeload?})`, `lastPerformance(state, id, {excludeDeload?})`,
`suggestProgression({..., deload?})`.

## Onboarding & goals (phase 4)

- **Fields**: `Settings.profile: {name: string /* '' until set */, experience?: 'beginner'|'intermediate'|'advanced'}`,
  `Settings.onboardedAt?: string` (ISO). A fresh install has no `onboardedAt` → show onboarding (after `status !== 'loading'`).
  `experience` is optional in the type because a fresh/migrated install has not chosen one yet.
- **`core.completeOnboarding({name, goal, experience, unit, schedule}): Settings`** — sets `profile.name` (trimmed),
  `profile.experience`, `goal.type` (`goal` may be the type string or `{type, ...}`; the rest of `goal` is kept), `unit`,
  `schedule` and `onboardedAt = now` in ONE state update and ONE settings write. Invalid unit/schedule/experience are
  ignored (current values kept). Type: `OnboardingInput`.
- **`core.updateProfile({name?, experience?}): Settings`** (type `ProfilePatch`). Everything stays editable via
  `updateSettings` (deep patch: `{profile: {experience}}`, `{goal: {type}}`, `{onboardedAt}`).
- **Hooks**: `useSettings()` adds `profile`, `onboarded`, `completeOnboarding`, `updateProfile`;
  `useOnboarding() => {status, onboarded, onboardedAt?, profile, completeOnboarding, updateProfile}`.
- **Experience is stored only** — it has no effect on prefill, progression, deload or anything else.
- **Goal types** (`settings.goal.type`; `GOAL_TYPES`):
  - `fat-loss` → cut rules (3-session stall, hold/dropSet then −5%, maintaining = success), deload due after **5** weeks,
    bodyweight loss-rate verdict (`tooSlow`/`onTrack`/`tooFast`).
  - `build-muscle`, `general-strength` (and any other string) → base rules (2-session stall → −10%, maintaining is NOT
    success), deload due after **6** weeks, bodyweight trend WITHOUT a verdict: `BodyweightTrend.goalApplies = false` and
    `status` stays the neutral `'insufficientData'` (weeklyRate/averages still computed). A new `'notApplicable'` status
    member was NOT added because the UI's `BodyweightStatus` is a closed 4-member union assigned from `trend.status`;
    use `goalApplies` instead.
  - Rules are keyed off `settings.goal.type` (the seed's `goal` only provides the default).
- **Migration** (so existing installs aren't re-prompted): on `init()`, if ANY user data is stored (settings, sessions,
  custom exercises, bodyweight or an active session) and `onboardedAt` is missing → `onboardedAt = now` and
  `goal.type = 'fat-loss'` if the stored settings had no goal type; persisted immediately. A truly fresh install (nothing
  stored) is not written and stays un-onboarded. `importJSON` applies the same migration to files without `onboardedAt`
  (files with it keep theirs, plus their profile and goal).

Additive in phase 4: `Settings.profile`, `Settings.onboardedAt?`, types `Profile`, `Experience`, `OnboardingInput`,
`ProfilePatch`, `UseOnboarding`; `GoalType` adds `'build-muscle' | 'general-strength'`; consts `GOAL_TYPES`,
`EXPERIENCE_LEVELS`; `BodyweightTrend.goalApplies`; `SettingsPatch.profile?`; `Core.completeOnboarding`,
`Core.updateProfile`; `useOnboarding`; `useSettings().profile/onboarded/completeOnboarding/updateProfile`.

## What counts as a PR

Single source of truth for the workout summary AND history: **`session.prs`** (written by `finishSession`), read via
**`sessionPRs(state, sessionOrId)`** (also `useExerciseHistory(id).sessionPRs(sessionOrId)`). **PR count of a session =
`sessionPRs(state, session).length`.** The UI must not recompute PRs itself.

1. Only **done** sets of **strength** exercises count (cardio never). Each set is compared with that exercise's done sets
   from **finished sessions before this session** (never with other sets of the same session). An exercise with no prior
   sets (first time ever) has **no** PRs. A substitute exercise has its own history.
2. A set is a candidate for each kind it beats (values in the display unit):
   - `e1rm`: its Epley e1RM (`weight × (1 + reps/30)`, weight > 0) is higher than the best prior e1RM;
   - `topSet`: its weight is heavier than every prior set;
   - `repsAtWeight`: it has more reps than any prior set at exactly that weight (the weight must have been lifted before).
3. Per exercise, keep **at most ONE PR per kind** — the best candidate of that kind in the session: `e1rm` → highest e1RM;
   `topSet` → heaviest weight; `repsAtWeight` → heaviest weight (tie → most reps). So a session has at most
   3 PRs per exercise. Order: exercise order in the session, then `e1rm`, `topSet`, `repsAtWeight`.
4. Each PR carries `previous` (the prior best of that kind; for `repsAtWeight` the prior best reps at that weight),
   `weight`, `reps`, `sessionId`, `date` (= session start).
5. `session.prs` is frozen at finish time (unit of that time). Sessions finished before `prs` existed get the same rules
   computed on demand by `sessionPRs` against the sessions before them (current unit). **Deleting a session does not
   rewrite later sessions' stored `prs`** — they stay as they were when those sessions were finished.
6. `logSet`'s returned `prs` are different on purpose: per set, for the live pill, compared with history AND earlier done
   sets of the current session (so two improving sets can both light up); they are not stored. `getPRs(state, id)` is the
   current all-time record table for one exercise (not per session).

## QC fixes (phase 5)

- **Set carry-over**: prefilled sets carry `SetLog.prefill: 'history' | 'default'` and edited sets `SetLog.touched: true`
  (active session only; stripped on finish). When `logSet` marks a set done or enters weight/reps, every LATER set of that
  entry that is untouched, not done and not a per-set history copy (`prefill !== 'history'`; legacy sets without the
  marker: only weight 0) gets that set's weight and reps. So a first-time 135×8 on set 1 fills sets 2..N; with history the
  per-set copies stay, only sets beyond last time's count carry. `addSet()` copies the previous set (`prefill: 'default'`,
  still a carry target); `addSet(i, init)` counts as touched.
- **Durable settings / active session**: every settings write is stamped `settings.updatedAt`. The app's default core
  (`getCore()`) mirrors settings (`ppl-tracker/v1/settings`) and the active session (`ppl-tracker/v1/active`,
  `{savedAt, value}`) SYNCHRONOUSLY to localStorage (`createCore({mirror})`, `browserLocalStorage()`), in addition to
  IndexedDB. On `init()` the newer settings copy (by `updatedAt`) wins and repairs IndexedDB; the active mirror wins unless
  that session is already in the finished history. A finished/discarded session clears the active mirror only after
  IndexedDB has the new state. A failing mirror write removes the mirror key (a stale copy never wins). The core also
  registers `pagehide` and `visibilitychange` (hidden) listeners that call `flush()` (browser only; `lifecycle: false`
  disables; `core.dispose()` removes them). Tests/`createCore` without `mirror` behave as before.
- **Empty finish**: `finishSession()` with no done strength set and no done cardio does NOT save a session and does NOT
  advance the rotation: it discards the active session (like `discardSession()`) and returns `null`. A session with only
  done cardio is saved. `deleteSession` rewinds the rotation (the next day follows the latest remaining session).

Additive in phase 5: `SetLog.touched?`, `SetLog.prefill?`, `Settings.updatedAt?`, `computeSessionPRs(session,
priorSessions, unit)`, `sessionPRs(state, sessionOrId)`, `useExerciseHistory().sessionPRs`, `Core.dispose()`,
`CreateCoreOptions.mirror?` / `lifecycle?`, `SyncStorage`, `MIRROR_KEYS`, `browserLocalStorage()`,
`createMemorySyncStorage()`. Behavior: `finishSession` dedupes to one PR per exercise per kind (previously one
`repsAtWeight` per weight) and returns null for empty sessions.
