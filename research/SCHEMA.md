# exercises.json — Field Reference (version 1)

Version stays `1`: the fat-loss update only added fields and changed values. No id, field or shape was removed or renamed.

`research/exercises.json` is the single source of truth for program content. `research/validate_exercises.py` enforces every rule below. Run `python3 research/validate_exercises.py` after any edit.

## Id rule (permanent)

- **Every id is kebab-case:** `^[a-z0-9]+(-[a-z0-9]+)*$`. This covers exercise ids, pattern ids, day ids and the schedule keys (`six-day`, `three-day`).
- **Ids are permanent.** Workout history is keyed by `exerciseId` (and day/pattern ids), so never rename or reuse an id. To retire an exercise, stop referencing it; don't change its id. New exercises get new ids. `name` can change freely.
- **These are enum values, not ids, and keep their spelling:** progression category keys (`barbell_lower`, `barbell_upper`, `dumbbell`, `machine`), `equipment` values (e.g. `ez_bar`), and muscle names (e.g. `front_delts`).

## Top level

| Field | Type | Notes |
|---|---|---|
| `version` | number | `1` |
| `units` | `{ default: "lb" \| "kg" }` | Currently `"lb"`; every increment has both lb and kg values. |
| `progressionCategories` | `Record<Category, { incrementLb: number, incrementKg: number, note: string }>` | Exactly the 4 categories. |
| `progressionRules` | object | See below. |
| `categoryMappingRule` | string | Human-readable equipment → category rule and loading conventions. |
| `warmup` | `{ pattern: "cardio-warmup", defaultExerciseId: "incline-treadmill", appliesTo: "all-days" }` | Exact value. |
| `patterns` | `Pattern[]` | |
| `exercises` | `Exercise[]` | |
| `schedules` | `{ "six-day": DayId[], "three-day": { rotation: DayId[], note: string } }` | Both rotations are `push-a, pull-a, legs-a, push-b, pull-b, legs-b`. |
| `days` | `Day[]` | Exactly the 6 rotation days. |
| `goal` | `{ type: "fat-loss", targetLossPctBodyweightPerWeek: { min: number, max: number }, proteinGPerLbGoalBodyweight: { min: number, max: number } }` | Currently `fat-loss`, 0.5–1.0 %/week, 0.7–1.0 g/lb of goal bodyweight. `type` is a goal enum (only `fat-loss` exists today). |
| `finisher` | `{ optional: true, pattern: "cardio-warmup", defaultExerciseId: string, defaultDurationMin: number, minDurationMin: number, maxDurationMin: number, intensity: "zone-2", effortNote: string, appliesTo: "all-days", placement: "after-lifting" }` | Optional zone-2 cardio after the lifting slots on every day. Defaults: `incline-treadmill`, 15 min (10–20). Reuses the 3 cardio exercises. |
| `activity` | `{ dailyStepTarget: number, stepTargetRange: string, note: string }` | `8000`, `"7000-10000"` (format `"min-max"`). |
| `bodyweightLog` | `{ recommendedEntriesPerWeek: string, trendWindowDays: number }` | `"3-7"`, `7`. App settings for the bodyweight log (see `BodyweightEntry`). |

`Category = "barbell_lower" | "barbell_upper" | "dumbbell" | "machine"`

## progressionRules

| Field | Type |
|---|---|
| `method` | `"double_progression"` |
| `description`, `increaseWhen`, `afterIncrease`, `stallRule` | string |
| `targetRir` | `{ compound: "1-3", isolation: "0-2" }`, keyed by `Pattern.rirClass` |
| `stallConsecutiveSessions` | number (`2`) |
| `stallLoadReductionPct` | number (`10`) |
| `deload` | `{ frequencyWeeks: "6-8", trigger: string, protocol: string, setReductionPct: 50, loadReductionPct: 10, targetRir: "3-4" }`; deload sets = `ceil(sets × 0.5)` |
| `cutAdjustments` | `{ appliesWhenGoalType: "fat-loss", maintainCountsAsSuccess: true, description: string, stallConsecutiveSessions: 3, stallLoadReductionPct: 5, stallRule: string, deloadNote: string }` |

**Cut rule for the logic layer:** when `goal.type === progressionRules.cutAdjustments.appliesWhenGoalType` (currently `"fat-loss"`):
- Use `cutAdjustments.stallConsecutiveSessions`, `cutAdjustments.stallLoadReductionPct` and `cutAdjustments.stallRule` instead of the base fields with the same names.
- Treat a session that matches the previous load and reps as a success (`maintainCountsAsSuccess`), not as progress toward a stall.
- Before reducing load, first hold the load for one more session or drop one set on that slot (never below 2).
- The load-increase rule (`increaseWhen` / `afterIncrease`) and the deload protocol are unchanged. `deloadNote` says deloads may come around every 5–6 weeks.

Otherwise, use the base fields. The base fields stay in the file so a non-cut goal still works.

## Pattern

| Field | Type | Notes |
|---|---|---|
| `id` | string (kebab) | e.g. `horizontal-press` |
| `name` | string | |
| `rirClass` | `"compound" \| "isolation" \| null` | `null` only for `cardio-warmup` |
| `primaryMuscles` | `Muscle[]` | Count as 1 set each in volume math. |
| `secondaryMuscles` | `Muscle[]` | Count as 0.5 sets each. |
| `exerciseIds` | string[] | Every exercise appears in exactly one pattern. A pattern used by a slot has 4–7 exercises. |

`Muscle = chest | front_delts | side_delts | rear_delts | triceps | lats | upper_back | biceps | quads | hamstrings | glutes | calves | core`

## Exercise

| Field | Type | Strength | Cardio |
|---|---|---|---|
| `id` | string (kebab, permanent) | required | `incline-treadmill`, `flat-treadmill`, `peloton` |
| `name` | string | required | required |
| `kind` | `"strength" \| "cardio"` | `"strength"` | `"cardio"` |
| `pattern` | pattern id | its pattern | `"cardio-warmup"` |
| `equipment` | Strength: `barbell \| dumbbell \| machine \| cable \| bodyweight \| smith \| ez_bar \| kettlebell`. Cardio: `treadmill \| bike` | required | required |
| `progressionCategory` | `Category \| null` | one of the 4 | `null` (the logic layer skips progression) |
| `primaryMuscles` | `Muscle[]` | copied from its pattern | `[]` |
| `unilateral` | `true` (optional) | present only when reps and load are per side | — |
| `defaultDurationMin` | number | — | `10` |
| `defaultPrescription` | string | — | required |
| `notes` | string | — | required |

Cardio exercises never carry `sets`, `repMin`, `repMax` or `restSec`.

Loading conventions: dumbbell load is per dumbbell; bodyweight exercises log ADDED load (`0` = bodyweight only); `unilateral` exercises are logged per side.

## Day / Slot

`Day = { id: DayId, name: string, focus: string, slots: Slot[] }` with 5–6 slots, `order` = 1..n, and no repeated `defaultExerciseId` within a day.

| Slot field | Type | Rule |
|---|---|---|
| `order` | integer | 1..n |
| `pattern` | pattern id | Never `cardio-warmup`. |
| `defaultExerciseId` | exercise id | Must belong to `pattern` and be `kind: "strength"`. Any other exercise in the same pattern is a valid swap. |
| `sets` | integer | 2–6 (minimum 2 per slot) |
| `repMin`, `repMax` | integer | `repMin < repMax` |
| `restSec` | integer | 45–240 |

`DayId = push-a | pull-a | legs-a | push-b | pull-b | legs-b`

## Cardio / warm-up rule

- There is no per-day warm-up field.
- The logic layer inserts a single cardio slot at the start of every day, as described by top-level `warmup`.
- The default exercise is `warmup.defaultExerciseId` (`incline-treadmill`), and the user can swap to any exercise in the `cardio-warmup` pattern.
- Duration comes from that exercise's `defaultDurationMin`.
- The warm-up has no sets, reps or progression.

## Finisher rule

- `finisher` is optional and is offered after the last lifting slot (`placement: "after-lifting"`) on every day.
- The default exercise is `finisher.defaultExerciseId`. The user can swap to any exercise in `finisher.pattern` (the same 3 cardio exercises as the warm-up).
- Duration defaults to `defaultDurationMin` and the user can set it anywhere from `minDurationMin` to `maxDurationMin`.
- Show `effortNote` as the intensity cue.
- When cardio is used as the finisher, ignore the exercise's own `defaultDurationMin` (10, which is the warm-up value) and `defaultPrescription`.
- Validator rules: `minDurationMin <= defaultDurationMin <= maxDurationMin`, and `defaultExerciseId` must be a `kind: "cardio"` exercise in `finisher.pattern`.

## BodyweightEntry (app-stored data, not seed data)

`exercises.json` contains no bodyweight entries. The app stores them itself:

```ts
type BodyweightEntry = {
  date: string;          // 'YYYY-MM-DD' (local date)
  weight: number;        // > 0
  unit: 'lb' | 'kg';
  note?: string;
};
```

Guidance to show the user:
- Weigh in the morning, after using the bathroom and before eating or drinking.
- Do it `bodyweightLog.recommendedEntriesPerWeek` times a week (3–7).
- Judge progress by the `bodyweightLog.trendWindowDays` (7-day) average, not single readings.
- Weekly rate % = (previous 7-day average − current 7-day average) / previous 7-day average × 100. Compare it with `goal.targetLossPctBodyweightPerWeek`:
  - Below `min`: loss is slower than planned.
  - Above `max`: loss is too fast and risks losing muscle and strength.
- Convert units before averaging (1 kg = 2.20462 lb).

