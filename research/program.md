# PPL Program — Samir (Intermediate) — Current phase: FAT LOSS (cut)

> Human-readable companion to `exercises.json`, which is the single source of truth. Every table here is generated from that JSON. If the two ever disagree, the JSON wins. Field reference: `SCHEMA.md`.

## 0. Fat-loss phase: what changed and why

`goal.type = "fat-loss"`. Target loss is **0.5–1.0% of bodyweight per week**. Protein target is **0.7–1.0 g per lb of goal bodyweight**.

| Change | What | Why |
|---|---|---|
| **Heavy compounds kept** | The first two slots of Push A, Pull A and Legs A are unchanged: bench 4×5–8, OHP 3×6–10, row 4×5–8, pull-up 3×6–10, squat 4×5–8, RDL 3×6–10, with the same rest. | Heavy, low-rep work is what keeps strength and muscle in a deficit, so it stays untouched [4]. The calorie deficit and protein intake decide how much lean mass you keep [8][10]. |
| **Less accessory and isolation volume** | Weekly sets go from 113 to **92** (−21, −19%). Only isolation and late accessory slots were trimmed, mostly 3→2, 4→3 and calves 5→4. Every day keeps the same slots, order and default exercises, with at least 2 sets per slot. | Recovery is worse in an energy deficit. Every major muscle still gets ≈8–14 weighted sets/week on 6 days (§6). That stays at or above the 10+ sets/week zone for most muscles [1] and ~8+ for the rest. |
| **Optional zone-2 finisher** | 15 min (range 10–20) of incline treadmill, flat treadmill or Peloton **after lifting**, on any day. Zone 2 / easy aerobic: conversational pace, you can speak in full sentences; roughly 60-70% of max heart rate, RPE 3-4 out of 10. It should not leave you tired for the next session. | Low-fatigue extra energy expenditure that doesn't eat into recovery for lifting. It's optional, so skip it on days when recovery is poor. |
| **Daily steps** | Target **8000** steps/day (working range 7000-10000). | Steps are the cheapest way to raise daily energy expenditure. In a 15-cohort meta-analysis, more steps per day were associated with progressively lower all-cause mortality, levelling off around 8,000–10,000 steps/day in adults under 60 [9]. |
| **Cut-aware progression** | When `goal.type` is `fat-loss`, holding load and reps counts as a **successful** session. Stall = 3 sessions below `repMin` (was 2). First hold the load or drop a set, then reduce ~5% (was 10%). Deloads may come a bit sooner (~5–6 weeks). | Strength often plateaus in a deficit. Treating maintenance as failure would trigger needless load cuts. |
| **Bodyweight log** | Weigh in 3-7×/week, in the morning after using the bathroom. Judge progress by the **7-day average** against the target rate. | Single weigh-ins swing by 1–2% with water and food. The trend is what matters. Slower loss (~0.7%/week) preserved lean mass and strength better than ~1.4%/week in athletes [10]. |

### Nutrition on a cut (brief)

> **Not medical advice. Check with a doctor, especially with high LDL.**

- **Deficit:** use a moderate deficit that loses about **0.5–1.0% of bodyweight per week**, judged on the 7-day average. Losing faster than that raises the risk of losing muscle and strength [8][10]. If the 7-day average stalls for about 2 weeks, cut roughly 100–200 kcal/day or add steps.
- **Protein:** about **0.7–1.0 g per lb of goal bodyweight per day** (≈1.6–2.2 g/kg), split over **3–4 meals** of roughly 0.25 g/kg (20–40 g) each [11]. ISSN puts 1.4–2.0 g/kg/day as enough for most exercisers. Higher intakes (2.3–3.1 g/kg of lean mass) may help lean people in a deficit keep lean mass [8][11].
- **Heart-friendly protein sources (no fish or seafood; the household excludes it):** skinless chicken and turkey breast, legumes (lentils, chickpeas, beans), tofu, tempeh and edamame, low-fat or non-fat dairy (Greek yogurt, skyr, cottage cheese, skim milk), egg whites (whole eggs in moderation), and whey or soy protein if needed.
- **For LDL:** limit saturated fat (fatty and processed red meat, butter, full-fat cheese, coconut and palm oil) and replace it with unsaturated fats such as olive or canola oil and a small handful of nuts or seeds, while keeping the calorie budget in mind. AHA concludes that replacing saturated fat with unsaturated fat, especially polyunsaturated, lowers LDL and cardiovascular disease [12]. AHA also advises limiting processed meat and choosing mostly plant protein, low-fat dairy and lean poultry [13]. For dietary cholesterol, AHA recommends a heart-healthy overall pattern rather than a fixed number [14].
- **Soluble fiber:** eat oats, oat bran, barley, beans and lentils daily. Across 67 trials, 2–10 g/day of soluble fiber lowered LDL by about 0.057 mmol/L (~2.2 mg/dL) per gram. For example, ~3 g from oats gives roughly −0.13 mmol/L (~5 mg/dL) [15]. That's a small but real help, and fiber also improves fullness on a deficit.
- **Everything else:** plenty of vegetables and fruit, mostly whole grains, minimal added sugar and ultra-processed snacks, and alcohol kept low. Calories from alcohol add up quickly on a cut.

## 1. Overview

- **Rotation:** Push A → Pull A → Legs A → Push B → Pull B → Legs B.
- **A days** lean strength: the main compound is 4 × 5–8 with 150–180 s rest, and secondary compounds are 6–10 reps.
- **B days** lean hypertrophy: mostly 8–12 / 10–15 reps with 60–120 s rest, plus more machine and cable work.
- **Order:** compounds first, then accessories and isolation.
- **Session flow:** 10-min cardio warm-up (`warmup`, every day, inserted by the app) → lifting slots → optional 15-min zone-2 finisher (`finisher`, `placement: after-lifting`). Both default to the incline treadmill, and you can swap to the flat treadmill or Peloton. Do 1–3 ramp-up sets before the first lift. Warm-up sets don't count as working sets.

### 6 days/week vs 3 days/week

| Mode | How to run | Frequency per muscle | Weekly volume (cut) |
|---|---|---|---|
| **6-day** | Run each of the six days once per week, e.g. Mon–Sat with Sun off. | ~2×/week | ≈8–14 weighted sets per major muscle (§6) |
| **3-day** | Train 3 non-consecutive days (e.g. Mon/Wed/Fri). Always do the **next** day in the rotation, whatever the calendar says. Each day comes up about every 2 weeks. | ~1×/week | About half: ≈4–7 sets per muscle |

Three days a week is a reduced-volume, time-saving mode. On a cut it is mainly about maintenance, so keep the heavy sets heavy. The progression and deload rules don't change.

## 2. The six days

`Sets × reps` = working sets × rep range for the current (fat-loss) phase. **Pre-cut** = the set count before the fat-loss trim. Rest is between working sets. Target effort: compounds RIR 1–3, isolation RIR 0–2. *(per side)* means reps and load are per leg or arm.

### Push A (`push-a`) — Strength-leaning push: chest, shoulders, triceps (14 working sets; pre-cut 17)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Barbell Bench Press | `horizontal-press` | 4 × 5–8 | 4 | 180 s | 1-3 |
| 2 | Standing Barbell Overhead Press | `vertical-press` | 3 × 6–10 | 3 | 150 s | 1-3 |
| 3 | Incline Dumbbell Press | `incline-press` | 2 × 8–12 | 3 → | 120 s | 1-3 |
| 4 | Dumbbell Lateral Raise | `lateral-raise` | 3 × 10–15 | 4 → | 60 s | 0-2 |
| 5 | Overhead Cable Triceps Extension | `elbow-extension` | 2 × 8–12 | 3 → | 90 s | 0-2 |

### Pull A (`pull-a`) — Strength-leaning pull: back thickness and width, rear delts, biceps (13 working sets; pre-cut 16)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Barbell Bent-Over Row | `horizontal-pull` | 4 × 5–8 | 4 | 180 s | 1-3 |
| 2 | Pull-Up (Weighted as Needed) | `vertical-pull` | 3 × 6–10 | 3 | 150 s | 1-3 |
| 3 | One-Arm Dumbbell Row *(per side)* | `horizontal-pull` | 2 × 8–12 | 3 → | 90 s | 1-3 |
| 4 | Cable Face Pull | `rear-delt` | 2 × 12–15 | 3 → | 60 s | 0-2 |
| 5 | Barbell Curl | `elbow-flexion` | 2 × 6–10 | 3 → | 90 s | 0-2 |

### Legs A (`legs-a`) — Strength-leaning legs: squat-dominant quads, hinge, hamstrings, calves, core (18 working sets; pre-cut 21)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Barbell Back Squat | `squat` | 4 × 5–8 | 4 | 180 s | 1-3 |
| 2 | Barbell Romanian Deadlift | `hip-hinge` | 3 × 6–10 | 3 | 150 s | 1-3 |
| 3 | Leg Press | `squat` | 2 × 8–12 | 3 → | 120 s | 1-3 |
| 4 | Lying Leg Curl | `knee-flexion` | 3 × 8–12 | 3 | 90 s | 0-2 |
| 5 | Standing Calf Raise (Machine) | `calf-raise` | 4 × 8–12 | 5 → | 75 s | 0-2 |
| 6 | Hanging Leg Raise | `core` | 2 × 10–15 | 3 → | 60 s | 0-2 |

### Push B (`push-b`) — Hypertrophy-leaning push: upper chest, chest, delts, triceps (15 working sets; pre-cut 19)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Incline Barbell Bench Press | `incline-press` | 3 × 8–12 | 3 | 120 s | 1-3 |
| 2 | Seated Dumbbell Shoulder Press | `vertical-press` | 3 × 8–12 | 3 | 120 s | 1-3 |
| 3 | Machine Chest Press | `horizontal-press` | 2 × 8–12 | 3 → | 90 s | 1-3 |
| 4 | Cable Chest Fly | `chest-fly` | 2 × 12–15 | 3 → | 60 s | 0-2 |
| 5 | Single-Arm Cable Lateral Raise *(per side)* | `lateral-raise` | 3 × 12–15 | 4 → | 60 s | 0-2 |
| 6 | Cable Triceps Pushdown (Rope) | `elbow-extension` | 2 × 10–15 | 3 → | 60 s | 0-2 |

### Pull B (`pull-b`) — Hypertrophy-leaning pull: lats, mid back, rear delts, biceps, core (15 working sets; pre-cut 19)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Lat Pulldown | `vertical-pull` | 4 × 8–12 | 4 | 120 s | 1-3 |
| 2 | Seated Cable Row | `horizontal-pull` | 3 × 10–15 | 3 | 90 s | 1-3 |
| 3 | Reverse Pec Deck | `rear-delt` | 2 × 12–15 | 3 → | 60 s | 0-2 |
| 4 | Incline Dumbbell Curl | `elbow-flexion` | 2 × 10–15 | 3 → | 60 s | 0-2 |
| 5 | Dumbbell Hammer Curl | `elbow-flexion` | 2 × 10–15 | 3 → | 60 s | 0-2 |
| 6 | Kneeling Cable Crunch | `core` | 2 × 10–15 | 3 → | 60 s | 0-2 |

### Legs B (`legs-b`) — Hypertrophy-leaning legs: quads, glutes, hamstrings, calves (17 working sets; pre-cut 21)

| # | Exercise | Pattern | Sets × Reps | Pre-cut sets | Rest | RIR |
|---|---|---|---|---|---|---|
| 1 | Hack Squat (Machine) | `squat` | 3 × 8–12 | 3 | 120 s | 1-3 |
| 2 | Barbell Hip Thrust | `hip-thrust` | 3 × 8–12 | 3 | 120 s | 1-3 |
| 3 | Dumbbell Bulgarian Split Squat *(per side)* | `lunge-single-leg` | 2 × 8–12 | 3 → | 90 s | 1-3 |
| 4 | Leg Extension | `knee-extension` | 2 × 10–15 | 3 → | 75 s | 0-2 |
| 5 | Seated Leg Curl | `knee-flexion` | 3 × 10–15 | 4 → | 75 s | 0-2 |
| 6 | Seated Calf Raise | `calf-raise` | 4 × 10–15 | 5 → | 60 s | 0-2 |

## 3. Substitutes by movement pattern

Each exercise belongs to exactly one pattern. Any exercise in a slot's pattern is a like-for-like swap. **Bold** = a default somewhere in the program. Category = progression category (sets the load increment).

| Pattern | Type | Exercises (`id`, equipment → category) |
|---|---|---|
| `horizontal-press` | compound | **Barbell Bench Press** (`barbell-bench-press`, barbell → barbell_upper)<br>Dumbbell Bench Press (`dumbbell-bench-press`, dumbbell → dumbbell)<br>**Machine Chest Press** (`machine-chest-press`, machine → machine)<br>Smith Machine Bench Press (`smith-machine-bench-press`, smith → machine)<br>Push-Up (Weighted as Needed) (`weighted-push-up`, bodyweight → machine) |
| `incline-press` | compound | **Incline Barbell Bench Press** (`incline-barbell-bench-press`, barbell → barbell_upper)<br>**Incline Dumbbell Press** (`incline-dumbbell-press`, dumbbell → dumbbell)<br>Incline Smith Machine Press (`incline-smith-machine-press`, smith → machine)<br>Incline Machine Press (`incline-machine-press`, machine → machine) |
| `vertical-press` | compound | **Standing Barbell Overhead Press** (`barbell-overhead-press`, barbell → barbell_upper)<br>**Seated Dumbbell Shoulder Press** (`seated-dumbbell-shoulder-press`, dumbbell → dumbbell)<br>Machine Shoulder Press (`machine-shoulder-press`, machine → machine)<br>Seated Smith Machine Overhead Press (`smith-machine-overhead-press`, smith → machine)<br>Arnold Press (`arnold-press`, dumbbell → dumbbell) |
| `chest-fly` | isolation | **Cable Chest Fly** (`cable-chest-fly`, cable → machine)<br>Pec Deck Fly (`pec-deck-fly`, machine → machine)<br>Flat Dumbbell Fly (`dumbbell-fly`, dumbbell → dumbbell)<br>Low-to-High Cable Fly (`low-to-high-cable-fly`, cable → machine) |
| `lateral-raise` | isolation | **Dumbbell Lateral Raise** (`dumbbell-lateral-raise`, dumbbell → dumbbell)<br>**Single-Arm Cable Lateral Raise** (`cable-lateral-raise`, cable → machine)<br>Machine Lateral Raise (`machine-lateral-raise`, machine → machine)<br>Lean-Away Dumbbell Lateral Raise (`lean-away-dumbbell-lateral-raise`, dumbbell → dumbbell) |
| `elbow-extension` | isolation | **Overhead Cable Triceps Extension** (`overhead-cable-triceps-extension`, cable → machine)<br>**Cable Triceps Pushdown (Rope)** (`cable-triceps-pushdown`, cable → machine)<br>EZ-Bar Skull Crusher (`ez-bar-skull-crusher`, ez_bar → barbell_upper)<br>Overhead Dumbbell Triceps Extension (`overhead-dumbbell-triceps-extension`, dumbbell → dumbbell)<br>Dip (Weighted as Needed) (`weighted-dip`, bodyweight → machine)<br>Machine Triceps Extension (`machine-triceps-extension`, machine → machine) |
| `vertical-pull` | compound | **Pull-Up (Weighted as Needed)** (`pull-up`, bodyweight → machine)<br>**Lat Pulldown** (`lat-pulldown`, cable → machine)<br>Chin-Up (Weighted as Needed) (`chin-up`, bodyweight → machine)<br>Neutral-Grip Lat Pulldown (`neutral-grip-lat-pulldown`, cable → machine)<br>Machine Lat Pulldown (`machine-lat-pulldown`, machine → machine) |
| `horizontal-pull` | compound | **Barbell Bent-Over Row** (`barbell-bent-over-row`, barbell → barbell_upper)<br>**One-Arm Dumbbell Row** (`one-arm-dumbbell-row`, dumbbell → dumbbell)<br>**Seated Cable Row** (`seated-cable-row`, cable → machine)<br>Chest-Supported Machine Row (`chest-supported-machine-row`, machine → machine)<br>Chest-Supported Dumbbell Row (`chest-supported-dumbbell-row`, dumbbell → dumbbell)<br>T-Bar Row (`t-bar-row`, barbell → barbell_upper) |
| `rear-delt` | isolation | **Cable Face Pull** (`face-pull`, cable → machine)<br>**Reverse Pec Deck** (`reverse-pec-deck`, machine → machine)<br>Bent-Over Dumbbell Reverse Fly (`dumbbell-reverse-fly`, dumbbell → dumbbell)<br>Cable Rear Delt Fly (`cable-rear-delt-fly`, cable → machine) |
| `elbow-flexion` | isolation | **Barbell Curl** (`barbell-curl`, barbell → barbell_upper)<br>EZ-Bar Curl (`ez-bar-curl`, ez_bar → barbell_upper)<br>**Incline Dumbbell Curl** (`incline-dumbbell-curl`, dumbbell → dumbbell)<br>**Dumbbell Hammer Curl** (`dumbbell-hammer-curl`, dumbbell → dumbbell)<br>Cable Curl (`cable-curl`, cable → machine)<br>Machine Preacher Curl (`machine-preacher-curl`, machine → machine) |
| `squat` | compound | **Barbell Back Squat** (`barbell-back-squat`, barbell → barbell_lower)<br>**Leg Press** (`leg-press`, machine → machine)<br>**Hack Squat (Machine)** (`hack-squat`, machine → machine)<br>Barbell Front Squat (`barbell-front-squat`, barbell → barbell_lower)<br>Smith Machine Squat (`smith-machine-squat`, smith → machine)<br>Goblet Squat (`goblet-squat`, dumbbell → dumbbell) |
| `hip-hinge` | compound | **Barbell Romanian Deadlift** (`romanian-deadlift`, barbell → barbell_lower)<br>Conventional Deadlift (`conventional-deadlift`, barbell → barbell_lower)<br>Dumbbell Romanian Deadlift (`dumbbell-romanian-deadlift`, dumbbell → dumbbell)<br>Cable Pull-Through (`cable-pull-through`, cable → machine)<br>45-Degree Back Extension (Weighted as Needed) (`back-extension-45`, bodyweight → machine) |
| `hip-thrust` | compound | **Barbell Hip Thrust** (`barbell-hip-thrust`, barbell → barbell_lower)<br>Smith Machine Hip Thrust (`smith-machine-hip-thrust`, smith → machine)<br>Machine Hip Thrust (`machine-hip-thrust`, machine → machine)<br>Dumbbell Hip Thrust (`dumbbell-hip-thrust`, dumbbell → dumbbell)<br>Barbell Glute Bridge (`barbell-glute-bridge`, barbell → barbell_lower) |
| `lunge-single-leg` | compound | **Dumbbell Bulgarian Split Squat** (`bulgarian-split-squat`, dumbbell → dumbbell)<br>Dumbbell Walking Lunge (`dumbbell-walking-lunge`, dumbbell → dumbbell)<br>Smith Machine Split Squat (`smith-machine-split-squat`, smith → machine)<br>Barbell Reverse Lunge (`barbell-reverse-lunge`, barbell → barbell_lower)<br>Dumbbell Step-Up (`dumbbell-step-up`, dumbbell → dumbbell) |
| `knee-extension` | isolation | **Leg Extension** (`leg-extension`, machine → machine)<br>Single-Leg Leg Extension (`single-leg-extension`, machine → machine)<br>Sissy Squat (Weighted as Needed) (`sissy-squat`, bodyweight → machine)<br>Reverse Nordic (Weighted as Needed) (`reverse-nordic`, bodyweight → machine) |
| `knee-flexion` | isolation | **Lying Leg Curl** (`lying-leg-curl`, machine → machine)<br>**Seated Leg Curl** (`seated-leg-curl`, machine → machine)<br>Standing Single-Leg Curl (`standing-single-leg-curl`, machine → machine)<br>Nordic Hamstring Curl (`nordic-hamstring-curl`, bodyweight → machine)<br>Prone Dumbbell Leg Curl (`dumbbell-leg-curl`, dumbbell → dumbbell) |
| `calf-raise` | isolation | **Standing Calf Raise (Machine)** (`standing-calf-raise`, machine → machine)<br>**Seated Calf Raise** (`seated-calf-raise`, machine → machine)<br>Leg Press Calf Raise (`leg-press-calf-raise`, machine → machine)<br>Smith Machine Calf Raise (`smith-machine-calf-raise`, smith → machine)<br>Single-Leg Dumbbell Calf Raise (`single-leg-dumbbell-calf-raise`, dumbbell → dumbbell) |
| `core` | isolation | **Hanging Leg Raise** (`hanging-leg-raise`, bodyweight → machine)<br>**Kneeling Cable Crunch** (`cable-crunch`, cable → machine)<br>Ab Wheel Rollout (`ab-wheel-rollout`, bodyweight → machine)<br>Machine Crunch (`machine-crunch`, machine → machine)<br>Decline Sit-Up (Weighted as Needed) (`decline-sit-up`, bodyweight → machine) |
| `cardio-warmup` | cardio | **Incline Treadmill Walk** (`incline-treadmill`, treadmill → no progression)<br>Flat Treadmill Walk / Easy Jog (`flat-treadmill`, treadmill → no progression)<br>Peloton / Stationary Bike (`peloton`, bike → no progression) |

**Cardio options** for the warm-up and finisher (`kind: cardio`, equipment treadmill or bike, `progressionCategory: null`, no rep range). The warm-up defaults to 10 min. The finisher defaults to 15 min (10–20) in zone 2.

- **Incline Treadmill Walk** (`incline-treadmill`): warm-up: 10 min walk, 2.8-3.5 mph (4.5-5.6 km/h), 8-12% incline, easy-moderate (RPE 4-5, can hold a conversation). Default warm-up. Walk without holding the rails. Raise the incline gradually over the first 2 min.
- **Flat Treadmill Walk / Easy Jog** (`flat-treadmill`): warm-up: 10 min at 0-1% incline, brisk walk or easy jog, RPE 4-5. Use when incline walking is unavailable or bothers the calves/Achilles before a leg day.
- **Peloton / Stationary Bike** (`peloton`): warm-up: 10 min easy-moderate spin, ~80-90 rpm, RPE 4-5. Lowest-impact option; good before leg days. Keep it easy: the goal is to warm up, not to fatigue the legs.

**Loading conventions:** dumbbell load is logged per dumbbell. Bodyweight-with-load exercises log the *added* load (0 = bodyweight only): build to the top of the range at bodyweight, then add +5 lb / +2.5 kg with a belt, vest or held dumbbell. Unilateral exercises are logged per side.

## 4. Progression: double progression

1. **Work inside the rep range.** Keep the load fixed and add reps each session. Target effort is RIR 1-3 on compounds and RIR 0-2 on isolation (RIR = reps in reserve).
2. **Increase when:** in the last session of that exercise, **all** working sets hit `repMax` at or within the target RIR.
3. **After an increase:** add the category increment below, aim for `repMin` or more on every set, and build back up to `repMax`.
4. **Base stall rule (non-cut):** if any working set falls below `repMin` at the same load for **2 consecutive sessions**, cut the load by ~10% and rebuild.
5. **Starting load** for a new exercise: something you can lift for about `repMin`+2 reps on every set at the target RIR.

### Cut adjustments (active now: `goal.type = "fat-loss"`)

When `goal.type` equals `cutAdjustments.appliesWhenGoalType` (`"fat-loss"`), the app uses `progressionRules.cutAdjustments` in place of the base `stallConsecutiveSessions`, `stallLoadReductionPct` and `stallRule`. Everything else stays the same.

- **Maintaining counts as success** (`maintainCountsAsSuccess: true`). When goal.type is 'fat-loss', use these values instead of the base stallConsecutiveSessions / stallLoadReductionPct / stallRule (all other progression rules unchanged). On a calorie deficit, holding the same load and reps as last time is a SUCCESSFUL session, not a stall. Only add load when all working sets hit repMax at the target RIR, exactly as in the base rule.
- **Stall rule:** A stall on a cut = any working set below repMin at the same load for 3 consecutive sessions of the exercise. First response: hold the load for one more session, or drop one set on that slot (never below 2). If reps are still below repMin after that, reduce the load ~5% (rounded to the nearest available increment) and rebuild with double progression. (`stallConsecutiveSessions: 3`, `stallLoadReductionPct: 5`)
- **Deload:** Fatigue accumulates faster on a deficit: a deload may be needed a bit sooner, around every 5-6 weeks, if performance drops across several lifts, sleep worsens or joints ache. Same deload protocol as the base rule.

### Increment table

| Category | Applies to | Increment (lb) | Increment (kg) | Notes |
|---|---|---|---|---|
| `barbell_lower` | Barbell squat, hinge, hip thrust, lunge | +5 lb | +2.5 kg | Squats, deadlifts, RDLs, hip thrusts, barbell lunges. +5 lb / +2.5 kg total bar load per increase. |
| `barbell_upper` | Barbell/EZ-bar press, row, curl, extension | +5 lb | +2.5 kg | Bench, overhead press, rows, barbell/EZ-bar curls and extensions. +5 lb / +2.5 kg total; if microplates are available, +2.5 lb / +1.25 kg is fine (especially overhead press and arm work). |
| `dumbbell` | Dumbbells, kettlebells (load per dumbbell) | +5 lb | +2.5 kg | Load is logged per dumbbell (the weight of one dumbbell). Move to the next dumbbell: +5 lb per dumbbell, or the next kg dumbbell (usually +2-2.5 kg). If the jump is too big to hit repMin, stay and add reps beyond repMax first. |
| `machine` | Machines, cables, smith, loaded bodyweight | +5 lb | +2.5 kg | Machines, cables, smith machine and loaded bodyweight. Move to the next pin / add the smallest plate: about +5 lb / +2.5 kg (use +10 lb / +5 kg on big plate-loaded lower-body machines like leg press if 5 lb is impractical). |

**Mapping rule (from JSON):** barbell -> barbell_lower if the lift is lower-body dominant (squat, hinge, hip thrust, lunge), otherwise barbell_upper; ez_bar -> barbell_upper; dumbbell and kettlebell -> dumbbell; machine, cable, smith and bodyweight -> machine. For bodyweight exercises the logged load is ADDED external load (0 = bodyweight only); progress reps first, then add load in machine-sized steps (+5 lb / +2.5 kg via belt, vest or held dumbbell). Exercises with unilateral=true: reps and rest are per side, load is per dumbbell/side. Cardio exercises (kind=cardio) have progressionCategory null and no rep fields; the logic layer skips progression for them. Note: all ids (exercises, patterns, days, schedule keys) are kebab-case and permanent; progressionCategories keys (barbell_lower, barbell_upper, dumbbell, machine), equipment values and muscle names are enum values, not ids, and keep their snake_case spelling.

## 5. Deload

- **When:** every 6-8 weeks, or earlier on a trigger. Every 6-8 weeks of consistent training, or earlier if 3 or more exercises hit the stall rule within ~2 weeks, or performance, sleep and joint comfort trend down together. **On the cut:** Fatigue accumulates faster on a deficit: a deload may be needed a bit sooner, around every 5-6 weeks, if performance drops across several lifts, sleep worsens or joints ache. Same deload protocol as the base rule.
- **How:** 1 calendar week. Same exercises; sets per slot = ceil(sets x 0.5); loads ~10% lighter; stop every set at RIR 3-4. Resume pre-deload loads and rep targets the following week.
- Examples of `ceil(sets × 0.5)`: 4 → 2, 3 → 2, 2 → 1.
- On the 3-day schedule, deload for one calendar week (3 sessions) and carry on with the rotation from where you left off.

## 6. Weekly volume summary (6-day schedule)

Counting rule: each set counts 1 for the pattern's primary muscles and 0.5 for its secondary muscles (e.g. a bench press set = 1 chest + 0.5 front delt + 0.5 triceps). The 3-day column is half of the 6-day value.

| Day | Pre-cut sets | Fat-loss sets |
|---|---|---|
| Push A | 17 | 14 |
| Pull A | 16 | 13 |
| Legs A | 21 | 18 |
| Push B | 19 | 15 |
| Pull B | 19 | 15 |
| Legs B | 21 | 17 |
| **Total / week** | **113** | **92** (−19%) |

| Muscle | Direct sets (cut) | Weighted sets pre-cut | **Weighted sets (cut, 6-day)** | Cut, 3-day |
|---|---|---|---|---|
| Chest | 13 | 16 | **13** | 6.5 |
| Front delts | 6 | 12.5 | **11.5** | 5.75 |
| Side delts | 6 | 11 | **9** | 4.5 |
| Rear delts | 4 | 11 | **8.5** | 4.25 |
| Triceps | 4 | 15.5 | **12.5** | 6.25 |
| Lats (back width) | 7 | 12 | **11.5** | 5.75 |
| Upper/mid back (thickness) | 9 | 13 | **11** | 5.5 |
| Biceps | 6 | 17.5 | **14** | 7 |
| Quads | 13 | 16 | **13** | 6.5 |
| Hamstrings | 9 | 11.5 | **10.5** | 5.25 |
| Glutes | 8 | 14 | **12.5** | 6.25 |
| Calves | 8 | 10 | **8** | 4 |
| Core (optional) | 4 | 6 | **4** | 2 |

Every major muscle stays at ≈8–14 weighted sets/week on 6 days, so none drops below 8. Core is optional and lower on purpose. After the cut, the pre-cut set counts can be restored as a value-only change.

## 7. Rationale (brief)

- **Training each muscle 2×/week** (6-day mode) follows the frequency meta-analysis. With volume equated, twice a week beat once a week for hypertrophy [2].
- **Volume:** hypertrophy shows a graded dose-response with weekly sets, and 10+ sets per muscle per week tended to do best [1]. On the cut, accessory volume is trimmed and heavy work is kept.
- **Rest:** longer rest (3 min vs 1 min) produced more strength and some hypertrophy in trained men [3]. That's why main lifts get 150–180 s.
- **Loading and progression:** ACSM recommends that intermediate lifters use a wide loading range (1–12 RM) and add 2–10% load once the lifter can exceed the target reps by 1–2 [4]. Double progression puts this into practice.
- **Effort via RIR:** the RIR-based RPE scale [5][6] supports autoregulation. That matters more on a cut, when day-to-day readiness varies.
- **Exercise order:** multi-joint exercises come before single-joint ones, in line with NSCA guidance [7] and ACSM [4].
- **Rate of loss and protein:** 0.5–1%/week and high protein to keep lean mass [8][10][11]. Steps support energy expenditure and long-term health [9].

## 8. Assumptions

- Samir is in a fat-loss phase. He has slightly high LDL and is otherwise healthy, with no known injuries. If he has injuries, swap within the pattern or get professional guidance.
- No fish or seafood: the household excludes it, so it is never suggested.
- Full commercial gym: barbells, racks, dumbbells, cable stations, common plate-loaded and selectorized machines, and a treadmill or bike.
- Intermediate status (~1–3+ years of consistent training, competent technique on the main barbell lifts). Default units are lb, and every increment also has a kg value.
- Pull-ups are done at bodyweight first and loaded later. If he can't get 6 clean reps, use `lat-pulldown` (same pattern) until he can.
- **This is general fitness and nutrition information, not medical advice. Check with a doctor before starting a diet, especially with high LDL.**

## 9. Sources

1. Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis. *J Sports Sci.* 2017;35(11):1073–1082. https://doi.org/10.1080/02640414.2016.1210197
2. Schoenfeld BJ, Ogborn D, Krieger JW. Effects of resistance training frequency on measures of muscle hypertrophy: A systematic review and meta-analysis. *Sports Med.* 2016;46(11):1689–1697. https://doi.org/10.1007/s40279-016-0543-8
3. Schoenfeld BJ, Pope ZK, Benik FM, Hester GM, Sellers J, Nooner JL, et al. Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men. *J Strength Cond Res.* 2016;30(7):1805–1812. https://doi.org/10.1519/JSC.0000000000001272
4. American College of Sports Medicine. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. *Med Sci Sports Exerc.* 2009;41(3):687–708. https://doi.org/10.1249/MSS.0b013e3181915670
5. Helms ER, Cronin J, Storey A, Zourdos MC. Application of the repetitions in reserve-based rating of perceived exertion scale for resistance training. *Strength Cond J.* 2016;38(4):42–49. https://doi.org/10.1519/SSC.0000000000000218
6. Zourdos MC, Klemp A, Dolan C, Quiles JM, Schau KA, Jo E, et al. Novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve. *J Strength Cond Res.* 2016;30(1):267–275. https://doi.org/10.1519/JSC.0000000000001049
7. Haff GG, Triplett NT, eds. *Essentials of Strength Training and Conditioning* (NSCA). 4th ed. Champaign, IL: Human Kinetics; 2016. ISBN 9781492501626.
8. Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *J Int Soc Sports Nutr.* 2014;11:20. https://doi.org/10.1186/1550-2783-11-20
9. Paluch AE, Bajpai S, Bassett DR, Carnethon MR, Ekelund U, Evenson KR, et al.; Steps for Health Collaborative. Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. *Lancet Public Health.* 2022;7(3):e219–e228. https://doi.org/10.1016/S2468-2667(21)00302-9
10. Garthe I, Raastad T, Refsnes PE, Koivisto A, Sundgot-Borgen J. Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes. *Int J Sport Nutr Exerc Metab.* 2011;21(2):97–104. https://doi.org/10.1123/ijsnem.21.2.97
11. Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, et al. International Society of Sports Nutrition Position Stand: protein and exercise. *J Int Soc Sports Nutr.* 2017;14:20. https://doi.org/10.1186/s12970-017-0177-8
12. Sacks FM, Lichtenstein AH, Wu JHY, Appel LJ, Creager MA, Kris-Etherton PM, et al. Dietary fats and cardiovascular disease: a presidential advisory from the American Heart Association. *Circulation.* 2017;136(3):e1–e23. https://doi.org/10.1161/CIR.0000000000000510
13. Lichtenstein AH, Appel LJ, Vadiveloo M, Hu FB, Kris-Etherton PM, Rebholz CM, et al. 2021 Dietary guidance to improve cardiovascular health: a scientific statement from the American Heart Association. *Circulation.* 2021;144(23):e472–e487. https://doi.org/10.1161/CIR.0000000000001031
14. Carson JAS, Lichtenstein AH, Anderson CAM, Appel LJ, Kris-Etherton PM, Meyer KA, et al. Dietary cholesterol and cardiovascular risk: a science advisory from the American Heart Association. *Circulation.* 2020;141(3):e39–e53. https://doi.org/10.1161/CIR.0000000000000743
15. Brown L, Rosner B, Willett WW, Sacks FM. Cholesterol-lowering effects of dietary fiber: a meta-analysis. *Am J Clin Nutr.* 1999;69(1):30–42. https://doi.org/10.1093/ajcn/69.1.30

*Citation details were checked against publisher, PubMed, Europe PMC and library catalogue records on 2026-10-04.*
