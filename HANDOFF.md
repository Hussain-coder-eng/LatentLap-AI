# LatentLap-AI — Agent Handoff Document

Generated: 2026-05-14 (updated after Phase 3 bug-fix sessions)
Project root: `/Users/hussianaltufayli/Downloads/LatentLap-AI-main`
Python env: `~/.venv/bin/python`
GitHub: `https://github.com/Hussain-coder-eng/LatentLap-AI`

---

## Goal

Build a **McLaren F1 tire degradation intelligence system** as a portfolio piece targeting F1 data/engineering internship recruiters. The system infers hidden tire degradation states (graining, blistering, thermal, wear) lap-by-lap from public FastF1 telemetry — no proprietary data.

**Scope:** McLaren cars, Silverstone circuit, 2021–2025 (18-inch Pirelli era).
**Reference race:** 2022 British Grand Prix (documented blistering incident, well-validated).

The approved design doc is at:
`~/.gstack/projects/LatentLap-AI-main/hussianaltufayli-unknown-design-20260514-085827.md`

---

## Architecture (6 phases)

| Phase | Status | Script |
|---|---|---|
| 1 — Data ingestion | ✅ Done | `explore_data.py` |
| 2 — Feature engineering | ✅ Done (bugs fixed) | `build_feature_table.py` |
| 3 — Weak supervision labels | ✅ Done (bugs fixed) | `build_labels.py` |
| 4 — XGBoost model | ✅ Done | `train_model.py` |
| 5 — SHAP explainability + validation | ⬜ Not started | `evaluate.py` (to be created) |
| 6 — Streamlit dashboard | ⬜ Not started | `app.py` (to be created) |

---

## Current State

### ⚠ CRITICAL BLOCKER — Regenerate feature_table.csv before Phase 4

Three logic fixes were applied to `build_feature_table.py` (commits `23b0a1f`, `787f391`) but **cannot take effect until the script is re-run**. FastF1's schedule API was unreachable during the fix session (network unavailable), so `feature_table.csv` still contains pre-fix values. The current labeled table is partially correct but the following features are still contaminated:

| Feature | Problem | Fix in code? | Applied to data? |
|---|---|---|---|
| `EarlyStintConcavity` | RIC Lap 3 (128.8s outlier) inflated polynomial coefficient 9× | ✅ | ❌ needs regen |
| `LapVariance` | Same outlier contaminated rolling std for laps 4–7; was on raw `LapTimeSec` not `FuelCorrLapTime` | ✅ | ❌ needs regen |
| `RollingDelta3` | Same outlier in 3-lap rolling mean elevated laps 5–6 to Grade 2 | ✅ | ❌ needs regen |
| `SLEI` | `np.trapezoid(y, dt_sec)` integration bug (dt_sec as x-axis, not cumsum) | ✅ (C-1) | ❌ needs regen |

**First thing to do when network is available:**
```bash
~/.venv/bin/python build_feature_table.py --year 2022
~/.venv/bin/python build_labels.py
```

Then recalibrate the four STALE thresholds (all marked `⚠ STALE` in `build_labels.py`):
- `SLEI_BLISTER = 3.50` → recalibrate to p90 of corrected SLEI distribution
- `ROLLING_GRADE2_THRESH = 0.50` → recalibrate after masked RollingDelta3
- `CONCAVITY_GRAIN = 0.30` → recalibrate after outlier-excluded polyfit
- `LAPVAR_GRAIN = 0.50` → recalibrate after FuelCorrLapTime-based LapVariance

All four should be done in one commit after regeneration.

---

## Phase 4 — Completed

### What was built

`train_model.py` trains two XGBoost classifiers from 84 raw telemetry features (no label-leaking columns):

1. **Severity classifier** — `DegSeverity` (0–3), 81 training rows
2. **Mode classifier** — `FailureMode` (none / thermal / wear), 75 training rows
   - graining (1 row), blistering (5 rows), unreliable (1 row) excluded as too sparse

**Cross-validation:** Driver leave-one-out (train NOR → test RIC, train RIC → test NOR). Leave-one-year-out CV was planned but only 2022 data is available; revisit when 2021/2023–2025 data is ingested.

**CV results (2022 Silverstone, single-year):**
- Severity avg weighted-F1: 0.162 — NOTE: below majority-class baseline. Model learns from raw telemetry only (LapDelta, RollingDelta3, DegRateAccel excluded). SHAP analysis in Phase 5 should focus on directional patterns rather than individual-lap attribution.
- Mode avg weighted-F1: 0.445

**Feature exclusions (84 features kept from labeled_table.csv):**
- Excluded identifiers: DriverNumber, Year, Stint
- Excluded admin flags: TrackStatus, IsAccurate, OutLap, InLap
- Excluded raw times: LapTimeSec, S1Sec, S2Sec, S3Sec, FuelCorrLapTime
- Excluded severity label-generators: LapDelta, RollingDelta3, DegRateAccel, DeltaRate, S2Delta, S3_S1_Decay, S3_S1_DecayZ
- Excluded mode label-generators: ThermalAccumProxy, PushRecoveryDelta
- Excluded targets: DegSeverity, StintId

**Mode encoding (integer labels for XGBoost):**
```python
MODE_ENCODING = {"none": 0, "thermal": 1, "wear": 2}
```

### Outputs
```
train_model.py               ← Phase 4, DONE — trains + saves both classifiers
models/severity_model.ubj    ← DegSeverity classifier (gitignored, regenerate with train_model.py)
models/mode_model.ubj        ← FailureMode classifier (gitignored)
models/feature_list.json     ← 84 feature column names (shared input schema)
models/cv_results.json       ← per-fold metrics + mode_encoding dict
tests/test_train_model.py    ← 13 unit tests
```

### Public interface for Phase 5/6
```python
from train_model import load_severity_model, load_mode_model
sev_model, features = load_severity_model()   # XGBClassifier + list[str]
mode_model, features = load_mode_model()      # XGBClassifier + list[str]
# Inference:
probs = sev_model.predict_proba(df[features].values)  # shape (n, 4)
mode_probs = mode_model.predict_proba(df[features].values)  # shape (n, 3), classes: none/thermal/wear
```

Note: Models are not committed to git. Run `~/.venv/bin/python train_model.py` to regenerate.

---

## Phase 3 — Completed with fixes

### What was built

`build_labels.py` assigns heuristic weak-supervision labels to `data/feature_table.csv`:

- `StintId` — stint index per driver (0, 1, 2, …)
- `DegSeverity` — 0=nominal, 1=mild, 2=moderate, 3=severe, -1=unreliable
- `FailureMode` — graining | blistering | thermal | wear | none | unreliable

**Current label distribution (2022 Silverstone, 82 laps):**
```
DegSeverity:  -1×1, 0×17, 1×22, 2×24, 3×18
FailureMode:  none×43, wear×24, thermal×10, graining×2, blistering×2, unreliable×1
```

**Key validation:** NOR 2022 Medium stint blistering correctly detected at laps 25 and 30 (SLEI spikes 3.99 and 4.18) — matches the documented McLaren blistering incident at the 2022 British GP.

### Outputs
```
data/labeled_table.csv       (82 laps × 115 features+labels)
data/labeled_table.parquet
```

---

## What Happened This Session — Bug Fixes

Two fix branches were created, reviewed, and merged.

### Branch: `fix-data-pipeline-bugs` (merged `5b960b6`)

Found by code review and domain audit. Fixed in `build_feature_table.py` and `build_labels.py`.

| ID | File | Bug | Fix |
|---|---|---|---|
| C-1 | `build_feature_table.py` | `np.trapezoid(y, dt_sec)` — `dt_sec` passed as x-axis gives `diff(dt_sec) ≈ 0`, producing near-zero SLEI integrals | Use `np.trapezoid(y, np.cumsum(dt_sec))` throughout |
| C-2 | `build_feature_table.py` | `PostSC_Lap` detection ran on already-filtered laps — SC-status rows already removed before flag was set | Move SC flag computation to before the lap filter, then map flags onto filtered df |
| I-1 | `build_labels.py` | Pre-pit severity boost used `InLap == 1` to skip final stint — but FastF1 always sets `InLap=0` because pit-in laps fail `IsAccurate` | Detect final stint via `stint == max(StintId)` per driver/year instead |
| I-A | `build_labels.py` | `SLEI_BLISTER` comment said "calibrated on corrected integration" — false, it was calibrated on the buggy code | Replaced with `⚠ STALE` warning |
| I-B | `build_labels.py` | Validation report NOR filter had no Year predicate; severity pivot grouped without Year | Added `Year` to both |

### Branch: `fix-label-quality` (merged `13bdabe`)

Found by F1 domain agent auditing the label values. Two rounds of fixes.

**Root cause:** RIC Lap 3 (LapTimeSec=128.8s, `LapDelta=33.0s`) passed the `MAX_LAP_SEC=130` filter but was a SC/incident lap. It contaminated three features used by the graining label.

| ID | File | Bug | Fix |
|---|---|---|---|
| A | `build_feature_table.py` | `EarlyStintConcavity` polyfit included outlier Lap 3 — inflated coefficient 9× (0.325 → 2.923) | Add `& (LapDelta <= OUTLIER_DELTA_CAP)` to `_early` filter |
| B | `build_feature_table.py` | `LapVariance` rolling std on raw `LapTimeSec` — Lap 3 stayed in window for laps 4–7, producing variances 14–22s | Switch to loop with masked `FuelCorrLapTime` (outlier laps → NaN before rolling) |
| 5A | `build_feature_table.py` | `RollingDelta3` had same contamination — Lap 3 elevated laps 5–6 rolling mean to 11.8s | Same masking pattern applied |
| C | `build_labels.py` | Graining condition had no pace-loss guard — laps 5–7 with `LapDelta < 0.20` labeled graining; Lap 7 was `DegSeverity=0 + FailureMode=graining` (internal contradiction) | Add `LapDelta > DELTA_GRADE0` as fourth graining condition |
| Q3 | `build_labels.py` | Pre-pit `+1` boost could push `DegSeverity=3` when `LapDelta < DELTA_WEAR=0.60` — resulting in `Sev=3 / FailureMode=none` (incoherent) | Fallback rule: `Sev≥3 + none + LapDelta > DELTA_GRADE0` → `wear` |
| STALE | `build_labels.py` | `ROLLING_GRADE2_THRESH`, `CONCAVITY_GRAIN`, `LAPVAR_GRAIN` had no stale warnings despite depending on pre-fix feature values | Added `⚠ STALE` comments to all three, matching existing `SLEI_BLISTER` pattern |

---

## What Didn't Work (don't repeat these)

Carries forward from prior session, plus new entries:

| Mistake | Why it failed | Fix |
|---|---|---|
| `pick_team()`/`pick_driver()` | Deprecated in FastF1 v3.x | Use `pick_teams()`/`pick_drivers()` |
| 130s lap time guard omitted | SC restart lap (139.6s) passed `IsAccurate`, contaminating data | Always filter `LapTimeSec < 130` |
| `lap.get_telemetry()` on modified DataFrame rows | FastF1 metadata lost after pandas copy/transform | Pass original `session.laps.pick_teams(TEAM)` object, not modified df |
| `groupby(...).apply(fn_returning_Series)` for scalar-per-group | Pandas 2.x interprets result as multi-column DataFrame | Use explicit `for key, grp in df.groupby(...)` loop + dict |
| `np.trapz` | Removed in NumPy 2.0 | Use `np.trapezoid` |
| `np.trapezoid(y, dt_sec)` with per-sample durations as x-axis | `diff(dt_sec) ≈ 0` → near-zero integrals | Pass `np.cumsum(dt_sec)` as x-axis |
| `PostSC_Lap` detection on filtered laps | SC rows already removed before flag computed → always 0 | Run on unfiltered laps, then map onto filtered df |
| Using `InLap == 1` to detect pit-in laps | FastF1 marks pit-in laps `IsAccurate=False` and filters them out — `InLap` is always 0 in the clean table | Detect final stint via `max(StintId)` per driver/year |
| Including outlier laps in `EarlyStintConcavity` polyfit | A single 128.8s SC lap inflated the quadratic coefficient 9× | Filter `LapDelta <= OUTLIER_DELTA_CAP` before polyfit |
| `LapVariance` on raw `LapTimeSec` with unmasked rolling window | SC outlier laps in window inflate std for 4 subsequent laps | Use masked `FuelCorrLapTime` loop; outlier laps → NaN before rolling |
| Graining condition without pace-loss guard | `EarlyStintConcavity` and `LapVariance` contamination caused grade-0 laps to get graining labels | Require `LapDelta > DELTA_GRADE0` as guard condition |
| Pre-pit boost without wear fallback | Boost drives `Sev=3` on laps below `DELTA_WEAR` → `Sev=3 / FailureMode=none` contradiction | Add fallback: `Sev≥3 + none + LapDelta > DELTA_GRADE0` → wear |
| dataprep EDA (library) | MarkupSafe/Jinja2/Bokeh/IPython/NumPy version chain incompatible with Python 3.12+ | Use manual pandas/numpy EDA instead |
| Groupby LOO CV | GroupShuffleSplit on Year planned but only 1 year available → used driver-LOO instead | Use LOY-CV when 2021/2023–2025 data is ingested |
| eval_set=test_fold early stopping | Optimistic avg_best_iteration; acceptable with ~41 train rows; Phase 5 SHAP should note | Document in HANDOFF |

---

## Immediate Next Steps

### Step 1 — Regenerate feature_table.csv (requires network) — DONE

```bash
~/.venv/bin/python build_feature_table.py --year 2022
~/.venv/bin/python build_labels.py
```

Thresholds were recalibrated after regeneration. Phase 4 training was completed on the corrected feature table.

### Step 2 — Phase 5: SHAP + Validation (`evaluate.py`) — NEXT

Key validation checks:
- Degradation probability rises before observed pit stops
- Predictions correlate with pace decay (Spearman rank)
- Maggotts-Becketts features (`MB_PeakLatG`, `MB_TimeSec`) appear in top SHAP features
- Held-out race (Silverstone 2024) used for out-of-sample evaluation

### Step 3 — Streamlit Dashboard (Phase 6, `app.py`)

Stack: Streamlit + Plotly

Panels:
1. Race timeline: degradation severity band per lap (green→red), overlaid on lap delta
2. Tire health indicator: current severity class + failure mode probability bars
3. Feature explanation: top-3 SHAP features driving current prediction
4. Stint comparison: NOR vs RIC degradation trajectories side-by-side
5. Race selector: year, driver

---

## Label Methodology — Summary

Labels are heuristic proxy approximations, **not physical tire state measurements**.

**DegSeverity (0–3):** Based on `LapDelta` (fuel-corrected lap time vs stint best). Upgrades for sustained rolling trend (`RollingDelta3`) or accelerating degradation (`DegRateAccel`). Last 3 laps of non-final stints get +1 backward-label from pit stop.

**FailureMode priority:** graining > thermal > blistering > wear > none. Unreliable laps (`DegSeverity=-1`) override all.

**Known open items:**
- Thermal labels fire on any `PushRecoveryDelta < -0.30` within early stint — may capture racecraft/traffic patterns in cool conditions (British GP ~35°C track). Consider adding TrackTemp gate or requiring 2/3-lap persistence in a future session.
- `StintId=2` for RIC merges two physical stints due to a 5-lap gap with same TyreLife (laps 38–42 filtered out). Low impact on 2022 labels but could affect other years. Fix: trust FastF1 `Stint` column instead of re-deriving from TyreLife resets.

---

## Phase 2 — Feature Engineering Details

`build_feature_table.py` produces **112 features across 82 clean laps** for 2022.

Run to regenerate:
```bash
~/.venv/bin/python build_feature_table.py --year 2022
```

Dry-run (10 laps, 1 driver, fast smoke test):
```bash
~/.venv/bin/python build_feature_table.py --year 2022 --dry-run
```

Multi-year (all 5 Silverstone races):
```bash
~/.venv/bin/python build_feature_table.py
```

---

## Key Technical Constants

```python
# In build_feature_table.py
YEARS           = [2021, 2022, 2023, 2024, 2025]
TEAM            = "McLaren"
RACE            = "British Grand Prix"
MAX_LAP_SEC     = 130
OUTLIER_DELTA_CAP = 8.0        # keep in sync with build_labels.py
RACING_STATUSES = {"1", "2"}
FUEL_CORR_SEC_PER_KG = 0.035   # industry standard
HANGAR_BEARING_DEG   = 135.0   # Hangar Straight axis for wind projection
G               = 9.81

CORNER_ZONES = {
    "Copse":  (580,  820),
    "MB":    (1200, 2200),
    "Stowe": (3100, 3400),
    "Club":  (4200, 4700),
}

# In build_labels.py — STALE thresholds (recalibrate after feature table regen)
SLEI_BLISTER          = 3.50   # ⚠ STALE — recalibrate to p90 of corrected SLEI
ROLLING_GRADE2_THRESH = 0.50   # ⚠ STALE — recalibrate after masked RollingDelta3
CONCAVITY_GRAIN       = 0.30   # ⚠ STALE — recalibrate after outlier-excluded polyfit
LAPVAR_GRAIN          = 0.50   # ⚠ STALE — recalibrate after FuelCorrLapTime LapVariance
```

---

## Tool Stack

| Tool | Version | Purpose |
|---|---|---|
| FastF1 | 3.8.3 | Telemetry ingestion |
| pandas | 2.x | Data manipulation |
| numpy | 2.x | Numerical (use `np.trapezoid`, not `np.trapz`) |
| scipy | 1.17.1 | `savgol_filter` for X/Y smoothing |
| pyarrow | installed | Parquet I/O |
| xgboost | to install | Phase 4 model |
| shap | to install | Phase 5 explainability |
| streamlit | to install | Phase 6 dashboard |
| plotly | to install | Phase 6 charts |

Install missing deps:
```bash
~/.venv/bin/pip install xgboost shap streamlit plotly
```

---

## File Map

```
LatentLap-AI-main/
├── build_feature_table.py   ← Phase 2, DONE with fixes — 112 features
├── build_labels.py          ← Phase 3, DONE with fixes — DegSeverity + FailureMode
├── explore_data.py          ← Phase 1, DONE — data validation
├── CLAUDE.md                ← Mandatory agent workflow rules (Gang team, branches, reviews)
├── HANDOFF.md               ← this file
├── cache/                   ← FastF1 cache (do not delete)
├── data/
│   ├── feature_table.csv    ← 82 laps × 112 features (⚠ PRE-FIX, needs regen)
│   ├── feature_table.parquet
│   ├── labeled_table.csv    ← 82 laps × 115 cols with labels (⚠ partially stale)
│   └── labeled_table.parquet
└── data_exploration/
    ├── mcl_silverstone_2022_laps_clean.csv
    ├── nor_fastest_lap_telemetry_clean.csv
    ├── nor_dirty_air_per_lap.csv
    └── silverstone_2022_weather.csv
```

---

## Design Constraints (do not violate)

- **No exact tire wear percentages** — predict degradation likelihood, not wear %
- **No exact tire temperatures** — all thermal features are proxies
- **No deep learning for v1** — XGBoost only; add HMM post-processing later if needed
- **All outputs probabilistic** — severity as 0–3 scale, not binary
- **Label methodology must be documented** — heuristic labels, not physical ground truth
- **Scope: McLaren + Silverstone only** — no multi-team generalization in MVP
