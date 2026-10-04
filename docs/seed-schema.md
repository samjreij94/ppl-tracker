# Seed schema — `research/exercises.json`

**Source of truth: [`research/SCHEMA.md`](../research/SCHEMA.md)** (Theodore; validated by
`research/validate_exercises.py`). This page only documents how core consumes it. The TS
mirror is `src/core/seed-schema.ts` (`SeedFile`), the loader is `loadSeed()`.

## How the app loads it

`src/core/bundled-seed.ts` imports the file **directly** from `research/` (eager
`import.meta.glob`, i.e. a Vite JSON import bundled at build time). No copy step: edits
to `research/exercises.json` flow through on the next dev reload / build.
`loadSeed()` normalizes it once at startup; problems surface as `state.seedErrors` /
`state.seedWarnings` (status `'error'` only if no usable day remains).

## Mapping to core types

| Seed | Core |
| --- | --- |
| `patterns[]` `{id, name, rirClass, primaryMuscles, secondaryMuscles, exerciseIds}` | `SubstitutionGroup` (swap groups) |
| `exercises[].pattern` | `Exercise.substitutionGroup` |
| `exercises[].progressionCategory` (`barbell_lower`/`barbell_upper`/`dumbbell`/`machine`) | `StrengthExercise.category` (derived from equipment if missing) |
| `progressionCategories{cat: {incrementLb, incrementKg}}` | default `Settings.increments` (user can override) |
| `progressionRules.stallConsecutiveSessions` / `stallLoadReductionPct` / `deload` | `state.progressionRules` (double progression + `reduce` hint) |
| `days[]` `{id, name, focus, slots}` (no program wrapper) | `Program {id:'ppl', name:'Push / Pull / Legs', days}` |
| slot `{order, pattern, defaultExerciseId, sets, repMin, repMax, restSec}` | `Slot {id: \`${dayId}-${order}\`, exerciseId, sets, repRange{min,max}, restSec, substitutionGroup: pattern}` |
| `schedules['six-day']`, `schedules['three-day'].rotation` | `Program.rotations[6]`, `Program.rotations[3]` |
| `warmup.defaultExerciseId` (`incline-treadmill`) | `state.warmupExerciseId`; cardio slot (`id: 'cardio-warmup'`) auto-inserted first on every day |
| cardio exercises (`kind:'cardio'`, `pattern:'cardio-warmup'`, `defaultDurationMin`, `progressionCategory:null`) | `CardioExercise` (no sets/progression) |
| `progressionRules.cutAdjustments` `{appliesWhenGoalType, maintainCountsAsSuccess, stallConsecutiveSessions:3, stallLoadReductionPct:5}` | `state.progressionRules.cut` (used when `settings.goal.type` matches) |
| `progressionRules.deload` `{frequencyWeeks:'6-8', setReductionPct:50, loadReductionPct:10, targetRir:'3-4'}` | `state.progressionRules.deload` `{setReductionPct, loadReductionPct, frequencyWeeks:{min:6,max:8}, targetRir}` (deload week; `deloadDue` after `frequencyWeeks.min`) |
| `cutAdjustments.deloadNote` ("around every 5-6 weeks") | `progressionRules.cut.deloadNote` + `deloadFrequencyWeeks:{min:5,max:6}` (deload due after 5 weeks on the cut; same protocol) |
| cardio `defaultPrescription` | `CardioExercise.defaultPrescription` → `TodayCardioSlot.prescription` (warm-up only; the finisher builds its own text from `finisher`) |
| `goal` `{type, targetLossPctBodyweightPerWeek{min,max}, proteinGPerLbGoalBodyweight}` | default `Settings.goal` |
| `finisher` `{optional, pattern, defaultExerciseId, defaultDurationMin, minDurationMin, maxDurationMin, intensity, effortNote, placement}` | `state.finisher` (`FinisherConfig`); optional cardio entry after lifting (slot id `cardio-finisher`) |
| `activity` `{dailyStepTarget, stepTargetRange:"7000-10000", note}` | `state.activity` (`stepTargetRange` parsed to `{min,max}`) |
| `bodyweightLog` `{recommendedEntriesPerWeek:"3-7", trendWindowDays}` | `state.bodyweightLog` (range parsed to `{min,max}`) |
| strength exercise default rep range (not in seed) | derived from the first slot that uses the exercise or its pattern |

History is keyed by the actually performed `exerciseId`; permanent swaps are keyed by slot id
(`push-a-1` … or `cardio-warmup`, shared by all days).

## Tolerance

Unknown fields are ignored. Bad entries are skipped with a path-specific error
(`days[0].slots[2]: unknown exercise "foo", skipped`). Aliases accepted:
`substitutionGroups`↔`patterns`, `substitutionGroup`↔`pattern`, `exerciseId`↔`defaultExerciseId`,
`repRange{min,max}`↔`repMin/repMax`, `category`↔`progressionCategory`, `six_day`↔`six-day`.
If no cardio exercises exist, the three built-ins (`incline-treadmill`, `flat-treadmill`,
`peloton`) are added.

## Minimal example

```json
{
  "version": 1,
  "units": { "default": "lb" },
  "progressionCategories": {
    "barbell_upper": { "incrementLb": 5, "incrementKg": 2.5, "note": "…" },
    "barbell_lower": { "incrementLb": 5, "incrementKg": 2.5, "note": "…" },
    "dumbbell": { "incrementLb": 5, "incrementKg": 2.5, "note": "…" },
    "machine": { "incrementLb": 5, "incrementKg": 2.5, "note": "…" }
  },
  "progressionRules": { "method": "double_progression", "stallConsecutiveSessions": 2, "stallLoadReductionPct": 10 },
  "warmup": { "pattern": "cardio-warmup", "defaultExerciseId": "incline-treadmill", "appliesTo": "all-days" },
  "patterns": [
    { "id": "horizontal-press", "name": "Horizontal Press", "rirClass": "compound",
      "primaryMuscles": ["chest"], "secondaryMuscles": ["front_delts", "triceps"],
      "exerciseIds": ["barbell-bench-press", "dumbbell-bench-press"] },
    { "id": "cardio-warmup", "name": "Cardio Warm-up", "rirClass": null,
      "primaryMuscles": [], "secondaryMuscles": [], "exerciseIds": ["incline-treadmill"] }
  ],
  "exercises": [
    { "id": "barbell-bench-press", "name": "Barbell Bench Press", "kind": "strength",
      "pattern": "horizontal-press", "equipment": "barbell", "progressionCategory": "barbell_upper",
      "primaryMuscles": ["chest"] },
    { "id": "dumbbell-bench-press", "name": "Dumbbell Bench Press", "kind": "strength",
      "pattern": "horizontal-press", "equipment": "dumbbell", "progressionCategory": "dumbbell",
      "primaryMuscles": ["chest"] },
    { "id": "incline-treadmill", "name": "Incline Treadmill Walk", "kind": "cardio",
      "pattern": "cardio-warmup", "equipment": "treadmill", "progressionCategory": null,
      "primaryMuscles": [], "defaultDurationMin": 10,
      "defaultPrescription": "10 min, 8-12% incline", "notes": "Default warm-up." }
  ],
  "schedules": {
    "six-day": ["push-a"],
    "three-day": { "rotation": ["push-a"], "note": "…" }
  },
  "days": [
    { "id": "push-a", "name": "Push A", "focus": "Strength-leaning push",
      "slots": [ { "order": 1, "pattern": "horizontal-press", "defaultExerciseId": "barbell-bench-press",
                   "sets": 4, "repMin": 5, "repMax": 8, "restSec": 180 } ] }
  ]
}
```
