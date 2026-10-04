#!/usr/bin/env python3
"""Validate research/exercises.json. Usage: python3 research/validate_exercises.py [path]"""
import json, math, re, sys, os
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "exercises.json")
errors = []
def check(cond, msg):
    if not cond: errors.append(msg)

try:
    with open(path) as f: data = json.load(f)
except Exception as e:
    print(f"FAIL: invalid JSON: {e}"); sys.exit(1)

CATS = {"barbell_lower", "barbell_upper", "dumbbell", "machine"}
EQUIP = {"barbell", "dumbbell", "machine", "cable", "bodyweight", "smith", "ez_bar", "kettlebell"}
CARDIO_EQUIP = {"treadmill", "bike"}
MUSCLES = {"chest", "front_delts", "side_delts", "rear_delts", "triceps", "lats", "upper_back", "biceps",
           "quads", "hamstrings", "glutes", "calves", "core"}
KINDS = {"strength", "cardio"}
CARDIO_PATTERN = "cardio-warmup"
CARDIO_IDS = {"incline-treadmill", "flat-treadmill", "peloton"}
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
EXPECTED_CAT = {"dumbbell": {"dumbbell"}, "kettlebell": {"dumbbell"}, "ez_bar": {"barbell_upper"},
                "barbell": {"barbell_lower", "barbell_upper"}, "machine": {"machine"}, "cable": {"machine"},
                "smith": {"machine"}, "bodyweight": {"machine"}}

# top level
for key in ["version", "units", "progressionCategories", "progressionRules", "categoryMappingRule",
          "warmup", "patterns", "exercises", "schedules", "days"]:
    check(key in data, f"missing top-level key {key}")
check(set(data["progressionCategories"]) == CATS, "progressionCategories must be exactly the 4 categories")
for c, v in data["progressionCategories"].items():
    check(isinstance(v.get("incrementLb"), (int, float)) and v["incrementLb"] > 0, f"{c} incrementLb")
    check(isinstance(v.get("incrementKg"), (int, float)) and v["incrementKg"] > 0, f"{c} incrementKg")
pr = data["progressionRules"]
check(pr.get("method") == "double_progression", "method must be double_progression")
check(set(pr.get("targetRir", {})) == {"compound", "isolation"}, "targetRir keys")

# exercises
ex = {}
for e in data["exercises"]:
    i = e.get("id")
    check(i not in ex, f"duplicate exercise id {i}")
    ex[i] = e
    check(bool(KEBAB.match(i or "")), f"{i}: exercise id not kebab-case")
    check(e.get("kind") in KINDS, f"{i}: kind must be strength|cardio")
    check(bool(e.get("name")), f"{i}: missing name")
    check(isinstance(e.get("primaryMuscles"), list) and all(m in MUSCLES for m in e.get("primaryMuscles", [])),
          f"{i}: primaryMuscles must be a list of known muscles")
    if e.get("kind") == "cardio":
        check(i in CARDIO_IDS, f"{i}: cardio id not in required set {sorted(CARDIO_IDS)}")
        check(e.get("pattern") == CARDIO_PATTERN, f"{i}: cardio must use pattern {CARDIO_PATTERN}")
        check(e.get("equipment") in CARDIO_EQUIP, f"{i}: cardio equipment must be treadmill|bike")
        check("progressionCategory" in e and e["progressionCategory"] is None, f"{i}: cardio progressionCategory must be null")
        check(e.get("primaryMuscles") == [], f"{i}: cardio primaryMuscles must be []")
        check(e.get("defaultDurationMin") == 10, f"{i}: defaultDurationMin must be 10")
        check(bool(e.get("defaultPrescription")) and bool(e.get("notes")), f"{i}: needs defaultPrescription and notes")
        check(not ({"repMin", "repMax", "sets", "restSec"} & set(e)), f"{i}: cardio must not carry rep/set fields")
    else:
        check(e.get("progressionCategory") in CATS, f"{i}: strength needs one of the 4 progressionCategories")
        check(e.get("equipment") in EQUIP, f"{i}: bad strength equipment {e.get('equipment')}")
        check(e.get("pattern") != CARDIO_PATTERN, f"{i}: strength exercise in cardio pattern")
        check(e.get("progressionCategory") in EXPECTED_CAT.get(e.get("equipment"), set()),
              f"{i}: category {e.get('progressionCategory')} violates mapping rule for {e.get('equipment')}")
check(CARDIO_IDS <= set(ex), f"missing cardio ids {sorted(CARDIO_IDS - set(ex))}")

# patterns
pat = {}
seen_in_pattern = defaultdict(list)
for p in data["patterns"]:
    pid = p.get("id")
    check(pid not in pat, f"duplicate pattern {pid}")
    pat[pid] = p
    check(bool(KEBAB.match(pid or "")), f"pattern id {pid} not kebab-case")
    check(len(p["exerciseIds"]) == len(set(p["exerciseIds"])), f"{pid}: duplicate exerciseIds")
    if pid != CARDIO_PATTERN:
        check(p.get("rirClass") in ("compound", "isolation"), f"{pid}: rirClass must be compound|isolation")
    else:
        check(p.get("rirClass") is None, f"{pid}: rirClass must be null")
    for eid in p["exerciseIds"]:
        seen_in_pattern[eid].append(pid)
        check(eid in ex, f"{pid}: unknown exercise {eid}")
        check(eid not in ex or ex[eid]["pattern"] == pid, f"{pid}: {eid} has pattern {ex.get(eid, {}).get('pattern')}")
for i, e in ex.items():
    if e["pattern"] in pat and e.get("kind") == "strength":
        check(e.get("primaryMuscles") == pat[e["pattern"]]["primaryMuscles"], f"{i}: primaryMuscles differ from pattern")
    check(e["pattern"] in pat, f"{i}: pattern {e['pattern']} not defined")
    check(len(seen_in_pattern[i]) == 1, f"{i}: must be listed in exactly one pattern (found {seen_in_pattern[i]})")
check(CARDIO_PATTERN in pat and set(pat[CARDIO_PATTERN]["exerciseIds"]) == CARDIO_IDS,
      "cardio-warmup pattern must list exactly the 3 cardio exercises")

# warmup
w = data["warmup"]
check(w == {"pattern": CARDIO_PATTERN, "defaultExerciseId": "incline-treadmill", "appliesTo": "all-days"},
      f"warmup must be exactly {{pattern: cardio-warmup, defaultExerciseId: incline-treadmill, appliesTo: all-days}}, got {w}")

# days
days = {}
used_patterns = set()
for d in data["days"]:
    did = d["id"]; days[did] = d
    check(KEBAB.match(did or "") is not None, f"day id {did} not kebab-case")
    check("warmup" not in d, f"{did}: per-day warmup field must not exist")
    slots = d["slots"]
    check(5 <= len(slots) <= 6, f"{did}: has {len(slots)} slots (need 5-6)")
    check([s["order"] for s in slots] == list(range(1, len(slots) + 1)), f"{did}: orders not 1..n")
    defaults = [s["defaultExerciseId"] for s in slots]
    check(len(defaults) == len(set(defaults)), f"{did}: duplicate default exercise")
    for s in slots:
        tag = f"{did}#{s['order']}"
        used_patterns.add(s["pattern"])
        check(s["pattern"] in pat, f"{tag}: unknown pattern")
        check(s["pattern"] != CARDIO_PATTERN, f"{tag}: cardio must not be a program slot")
        x = ex.get(s["defaultExerciseId"])
        check(x is not None, f"{tag}: unknown default exercise {s['defaultExerciseId']}")
        check(x is not None and x["pattern"] == s["pattern"], f"{tag}: default exercise not in slot pattern")
        check(x is not None and x.get("kind") == "strength", f"{tag}: default exercise must be strength")
        check(isinstance(s["sets"], int) and 1 <= s["sets"] <= 6, f"{tag}: sets")
        check(isinstance(s["repMin"], int) and isinstance(s["repMax"], int) and 1 <= s["repMin"] < s["repMax"], f"{tag}: repMin < repMax")
        check(45 <= s["restSec"] <= 240, f"{tag}: restSec {s['restSec']} outside 45-240")
for pid in used_patterns:
    if pid in pat:
        n = len(pat[pid]["exerciseIds"])
        check(4 <= n <= 7, f"pattern {pid} used by a slot has {n} exercises (need 4-7)")

# schedules
sch = data["schedules"]
ROT = ["push-a", "pull-a", "legs-a", "push-b", "pull-b", "legs-b"]
check(set(sch) == {"six-day", "three-day"}, f"schedules keys must be six-day, three-day (got {sorted(sch)})")
check(sch.get("six-day") == ROT, "six-day must be the base rotation")
check(sch.get("three-day", {}).get("rotation") == ROT, "three-day rotation must be the base rotation")
check(set(days) == set(ROT), "days must be exactly the six rotation days")

# ---------- fat-loss / program-level additions ----------
def num(x): return isinstance(x, (int, float)) and not isinstance(x, bool)
def posint(x): return isinstance(x, int) and not isinstance(x, bool) and x > 0
for d in data["days"]:
    for s in d["slots"]:
        check(isinstance(s["sets"], int) and s["sets"] >= 2, f"{d['id']}#{s['order']}: minimum 2 sets per slot")

fin = data.get("finisher")
check(isinstance(fin, dict), "missing top-level finisher")
if isinstance(fin, dict):
    for key in ["optional", "pattern", "defaultExerciseId", "defaultDurationMin", "minDurationMin", "maxDurationMin",
                "intensity", "effortNote", "appliesTo", "placement"]:
        check(key in fin, f"finisher missing {key}")
    check(fin.get("optional") is True, "finisher.optional must be true")
    check(fin.get("pattern") == CARDIO_PATTERN, "finisher.pattern must be cardio-warmup")
    fx = ex.get(fin.get("defaultExerciseId"))
    check(fx is not None and fx.get("kind") == "cardio" and fx.get("pattern") == fin.get("pattern"),
          "finisher.defaultExerciseId must be a cardio exercise in finisher.pattern")
    lo, dflt, hi = fin.get("minDurationMin"), fin.get("defaultDurationMin"), fin.get("maxDurationMin")
    check(all(posint(v) for v in (lo, dflt, hi)) and lo <= dflt <= hi, "finisher must satisfy 0 < min <= default <= max (integers)")
    check(fin.get("intensity") == "zone-2", "finisher.intensity must be zone-2")
    check(isinstance(fin.get("effortNote"), str) and fin["effortNote"], "finisher.effortNote must be a non-empty string")
    check(fin.get("appliesTo") == "all-days", "finisher.appliesTo must be all-days")
    check(fin.get("placement") == "after-lifting", "finisher.placement must be after-lifting")

act = data.get("activity")
check(isinstance(act, dict), "missing top-level activity")
if isinstance(act, dict):
    check(posint(act.get("dailyStepTarget")), "activity.dailyStepTarget must be a positive integer")
    m = re.match(r"^(\d+)-(\d+)$", str(act.get("stepTargetRange", "")))
    check(bool(m) and int(m.group(1)) < int(m.group(2)), "activity.stepTargetRange must be 'min-max' with min < max")
    if m and posint(act.get("dailyStepTarget")):
        check(int(m.group(1)) <= act["dailyStepTarget"] <= int(m.group(2)), "activity.dailyStepTarget must lie inside stepTargetRange")
    check(isinstance(act.get("note"), str) and act["note"], "activity.note must be a non-empty string")

goal = data.get("goal")
check(isinstance(goal, dict), "missing top-level goal")
if isinstance(goal, dict):
    check(goal.get("type") in ("fat-loss",), f"goal.type must be a known goal type (got {goal.get('type')})")
    for key in ["targetLossPctBodyweightPerWeek", "proteinGPerLbGoalBodyweight"]:
        r = goal.get(key, {})
        check(isinstance(r, dict) and num(r.get("min")) and num(r.get("max")) and 0 < r["min"] < r["max"],
              f"goal.{key} must have numeric 0 < min < max")

ca = pr.get("cutAdjustments")
check(isinstance(ca, dict), "missing progressionRules.cutAdjustments")
if isinstance(ca, dict):
    check(ca.get("maintainCountsAsSuccess") is True, "cutAdjustments.maintainCountsAsSuccess must be true")
    check(posint(ca.get("stallConsecutiveSessions")), "cutAdjustments.stallConsecutiveSessions must be a positive integer")
    check(num(ca.get("stallLoadReductionPct")) and 0 < ca["stallLoadReductionPct"] < 50, "cutAdjustments.stallLoadReductionPct must be numeric 0-50")
    for key in ["description", "stallRule", "deloadNote"]:
        check(isinstance(ca.get(key), str) and ca[key], f"cutAdjustments.{key} must be a non-empty string")
# base (non-cut) values must remain for non-cut mode
check(posint(pr.get("stallConsecutiveSessions")) and num(pr.get("stallLoadReductionPct")) and isinstance(pr.get("stallRule"), str),
      "base stall fields must remain in progressionRules")

bw = data.get("bodyweightLog")
if bw is not None:
    check(posint(bw.get("trendWindowDays")), "bodyweightLog.trendWindowDays must be a positive integer")
    check(bool(re.match(r"^\d+-\d+$", str(bw.get("recommendedEntriesPerWeek", "")))), "bodyweightLog.recommendedEntriesPerWeek must be 'min-max'")

if errors:
    print(f"FAIL ({len(errors)} errors)")
    for e in errors: print("  -", e)
    sys.exit(1)

# summary
nslots = sum(len(d["slots"]) for d in data["days"])
print(f"PASS  goal={data.get('goal', {}).get('type')}  patterns={len(pat)} (strength={len(pat)-1}, cardio=1)  exercises={len(ex)} "
      f"(strength={sum(e['kind']=='strength' for e in ex.values())}, cardio={sum(e['kind']=='cardio' for e in ex.values())})  "
      f"days={len(days)}  slots={nslots}")
print("\nSets per session:", ", ".join(f"{d['id']}={sum(s['sets'] for s in d['slots'])}" for d in data["days"]))

by_pat = defaultdict(int)
for d in data["days"]:
    for s in d["slots"]: by_pat[s["pattern"]] += s["sets"]
print("\nWeekly hard sets by pattern (6-day schedule; halve for 3-day):")
for p in data["patterns"]:
    if p["id"] in by_pat: print(f"  {p['id']:<18} {by_pat[p['id']]:>3}")
print(f"  {'TOTAL':<18} {sum(by_pat.values()):>3}")

mus = defaultdict(float); direct = defaultdict(int)
for pid, n in by_pat.items():
    for m in pat[pid]["primaryMuscles"]: mus[m] += n; direct[m] += n
    for m in pat[pid]["secondaryMuscles"]: mus[m] += 0.5 * n
print("\nWeekly sets by muscle (primary=1, secondary=0.5) -- 6-day | 3-day:")
for m in ["chest","front_delts","side_delts","rear_delts","triceps","lats","upper_back","biceps",
          "quads","hamstrings","glutes","calves","core"]:
    print(f"  {m:<12} direct={direct[m]:>3}  weighted={mus[m]:>5.1f} | {mus[m]/2:>5.1f}")
